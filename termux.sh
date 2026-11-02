#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#  WABot Multi-Feature 24/7 — Universal Termux Installer
#  Dirancang khusus untuk Xiaomi Redmi 9C (3/32GB, ARMv7 32-bit MIUI 12)
#  maupun HP Android 64-bit (aarch64) + Web Control Panel (localhost:3000)
# ==============================================================================
set -e

ARCH="$(uname -m 2>/dev/null || echo unknown)"

echo ""
echo "============================================================"
echo "  WABOT MULTI-FEATURE — INSTALLER TERMUX 24/7"
echo "  Arsitektur HP Terdeteksi : $ARCH"
echo "  Mode Hemat RAM           : Aktif (Optimal untuk RAM 3GB)"
echo "============================================================"
echo ""

# 1. Aktifkan WakeLock agar CPU tetap terjaga saat layar HP dimatikan
echo "[1/6] Mengaktifkan Termux WakeLock (Anti-Sleep saat layar mati)..."
termux-wake-lock 2>/dev/null || true

# 2. Pasang paket sistem Termux (Node.js 22 LTS, FFmpeg + libwebp, Git, Curl, Tar)
echo "[2/6] Memperbarui repositori & menginstal Node.js LTS, FFmpeg, libwebp..."
pkg update -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" || pkg update -y
pkg install -y nodejs-lts ffmpeg libwebp git curl tar

# 3. Pasang PM2 Process Manager global jika belum tersedia
echo "[3/6] Menyiapkan PM2 Process Manager (Auto-Restart 24/7)..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund
fi

# 4. Pastikan kita berada di folder project bot yang berisi package.json
BOT_DIR="$(pwd)"
if [ ! -f "$BOT_DIR/package.json" ]; then
  if [ -f "$HOME/wabot/package.json" ]; then
    BOT_DIR="$HOME/wabot"
  else
    echo ""
    echo "[!] File package.json tidak ditemukan di folder ini ($BOT_DIR)."
    echo "    Pastikan kamu sudah mengekstrak paket .tar.gz ke ~/wabot"
    echo "    atau melakukan git clone repo GitHub milikmu ke ~/wabot,"
    echo "    lalu jalankan: cd ~/wabot && bash termux.sh"
    exit 1
  fi
fi

cd "$BOT_DIR"
echo "[4/6] Direktori kerja aktif: $BOT_DIR"

# 5. Instalasi dependensi runtime murni (WASM + JS, bebas error kompilasi C++ / sharp 32-bit)
echo "[5/6] Memasang dependensi runtime ringan (tanpa kompilasi native berat)..."
npm install --omit=dev --no-optional --legacy-peer-deps --no-audit --no-fund

# 6. Pasang perintah interaktif 'bot' di Termux (/usr/bin/bot)
PREFIX_BIN="${PREFIX:-/data/data/com.termux/files/usr}/bin"
if [ -d "$PREFIX_BIN" ]; then
  cat > "$PREFIX_BIN/bot" << 'BOTEOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true

API_BASE="http://127.0.0.1:3000"

print_status() {
  node -e '
    (async () => {
      try {
        const [netRes, stRes] = await Promise.all([
          fetch("http://127.0.0.1:3000/api/network-info"),
          fetch("http://127.0.0.1:3000/api/state")
        ]);
        const net = await netRes.json();
        const st = await stRes.json();
        const wa = st.waState || {};
        const cfg = st.config || {};
        console.log("============================================================");
        console.log("  STATUS SERVER WABOT 24/7");
        console.log("============================================================");
        console.log("  Nama Bot      :", cfg.botName || "WABot");
        console.log("  Status WA     :", (wa.status || "disconnected").toUpperCase());
        console.log("  Nomor Tertaut :", wa.connectedUser?.phone ? ("+" + wa.connectedUser.phone) : "Belum tertaut");
        console.log("  Prefix Aktif  :", cfg.prefix || ".");
        console.log("  Pengolah Media:", net.imageBackend || "resvg-wasm+ffmpeg");
        console.log("  Pemakaian RAM :", (net.memoryRssMb || "-") + " MB (" + (net.arch || "") + ")");
        console.log("------------------------------------------------------------");
        console.log("  Kontrol di HP ini (Chrome) : " + (net.localhostUrl || "http://localhost:3000"));
        if (Array.isArray(net.lanUrls) && net.lanUrls.length > 0) {
          console.log("  Kontrol dari HP Utama/PC   : " + net.lanUrls.join(" , "));
        } else {
          console.log("  Kontrol dari HP Utama/PC   : Hubungkan ke WiFi yang sama lalu cek IP HP");
        }
        console.log("============================================================");
      } catch {
        console.log("[!] Server belum merespons di port 3000. Coba ketik: bot restart");
      }
    })();
  '
}

request_pair() {
  PHONE="$1"
  if [ -z "$PHONE" ]; then
    printf "Masukkan nomor WhatsApp Bot (contoh 6281234567890): "
    read -r PHONE
  fi
  PHONE="$(echo "$PHONE" | tr -cd '0-9')"
  if [ -z "$PHONE" ]; then
    echo "[!] Nomor tidak valid."
    exit 1
  fi
  echo "Meminta 8-digit Pairing Code untuk +$PHONE ..."
  node -e '
    const phone = process.argv[1];
    (async () => {
      try {
        const res = await fetch("http://127.0.0.1:3000/api/wa/connect-pairing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (!data.ok) {
          console.error("[!] Gagal:", data.error || "Tidak dapat meminta kode.");
          process.exit(1);
        }
        for (let i = 0; i < 20; i++) {
          const stRes = await fetch("http://127.0.0.1:3000/api/state");
          const st = await stRes.json();
          const code = st.waState?.pairingCode;
          if (code) {
            console.log("");
            console.log("============================================================");
            console.log("  KODE PAIRING WHATSAPP :  " + code);
            console.log("============================================================");
            console.log("  Buka WhatsApp > Perangkat Tertaut > Tautkan dgn nomor HP");
            console.log("");
            process.exit(0);
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        console.log("[i] Kode masih diproses. Cek dengan perintah: bot logs");
      } catch (e) {
        console.error("[!] Pastikan bot sedang menyala (ketik: bot status).");
        process.exit(1);
      }
    })();
  ' "$PHONE"
}

change_prefix() {
  NEW_PFX="$1"
  if [ -z "$NEW_PFX" ]; then
    printf "Masukkan prefix baru (contoh . atau ! atau #): "
    read -r NEW_PFX
  fi
  if [ -z "$NEW_PFX" ]; then
    echo "[!] Prefix tidak boleh kosong."
    exit 1
  fi
  node -e '
    const prefix = process.argv[1];
    (async () => {
      const res = await fetch("http://127.0.0.1:3000/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix })
      });
      const data = await res.json();
      if (data.ok) {
        console.log("[OK] Prefix bot berhasil diubah menjadi:", data.config.prefix);
      } else {
        console.log("[!] Gagal mengubah prefix.");
      }
    })();
  ' "$NEW_PFX"
}

case "${1:-menu}" in
  status|ip)
    print_status
    ;;
  pair|pairing)
    request_pair "$2"
    ;;
  prefix)
    change_prefix "$2"
    ;;
  logs|log)
    pm2 logs wabot
    ;;
  restart)
    pm2 restart wabot
    sleep 2
    print_status
    ;;
  update)
    if [ -d "$HOME/wabot/.git" ]; then
      echo "[Update] Mengambil pembaruan terbaru dari Git..."
      (cd "$HOME/wabot" && git pull && rm -f server.bundle.mjs)
      pm2 restart wabot
      sleep 2
      print_status
    else
      echo "[i] Folder ~/wabot dipasang dari paket .tar.gz (bukan git clone)."
      echo "    Untuk update, unduh ulang wabot-redmi9c-ready.tar.gz ke folder Download lalu jalankan:"
      echo "    tar -xzf ~/storage/downloads/wabot-redmi9c-ready.tar.gz -C ~/wabot && bot restart"
    fi
    ;;
  stop)
    pm2 stop wabot
    ;;
  start)
    pm2 start wabot || (cd "$HOME/wabot" && pm2 start index.js --name "wabot" --node-args="--max-old-space-size=256" --max-memory-restart 320M)
    ;;
  *)
    print_status
    echo ""
    echo "Pilih aksi cepat:"
    echo "  1) Tautkan Nomor WA (Minta Kode Pairing 8 Digit)"
    echo "  2) Ubah Prefix Perintah (. / ! / #)"
    echo "  3) Lihat Log Aktivitas Realtime (CTRL+C untuk keluar)"
    echo "  4) Restart Mesin Bot"
    echo "  5) Matikan Bot Sementara"
    echo "  6) Update Kode Bot Terbaru (git pull + restart)"
    echo "  0) Keluar"
    printf "\nPilihan [0-6]: "
    read -r CHOICE
    case "$CHOICE" in
      1) request_pair "" ;;
      2) change_prefix "" ;;
      3) pm2 logs wabot ;;
      4) pm2 restart wabot ;;
      5) pm2 stop wabot ;;
      6) "$0" update ;;
      *) exit 0 ;;
    esac
    ;;
esac
BOTEOF
  chmod +x "$PREFIX_BIN/bot"
fi

# 7. Jalankan satu proses bersih dengan batas memori optimal untuk Redmi 9C (3GB RAM)
echo "[6/6] Menyalakan mesin WABot di background via PM2..."
pm2 delete wabot 2>/dev/null || true
pm2 start index.js --name "wabot" --node-args="--max-old-space-size=256" --max-memory-restart 320M
pm2 save 2>/dev/null || true

# Tunggu 3 detik hingga server port 3000 siap lalu tampilkan info IP & kontrol lengkap
sleep 3

LAN_URLS="$(node -e '
  const os = require("node:os");
  const urls = [];
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list || []) {
        if ((n.family === "IPv4" || n.family === 4) && !n.internal && n.address) {
          urls.push("http://" + n.address + ":3000");
        }
      }
    }
  } catch {}
  process.stdout.write(urls.join(" , "));
' 2>/dev/null || true)"

echo ""
echo "============================================================"
echo "  SELESAI! WABOT AKTIF 24/7 DI HP INI"
echo "============================================================"
echo ""
echo "  PUSAT KONTROL MENU, TEMPLATE & PAIRING:"
echo "  1. Dari Browser Chrome di HP Redmi 9C ini:"
echo "     -> http://localhost:3000"
if [ -n "$LAN_URLS" ]; then
  echo "  2. Dari HP Utama / Laptop kamu (Satu WiFi / Hotspot):"
  echo "     -> $LAN_URLS"
fi
echo "  3. Langsung dari Terminal Termux:"
echo "     -> Ketik: bot               (Menu interaktif lengkap)"
echo "     -> Ketik: bot pair 628xxx   (Minta 8-digit Pairing Code)"
echo "     -> Ketik: bot prefix .      (Ganti prefix bot)"
echo "     -> Ketik: bot logs          (Pantau chat masuk realtime)"
echo ""
echo "  WAJIB SETTING DI MIUI REDMI 9C AGAR TIDAK MATI SAAT LAYAR GELAP:"
echo "  - Pengaturan > Aplikasi > Kelola Aplikasi > Termux:"
echo "    1) Mulai Otomatis (Autostart) : AKTIFKAN"
echo "    2) Penghemat Baterai          : TIDAK ADA PEMBATASAN"
echo "  - Buka Recent Apps > Tekan tahan kartu Termux > Ketuk ikon GEMBOK"
echo "============================================================"
echo ""
