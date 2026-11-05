"""
FastAPI GPU Microservice for WABot AI Photo Enhancement (.hd, .remini, .upscale, .hd2, .hd4)
- Bounded async GPU job queue & concurrency limiter
- Strict MIME + magic-byte + file size validation
- Zero permanent storage: isolated temp directory wiped in finally {}
- Constant-time API key authentication without ever logging secrets
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from pipeline import AdaptiveEnhancementPipeline, EnhanceOptions, sniff_magic_format

# Configure clean logger that never prints Authorization / X-API-Key headers
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("wabot.ai_service")

CONFIG_PATH = os.getenv("AI_CONFIG_PATH", "./config.yaml")
pipeline = AdaptiveEnhancementPipeline(config_path=CONFIG_PATH)

MAX_CONCURRENT = int(
    os.getenv(
        "AI_MAX_CONCURRENT_JOBS",
        pipeline.config["server"].get("max_concurrent_jobs", 2),
    )
)
MAX_QUEUE_SIZE = int(
    os.getenv(
        "AI_MAX_QUEUE_SIZE",
        pipeline.config["server"].get("max_queue_size", 16),
    )
)
JOB_TIMEOUT_SEC = float(
    os.getenv(
        "AI_JOB_TIMEOUT_SECONDS",
        pipeline.config["server"].get("job_timeout_seconds", 90),
    )
)

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/octet-stream",
}

gpu_semaphore = asyncio.Semaphore(MAX_CONCURRENT)
worker_pool = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix="ai-gpu")
active_jobs = 0
queued_jobs = 0

app = FastAPI(
    title="WABot AI Photo Enhancement GPU Service",
    version="1.0.0",
    docs_url="/docs",
)


def verify_api_key(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None),
) -> None:
    expected = (os.getenv("AI_ENHANCE_API_KEY") or "").strip()
    if not expected:
        return

    provided = ""
    if x_api_key:
        provided = x_api_key.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()

    if not provided or not hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized AI service request.")


class RuntimeConfigPatch(BaseModel):
    default_face_model: Optional[Literal["codeformer", "gfpgan"]] = None
    default_fidelity: Optional[float] = Field(default=None, ge=0.05, le=0.98)
    skin_texture_preserve: Optional[float] = Field(default=None, ge=0.0, le=0.5)
    noise_sigma_trigger: Optional[float] = Field(default=None, ge=2.0, le=40.0)
    blur_laplacian_trigger: Optional[float] = Field(default=None, ge=5.0, le=300.0)
    tile_size: Optional[int] = Field(default=None, ge=128, le=1024)
    jpeg_quality: Optional[int] = Field(default=None, ge=80, le=100)


@app.get("/health")
async def health_check(_: None = Depends(verify_api_key)) -> Dict[str, Any]:
    hw = pipeline.get_hardware_status()
    return {
        "ok": True,
        "service": "wabot-ai-enhance",
        "active_jobs": active_jobs,
        "queued_jobs": queued_jobs,
        "max_concurrent_jobs": MAX_CONCURRENT,
        "max_queue_size": MAX_QUEUE_SIZE,
        **hw,
    }


@app.get("/v1/config")
async def get_config(_: None = Depends(verify_api_key)) -> Dict[str, Any]:
    return {"ok": True, "config": pipeline.config}


@app.patch("/v1/config")
async def patch_config(
    body: RuntimeConfigPatch, _: None = Depends(verify_api_key)
) -> Dict[str, Any]:
    patch_dict: Dict[str, Any] = {"models": {}, "adaptive_thresholds": {}, "server": {}}
    if body.default_face_model is not None:
        patch_dict["models"]["default_face_model"] = body.default_face_model
    if body.default_fidelity is not None:
        patch_dict["models"]["default_fidelity"] = body.default_fidelity
    if body.skin_texture_preserve is not None:
        patch_dict["models"]["skin_texture_preserve"] = body.skin_texture_preserve
    if body.tile_size is not None:
        patch_dict["models"]["tile_size"] = body.tile_size
    if body.noise_sigma_trigger is not None:
        patch_dict["adaptive_thresholds"]["noise_sigma_trigger"] = body.noise_sigma_trigger
    if body.blur_laplacian_trigger is not None:
        patch_dict["adaptive_thresholds"]["blur_laplacian_trigger"] = body.blur_laplacian_trigger
    if body.jpeg_quality is not None:
        patch_dict["server"]["jpeg_quality"] = body.jpeg_quality

    updated = pipeline.update_runtime_config(patch_dict)
    return {"ok": True, "config": updated}


@app.post("/v1/enhance")
async def enhance_endpoint(
    image: UploadFile = File(...),
    mode: Literal["auto", "face", "upscale", "2x", "4x"] = Form(default="auto"),
    scale: Optional[int] = Form(default=None),
    face_model: Optional[Literal["codeformer", "gfpgan"]] = Form(default=None),
    fidelity: Optional[float] = Form(default=None),
    enable_denoise: Optional[bool] = Form(default=None),
    enable_deblur: Optional[bool] = Form(default=None),
    output_format: Optional[Literal["jpeg", "png"]] = Form(default=None),
    _: None = Depends(verify_api_key),
) -> Response:
    global active_jobs, queued_jobs

    content_type = (image.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"MIME type '{content_type}' tidak diizinkan. Gunakan image/jpeg, image/png, atau image/webp.",
        )

    if queued_jobs >= MAX_QUEUE_SIZE:
        raise HTTPException(
            status_code=429,
            detail="Antrean server GPU sedang penuh. Silakan coba beberapa saat lagi.",
        )

    max_bytes = int(pipeline.config["server"].get("max_file_size_mb", 15)) * 1024 * 1024
    raw_bytes = await image.read(max_bytes + 1)
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="Berkas gambar kosong.")
    if len(raw_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Ukuran gambar melebihi batas maksimum {max_bytes // (1024 * 1024)} MB.",
        )

    magic_fmt = sniff_magic_format(raw_bytes)
    if magic_fmt is None:
        raise HTTPException(
            status_code=415,
            detail="Header biner berkas bukan gambar JPEG, PNG, atau WebP yang valid.",
        )

    options = EnhanceOptions(
        mode=mode,
        scale=scale if scale in (2, 4) else None,
        face_model=face_model,
        fidelity=fidelity,
        enable_denoise=enable_denoise,
        enable_deblur=enable_deblur,
        output_format=output_format,
    )

    queued_jobs += 1
    in_queue = True
    try:
        async with gpu_semaphore:
            queued_jobs = max(0, queued_jobs - 1)
            in_queue = False
            active_jobs += 1
            try:
                # Isolated ephemeral temp workspace wiped immediately after processing
                with tempfile.TemporaryDirectory(prefix="wabot_ai_gpu_") as tmp_dir:
                    in_file = Path(tmp_dir) / f"in.{magic_fmt}"
                    in_file.write_bytes(raw_bytes)

                    loop = asyncio.get_running_loop()
                    result = await asyncio.wait_for(
                        loop.run_in_executor(
                            worker_pool,
                            pipeline.enhance,
                            in_file.read_bytes(),
                            options,
                        ),
                        timeout=JOB_TIMEOUT_SEC,
                    )
            finally:
                active_jobs = max(0, active_jobs - 1)
    except asyncio.TimeoutError:
        logger.warning("AI enhancement job timed out after %.1fs (mode=%s)", JOB_TIMEOUT_SEC, mode)
        raise HTTPException(
            status_code=504,
            detail=f"Pemrosesan GPU melebihi batas waktu ({int(JOB_TIMEOUT_SEC)} detik).",
        )
    except FileNotFoundError as fnf:
        logger.error("Model weight missing: %s", fnf)
        raise HTTPException(status_code=503, detail=str(fnf))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.exception("Unexpected error during AI enhancement (mode=%s)", mode)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal memproses peningkatan kualitas AI: {exc}",
        )
    finally:
        if in_queue:
            queued_jobs = max(0, queued_jobs - 1)

    meta_payload = {
        "mode": mode,
        "input_width": result.input_width,
        "input_height": result.input_height,
        "output_width": result.output_width,
        "output_height": result.output_height,
        "effective_scale": result.effective_scale,
        "faces_detected": result.faces_detected,
        "fidelity_used": result.fidelity_used,
        "face_model_used": result.face_model_used,
        "stages_executed": result.stages_executed,
        "models_used": result.models_used,
        "input_sharpness": result.input_sharpness,
        "output_sharpness": result.output_sharpness,
        "noise_sigma": result.noise_sigma,
        "duration_ms": result.duration_ms,
        "note": result.reconstruction_note,
    }
    logger.info(
        "Enhanced image (%s): %dx%d -> %dx%d, faces=%d, models=%s in %dms",
        mode,
        result.input_width,
        result.input_height,
        result.output_width,
        result.output_height,
        result.faces_detected,
        ",".join(result.models_used),
        result.duration_ms,
    )

    return Response(
        content=result.image_bytes,
        media_type=result.mime_type,
        headers={
            "X-Enhance-Meta": json.dumps(meta_payload, separators=(",", ":")),
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    )
