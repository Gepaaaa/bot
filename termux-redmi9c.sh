#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Installer WABot Khusus Xiaomi Redmi 9C (Helio G35 / RAM 3GB Armor Mode)
# ==============================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/termux.sh" ]; then
  exec bash "$DIR/termux.sh" redmi9c "$@"
elif [ -f "$HOME/wabot/termux.sh" ]; then
  exec bash "$HOME/wabot/termux.sh" redmi9c "$@"
else
  curl -sL "https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app/termux.sh" | bash -s -- redmi9c "$@"
fi
