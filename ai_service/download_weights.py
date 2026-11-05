#!/usr/bin/env python3
"""
Download official pretrained checkpoints for Real-ESRGAN, GFPGAN, CodeFormer,
RetinaFace, and SCUNet / NAFNet into ./weights.
"""
import argparse
import hashlib
import os
import sys
import urllib.request
from pathlib import Path

WEIGHT_MANIFEST = {
    "4x-UltraSharp.pth": {
        "url": "https://huggingface.co/lokcx/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth",
        "mirrors": [
            "https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x-UltraSharp.pth",
        ],
        "min_mb": 60,
        "group": "core",
        "desc": "Model Premier Super-Resolution (Super Ajib, Detail Alami tanpa efek plastik)",
    },
    "RealESRGAN_x4plus.pth": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        "mirrors": [
            "https://huggingface.co/lokcx/4x-Ultrasharp/resolve/main/RealESRGAN_x4plus.pth",
        ],
        "min_mb": 60,
        "group": "core",
        "desc": "Real-ESRGAN x4 Standar",
    },
    "RealESRGAN_x2plus.pth": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
        "mirrors": [
            "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x2plus.pth",
        ],
        "min_mb": 60,
        "group": "core",
        "desc": "Real-ESRGAN x2 Standar",
    },
    "GFPGANv1.4.pth": {
        "url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        "mirrors": [
            "https://huggingface.co/MonsterMMORPG/tools/resolve/main/GFPGANv1.4.pth",
        ],
        "min_mb": 330,
        "group": "face",
        "desc": "GFPGAN v1.4 Face Restoration",
    },
    "codeformer.pth": {
        "url": "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth",
        "mirrors": [
            "https://huggingface.co/MonsterMMORPG/tools/resolve/main/codeformer.pth",
        ],
        "min_mb": 350,
        "group": "face",
        "desc": "CodeFormer Natural Face Restoration (Fidelity Controllable)",
    },
    "detection_Resnet50_Final.pth": {
        "url": "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth",
        "mirrors": [],
        "min_mb": 100,
        "group": "face",
        "desc": "RetinaFace ResNet50 Face Detector",
    },
    "parsing_parsenet.pth": {
        "url": "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth",
        "mirrors": [],
        "min_mb": 80,
        "group": "face",
        "desc": "Face ParseNet",
    },
    "scunet_color_real_psnr.pth": {
        "url": "https://github.com/cszn/KAIR/releases/download/v1.0/scunet_color_real_psnr.pth",
        "mirrors": [],
        "min_mb": 65,
        "group": "denoise",
        "desc": "SCUNet Blind Denoiser",
    },
}


def download_file_with_mirrors(meta: dict, dest: Path, min_mb: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size >= min_mb * 1024 * 1024:
        print(f"[skip] {dest.name} already exists ({dest.stat().st_size / (1024 * 1024):.1f} MB)")
        return

    urls = [meta["url"]] + list(meta.get("mirrors", []))
    last_err = None
    for idx, url in enumerate(urls):
        try:
            tmp_path = dest.with_suffix(".part")
            mirror_tag = f" (mirror {idx})" if idx > 0 else ""
            print(f"[download] Fetching {dest.name}{mirror_tag} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "WABot-AI-Service/1.0"})
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp_path, "wb") as out:
                hasher = hashlib.sha256()
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    hasher.update(chunk)

            size_mb = tmp_path.stat().st_size / (1024 * 1024)
            if size_mb < min_mb:
                tmp_path.unlink(missing_ok=True)
                raise RuntimeError(f"Downloaded {dest.name} looks incomplete ({size_mb:.1f} MB < {min_mb} MB)")

            os.replace(tmp_path, dest)
            print(f"[ok] {dest.name} saved ({size_mb:.1f} MB, sha256={hasher.hexdigest()[:12]}...)")
            return
        except Exception as exc:
            last_err = exc
            print(f"[retry] URL {url} gagal: {exc}")

    raise RuntimeError(f"Gagal mengunduh {dest.name} dari semua mirror: {last_err}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download pretrained AI restoration weights")
    parser.add_argument("--weights-dir", default="./weights", help="Destination folder for .pth weights")
    parser.add_argument(
        "--core-only",
        action="store_true",
        help="Download only premier core super-resolution models (4x-UltraSharp & RealESRGAN)",
    )
    parser.add_argument(
        "--skip-denoise",
        action="store_true",
        help="Skip optional SCUNet denoiser weights if VRAM/disk is tight",
    )
    args = parser.parse_args()

    weights_dir = Path(args.weights_dir).resolve()
    for name, meta in WEIGHT_MANIFEST.items():
        if args.core_only and meta["group"] != "core":
            continue
        if args.skip_denoise and meta["group"] == "denoise":
            continue
        try:
            download_file_with_mirrors(meta, weights_dir / name, int(meta["min_mb"]))
        except Exception as exc:
            print(f"[warn] Failed to download {name}: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
