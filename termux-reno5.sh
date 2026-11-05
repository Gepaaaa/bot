#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Installer WABot Khusus Oppo Reno 5 (Snapdragon 720G / RAM 8GB Turbo Mode)
# ==============================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/termux.sh" ]; then
  exec bash "$DIR/termux.sh" reno5 "$@"
elif [ -f "$HOME/wabot/termux.sh" ]; then
  exec bash "$HOME/wabot/termux.sh" reno5 "$@"
else
  curl -sL "https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app/termux.sh" | bash -s -- reno5 "$@"
fi
