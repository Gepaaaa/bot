#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Script Pemasangan Server AI WABot Khusus Oppo Reno 5 (Snapdragon 720G, 8GB RAM)
# Arsitektur: 64-bit aarch64 Android + Python FastAPI + Pretrained Models
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
echo -e "\n${YELLOW}[1/5] Memperbarui repositori Termux...${NC}"
pkg update -y && pkg upgrade -y

# 2. Pasang dependensi C++, Python, Git, dan Libs
echo -e "\n${YELLOW}[2/5] Memasang Python, Git, OpenBLAS, dan compiler...${NC}"
pkg install -y python git clang cmake ninja libjpeg-turbo libpng libxml2 libxslt openblas libandroid-wordexp curl

# Pastikan pip up to date
python -m pip install --upgrade pip wheel setuptools

# 3. Masuk ke folder kerja atau buat folder ai_server
TARGET_DIR="$HOME/wabot-ai"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

echo -e "\n${YELLOW}[3/5] Mengunduh modul layanan AI (/ai_service)...${NC}"
# Jika script ini dijalankan mandiri, download kode backend AI
cat << 'EOF' > start_ai.sh
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/wabot-ai/ai_service"
IP_LOCAL=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "127.0.0.1")
echo "=================================================="
echo " Server AI Berjalan di Oppo Reno 5!"
echo " Alamat untuk dimasukkan ke Redmi 9C:"
echo " http://${IP_LOCAL}:8001"
echo "=================================================="
python -m uvicorn app:app --host 0.0.0.0 --port 8001
EOF
chmod +x start_ai.sh

echo -e "\n${YELLOW}[4/5] Memasang pustaka FastAPI & Pillow...${NC}"
pip install fastapi uvicorn python-multipart pyyaml pillow requests tqdm

echo -e "\n${GREEN}[5/5] Selesai disiapkan!${NC}"
echo -e "Untuk menyalakan server AI, cukup ketik: ${YELLOW}./start_ai.sh${NC}"
