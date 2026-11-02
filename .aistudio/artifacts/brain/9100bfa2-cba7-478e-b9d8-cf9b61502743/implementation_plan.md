# Audit & Rancangan Instalasi Termux 24/7 untuk Xiaomi Redmi 9C (3/32)

Perombakan menyeluruh alur pemasangan dan mesin runtime bot agar berjalan 100% mulus, hemat RAM, dan bebas gagal kompilasi pada **Xiaomi Redmi 9C (RAM 3GB / Memori 32GB)** menggunakan Termux, lengkap dengan akses kontrol ganda melalui browser **localhost:3000** serta perintah terminal instan.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Temuan Utama Audit Hardware Redmi 9C (3/32):** Meskipun prosesor MediaTek Helio G35 mendukung 64-bit, ROM bawaan pabrik (MIUI 12) pada Redmi 9C berjalan dalam **mode sistem 32-bit (`armv7l` / `android-arm`)**. Rancangan skrip sebelumnya pasti gagal di Redmi 9C karena memaksa HP menjalankan kompilasi antarmuka modern dan modul C++ (`sharp` / bundler 64-bit) yang tidak menyediakan *binary* 32-bit Android.

- **Keputusan Terkonfirmasi 1 — Target Perangkat (`Redmi 9C 3/32`)**: Mesin bot dioptimalkan khusus untuk sistem 32-bit `armv7l` dengan batas memori aman (`256 MB` heap Node.js) agar MIUI tidak mematikan proses saat sisa RAM dari 3GB menipis.
- **Keputusan Terkonfirmasi 2 — Dua Jalur Pemasangan Sekaligus**: Menyediakan **(A) Paket Siap Pakai Offline (`.tar.gz`)** yang sudah berisi antarmuka web matang (tinggal unduh ke folder *Download* HP lalu ekstrak 1 baris di Termux, bebas kendala autentikasi link) serta **(B) Jalur Git Clone Pribadi** yang bersih untuk repositori GitHub milikmu sendiri.
- **Keputusan Terkonfirmasi 3 — Kontrol Ganda (`localhost:3000` + CLI Termux)**: Seluruh pengaturan menu, template balasan, prefix, anti-ban, simulator, dan Pairing WA dapat dikelola penuh lewat Chrome di `http://localhost:3000` (atau dari HP utama/laptop satu WiFi) sekaligus lewat perintah terminal `bot` di Termux.

> [!WARNING]
> **7 Bug Kritis pada Rancangan Sebelumnya yang Akan Diperbaiki:**
> 1. **Kegagalan `armv7l` (32-bit) saat Build & Startup**: Paket bundler dan pengolah gambar C++ tidak memiliki binary untuk sistem 32-bit Redmi 9C. Solusinya: antarmuka web & bundel server sudah dipra-kompilasi di dalam paket unduhan, dan mesin stiker otomatis beralih ke jalur **WebAssembly + FFmpeg bawaan Termux (`libwebp`)** ketika mendeteksi arsitektur 32-bit.
> 2. **Link `curl` Langsung Terblokir Sesi Login**: Mengambil skrip lewat `curl` ke alamat preview internal akan mengembalikan halaman login HTML, bukan skrip bash. Solusinya: unduh paket `.tar.gz` satu klik lewat browser, lalu jalankan ekstraksi lokal dari folder `Download` HP.
> 3. **Pairing di Termux Tidak Bisa Diketik saat Mode PM2**: Perintah `pm2 logs` hanya menampilkan teks satu arah dan tidak meneruskan ketikan nomor HP ke mesin bot. Solusinya: perintah pintasan `bot pair 628xxx` yang berkomunikasi langsung ke API lokal `127.0.0.1:3000`.
> 4. **Endpoint Pairing Darurat Salah Alamat (404)**: Halaman cadangan sebelumnya memanggil rute yang tidak ada (`/api/pairing-code`), sehingga tombol pairing gagal berfungsi. Akan diselaraskan ke rute resmi mesin bot.
> 5. **Proses Ganda (Zombie Process) di PM2**: Menjalankan pembungkus yang melahirkan sub-proses membuat PM2 gagal mematikan port `3000` dengan bersih saat restart. PM2 akan langsung menjalankan bundel server tunggal.
> 6. **Error `grep -oP` di Android**: Perintah deteksi IP WiFi memakai sintaks yang sering ditolak oleh utilitas bawaan Android sehingga menghentikan skrip di tengah jalan. Akan diganti pembacaan antarmuka jaringan langsung dari Node.js.
> 7. **Pembersihan Identitas Lama**: Menghapus seluruh sisa tautan repositori eksternal lama yang masih tertinggal di skrip dan tampilan panduan.

---

## 1. Overview & Core Concept

- **Apa yang Dilakukan**: Mengubah Xiaomi Redmi 9C nganggur menjadi server WhatsApp Multi-Fitur pribadi 24/7 yang mandiri, hemat penyimpanan (di bawah 200 MB dari ruang 32GB), dan ringan di RAM 3GB.
- **Target Pengguna**: Pemilik bot yang ingin menjalankan bot nonstop di rumah memakai koneksi WiFi sendiri (jauh lebih aman dari pemblokiran nomor oleh Meta dibandingkan IP datacenter cloud) tanpa pusing mengurus error kompilasi Linux di HP.
- **Nilai Utama**: Sekali pasang langsung jalan—tanpa gagal instalasi C++/32-bit, layar Redmi 9C bisa dimatikan penuh sambil dicolok casan, sementara pengaturan template atau menu bisa dibuka kapan saja dari HP utama lewat jaringan WiFi rumah.

---

## 2. User Experience & Visual Design

- **Alur Penggunaan Utama (End-to-End di Redmi 9C)**:
  1. **Persiapan Paket**: Di panel web, pengguna menekan tombol **Unduh Paket Siap Pakai Termux (`.tar.gz`)** yang sudah berisi tampilan web matang dan mesin bot siap jalan (atau menyalin perintah *Git Clone* untuk repo pribadinya).
  2. **Eksekusi 1 Baris di Termux**: Di Redmi 9C (Termux versi F-Droid), pengguna mengizinkan akses penyimpanan (`termux-setup-storage`) lalu menempel 1 baris perintah instalasi lokal. Skrip memasang Node.js LTS, FFmpeg Termux, dan PM2 tanpa kompilasi C++ yang berat.
  3. **Tautkan Nomor WA**: Pengguna bisa memilih mengetik `bot pair 628xxx` langsung di layar Termux untuk mendapatkan 8 digit Pairing Code, atau membuka Chrome di `http://localhost:3000`.
  4. **Kelola Menu & Template Kapan Saja**: Dari Chrome di Redmi 9C (`http://localhost:3000`) maupun dari HP utama/laptop satu WiFi (`http://192.168.x.x:3000`), pengguna membuka **Panel Kontrol Lengkap** untuk mengedit template sambutan, mengaktifkan/mematikan fitur di katalog menu, mengatur cooldown anti-ban, dan memantau status sesi.

- **Identitas Visual & Tata Letak Panel Kontrol**:
  - *Aesthetic Direction*: Konsol kontrol developer modern yang bersih, fungsional, dan bebas dekorasi berlebihan (*clean utilitarian SaaS console*).
  - *Color Palette & Mood*: Kanvas netral terang/gelap berimbang (`#FAF9F6` pada mode terang, `#0C0C0E` dan permukaan `#141417` pada mode gelap) dengan aksen hijau zamrud (`#059669` / `#10B981`) khusus untuk aksi utama dan status koneksi aktif, serta kuning amber untuk peringatan penting.
  - *Typography & Hierarchy*: Judul tegas proporsional menggunakan keluarga sans modern, teks instruksi yang nyaman dibaca di layar HP kecil (Redmi 9C berlayar HD+ 720p), serta angka metrik, alamat IP, port, dan kode perintah menggunakan font monospace dengan angka sejajar (`tabular-nums`).
  - *Component Styling & Top Bar Contract*: Bilah navigasi atas dijaga tetap ringkas dengan **5 menu utama satu baris** (*Simulator*, *Menu & Fitur*, *Koneksi & Server*, *Keamanan & API*, *Pengaturan*) agar tidak bertumpuk atau terpotong. Pusat pemasangan Termux digabungkan secara rapi di dalam ruang kerja **Koneksi & Server** menggunakan pemilih tab bersih tanpa kartu bersarang (*no cards-within-cards*) dan tanpa lencana kapsul dekoratif.
- **Umpan Balik Interaktif**: Tombol salin perintah memberikan konfirmasi instan (`< 150ms`), indikator pembungkus paket `.tar.gz` menampilkan progres pengunduhan nyata, dan daftar alamat IP WiFi lokal dideteksi otomatis oleh server agar langsung bisa disalin.

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Pra-Kompilasi Paket Web & Server sebelum Masuk ke Redmi 9C**
  - *Pendekatan Terpilih*: Server mengemas hasil kompilasi antarmuka (`dist/`) dan bundel mesin server tunggal ke dalam arsip `.tar.gz` khusus Termux saat diunduh, serta menyertakan skrip pembangun bundel untuk pengguna jalur GitHub.
  - *Mengapa*: Menghilangkan kebutuhan memasang bundler berat di Redmi 9C 32-bit, mempercepat instalasi di memori eMMC 32GB dari belasan menit menjadi kurang dari 1 menit, dan menghemat ratusan MB ruang penyimpanan.
  - *Alternatif yang Dilewati*: Menjalankan `vite build` langsung di dalam Termux Redmi 9C (gagal pada sistem operasi 32-bit `armv7l` dan memakan RAM berlebih).

- **Keputusan 2: Mesin Pengolah Gambar & Stiker Adaptif (Hybrid Native + WASM/FFmpeg)**
  - *Pendekatan Terpilih*: Membuat lapisan abstraksi pengolah media yang memakai `sharp` bila tersedia (di Cloud/PC 64-bit), dan otomatis beralih ke kombinasi **perender SVG WebAssembly (`@resvg/resvg-wasm`) + `ffmpeg` bawaan Termux (`libwebp`)** pada sistem 32-bit `armv7l`.
  - *Mengapa*: Memastikan seluruh fitur stiker gambar, stiker video, teks `.brat`, bubble chat `.qc`/`.iqc`, `.ttp`/`.attp`, `.meme`, `.toimg`, hingga filter gambar berjalan 100% di Redmi 9C tanpa satu pun error *module not found* atau gagal kompilasi `node-gyp`.
  - *Alternatif yang Dilewati*: Memasang Ubuntu via `proot-distro` di Redmi 9C (karena kernel OS bawaan Redmi 9C tetap 32-bit, container Ubuntu tetap berjalan sebagai `armhf` 32-bit dan hanya membebani RAM 3GB).

- **Keputusan 3: Kontrol PM2 Langsung Tanpa Proses Pembungkus Berantai**
  - *Pendekatan Terpilih*: PM2 menjalankan bundel server langsung dengan batas `--max-old-space-size=256`, sementara perintah terminal `bot` berkomunikasi lewat HTTP lokal ke `127.0.0.1:3000`.
  - *Mengapa*: Mencegah kebocoran RAM akibat dua proses Node.js bertumpuk dan memungkinkan pengguna melakukan pairing WA (`bot pair 628...`), cek status (`bot status`), cek IP WiFi (`bot ip`), maupun ganti prefix langsung dari layar Termux kapan saja.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Diagram Arsitektur Sistem di Redmi 9C (Termux 24/7)**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   XIAOMI REDMI 9C (3GB RAM · armv7l)                    │
│                                                                         │
│  ┌──────────────────────────┐       ┌────────────────────────────────┐  │
│  │  CLI Pintasan Termux     │ HTTP  │  PM2 Daemon (Auto-Restart)     │  │
│  │  • bot status / bot ip   │──────▶│  Node.js LTS (--max-old-256MB) │  │
│  │  • bot pair 628xxx       │ Lokal │  • Express REST + WebSocket    │  │
│  │  • bot logs / restart    │       │  • Static Web Panel (Port 3000)│  │
│  └──────────────────────────┘       └───────────────┬────────────────┘  │
│                                                     │                   │
│         ┌───────────────────────────────────────────┼───────────┐       │
│         ▼                                           ▼           ▼       │
│  ┌──────────────────────┐  ┌──────────────────────────┐  ┌───────────┐  │
│  │ Baileys Multi-Device │  │ Universal Media Engine   │  │ Penyimpan │  │
│  │ • Auto-Resume Sesi   │  │ • SVG -> PNG (Resvg WASM)│  │ Lokal HP  │  │
│  │ • Anti-Ban Cooldown  │  │ • WebP/Audio/Video       │  │ • Sesi WA │  │
│  │ • Command Processor  │  │   (Termux Native FFmpeg) │  │ • Template│  │
│  └──────────────────────┘  └──────────────────────────┘  └───────────┘  │
└─────────────────────────────────────────┬───────────────────────────────┘
                                          │ HTTP / WebSocket (Port 3000)
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
     ┌─────────────────────────────┐             ┌─────────────────────────────┐
     │ Chrome di Redmi 9C          │             │ Browser HP Utama / Laptop   │
     │ http://localhost:3000       │             │ http://192.168.x.x:3000     │
     │ (Atur Menu, Template, Pair) │             │ (Kontrol Jarak Jauh Se-WiFi)│
     └─────────────────────────────┘             └─────────────────────────────┘
```

- **Model Data & Penyimpanan Sesi**:
  - Seluruh kredensial autentikasi WhatsApp (`.baileys_auth`) dan konfigurasi kustom pengguna (nama bot, prefix, nomor owner, daftar fitur aktif/nonaktif, template sambutan/keluar grup, aturan auto-responder) disimpan langsung ke penyimpanan internal folder kerja Termux (`~/wabot`) sehingga aman dari penghapusan cache sistem dan otomatis tersambung kembali saat HP dinyalakan ulang.
  - Endpoint informasi jaringan baru pada server membaca antarmuka jaringan lokal (`os.networkInterfaces()`) secara aman lintas versi Android untuk menampilkan daftar alamat IP LAN WiFi aktif di halaman Koneksi maupun di CLI Termux.

- **Pemetaan Interaksi Komponen & Penanganan Status**:
  - **Generator Paket Siap Pakai Termux (`/api/termux-bundle.tar.gz`)**: Saat pengguna mengklik tombol unduh paket di panel web, server memastikan aset antarmuka `dist/` dan bundel server siap pakai telah tersedia, lalu mengalirkan arsip terkompresi ringan tanpa `node_modules` agar cepat diunduh di jaringan seluler maupun WiFi.
  - **Skrip Installer Adaptif (`termux.sh`)**: Mendeteksi arsitektur CPU/OS (`uname -m`), mengaktifkan `termux-wake-lock`, memasang paket inti Termux (`nodejs-lts`, `ffmpeg`, `libwebp`), memasang hanya dependensi runtime yang kompatibel dengan 32-bit/64-bit (`--omit=dev --ignore-scripts` bila pada `armv7l` diikuti inisialisasi WASM), mendaftarkan perintah CLI `bot`, dan menyalakan layanan PM2.
  - **CLI Kontrol Termux (`bot`)**: Menangani argumen perintah (`pair`, `status`, `ip`, `logs`, `restart`, `stop`) dengan validasi nomor telepon dan penanganan pesan error yang jelas apabila server masih dalam proses pemanasan awal.
  - **Panduan Anti-Mati Khusus MIUI 12 (Redmi 9C)**: Menampilkan instruksi spesifik menu MIUI (*Penghemat Baterai Aplikasi -> Tidak ada pembatasan*, *Mulai Otomatis / Autostart*, dan penguncian aplikasi di *Recent Apps*) tepat di sebelah langkah instalasi.
