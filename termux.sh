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

# 2. Pasang paket sistem Termux (Node.js 22 LTS, FFmpeg + libwebp, Git, Curl, Tar, Cloudflared)
echo "[2/6] Memperbarui repositori & menginstal Node.js LTS, FFmpeg, libwebp, cloudflared..."
pkg update -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" || pkg update -y
pkg install -y nodejs-lts ffmpeg libwebp git curl tar
pkg install -y cloudflared 2>/dev/null || true

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
        const [netRes, stRes, rtRes] = await Promise.all([
          fetch("http://127.0.0.1:3000/api/network-info"),
          fetch("http://127.0.0.1:3000/api/state"),
          fetch("http://127.0.0.1:3000/api/remote-tunnel").catch(() => null)
        ]);
        const net = await netRes.json();
        const st = await stRes.json();
        const rt = rtRes && rtRes.ok ? await rtRes.json() : null;
        const wa = st.waState || {};
        const cfg = st.config || {};
        console.log("============================================================");
        console.log("  STATUS SERVER WABOT 24/7");
        console.log("============================================================");
        console.log("  Nama Bot      :", cfg.botName || "WABot");
        console.log("  Status WA     :", (wa.status || "disconnected").toUpperCase());
        console.log("  Nomor Tertaut :", wa.connectedUser?.phone ? ("+" + wa.connectedUser.phone) : "Belum tertaut");
        console.log("  Nomor Owner   : +" + (cfg.antiBan?.ownerNumber || "6289673533963"));
        console.log("  Prefix Aktif  :", cfg.prefix || ".");
        console.log("  Pemakaian RAM :", (net.memoryRssMb || "-") + " MB (" + (net.arch || "") + ")");
        console.log("------------------------------------------------------------");
        console.log("  1) Di HP Redmi 9C ini     : " + (net.localhostUrl || "http://localhost:3000"));
        if (Array.isArray(net.lanUrls) && net.lanUrls.length > 0) {
          console.log("  2) HP ke-2 (Satu Wi-Fi)   : " + net.lanUrls.join(" , "));
        } else {
          console.log("  2) HP ke-2 (Satu Wi-Fi)   : Hubungkan ke Wi-Fi rumah lalu ketik bot status");
        }
        if (rt && rt.magicUrl) {
          console.log("  3) HP ke-2 (Luar Rumah)   : " + rt.magicUrl);
        } else {
          console.log("  3) HP ke-2 (Luar Rumah)   : Ketik \"bot remote\" atau kirim \".panel\" dari WA Owner");
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

change_owner() {
  NEW_OWNER="$1"
  if [ -z "$NEW_OWNER" ]; then
    printf "Masukkan nomor WA HP keduamu/Owner (contoh 6289673533963): "
    read -r NEW_OWNER
  fi
  NEW_OWNER="$(echo "$NEW_OWNER" | tr -cd '0-9')"
  case "$NEW_OWNER" in
    08*) NEW_OWNER="62${NEW_OWNER#0}" ;;
    8*)  NEW_OWNER="62${NEW_OWNER}" ;;
  esac
  if [ -z "$NEW_OWNER" ]; then
    echo "[!] Nomor Owner tidak valid."
    exit 1
  fi
  node -e '
    const ownerNumber = process.argv[1];
    (async () => {
      const stRes = await fetch("http://127.0.0.1:3000/api/state");
      const st = await stRes.json();
      const prevAntiBan = st.config?.antiBan || {};
      const res = await fetch("http://127.0.0.1:3000/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antiBan: { ...prevAntiBan, ownerNumber } })
      });
      const data = await res.json();
      if (data.ok) {
        console.log("[OK] Nomor WA Owner berhasil disetel ke: +" + ownerNumber);
        console.log("     Sekarang kamu bisa chat pribadi \".panel\" dari nomor ini ke bot kapan saja!");
      } else {
        console.log("[!] Gagal mengubah Nomor Owner.");
      }
    })();
  ' "$NEW_OWNER"
}

manage_remote() {
  SUB="${1:-on}"
  if [ "$SUB" = "off" ] || [ "$SUB" = "stop" ]; then
    node -e '
      (async () => {
        await fetch("http://127.0.0.1:3000/api/remote-tunnel/stop", { method: "POST" });
        console.log("[OK] Link akses luar rumah berhasil dimatikan.");
      })();
    '
    return
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "[+] Menginstal paket resmi cloudflared di Termux (sekali saja)..."
    pkg install -y cloudflared || true
  fi

  echo "[+] Membuka jalur akses aman luar rumah (Cloudflare HTTP/2 Tunnel)..."
  node -e '
    (async () => {
      try {
        const res = await fetch("http://127.0.0.1:3000/api/remote-tunnel/start", { method: "POST" });
        const rt = await res.json();
        console.log("");
        console.log("============================================================");
        if (rt.magicUrl) {
          console.log("  LINK PANEL HP KE-2 (BISA DARI 4G/5G LUAR RUMAH):");
          console.log("  " + rt.magicUrl);
          console.log("");
          console.log("  Tips Penting:");
          console.log("  - Kalau di luar rumah link berubah karena mati lampu/Wi-Fi,");
          console.log("    cukup kirim chat pribadi \".panel\" dari WA Owner ke bot!");
          console.log("  - Untuk mematikan akses luar: bot remote off");
        } else {
          console.log("  [!] Tunnel belum mendapat URL publik:", rt.lastError || rt.status);
        }
        console.log("============================================================");
        console.log("");
      } catch {
        console.log("[!] Server belum menyala. Jalankan: bot restart");
      }
    })();
  '
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
  owner)
    change_owner "$2"
    ;;
  remote|panel|tunnel)
    manage_remote "$2"
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
      pkg install -y cloudflared 2>/dev/null || true
      pm2 restart wabot
      sleep 2
      print_status
    else
      echo "[i] Folder ~/wabot dipasang dari paket .tar.gz (bukan git clone)."
      echo "    Untuk update, unduh ulang wabot-redmi9c-ready.tar.gz ke folder Download lalu jalankan:"
      echo "    tar -xzf ~/storage/downloads/wabot-redmi9c-ready.tar.gz -C ~/wabot && bash ~/wabot/termux.sh"
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
    echo "  2) Buka Link Panel untuk HP Kedua / Luar Rumah (Cloudflare Tunnel)"
    echo "  3) Setel Nomor WA HP Kedua sebagai Owner (Agar bisa chat .panel)"
    echo "  4) Ubah Prefix Perintah (. / ! / #)"
    echo "  5) Lihat Log Aktivitas Realtime (CTRL+C untuk keluar)"
    echo "  6) Restart Mesin Bot"
    echo "  7) Update Kode Bot Terbaru (git pull + restart)"
    echo "  8) Matikan Bot Sementara"
    echo "  0) Keluar"
    printf "\nPilihan [0-8]: "
    read -r CHOICE
    case "$CHOICE" in
      1) request_pair "" ;;
      2) manage_remote "on" ;;
      3) change_owner "" ;;
      4) change_prefix "" ;;
      5) pm2 logs wabot ;;
      6) pm2 restart wabot ;;
      7) "$0" update ;;
      8) pm2 stop wabot ;;
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
