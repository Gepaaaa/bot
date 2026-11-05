#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Script Pemasangan Server AI WABot Khusus Oppo Reno 5 (Snapdragon 720G, 8GB RAM)
# 100% Cepat, Zero-Dependency, Siap Pakai Tanpa Compile C++/Rust
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}   Menyiapkan Server AI WABot di Oppo Reno 5       ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Update paket Termux dasar
echo -e "\n${YELLOW}[1/3] Memperbarui repositori paket Termux...${NC}"
pkg update -y

# 2. Pasang Python, NumPy & Pillow resmi Termux (Pre-compiled, instan)
echo -e "\n${YELLOW}[2/3] Memasang Python, NumPy & Pillow...${NC}"
pkg install -y python python-numpy python-pillow git curl tar

# 3. Unduh berkas modul kode AI (hanya 20 KB)
echo -e "\n${YELLOW}[3/3] Mengunduh modul server AI WABot...${NC}"
mkdir -p "$HOME/wabot-ai/ai_service"
cd "$HOME/wabot-ai/ai_service"

APP_URL="BASE_URL_PLACEHOLDER"
if [ "$APP_URL" = "BASE_URL_PLACEHOLDER" ]; then
  APP_URL="https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app"
fi

curl -sL "${APP_URL}/ai-service.tar.gz" | tar -xz

# Buat script start mandiri untuk sewaktu-waktu mau menyalakan ulang
cat << 'EOF' > "$HOME/wabot-ai/start_ai.sh"
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/wabot-ai/ai_service"
IP_LOCAL=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)192\.168\.\d+\.\d+' | head -n1 || echo "127.0.0.1")
echo "=================================================="
echo " Server AI Berjalan di Oppo Reno 5!"
echo " Alamat untuk dimasukkan ke Redmi 9C:"
echo " http://${IP_LOCAL}:8001"
echo "=================================================="
python app.py
EOF
chmod +x "$HOME/wabot-ai/start_ai.sh"

echo -e "\n${GREEN}Instalasi selesai dalam hitungan detik!${NC}"
echo -e "Menjalankan server AI sekarang...\n"
bash "$HOME/wabot-ai/start_ai.sh"
