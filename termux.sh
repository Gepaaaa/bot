#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#  WABot 24/7 & Web Panel — Termux Auto-Installer (1-Kali Jalan Langsung Beres)
#  Kompatibel dengan arsitektur ARM 32-bit & 64-bit, PM2 daemon, & Localhost UI
# ==============================================================================
set -e

echo ""
echo "============================================================"
echo "  🚀 WABOT MULTI-FEATURE — INSTALLER TERMUX 24/7"
echo "  HP Android Lokal + Localhost Management (http://localhost:3000)"
echo "============================================================"
echo ""

# 1. Aktifkan Termux WakeLock agar HP tidak sleep saat layar mati
echo "⚡ [1/6] Mengaktifkan Termux WakeLock (Anti-Sleep Layar Mati)..."
termux-wake-lock 2>/dev/null || true

# 2. Update repository & pasang paket dasar Termux
echo "📦 [2/6] Memperbarui paket & menginstal Node.js LTS, Git, dan FFmpeg..."
pkg update -y
pkg install -y nodejs-lts git ffmpeg ncurses-utils

# 3. Pasang PM2 Process Manager global untuk menjaga bot aktif 24/7
echo "⚙️ [3/6] Menyiapkan PM2 Process Manager (Auto Restart 24/7)..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund || npm install -g pm2 --unsafe-perm || true
fi

# 4. Tentukan folder kerja bot
BOT_DIR="$(pwd)"
if [ ! -f "$BOT_DIR/package.json" ]; then
  echo "📂 [4/6] Mengunduh repository bot ke ~/wabot..."
  mkdir -p "$HOME/wabot"
  cd "$HOME/wabot"
  if [ -d ".git" ]; then
    git pull || true
  else
    git clone https://github.com/Gepaaaa/panel-.git . || git clone https://github.com/Gepaaaa/bot.git . || true
  fi
  BOT_DIR="$HOME/wabot"
else
  echo "📂 [4/6] Menggunakan direktori saat ini: $BOT_DIR"
fi

cd "$BOT_DIR"

# 5. Instal dependensi Node.js & Sharp WebAssembly untuk kompatibilitas Android 32/64-bit
echo "📥 [5/6] Menginstal dependensi & engine stiker (@img/sharp-wasm32)..."
npm install --legacy-peer-deps --no-audit --no-fund
npm install @img/sharp-wasm32 --no-audit --no-fund 2>/dev/null || true

# Build tampilan Web Panel agar siap diakses di http://localhost:3000
if [ ! -f "dist/index.html" ]; then
  echo "🎨 [5.1] Mengompilasi Web Control Panel (localhost:3000)..."
  npm run build || {
    echo "⚠️ Build dist dilewati, membuat fallback static HTML..."
    mkdir -p dist
    echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WABot Localhost</title></head><body style="font-family:sans-serif;padding:24px;background:#0c0c0e;color:#fff;"><h2>WABot Server Aktif di Localhost</h2><p>Buka terminal Termux untuk memantau log atau ketik <code>pm2 logs wabot</code>.</p></body></html>' > dist/index.html
  }
fi

# 6. Buat shortcut 'bot' di Termux agar mudah dipanggil kapan pun
PREFIX_BIN="/data/data/com.termux/files/usr/bin"
if [ -d "$PREFIX_BIN" ]; then
  cat > "$PREFIX_BIN/bot" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
echo "============================================================"
echo "  WABot 24/7 Console Monitor"
echo "  🌐 Kelola di Browser HP: http://localhost:3000"
echo "  Tekan CTRL + C untuk keluar dari monitor log (bot tetap ON)"
echo "============================================================"
pm2 logs wabot
EOF
  chmod +x "$PREFIX_BIN/bot"
fi

# 7. Jalankan bot melalui PM2
echo "🔥 [6/6] Menjalankan Bot di Background dengan PM2..."
pm2 delete wabot 2>/dev/null || true
pm2 start index.js --name "wabot"
pm2 save 2>/dev/null || true

# Deteksi IP lokal HP jika terhubung WiFi
WIFI_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n1 || echo "")

echo ""
echo "============================================================"
echo "  🎉 SELESAI 100%! WABOT SEKARANG AKTIF 24/7 DI HP KAMU"
echo "============================================================"
echo ""
echo "  🌐 CARA MENGELOLA BOT (LOCALHOST):"
echo "     1. Buka browser (Google Chrome) di HP ini."
echo "     2. Ketik alamat: http://localhost:3000  (atau http://127.0.0.1:3000)"
echo "     3. Kamu bisa cek status, Pairing Code, ubah prefix, dan uji fitur!"
if [ -n "$WIFI_IP" ]; then
echo ""
echo "  💻 BUKA DARI LAPTOP / PC (Satu Jaringan WiFi):"
echo "     Ketik alamat: http://$WIFI_IP:3000"
fi
echo ""
echo "  📱 PERINTAH CEPAT DI TERMUX:"
echo "     - Ketik:  bot              (Langsung pantau log & kode pairing)"
echo "     - Ketik:  pm2 status       (Cek kondisi bot hidup/mati & RAM)"
echo "     - Ketik:  pm2 restart wabot (Restart bot)"
echo "     - Ketik:  pm2 stop wabot   (Matikan bot sementara)"
echo ""
echo "  🔋 TIPS PENTING AGAR TIDAK MATI DI HP (XIAOMI, OPPO, VIVO, SAMSUNG):"
echo "     Buka Pengaturan HP -> Aplikasi -> Termux:"
echo "     - Penghemat Baterai: Pilih 'Tidak ada pembatasan' (No Restrictions)"
echo "     - Autostart / Mulai Otomatis: Aktifkan"
echo "============================================================"
echo ""
echo "📌 Menampilkan log langsung sekarang (Tekan CTRL + C untuk menutup log):"
sleep 1
pm2 logs wabot
