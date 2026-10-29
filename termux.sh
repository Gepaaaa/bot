#!/usr/bin/env bash
set -e

echo "============================================================"
echo "  WABot 24/7 — Installer Otomatis Server HP Android (Termux)"
echo "============================================================"

# 1. Jika dijalankan di dalam Termux Android, aktifkan WakeLock & masuk ke Ubuntu ARM64 otomatis
#    supaya library gambar/stiker (sharp, ffmpeg, emoji font) jalan 100% tanpa error kompilasi!
if [ -n "$TERMUX_VERSION" ] && [ "$1" != "--inside-ubuntu" ]; then
  echo "[1/4] Mengaktifkan Termux WakeLock (agar layar HP mati bot tetap ON 24/7)..."
  termux-wake-lock || true

  echo "[2/4] Memastikan paket dasar Termux & Ubuntu container tersedia..."
  pkg update -y
  pkg install -y proot-distro git curl

  if ! proot-distro list | grep -q "ubuntu.*installed"; then
    echo "[3/4] Mengunduh sistem Ubuntu ringan (hanya sekali saja di awal)..."
    proot-distro install ubuntu
  fi

  PROJECT_DIR="$(pwd)"

  # Buat perintah pintasan 'bot' di Termux agar kapan pun HP habis mati lampu/restart,
  # cukup buka Termux lalu ketik: bot
  cat > "$PREFIX/bin/bot" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock || true
exec proot-distro login ubuntu --shared-tmp -- bash -c "cd '$PROJECT_DIR' && node index.js"
EOF
  chmod +x "$PREFIX/bin/bot"

  echo "[4/4] Masuk ke lingkungan server Ubuntu & menyiapkan mesin WABot..."
  exec proot-distro login ubuntu --shared-tmp -- bash -c "cd '$PROJECT_DIR' && bash termux.sh --inside-ubuntu"
fi

# 2. Bagian ini berjalan di dalam Ubuntu (atau VPS Linux biasa)
echo "[Ubuntu] Memeriksa Node.js 22 LTS, FFmpeg, dan Font Stiker Emoji..."
export DEBIAN_FRONTEND=noninteractive

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl ca-certificates ffmpeg fontconfig fonts-liberation fonts-noto-color-emoji git
  fc-cache -fv || true
fi

NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
else
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 20 ]; then
    NEED_NODE=1
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
  echo "[Ubuntu] Memasang Node.js untuk arsitektur ($ARCH)..."

  if [ "$ARCH" = "armhf" ] || [ "$ARCH" = "armv7l" ] || [ "$ARCH" = "arm" ]; then
    echo "[Ubuntu] Arsitektur 32-bit (armhf) terdeteksi. Menggunakan build Node.js resmi untuk ARMv7..."
    apt-get update -y
    apt-get install -y xz-utils curl tar ca-certificates || true

    # Unduh binary resmi Node.js v20 LTS langsung dari nodejs.org (bebas ketergantungan NodeSource)
    NODE_ARM_FILE=$(curl -fsSL https://nodejs.org/dist/latest-v20.x/ | grep -o 'node-v20\.[0-9]*\.[0-9]*-linux-armv7l\.tar\.xz' | head -n1 || echo "")
    if [ -n "$NODE_ARM_FILE" ]; then
      echo "[Ubuntu] Mengunduh https://nodejs.org/dist/latest-v20.x/$NODE_ARM_FILE..."
      curl -fsSL "https://nodejs.org/dist/latest-v20.x/$NODE_ARM_FILE" -o /tmp/node-arm.tar.xz
      tar -xJf /tmp/node-arm.tar.xz -C /usr/local --strip-components=1
      rm -f /tmp/node-arm.tar.xz
    else
      # Cadangan: pasang dari repository bawaan Ubuntu
      echo "[Ubuntu] Mengunduh via apt Ubuntu..."
      apt-get install -y nodejs npm
    fi
  else
    # 64-bit (arm64 / amd64) aman menggunakan NodeSource LTS resmi
    echo "[Ubuntu] Menginstal Node.js 22 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
fi

echo "[WABot] Menginstal dependensi project (npm install)..."
npm install --legacy-peer-deps --no-audit --no-fund

echo ""
echo "============================================================"
echo "  INSTALASI SELESAI!"
echo "  Tips: Lain kali kalau HP habis direstart, cukup buka Termux"
echo "  lalu ketik:   bot"
echo "============================================================"
echo ""

exec node index.js
