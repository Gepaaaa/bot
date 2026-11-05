"""
Multi-Mode AI Photo Enhancement Microservice (.hd, .remini, .upscale, .hd2, .hd4)
Supports two run modes:
1. Pure Zero-Dependency Mode: Standard library ThreadingHTTPServer (works immediately on Termux / Android without pip)
2. FastAPI / Uvicorn Mode: Full async ASGI server when running on Linux GPU / Colab / PC
"""
from __future__ import annotations

import asyncio
from email.parser import BytesParser
from email.policy import default
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Literal, Optional
import urllib.parse

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

active_jobs = 0
queued_jobs = 0

# Check if FastAPI & Uvicorn are available
try:
    from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
    from pydantic import BaseModel, Field

    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False


# ==============================================================================
# 1. PURE ZERO-DEPENDENCY HTTP SERVER (Works on Android Termux out of the box!)
# ==============================================================================
class StandaloneAIHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("%s - - [%s] %s", self.client_address[0], self.log_date_time_string(), format % args)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Expose-Headers", "X-Enhance-Meta")

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/health", "/", "/healthz"):
            hw = pipeline.get_hardware_status()
            payload = {
                "ok": True,
                "service": "wabot-ai-enhance",
                "active_jobs": active_jobs,
                "queued_jobs": queued_jobs,
                "max_concurrent_jobs": MAX_CONCURRENT,
                "max_queue_size": MAX_QUEUE_SIZE,
                **hw,
            }
            body = json.dumps(payload, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif parsed.path == "/v1/config":
            body = json.dumps({"ok": True, "config": pipeline.config}, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404, "Endpoint not found.")

    def do_POST(self) -> None:
        global active_jobs
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/v1/enhance":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length <= 0:
                    self.send_error(400, "Berkas gambar kosong.")
                    return

                content_type = self.headers.get("Content-Type", "")
                raw_body = self.rfile.read(content_length)

                # Parse multipart using standard library email.parser
                msg_header = f"Content-Type: {content_type}\r\n\r\n".encode("latin-1")
                msg = BytesParser(policy=default).parsebytes(msg_header + raw_body)

                image_bytes: Optional[bytes] = None
                fields: Dict[str, str] = {}

                for part in msg.iter_parts():
                    name = part.get_param("name", header="content-disposition")
                    if name == "image":
                        image_bytes = part.get_payload(decode=True)
                    elif name:
                        payload = part.get_payload(decode=True)
                        if payload is not None:
                            fields[name] = payload.decode("utf-8", errors="ignore").strip()

                if not image_bytes or len(image_bytes) == 0:
                    self.send_error(400, "Field gambar 'image' tidak ditemukan.")
                    return

                mode = fields.get("mode", "auto")
                scale_raw = fields.get("scale")
                scale = int(scale_raw) if scale_raw in ("2", "4") else None
                face_model = fields.get("face_model") or None
                fidelity_raw = fields.get("fidelity")
                fidelity = float(fidelity_raw) if fidelity_raw else None
                enable_denoise = fields.get("enable_denoise", "false").lower() == "true"
                sr_model = fields.get("sr_model") or ("ultrasharp" if mode == "ultra" else None)

                options = EnhanceOptions(
                    mode=mode,  # type: ignore
                    scale=scale,
                    face_model=face_model,  # type: ignore
                    sr_model=sr_model,  # type: ignore
                    fidelity=fidelity,
                    enable_denoise=enable_denoise,
                    enable_deblur=enable_deblur,
                    output_format="jpeg",
                )

                active_jobs += 1
                try:
                    result = pipeline.enhance(image_bytes, options)
                finally:
                    active_jobs = max(0, active_jobs - 1)

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

                self.send_response(200)
                self.send_header("Content-Type", result.mime_type)
                self.send_header("X-Enhance-Meta", json.dumps(meta_payload, separators=(",", ":")))
                self._send_cors_headers()
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
                self.send_header("Content-Length", str(len(result.image_bytes)))
                self.end_headers()
                self.wfile.write(result.image_bytes)
            except Exception as exc:
                logger.exception("Error processing enhancement request: %s", exc)
                err_data = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.send_header("Content-Length", str(len(err_data)))
                self.end_headers()
                self.wfile.write(err_data)
        else:
            self.send_error(404, "Endpoint not found.")


def run_standalone_server(host: str = "0.0.0.0", port: int = 8001) -> None:
    server = ThreadingHTTPServer((host, port), StandaloneAIHandler)
    logger.info("==================================================")
    logger.info(" Server AI Berjalan Cepat di Oppo Reno 5!")
    logger.info(" Port: %d (Zero-Dependency Built-in Server)", port)
    logger.info(" Siap melayani permintaan .hd, .remini, .upscale")
    logger.info("==================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server dihentikan oleh pengguna.")
    finally:
        server.server_close()


# ==============================================================================
# 2. FASTAPI ASGI MODE (Optional fallback for Linux GPU / Colab)
# ==============================================================================
if HAS_FASTAPI:
    gpu_semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    worker_pool = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix="ai-gpu")

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

    @app.post("/v1/enhance")
    async def enhance_endpoint(
        image: UploadFile = File(...),
        mode: Literal["auto", "face", "upscale", "2x", "4x", "ultra"] = Form(default="auto"),
        scale: Optional[int] = Form(default=None),
        face_model: Optional[Literal["codeformer", "gfpgan"]] = Form(default=None),
        sr_model: Optional[str] = Form(default=None),
        fidelity: Optional[float] = Form(default=None),
        enable_denoise: Optional[bool] = Form(default=None),
        enable_deblur: Optional[bool] = Form(default=None),
        output_format: Optional[Literal["jpeg", "png"]] = Form(default=None),
        _: None = Depends(verify_api_key),
    ) -> Response:
        global active_jobs, queued_jobs

        raw_bytes = await image.read()
        if len(raw_bytes) == 0:
            raise HTTPException(status_code=400, detail="Berkas gambar kosong.")

        resolved_sr_model = sr_model or ("ultrasharp" if mode == "ultra" else None)

        options = EnhanceOptions(
            mode=mode,
            scale=scale if scale in (2, 4) else None,
            face_model=face_model,
            sr_model=resolved_sr_model,  # type: ignore
            fidelity=fidelity,
            enable_denoise=enable_denoise,
            enable_deblur=enable_deblur,
            output_format=output_format,
        )

        result = pipeline.enhance(raw_bytes, options)
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
        return Response(
            content=result.image_bytes,
            media_type=result.mime_type,
            headers={
                "X-Enhance-Meta": json.dumps(meta_payload, separators=(",", ":")),
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        )
else:
    app = None  # type: ignore


if __name__ == "__main__":
    port_env = int(os.getenv("PORT", "8001"))
    host_env = os.getenv("HOST", "0.0.0.0")
    run_standalone_server(host=host_env, port=port_env)
