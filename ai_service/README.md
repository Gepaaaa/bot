# WABot AI Photo Enhancement Service (Python + FastAPI + GPU)

Service pemrosesan gambar AI terpisah (decoupled microservice) untuk perintah WhatsApp `.hd`, `.remini`, `.upscale`, `.hd2`, dan `.hd4`. Bot WhatsApp tetap ringan di Node.js + Baileys (termasuk Termux Redmi 9C), sementara beban inferensi GPU dijalankan pada server ini melalui HTTP API.

## Kombinasi Pretrained Models & Pipeline Adaptif
Service ini **tidak** menjalankan seluruh model secara membabi buta, melainkan menganalisis kondisi gambar terlebih dahulu:
1. **Validasi & Normalisasi Orientasi EXIF**: Pemeriksaan magic bytes (`JPEG`/`PNG`/`WebP`), batas ukuran berkas, penghapusan metadata lokasi, dan pelindung batas resolusi VRAM.
2. **Deteksi Kualitas Gambar**: Mengukur ketajaman (*Laplacian variance*), estimasi derau frekuensi tinggi (*Wavelet/MAD noise sigma*), dan artefak blok kompresi JPEG.
3. **Deteksi Wajah (`RetinaFace` / `YuNet`)**: Menghitung jumlah dan ukuran wajah pada gambar.
4. **Conditional Denoising (`SCUNet` / `NAFNet-SIDD`)**: Hanya dijalankan apabila `noise_sigma` melampaui ambang batas pada `config.yaml`.
5. **Conditional Deblurring (`NAFNet-GoPro`)**: Hanya dijalankan apabila skor ketajaman di bawah ambang batas blur dan bobot tersedia.
6. **Adaptive Face Restoration (`CodeFormer` dengan kontrol `fidelity` `w` atau `GFPGAN v1.4`)**: Memperjelas detail wajah dengan menjaga proporsi identitas wajah asli serta tekstur pori kulit natural (bebas efek wajah plastik).
7. **General Restoration & Super-Resolution (`Real-ESRGAN` `x2plus` / `x4plus`)**: Tiled FP16 super-resolution 2× atau 4× sesuai mode perintah.
8. **Final Quality Check & CIE LAB Color Guard**: Menjaga konsistensi krominansi warna asli (`a*`/`b*`) agar warna foto tidak berubah ekstrem dan memastikan resolusi meningkat secara nyata.

## Menjalankan di Cloud GPU / Server NVIDIA CUDA

```bash
cd ai_service
pip install -r requirements.txt
python download_weights.py --weights-dir ./weights

# Opsional: pasang API key agar hanya bot milikmu yang bisa mengakses GPU
export AI_ENHANCE_API_KEY="rahasia-server-gpu-kamu"

uvicorn app:app --host 0.0.0.0 --port 8000
```

Atau menggunakan Docker GPU (`nvidia-container-toolkit` / RunPod / Vast.ai):

```bash
docker build -t wabot-ai-gpu ./ai_service
docker run --gpus all -p 8000:8000 -e AI_ENHANCE_API_KEY="rahasia-server-gpu-kamu" wabot-ai-gpu
```

## Menghubungkan ke Node.js WABot
1. Isi pada `.env` server Node.js:
   ```env
   AI_ENHANCE_SERVICE_URL=https://url-gpu-server-kamu.example.com
   AI_ENHANCE_API_KEY=rahasia-server-gpu-kamu
   ```
2. Atau atur URL service, pilihan model wajah (`CodeFormer` / `GFPGAN`), nilai `Fidelity` (`0.10–0.95`), dan batas antrean langsung dari tab **Pengaturan** di Web Control Panel tanpa mengubah kode.
