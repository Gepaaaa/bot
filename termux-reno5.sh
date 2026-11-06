#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Installer WABot Khusus Oppo Reno 5 (Snapdragon 720G / 8GB RAM Turbo Mode)
# Pure Termux di HP: WABot Lengkap + Mesin AI Super-Resolution (4x-UltraSharp / Real-ESRGAN)
# ==============================================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/termux.sh" ]; then
  exec bash "$DIR/termux.sh" reno5 "$@"
elif [ -f "$HOME/wabot/termux.sh" ]; then
  exec bash "$HOME/wabot/termux.sh" reno5 "$@"
else
  # Ambil installer terbaru dan jalankan profil reno5
  curl -sL "${APP_URL:-https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app}/termux.sh" | bash -s -- reno5 "$@"
fi
