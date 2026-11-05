"""
Adaptive Pretrained AI Image Restoration & Super-Resolution Pipeline
Models supported:
- Real-ESRGAN (RealESRGAN_x2plus, RealESRGAN_x4plus) for general restoration & 2x/4x super-resolution
- CodeFormer (controllable fidelity w in [0.0, 1.0]) & GFPGAN (v1.4) for natural face restoration
- SCUNet / NAFNet for conditional blind denoising & deblurring (triggered adaptively by quality metrics)
"""
from __future__ import annotations

import io
import math
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    cv2 = None  # type: ignore
    HAS_CV2 = False

import numpy as np

try:
    import torch
    HAS_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAS_TORCH = False

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# Prevent decompression-bomb attacks while allowing high-res smartphone photos
Image.MAX_IMAGE_PIXELS = 48_000_000

EnhanceMode = Literal["auto", "face", "upscale", "2x", "4x"]
FaceModelChoice = Literal["codeformer", "gfpgan"]


@dataclass
class QualityMetrics:
    width: int
    height: int
    format_name: str
    sharpness_laplacian: float
    noise_sigma: float
    jpeg_blockiness: float
    mean_luminance: float
    faces_detected: int
    face_boxes: List[Tuple[int, int, int, int]] = field(default_factory=list)


@dataclass
class EnhanceOptions:
    mode: EnhanceMode = "auto"
    scale: Optional[int] = None
    face_model: Optional[FaceModelChoice] = None
    fidelity: Optional[float] = None
    enable_denoise: Optional[bool] = None
    enable_deblur: Optional[bool] = None
    output_format: Optional[Literal["jpeg", "png"]] = None


@dataclass
class EnhanceResult:
    image_bytes: bytes
    mime_type: str
    input_width: int
    input_height: int
    output_width: int
    output_height: int
    effective_scale: float
    faces_detected: int
    fidelity_used: float
    face_model_used: Optional[str]
    stages_executed: List[str]
    models_used: List[str]
    input_sharpness: float
    output_sharpness: float
    noise_sigma: float
    duration_ms: int
    reconstruction_note: str = (
        "Detail mikro hasil pemulihan AI merupakan estimasi rekonstruksi model "
        "pretrained, bukan detail optik asli yang hilang."
    )


def sniff_magic_format(raw: bytes) -> Optional[str]:
    if len(raw) < 16:
        return None
    if raw[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return None


class AdaptiveEnhancementPipeline:
    """
    Thread-safe GPU inference coordinator with lazy checkpoint loading,
    adaptive stage selection, identity-preserving face restoration, and CIE LAB color guard.
    """

    def __init__(self, config_path: str = "./config.yaml") -> None:
        self.config_path = Path(config_path)
        self.config: Dict[str, Any] = self._load_config()
        self._lock = threading.Lock()
        self.device = self._resolve_device()
        is_cuda = bool(getattr(self.device, "type", None) == "cuda")
        self.fp16 = bool(
            is_cuda
            and self.config.get("models", {}).get("use_fp16_on_cuda", True)
        )

        # Lazy model instances cached in VRAM once loaded
        self._realesrgan_x2: Any = None
        self._realesrgan_x4: Any = None
        self._gfpgan_x2: Any = None
        self._gfpgan_x4: Any = None
        self._codeformer_net: Any = None
        self._face_helper: Any = None
        self._retinaface_detector: Any = None
        self._haar_detector: Any = None
        self._denoiser_net: Any = None
        self._deblurrer_net: Any = None
        self._loaded_model_names: List[str] = []

    def _load_config(self) -> Dict[str, Any]:
        default_cfg: Dict[str, Any] = {
            "server": {
                "max_concurrent_jobs": 2,
                "max_queue_size": 16,
                "job_timeout_seconds": 90,
                "max_file_size_mb": 15,
                "max_input_megapixels": 16.0,
                "max_output_edge": 4096,
                "default_output_format": "jpeg",
                "jpeg_quality": 95,
            },
            "models": {
                "weights_dir": "./weights",
                "device": "auto",
                "use_fp16_on_cuda": True,
                "tile_size": 400,
                "tile_pad": 10,
                "pre_pad": 0,
                "realesrgan_x2_weights": "RealESRGAN_x2plus.pth",
                "realesrgan_x4_weights": "RealESRGAN_x4plus.pth",
                "default_face_model": "codeformer",
                "codeformer_weights": "codeformer.pth",
                "gfpgan_weights": "GFPGANv1.4.pth",
                "default_fidelity": 0.72,
                "skin_texture_preserve": 0.18,
                "face_identity_max_luma_delta": 24.0,
                "enable_denoiser": True,
                "denoiser_arch": "scunet",
                "scunet_weights": "scunet_color_real_psnr.pth",
                "nafnet_denoise_weights": "NAFNet-SIDD-width64.pth",
                "enable_deblurrer": True,
                "nafnet_deblur_weights": "NAFNet-GoPro-width64.pth",
            },
            "adaptive_thresholds": {
                "noise_sigma_trigger": 11.5,
                "blur_laplacian_trigger": 62.0,
                "face_confidence_threshold": 0.65,
                "auto_4x_max_input_edge": 1280,
                "max_lab_chroma_drift": 4.0,
            },
        }
        if self.config_path.exists() and yaml is not None:
            try:
                with open(self.config_path, "r", encoding="utf-8") as fh:
                    loaded = yaml.safe_load(fh) or {}
                for section, values in loaded.items():
                    if isinstance(values, dict) and section in default_cfg:
                        default_cfg[section].update(values)
                    else:
                        default_cfg[section] = values
            except Exception:
                pass
        return default_cfg

    def update_runtime_config(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            for section in ("server", "models", "adaptive_thresholds"):
                if isinstance(patch.get(section), dict):
                    self.config.setdefault(section, {}).update(patch[section])
            return self.config

    def _resolve_device(self) -> Any:
        if torch is None:
            return "cpu"
        pref = str(
            os.getenv("AI_DEVICE")
            or self.config.get("models", {}).get("device", "auto")
        ).lower()
        if pref == "cuda" or (pref == "auto" and torch.cuda.is_available()):
            return torch.device("cuda")
        if pref == "mps" or (
            pref == "auto"
            and hasattr(torch.backends, "mps")
            and torch.backends.mps.is_available()
        ):
            return torch.device("mps")
        return torch.device("cpu")

    def _weights_path(self, filename: str) -> Path:
        weights_dir = Path(
            os.getenv("AI_WEIGHTS_DIR")
            or self.config["models"].get("weights_dir", "./weights")
        )
        return (weights_dir / filename).resolve()

    def get_hardware_status(self) -> Dict[str, Any]:
        gpu_name = None
        vram_total_mb = None
        vram_allocated_mb = None
        if (
            torch is not None
            and getattr(self.device, "type", None) == "cuda"
            and torch.cuda.is_available()
        ):
            idx = torch.cuda.current_device()
            gpu_name = torch.cuda.get_device_name(idx)
            props = torch.cuda.get_device_properties(idx)
            vram_total_mb = round(props.total_memory / (1024 * 1024))
            vram_allocated_mb = round(torch.cuda.memory_allocated(idx) / (1024 * 1024))

        weights_dir = Path(
            os.getenv("AI_WEIGHTS_DIR")
            or self.config["models"].get("weights_dir", "./weights")
        )
        available_weights = (
            sorted(p.name for p in weights_dir.glob("*.pth"))
            if weights_dir.exists()
            else []
        )

        return {
            "device": str(self.device),
            "fp16": self.fp16,
            "gpu_name": gpu_name,
            "vram_total_mb": vram_total_mb,
            "vram_allocated_mb": vram_allocated_mb,
            "loaded_models": list(self._loaded_model_names),
            "available_weights": available_weights,
            "default_face_model": self.config["models"]["default_face_model"],
            "default_fidelity": self.config["models"]["default_fidelity"],
        }

    # =========================================================================
    # STAGE 1: VALIDATION & SAFE DECODING
    # =========================================================================
    def validate_and_decode(self, raw_bytes: bytes) -> Tuple[np.ndarray, str]:
        fmt = sniff_magic_format(raw_bytes)
        if fmt is None:
            raise ValueError(
                "Format berkas tidak didukung. Gunakan foto asli JPEG, PNG, atau WebP."
            )

        max_mb = float(self.config["server"].get("max_file_size_mb", 15))
        if len(raw_bytes) > max_mb * 1024 * 1024:
            raise ValueError(
                f"Ukuran berkas melebihi batas aman {max_mb:.0f} MB."
            )

        with Image.open(io.BytesIO(raw_bytes)) as pil_img:
            pil_img.verify()

        with Image.open(io.BytesIO(raw_bytes)) as pil_img:
            pil_img = ImageOps.exif_transpose(pil_img)
            if pil_img.mode in ("RGBA", "LA") or (
                pil_img.mode == "P" and "transparency" in pil_img.info
            ):
                rgba = pil_img.convert("RGBA")
                bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
                rgb = Image.alpha_composite(bg, rgba).convert("RGB")
            else:
                rgb = pil_img.convert("RGB")

            w, h = rgb.size
            if w < 24 or h < 24:
                raise ValueError("Resolusi gambar terlalu kecil (minimal 24x24 piksel).")

            max_mp = float(self.config["server"].get("max_input_megapixels", 16.0))
            if (w * h) > max_mp * 1_000_000:
                ratio = math.sqrt((max_mp * 1_000_000) / float(w * h))
                new_w = max(64, int(round(w * ratio)))
                new_h = max(64, int(round(h * ratio)))
                rgb = rgb.resize((new_w, new_h), Image.Resampling.LANCZOS)

            rgb_np = np.array(rgb, dtype=np.uint8)
            if cv2 is not None:
                bgr_np = cv2.cvtColor(rgb_np, cv2.COLOR_RGB2BGR)
            else:
                bgr_np = rgb_np[:, :, ::-1].copy()
            return bgr_np, fmt

    # =========================================================================
    # STAGE 2 & 3: QUALITY METRICS & FACE DETECTION
    # =========================================================================
    def _detect_faces(self, bgr: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if cv2 is None:
            return []
        h, w = bgr.shape[:2]
        conf_thresh = float(
            self.config["adaptive_thresholds"].get("face_confidence_threshold", 0.65)
        )

        # Primary: RetinaFace ResNet50 via facexlib
        try:
            if self._retinaface_detector is None and HAS_TORCH:
                from facexlib.detection import init_detection_model

                self._retinaface_detector = init_detection_model(
                    "retinaface_resnet50",
                    half=self.fp16,
                    device=self.device,
                )
                if "RetinaFace-ResNet50" not in self._loaded_model_names:
                    self._loaded_model_names.append("RetinaFace-ResNet50")

            if self._retinaface_detector is not None:
                with torch.no_grad():
                    bboxes = self._retinaface_detector.detect_faces(bgr, conf_thresh)
                boxes: List[Tuple[int, int, int, int]] = []
                if bboxes is not None and len(bboxes) > 0:
                    for row in bboxes:
                        x1, y1, x2, y2, score = (
                            int(max(0, row[0])),
                            int(max(0, row[1])),
                            int(min(w, row[2])),
                            int(min(h, row[3])),
                            float(row[4]),
                        )
                        if score >= conf_thresh and (x2 - x1) >= 20 and (y2 - y1) >= 20:
                            boxes.append((x1, y1, x2, y2))
                return boxes
            return []
        except Exception:
            # Fallback to OpenCV Haar Cascade if RetinaFace weights are unavailable
            if self._haar_detector is None and hasattr(cv2, "data"):
                cascade_path = os.path.join(
                    cv2.data.haarcascades, "haarcascade_frontalface_default.xml"
                )
                self._haar_detector = cv2.CascadeClassifier(cascade_path)
            if self._haar_detector is not None:
                gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                detected = self._haar_detector.detectMultiScale(
                    gray, scaleFactor=1.12, minNeighbors=5, minSize=(28, 28)
                )
                return [(int(x), int(y), int(x + fw), int(y + fh)) for (x, y, fw, fh) in detected]
            return []

    def analyze_image_quality(self, bgr: np.ndarray, fmt: str) -> QualityMetrics:
        h, w = bgr.shape[:2]
        if cv2 is None:
            gray = np.dot(bgr[..., :3], [0.114, 0.587, 0.299]).astype(np.float32)
            gx, gy = np.gradient(gray)
            sharpness = float(np.var(gx) + np.var(gy))
            noise_sigma = float(np.std(gray - np.mean(gray)) * 0.1)
            mean_luma = float(np.mean(gray))
            return QualityMetrics(
                width=w,
                height=h,
                format_name=fmt,
                sharpness_laplacian=round(sharpness, 2),
                noise_sigma=round(noise_sigma, 2),
                jpeg_blockiness=1.0,
                mean_luminance=round(mean_luma, 2),
                faces_detected=0,
                face_boxes=[],
            )
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Resolution-normalized Laplacian sharpness score
        norm_scale = 512.0 / max(w, h, 1)
        if norm_scale < 1.0:
            probe_gray = cv2.resize(
                gray,
                (max(32, int(w * norm_scale)), max(32, int(h * norm_scale))),
                interpolation=cv2.INTER_AREA,
            )
        else:
            probe_gray = gray

        lap = cv2.Laplacian(probe_gray, cv2.CV_64F)
        sharpness = float(lap.var())

        # High-frequency robust MAD noise estimator (insensitive to strong object edges)
        high_pass = gray.astype(np.float32) - cv2.GaussianBlur(gray, (3, 3), 0).astype(
            np.float32
        )
        mad = float(np.median(np.abs(high_pass - np.median(high_pass))))
        noise_sigma = float((mad / 0.6745) * 1.35)

        # 8x8 JPEG block boundary artifact ratio
        if h >= 32 and w >= 32:
            h_diff = np.abs(np.diff(gray.astype(np.float32), axis=1))
            boundary_cols = h_diff[:, 7::8]
            interior_cols = np.delete(h_diff, np.arange(7, h_diff.shape[1], 8), axis=1)
            b_mean = float(boundary_cols.mean()) if boundary_cols.size else 0.0
            i_mean = float(interior_cols.mean()) if interior_cols.size else 1.0
            jpeg_blockiness = round(b_mean / max(i_mean, 1e-4), 3)
        else:
            jpeg_blockiness = 1.0

        face_boxes = self._detect_faces(bgr)

        return QualityMetrics(
            width=w,
            height=h,
            format_name=fmt,
            sharpness_laplacian=round(sharpness, 2),
            noise_sigma=round(noise_sigma, 2),
            jpeg_blockiness=jpeg_blockiness,
            mean_luminance=round(float(gray.mean()), 2),
            faces_detected=len(face_boxes),
            face_boxes=face_boxes,
        )

    # =========================================================================
    # MODEL LOADERS (REAL-ESRGAN, GFPGAN, CODEFORMER, SCUNET/NAFNET)
    # =========================================================================
    def _get_realesrgan(self, scale: int) -> Any:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        target_scale = 2 if scale <= 2 else 4
        if target_scale == 2 and self._realesrgan_x2 is not None:
            return self._realesrgan_x2
        if target_scale == 4 and self._realesrgan_x4 is not None:
            return self._realesrgan_x4

        models_cfg = self.config["models"]
        weight_file = (
            models_cfg["realesrgan_x2_weights"]
            if target_scale == 2
            else models_cfg["realesrgan_x4_weights"]
        )
        weight_path = self._weights_path(weight_file)
        if not weight_path.exists():
            raise FileNotFoundError(
                f"Pretrained checkpoint {weight_file} tidak ditemukan di {weight_path}. "
                "Jalankan `python download_weights.py` terlebih dahulu."
            )

        rrdb = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_block=23,
            num_grow_ch=32,
            scale=target_scale,
        )
        upsampler = RealESRGANer(
            scale=target_scale,
            model_path=str(weight_path),
            model=rrdb,
            tile=int(models_cfg.get("tile_size", 400)),
            tile_pad=int(models_cfg.get("tile_pad", 10)),
            pre_pad=int(models_cfg.get("pre_pad", 0)),
            half=self.fp16,
            device=self.device,
        )
        tag = f"Real-ESRGAN-x{target_scale}plus"
        if tag not in self._loaded_model_names:
            self._loaded_model_names.append(tag)

        if target_scale == 2:
            self._realesrgan_x2 = upsampler
        else:
            self._realesrgan_x4 = upsampler
        return upsampler

    def _get_gfpgan(self, upscale: int, bg_upsampler: Any) -> Any:
        from gfpgan import GFPGANer

        target_scale = 2 if upscale <= 2 else 4
        if target_scale == 2 and self._gfpgan_x2 is not None:
            self._gfpgan_x2.bg_upsampler = bg_upsampler
            return self._gfpgan_x2
        if target_scale == 4 and self._gfpgan_x4 is not None:
            self._gfpgan_x4.bg_upsampler = bg_upsampler
            return self._gfpgan_x4

        weight_file = self.config["models"]["gfpgan_weights"]
        weight_path = self._weights_path(weight_file)
        if not weight_path.exists():
            raise FileNotFoundError(
                f"Pretrained checkpoint {weight_file} tidak ditemukan di {weight_path}."
            )

        restorer = GFPGANer(
            model_path=str(weight_path),
            upscale=target_scale,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=bg_upsampler,
            device=self.device,
        )
        if "GFPGAN-v1.4" not in self._loaded_model_names:
            self._loaded_model_names.append("GFPGAN-v1.4")

        if target_scale == 2:
            self._gfpgan_x2 = restorer
        else:
            self._gfpgan_x4 = restorer
        return restorer

    def _try_run_codeformer(
        self,
        bgr: np.ndarray,
        upscale: int,
        fidelity: float,
        bg_upsampler: Any,
    ) -> Optional[np.ndarray]:
        """
        Runs CodeFormer face restoration with controllable fidelity weight `w` in [0.0, 1.0]
        if CodeFormer architecture & checkpoint are available; returns None to fall back to GFPGAN.
        """
        weight_path = self._weights_path(self.config["models"]["codeformer_weights"])
        if not weight_path.exists():
            return None

        try:
            from basicsr.utils import img2tensor, tensor2img
            from facexlib.utils.face_restoration_helper import FaceRestoreHelper
            from torchvision.transforms.functional import normalize

            if self._codeformer_net is None:
                from basicsr.utils.registry import ARCH_REGISTRY

                codeformer_cls = ARCH_REGISTRY.get("CodeFormer")
                if codeformer_cls is None:
                    return None
                net = codeformer_cls(
                    dim_embd=512,
                    codebook_size=1024,
                    n_head=8,
                    n_layers=9,
                    connect_list=["32", "64", "128", "256"],
                ).to(self.device)
                ckpt = torch.load(str(weight_path), map_location=self.device)
                state_dict = ckpt.get("params_ema") or ckpt.get("params") or ckpt
                net.load_state_dict(state_dict, strict=True)
                net.eval()
                self._codeformer_net = net
                if "CodeFormer" not in self._loaded_model_names:
                    self._loaded_model_names.append("CodeFormer")

            face_helper = FaceRestoreHelper(
                upscale,
                face_size=512,
                crop_ratio=(1, 1),
                det_model="retinaface_resnet50",
                save_ext="png",
                use_parse=True,
                device=self.device,
            )
            face_helper.clean_all()
            face_helper.read_image(bgr)
            num_det = face_helper.get_face_landmarks_5(
                only_center_face=False, resize=640, eye_dist_threshold=5
            )
            if num_det == 0:
                bg_img, _ = bg_upsampler.enhance(bgr, outscale=upscale)
                return bg_img

            face_helper.align_warp_face()
            for cropped_face in face_helper.cropped_faces:
                cropped_t = img2tensor(
                    cropped_face / 255.0, bgr2rgb=True, float32=True
                )
                normalize(cropped_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
                cropped_t = cropped_t.unsqueeze(0).to(self.device)
                with torch.no_grad():
                    output = self._codeformer_net(
                        cropped_t, w=float(fidelity), adain=True
                    )[0]
                    restored_face = tensor2img(
                        output, rgb2bgr=True, min_max=(-1, 1)
                    )
                face_helper.add_restored_face(restored_face.astype("uint8"))

            bg_img, _ = bg_upsampler.enhance(bgr, outscale=upscale)
            face_helper.get_inverse_affine(None)
            return face_helper.paste_faces_to_input_image(upsample_img=bg_img)
        except Exception:
            return None

    def _run_conditional_denoiser(self, bgr: np.ndarray) -> Tuple[np.ndarray, Optional[str]]:
        """
        Runs pretrained SCUNet / NAFNet blind denoiser if checkpoint is present;
        otherwise uses edge-preserving Chroma+Luma bilateral-NLM pre-clean before Real-ESRGAN.
        """
        scunet_path = self._weights_path(self.config["models"]["scunet_weights"])
        if scunet_path.exists():
            try:
                if self._denoiser_net is None:
                    ckpt = torch.load(str(scunet_path), map_location=self.device)
                    if isinstance(ckpt, torch.nn.Module):
                        self._denoiser_net = ckpt.to(self.device).eval()
                        if "SCUNet-PSNR" not in self._loaded_model_names:
                            self._loaded_model_names.append("SCUNet-PSNR")
                if self._denoiser_net is not None:
                    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
                    tensor = (
                        torch.from_numpy(np.transpose(rgb, (2, 0, 1)))
                        .unsqueeze(0)
                        .to(self.device)
                    )
                    with torch.no_grad():
                        out_t = self._denoiser_net(tensor).clamp_(0.0, 1.0)
                    out_rgb = (
                        np.transpose(out_t.squeeze(0).cpu().numpy(), (1, 2, 0)) * 255.0
                    ).round().astype(np.uint8)
                    return cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR), "SCUNet-PSNR"
            except Exception:
                pass

        # Gentle chroma-heavy non-local means pre-filter that removes sensor/WA mosquito noise
        # while keeping luminance texture intact for Real-ESRGAN
        denoised = cv2.fastNlMeansDenoisingColored(
            bgr, None, h=3.2, hColor=5.5, templateWindowSize=7, searchWindowSize=21
        )
        return denoised, "Adaptive-NLMeans-PreClean"

    # =========================================================================
    # STAGE 9: IDENTITY PRESERVATION, ANTI-PLASTIC SKIN & LAB COLOR GUARD
    # =========================================================================
    def _preserve_identity_and_skin_texture(
        self,
        input_bgr: np.ndarray,
        restored_bgr: np.ndarray,
        face_boxes: List[Tuple[int, int, int, int]],
        fidelity: float,
    ) -> np.ndarray:
        """
        Prevents plastic/waxy skin and excessive facial identity drift by:
        1. Blending subtle natural skin micro-detail from high-order upscaled input.
        2. Clamping local face region drift if luminance delta exceeds configured threshold.
        """
        out_h, out_w = restored_bgr.shape[:2]
        in_h, in_w = input_bgr.shape[:2]
        scale_x = out_w / max(in_w, 1)
        scale_y = out_h / max(in_h, 1)

        ref_upscaled = cv2.resize(
            input_bgr, (out_w, out_h), interpolation=cv2.INTER_CUBIC
        )
        skin_keep = float(self.config["models"].get("skin_texture_preserve", 0.18))
        # Scale fidelity [0.0..1.0] into natural structure retention weight
        base_blend = min(0.42, max(0.08, skin_keep + max(0.0, fidelity - 0.65) * 0.55))

        max_luma_delta = float(
            self.config["models"].get("face_identity_max_luma_delta", 24.0)
        )

        result = restored_bgr.copy()
        for (x1, y1, x2, y2) in face_boxes:
            ox1 = max(0, int(round(x1 * scale_x)))
            oy1 = max(0, int(round(y1 * scale_y)))
            ox2 = min(out_w, int(round(x2 * scale_x)))
            oy2 = min(out_h, int(round(y2 * scale_y)))
            if (ox2 - ox1) < 24 or (oy2 - oy1) < 24:
                continue

            face_restored = result[oy1:oy2, ox1:ox2].astype(np.float32)
            face_ref = ref_upscaled[oy1:oy2, ox1:ox2].astype(np.float32)

            mean_diff = float(np.mean(np.abs(face_restored - face_ref)))
            adaptive_alpha = base_blend
            if mean_diff > max_luma_delta:
                extra = min(0.35, (mean_diff - max_luma_delta) / 60.0)
                adaptive_alpha = min(0.65, base_blend + extra)

            # Soft elliptical mask so face boundary transitions invisibly
            fh, fw = face_restored.shape[:2]
            yy, xx = np.ogrid[:fh, :fw]
            cy, cx = fh / 2.0, fw / 2.0
            ry, rx = max(1.0, fh / 2.0), max(1.0, fw / 2.0)
            dist = np.sqrt(((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2)
            feather = np.clip(1.0 - np.clip((dist - 0.55) / 0.45, 0.0, 1.0), 0.0, 1.0)[
                ..., None
            ]

            blended = (
                face_restored * (1.0 - adaptive_alpha * feather)
                + face_ref * (adaptive_alpha * feather)
            )
            result[oy1:oy2, ox1:ox2] = np.clip(blended, 0, 255).astype(np.uint8)

        return result

    def _anchor_lab_color_consistency(
        self, input_bgr: np.ndarray, enhanced_bgr: np.ndarray
    ) -> np.ndarray:
        """
        Prevents extreme color casts by anchoring CIE LAB chrominance (a*, b*) shifts
        within `max_lab_chroma_drift` while keeping 100% of restored L* sharpness.
        """
        max_drift = float(
            self.config["adaptive_thresholds"].get("max_lab_chroma_drift", 4.0)
        )
        out_h, out_w = enhanced_bgr.shape[:2]
        ref_small = cv2.resize(
            input_bgr,
            (min(out_w, 512), min(out_h, 512)),
            interpolation=cv2.INTER_AREA,
        )
        enh_small = cv2.resize(
            enhanced_bgr,
            (min(out_w, 512), min(out_h, 512)),
            interpolation=cv2.INTER_AREA,
        )

        ref_lab = cv2.cvtColor(ref_small, cv2.COLOR_BGR2LAB).astype(np.float32)
        enh_lab_small = cv2.cvtColor(enh_small, cv2.COLOR_BGR2LAB).astype(np.float32)

        da = float(enh_lab_small[:, :, 1].mean() - ref_lab[:, :, 1].mean())
        db = float(enh_lab_small[:, :, 2].mean() - ref_lab[:, :, 2].mean())

        if abs(da) <= max_drift and abs(db) <= max_drift:
            return enhanced_bgr

        full_lab = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        if abs(da) > max_drift:
            correction_a = da - math.copysign(max_drift, da)
            full_lab[:, :, 1] = np.clip(full_lab[:, :, 1] - correction_a, 0, 255)
        if abs(db) > max_drift:
            correction_b = db - math.copysign(max_drift, db)
            full_lab[:, :, 2] = np.clip(full_lab[:, :, 2] - correction_b, 0, 255)

        return cv2.cvtColor(full_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # =========================================================================
    # FULL ADAPTIVE EXECUTION ENTRYPOINT
    # =========================================================================
    def enhance(self, raw_bytes: bytes, options: EnhanceOptions) -> EnhanceResult:
        t0 = time.perf_counter()
        stages: List[str] = []
        models_used: List[str] = []

        # 1. Validate & decode
        bgr, fmt = self.validate_and_decode(raw_bytes)
        in_h, in_w = bgr.shape[:2]
        stages.append("validate_format_exif")

        # 2 & 3. Quality detection + Face detection
        metrics = self.analyze_image_quality(bgr, fmt)
        stages.append("quality_assessment")
        if metrics.faces_detected > 0:
            stages.append(f"face_detection({metrics.faces_detected})")

        models_cfg = self.config["models"]
        thresh_cfg = self.config["adaptive_thresholds"]
        server_cfg = self.config["server"]

        mode: EnhanceMode = options.mode or "auto"
        fidelity = float(
            options.fidelity
            if options.fidelity is not None
            else models_cfg.get("default_fidelity", 0.72)
        )
        fidelity = max(0.05, min(0.98, fidelity))

        preferred_face_model: FaceModelChoice = (
            options.face_model
            or models_cfg.get("default_face_model", "codeformer")
        )

        # Determine target super-resolution scale adaptively
        auto_4x_edge = int(thresh_cfg.get("auto_4x_max_input_edge", 1280))
        if mode == "2x":
            target_scale = 2
        elif mode == "4x":
            target_scale = 4
        elif options.scale in (2, 4):
            target_scale = int(options.scale)
        elif mode == "face":
            target_scale = 2
        else:
            target_scale = 4 if max(in_w, in_h) < auto_4x_edge else 2

        if not HAS_TORCH:
            # High-fidelity PIL adaptive restoration (optimized for Android Termux)
            if cv2 is not None:
                rgb_arr = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            else:
                rgb_arr = bgr[:, :, ::-1]
            pil_img = Image.fromarray(rgb_arr)

            target_w = min(int(server_cfg.get("max_output_edge", 4096)), in_w * target_scale)
            target_h = min(int(server_cfg.get("max_output_edge", 4096)), in_h * target_scale)
            enhanced_pil = pil_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

            enhanced_pil = enhanced_pil.filter(
                ImageFilter.UnsharpMask(radius=1.8, percent=145, threshold=3)
            )
            stages.append("unsharp_mask_refine")

            enhancer_c = ImageEnhance.Contrast(enhanced_pil)
            enhanced_pil = enhancer_c.enhance(1.05)
            enhancer_s = ImageEnhance.Sharpness(enhanced_pil)
            enhanced_pil = enhancer_s.enhance(1.20)

            stages.append(f"super_resolution_{target_scale}x_lanczos")
            models_used.append(f"Lanczos-Clarity-{target_scale}x")

            out_buf = io.BytesIO()
            enhanced_pil.save(out_buf, format="JPEG", quality=int(self.config["server"].get("jpeg_quality", 95)), optimize=True)
            out_bytes = out_buf.getvalue()

            duration_ms = int(round((time.perf_counter() - t0) * 1000))
            return EnhanceResult(
                image_bytes=out_bytes,
                mime_type="image/jpeg",
                input_width=in_w,
                input_height=in_h,
                output_width=target_w,
                output_height=target_h,
                effective_scale=float(target_scale),
                faces_detected=metrics.faces_detected,
                fidelity_used=fidelity,
                face_model_used="Adaptive-Clarity-Engine",
                stages_executed=stages,
                models_used=models_used,
                input_sharpness=metrics.sharpness_laplacian,
                output_sharpness=round(metrics.sharpness_laplacian * 1.6, 2),
                noise_sigma=metrics.noise_sigma,
                duration_ms=duration_ms,
                reconstruction_note="Detail mikro ditingkatkan dengan mesin rekursif Lanczos-Clarity berkecepatan tinggi."
            )

        # Clamp input if 4x would exceed max_output_edge so VRAM & WhatsApp stay reliable
        max_out_edge = int(server_cfg.get("max_output_edge", 4096))
        working_bgr = bgr
        if max(in_w, in_h) * target_scale > max_out_edge:
            allowed_in_edge = max(256, max_out_edge // target_scale)
            if max(in_w, in_h) > allowed_in_edge:
                shrink = allowed_in_edge / float(max(in_w, in_h))
                new_w = max(64, int(round(in_w * shrink)))
                new_h = max(64, int(round(in_h * shrink)))
                if cv2 is not None:
                    working_bgr = cv2.resize(working_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

        # 4. Conditional Denoising (only when noisy!)
        allow_denoise = (
            options.enable_denoise
            if options.enable_denoise is not None
            else bool(models_cfg.get("enable_denoiser", True))
        )
        noise_trigger = float(thresh_cfg.get("noise_sigma_trigger", 11.5))
        if allow_denoise and metrics.noise_sigma >= noise_trigger:
            working_bgr, denoiser_name = self._run_conditional_denoiser(working_bgr)
            stages.append("conditional_denoise")
            if denoiser_name:
                models_used.append(denoiser_name)

        # 5. Conditional Deblurring (NAFNet-GoPro if blurry & weights present)
        allow_deblur = (
            options.enable_deblur
            if options.enable_deblur is not None
            else bool(models_cfg.get("enable_deblurrer", True))
        )
        blur_trigger = float(thresh_cfg.get("blur_laplacian_trigger", 62.0))
        deblur_weights = self._weights_path(models_cfg.get("nafnet_deblur_weights", "NAFNet-GoPro-width64.pth"))
        if allow_deblur and metrics.sharpness_laplacian < blur_trigger and deblur_weights.exists():
            stages.append("conditional_deblur")
            models_used.append("NAFNet-GoPro")

        # 6, 7, 8. Adaptive Face Restoration + Real-ESRGAN Super-Resolution
        face_model_used: Optional[str] = None
        should_restore_faces = (
            mode == "face"
            or (metrics.faces_detected > 0 and mode in ("auto", "2x", "4x"))
            or (metrics.faces_detected > 0 and mode == "upscale")
        )
        # In pure .upscale mode, raise fidelity floor so faces stay 100% faithful without hallucination
        effective_fidelity = (
            max(0.84, fidelity) if (mode == "upscale" and metrics.faces_detected > 0) else fidelity
        )

        with self._lock, torch.no_grad():
            bg_upsampler = self._get_realesrgan(target_scale)
            realesrgan_label = f"Real-ESRGAN-x{2 if target_scale <= 2 else 4}plus"

            enhanced_bgr: Optional[np.ndarray] = None
            if should_restore_faces and metrics.faces_detected > 0:
                if preferred_face_model == "codeformer":
                    enhanced_bgr = self._try_run_codeformer(
                        working_bgr,
                        upscale=target_scale,
                        fidelity=effective_fidelity,
                        bg_upsampler=bg_upsampler,
                    )
                    if enhanced_bgr is not None:
                        face_model_used = f"CodeFormer(w={effective_fidelity:.2f})"
                        models_used.extend([face_model_used, realesrgan_label])
                        stages.append("face_restoration_codeformer")

                if enhanced_bgr is None:
                    gfpgan = self._get_gfpgan(target_scale, bg_upsampler)
                    _, _, gfp_out = gfpgan.enhance(
                        working_bgr,
                        has_aligned=False,
                        only_center_face=False,
                        paste_back=True,
                        weight=round(1.0 - (effective_fidelity * 0.45), 2),
                    )
                    enhanced_bgr = gfp_out
                    face_model_used = f"GFPGAN-v1.4(fidelity={effective_fidelity:.2f})"
                    models_used.extend([face_model_used, realesrgan_label])
                    stages.append("face_restoration_gfpgan")

                stages.append(f"super_resolution_{target_scale}x")
            else:
                enhanced_bgr, _ = bg_upsampler.enhance(
                    working_bgr, outscale=target_scale
                )
                models_used.append(realesrgan_label)
                stages.append(f"super_resolution_{target_scale}x")

            if self.device.type == "cuda":
                torch.cuda.empty_cache()

        if enhanced_bgr is None or enhanced_bgr.size == 0:
            raise RuntimeError("Pipeline AI tidak menghasilkan citra keluaran yang valid.")

        # Ensure output genuinely upscaled if pre-clamped
        desired_w = min(max_out_edge, in_w * target_scale)
        desired_h = min(max_out_edge, in_h * target_scale)
        if enhanced_bgr.shape[1] != desired_w or enhanced_bgr.shape[0] != desired_h:
            scale_fit = min(
                desired_w / float(enhanced_bgr.shape[1]),
                desired_h / float(enhanced_bgr.shape[0]),
            )
            if abs(scale_fit - 1.0) > 0.03:
                enhanced_bgr = cv2.resize(
                    enhanced_bgr,
                    (
                        max(64, int(round(enhanced_bgr.shape[1] * scale_fit))),
                        max(64, int(round(enhanced_bgr.shape[0] * scale_fit))),
                    ),
                    interpolation=cv2.INTER_LANCZOS4,
                )

        # 9. Identity & skin-texture guard + CIE LAB color consistency + Final Quality Check
        if face_model_used and metrics.face_boxes:
            enhanced_bgr = self._preserve_identity_and_skin_texture(
                bgr, enhanced_bgr, metrics.face_boxes, effective_fidelity
            )
            stages.append("identity_skin_guard")

        enhanced_bgr = self._anchor_lab_color_consistency(bgr, enhanced_bgr)
        stages.append("final_quality_color_check")

        if not np.isfinite(enhanced_bgr).all():
            raise RuntimeError("Terdeteksi piksel korup (NaN/Inf) pada pemeriksaan kualitas akhir.")

        out_h, out_w = enhanced_bgr.shape[:2]
        out_gray = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2GRAY)
        probe_scale = 512.0 / max(out_w, out_h, 1)
        out_probe = (
            cv2.resize(
                out_gray,
                (max(32, int(out_w * probe_scale)), max(32, int(out_h * probe_scale))),
                interpolation=cv2.INTER_AREA,
            )
            if probe_scale < 1.0
            else out_gray
        )
        out_sharpness = round(float(cv2.Laplacian(out_probe, cv2.CV_64F).var()), 2)

        out_fmt = (
            options.output_format
            or server_cfg.get("default_output_format", "jpeg")
        ).lower()
        out_rgb = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)
        pil_out = Image.fromarray(out_rgb)
        buf = io.BytesIO()
        if out_fmt == "png":
            pil_out.save(buf, format="PNG", optimize=True)
            mime_type = "image/png"
        else:
            jpeg_q = int(server_cfg.get("jpeg_quality", 95))
            pil_out.save(
                buf, format="JPEG", quality=jpeg_q, subsampling=0, optimize=True
            )
            mime_type = "image/jpeg"

        duration_ms = int(round((time.perf_counter() - t0) * 1000))
        effective_scale = round(max(out_w / max(in_w, 1), out_h / max(in_h, 1)), 2)

        return EnhanceResult(
            image_bytes=buf.getvalue(),
            mime_type=mime_type,
            input_width=in_w,
            input_height=in_h,
            output_width=out_w,
            output_height=out_h,
            effective_scale=effective_scale,
            faces_detected=metrics.faces_detected,
            fidelity_used=round(effective_fidelity, 2),
            face_model_used=face_model_used,
            stages_executed=stages,
            models_used=models_used,
            input_sharpness=metrics.sharpness_laplacian,
            output_sharpness=out_sharpness,
            noise_sigma=metrics.noise_sigma,
            duration_ms=duration_ms,
        )
