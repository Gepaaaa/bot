#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Installer WABot Khusus Xiaomi Redmi 9C (3/32GB ARMv7 - Armor Mode 24/7)
# Pure Termux di HP: Tanpa Fitur HD Image (Bebas Lag & Anti Force-Close RAM)
# ==============================================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/termux.sh" ]; then
  exec bash "$DIR/termux.sh" redmi9c "$@"
elif [ -f "$HOME/wabot/termux.sh" ]; then
  exec bash "$HOME/wabot/termux.sh" redmi9c "$@"
else
  # Ambil installer terbaru dan jalankan profil redmi9c
  curl -sL "${APP_URL:-https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app}/termux.sh" | bash -s -- redmi9c "$@"
fi
