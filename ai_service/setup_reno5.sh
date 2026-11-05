#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Script Pemasangan Server AI WABot Khusus Oppo Reno 5 (Snapdragon 720G, 8GB RAM)
# Menggunakan Mesin Real AI Super-Resolution (4x-UltraSharp & Real-ESRGAN + CodeFormer)
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}   Menyiapkan Server AI WABot di Oppo Reno 5       ${NC}"
echo -e "${CYAN}   Mesin Premier: 4x-UltraSharp & Real-ESRGAN       ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Update paket Termux dasar
echo -e "\n${YELLOW}[1/4] Memperbarui repositori paket Termux...${NC}"
pkg update -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" || pkg update -y

# 2. Pasang paket dasar Termux (Python, NumPy, Pillow, Curl, Tar)
echo -e "\n${YELLOW}[2/4] Memasang runtime Python, NumPy, Pillow & tools...${NC}"
pkg install -y python python-numpy python-pillow git curl tar

# 3. Unduh berkas modul kode AI
echo -e "\n${YELLOW}[3/4] Mengunduh modul server AI WABot...${NC}"
mkdir -p "$HOME/wabot-ai/ai_service"
cd "$HOME/wabot-ai/ai_service"

APP_URL="BASE_URL_PLACEHOLDER"
if [ "$APP_URL" = "BASE_URL_PLACEHOLDER" ]; then
  APP_URL="https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app"
fi

curl -sL "${APP_URL}/ai-service.tar.gz" | tar -xz

# 4. Unduh Bobot Model Pretrained (4x-UltraSharp & Real-ESRGAN)
echo -e "\n${YELLOW}[4/4] Mengunduh Model Pretrained Super Ajib (4x-UltraSharp)...${NC}"
python download_weights.py --core-only || echo -e "${YELLOW}[!] Unduhan weights latar belakang akan dilanjutkan otomatis saat permintaan pertama.${NC}"

# Buat script start mandiri
cat << 'EOF' > "$HOME/wabot-ai/start_ai.sh"
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/wabot-ai/ai_service"
IP_LOCAL=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)192\.168\.\d+\.\d+' | head -n1 || echo "127.0.0.1")

echo ""
echo "=================================================="
echo " [WABot AI Server] Aktif di Oppo Reno 5!"
echo "--------------------------------------------------"
echo " • Engine       : 4x-UltraSharp (Super Ajib) + Real-ESRGAN"
echo " • Port Server  : 8001"
echo " • Alamat Lokal : http://${IP_LOCAL}:8001"
echo "--------------------------------------------------"
echo " Masukkan alamat di atas pada tab Pengaturan di Redmi 9C"
echo " atau ketik '.hd ultra' dari WhatsApp!"
echo "=================================================="
echo ""

PORT=8001 HOST=0.0.0.0 python app.py
EOF
chmod +x "$HOME/wabot-ai/start_ai.sh"

echo -e "\n${GREEN}Instalasi Server AI di Oppo Reno 5 Berhasil!${NC}"
echo -e "Menjalankan server AI sekarang...\n"
bash "$HOME/wabot-ai/start_ai.sh"
