# GepaBot — WhatsApp Multi-Feature Bot & Control Corner

Aplikasi bot WhatsApp serbaguna berbasis perintah awalan titik (`.`) yang menggabungkan mesin koneksi WhatsApp Multi-Device nyata (Scan QR & Pairing Code), simulator ruang chat interaktif di web, serta panel kontrol minimalis yang mengadaptasi estetika personal bersih ala **Gepa — Personal Corner (`gepacorner.my.id`)**.

## User Review & Critical Decisions

> [!IMPORTANT]
> Berikut adalah keputusan utama yang telah dikonfirmasi dari jawaban kamu dan siap dibangun:

- **Metode Koneksi Ganda (Real WA + Simulator Web)**: Bot dapat langsung ditautkan ke nomor WhatsApp asli menggunakan **Scan QR Code** maupun **8-Digit Pairing Code** secara real-time, sekaligus menyediakan **Simulator Chat Web** agar semua fitur command `.` bisa langsung dicoba di browser bahkan sebelum nomor ditautkan.
- **Cakupan Fitur Command Titik (`.`)**:
  - **Downloader Video Sosmed**: `.tt <link>` (TikTok tanpa watermark), `.ig <link>` (Instagram Reels/Post), dan `.yt <link>` (YouTube Shorts/Video).
  - **Ekstraktor Audio MP3**: `.mp3 <link>` atau `.ttmp3 <link>` untuk mengambil jalur suara MP3 langsung dari tautan video sosmed.
  - **Pembuat Stiker Gambar & Teks**: `.s` / `.stiker` (ubah gambar/foto menjadi stiker WebP 512×512 ber-metadata), `.brat <teks>` (stiker teks otomatis gaya Brat hijau limau atau putih klasik), dan `.meme <atas> | <bawah>` (stiker meme teks atas-bawah).
  - **Menu Admin Grup**: `.hidetag <pesan>` (mention tersembunyi seluruh anggota grup), `.tagall <pesan>` (mention terbuka seluruh anggota), dan `.antilink on/off` (moderasi otomatis hapus pesan berisi tautan dari non-admin).
- **Gaya Visual Ala `gepacorner.my.id`**: Mengusung nuansa *personal creator corner* yang bersih, tenang, minim distraksi, dengan kartu berbatas garis tipis (*hairline border*), tipografi modern yang rapi, serta profil identitas pembuat bot ("Gepa Corner").

> [!NOTE]
> Saat dijalankan di lingkungan server bersama, sesi tautan WhatsApp disimpan di penyimpanan server aktif agar bot tetap merespons pesan masuk selama aplikasi berjalan, dan dapat diputus atau ditautkan ulang kapan saja dari panel.

---

## 1. Overview & Core Concept

- **Apa yang Dilakukan Aplikasi Ini**: Menyediakan mesin bot WhatsApp otomatis yang merespons pesan berawalan `.` baik di chat pribadi maupun grup WhatsApp, lengkap dengan antarmuka web untuk menautkan perangkat, mencoba semua perintah secara instan di ruang simulasi, serta mengatur konfigurasi bot (seperti nama paket stiker, awalan perintah, dan aturan grup).
- **Target Pengguna**: Kreator dan pemilik komunitas (khususnya ekosistem Gepa Corner) yang membutuhkan bot utilitas harian serba cepat di WhatsApp tanpa harus mengetik perintah panjang atau membuka aplikasi pihak ketiga.
- **Nilai Utama**: Cukup ketik satu perintah singkat seperti `.tt https://vt.tiktok.com/...` atau `.brat santai dulu` di ruang chat, dan bot langsung mengirimkan media siap simpan atau stiker siap pakai dalam hitungan detik.

---

## 2. User Experience & Visual Design

### Alur Penggunaan Utama (Key User Flows)

1. **Menautkan Nomor WhatsApp (QR & Pairing Code)**:
   - Pengguna membuka tampilan **Koneksi WA**, memilih metode **Scan QR** atau **Pairing Code Nomor HP**.
   - Untuk Pairing Code, pengguna memasukkan nomor berformat kode negara (misal `62812xxxx`), lalu panel menampilkan kode 8 karakter yang siap dimasukkan ke menu *Perangkat Tertaut* di aplikasi WhatsApp.
   - Begitu terhubung, indikator status berubah menjadi aktif secara langsung melalui koneksi waktu nyata (*real-time*).
2. **Mencoba Command di Simulator Chat Interaktif**:
   - Tanpa perlu menunggu tautan nomor, pengguna dapat langsung beralih ke **Simulator Chat**, memilih mode **Chat Pribadi** atau **Grup Komunitas (Simulasi Admin & Antilink)**, lalu mengetik `.menu`, `.tt <link>`, `.mp3 <link>`, `.brat <teks>`, atau mengunggah gambar dengan caption `.s`.
   - Di mode Grup, terdapat tombol uji coba untuk mengirim tautan sebagai "Anggota Biasa" guna membuktikan fitur `.antilink on` otomatis menolak dan menghapus pesan bertautan.
3. **Mengelola Katalog Command & Identitas Stiker**:
   - Pada bagian **Katalog Command**, pengguna dapat mencari perintah berdasarkan kategori (Downloader, Stiker, Audio, Grup), menyalin contoh pemakaian sekali klik ke simulator, atau menonaktifkan perintah tertentu sementara waktu.
   - Pada bagian **Pengaturan Bot**, pengguna dapat mengubah awalan perintah (default `.`), nama paket stiker (*Sticker Pack Name*: `Gepa Corner`), serta nama pembuat stiker (*Author*) yang tertanam di info stiker WhatsApp.

### Identitas Visual & Tema (Terinspirasi `gepacorner.my.id`)

- **Arah Estetika**: *Minimalist Personal Creator Corner* — memadukan ketenangan halaman profil kreator independen (`Gepa — Personal Corner`) dengan kerapian konsol utilitas modern. Fokus pada ruang lega (*generous whitespace*), kartu permukaan datar tanpa tumpukan bayangan berlapis, serta aksen personal yang hangat namun fungsional.
- **Palet Warna (60-30-10)**:
  - **60% Kanvas Utama (`--background`)**: Putih hangat bersih (`#FAF9F6`) yang nyaman di mata dengan opsi sakelar tema gelap tenang (`#0C0C0E`) di area profil kerja.
  - **30% Permukaan Struktural (`--surface` & `--border`)**: Kartu putih murni (`#FFFFFF` / `#141417` pada mode gelap) dengan garis tepi tipis 1px (`#E4E4E7` / `#27272A`) dan teks sekunder abu netral (`#71717A`).
  - **10% Aksen Fokus (`--primary` & `--accent`)**: Hijau zamrud segar (`#10B981` / `#059669`) khusus untuk tombol aksi utama, indikator koneksi aktif, serta gelembung balasan di simulator chat; kuning amber (`#D97706`) dan merah koral (`#E11D48`) khusus untuk peringatan moderasi grup (`.antilink`).
- **Tipografi & Hierarki**:
  - *Heading & Brand*: **Plus Jakarta Sans** (SemiBold/Bold, *tight tracking*) untuk judul halaman dan identitas brand Gepa Corner.
  - *Body & Ruang Chat*: **DM Sans** (Regular/Medium, 14px–15px) untuk keterbacaan percakapan, deskripsi fitur, dan panduan tautan.
  - *Command, Kode Pairing & Angka*: **JetBrains Mono** (`tabular-nums`) untuk penulisan sintaks perintah (`.tt`, `.brat`, `.hidetag`), kode tautan 8 digit, penghitung pesan, dan waktu pemrosesan.
- **Tata Letak & Struktur Navigasi**:
  - **Bilah Atas (3-Zone Top Bar)**: Zona kiri menampilkan identitas tunggal `GepaBot`, zona tengah menampilkan 4 tautan navigasi teks satu baris (`Koneksi WA`, `Simulator Chat`, `Katalog Command`, `Pengaturan`), dan zona kanan menampilkan 1 tombol aksi utama (`Hubungkan WA` atau status sesi).
  - **Header Personal Corner**: Bagian pembuka menampilkan kartu ringkas profil bot ala `gepacorner.my.id` (avatar kreator/bot, sapaan singkat, awalan aktif `.`, serta metrik ringkas jumlah perintah diproses dalam teks bersih berpemisah `·` tanpa lencana kapsul berlebihan).
- **Umpan Balik Interaktif & Transisi**:
  - Transisi antar-tab halus di bawah 180ms, indikator sedang memproses (*"Mengunduh media tanpa watermark..."* / *"Merender stiker WebP..."*) langsung di dalam gelembung chat, pemutar video/audio langsung di ruang simulator, serta pratinjau stiker transparan ukuran penuh saat diklik.

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Mesin Pemroses Perintah Terpadu (Unified Command Router)**
  - *Pendekatan Terpilih*: Satu mesin pemroses perintah di sisi server menangani pesan dari koneksi WhatsApp asli maupun dari Simulator Chat Web menggunakan logika yang persis sama.
  - *Alasan*: Memastikan apa pun yang berhasil diuji di Simulator Web (seperti unduhan `.tt`, audio `.mp3`, stiker `.brat`, maupun moderasi `.antilink`) berjalan identik 100% ketika seseorang mengirim chat ke nomor WhatsApp bot yang sudah tertaut.
  - *Alternatif yang Dilewati*: Membuat simulasi palsu di sisi browser saja — dilewati karena tidak mencerminkan hasil pengunduhan media maupun pembuatan file stiker WebP yang sesungguhnya.

- **Keputusan 2: Pembuatan Stiker Mandiri di Server (Tanpa Ketergantungan Layanan Luar)**
  - *Pendekatan Terpilih*: Merender stiker gambar (`.s`), stiker teks gaya Brat (`.brat`), dan stiker meme (`.meme`) secara langsung di server menggunakan kanvas grafis vektor dan pengolah gambar berformat WebP 512×512 lengkap dengan penyuntikan metadata EXIF WhatsApp (Nama Paket & Pembuat).
  - *Alasan*: Cepat, tidak dibatasi kuota pihak ketiga, mendukung transparansi maupun latar khas hijau limau Brat dengan presisi tinggi, dan langsung dikenali WhatsApp sebagai stiker resmi yang bisa disimpan ke favorit.

- **Keputusan 3: Sinkronisasi Koneksi Waktu Nyata (WebSocket)**
  - *Pendekatan Terpilih*: Menggunakan saluran komunikasi dua arah waktu nyata antara server bot dan dashboard web untuk mengalirkan pembaruan QR Code, Pairing Code 8 digit, status keterhubungan perangkat, dan riwayat aktivitas perintah.
  - *Alasan*: Kode QR WhatsApp berganti secara berkala setiap beberapa puluh detik; aliran langsung menjamin kode di layar selalu segar tanpa perlu memuat ulang halaman.

---

## 4. Technical Architecture & Data Strategy

### Diagram Arsitektur & Komponen

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                   ANTARMUKA WEB GEPABOT (Gepa Corner UI)                   │
│                                                                            │
│  ┌──────────────────┐  ┌────────────────────┐  ┌────────────────────────┐  │
│  │ Panel Koneksi WA │  │ Simulator Chat WA  │  │ Katalog & Pengaturan   │  │
│  │ (QR & 8-Digit    │  │ (Pribadi & Grup,   │  │ Command "." (Toggle,   │  │
│  │  Pairing Code)   │  │  Upload Foto, MP3) │  │  Prefix, Sticker Info) │  │
│  └────────┬─────────┘  └─────────┬──────────┘  └───────────┬────────────┘  │
└───────────┼──────────────────────┼─────────────────────────┼───────────────┘
            │ WebSocket & HTTP     │ Pesan & Lampiran        │ Konfigurasi
            ▼                      ▼                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        SERVER BOT & COMMAND ENGINE                         │
│                                                                            │
│  ┌─────────────────────────┐          ┌─────────────────────────────────┐  │
│  │ Manajer Sesi WhatsApp   │◄────────►│ Router Perintah Awalan "."      │  │
│  │ (Multi-Device Socket,   │  Pesan   │ (.menu, .tt, .ig, .yt, .mp3,    │  │
│  │  Auth State, Auto-Retry)│  Masuk   │  .s, .brat, .meme, .hidetag,    │  │
│  └─────────────────────────┘          │  .tagall, .antilink)            │  │
│                                       └───────┬───────────────┬─────────┘  │
│                                               │               │            │
│                              ┌────────────────▼──┐   ┌────────▼─────────┐  │
│                              │ Modul Downloader  │   │ Studio Stiker    │  │
│                              │ Video & Audio MP3 │   │ WebP & EXIF Pack │  │
│                              │ (TikTok/IG/YT)    │   │ (Brat/Meme/Foto) │  │
│                              └───────────────────┘   └──────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Model Data & Penyimpanan Status

- **Konfigurasi Bot (`BotConfig`)**: Menyimpan awalan perintah aktif (default `.`), nama bot (`GepaBot`), nama paket stiker (`Gepa Corner`), nama pembuat stiker (`gepacorner.my.id`), daftar perintah yang diaktifkan/dinonaktifkan, serta pengaturan per-grup (`antilink`, `welcome`). Disimpan secara persisten di penyimpanan lokal server agar tidak hilang saat dimuat ulang.
- **Status Sesi WhatsApp (`ConnectionState`)**: Melacak kondisi tautan saat ini (`disconnected`, `connecting`, `qr_ready`, `pairing_code_ready`, `connected`), string QR terkini, kode pairing 8 karakter, profil nomor tertaut (nama & nomor), serta waktu aktif sesi.
- **Pesan & Riwayat Aktivitas (`ChatMessage` & `CommandLog`)**: Menyimpan percakapan di ruang Simulator (teks, lampiran gambar/stiker WebP, pemutar video MP4, pemutar audio MP3, status penghapusan pesan antilink, serta daftar anggota grup simulasi untuk `.hidetag`/`.tagall`) dan ringkasan eksekusi perintah terbaru.

### Pemetaan Interaksi Komponen & Perubahan Status

- **Panel Koneksi WA**:
  - Memilih metode *Scan QR* memicu inisialisasi soket WhatsApp dan menampilkan gambar QR yang diperbarui otomatis setiap kali token berganti.
  - Memilih *Pairing Code*, memvalidasi nomor telepon hanya angka berkode negara (contoh `628...`), meminta kode 8 digit dari soket WhatsApp, dan menampilkannya dengan tombol salin cepat.
  - Menekan *Putuskan Sesi* membersihkan kredensial sesi aktif dan mengembalikan panel ke keadaan siap taut baru.
- **Simulator Chat WA**:
  - Mengirim pesan berawalan `.` (misal `.tt <url>`) menampilkan gelembung pesan pengguna, status pengetikan bot, lalu merender balasan media asli (video MP4 tanpa watermark yang dapat diputar & diunduh, atau pemutar audio MP3 untuk `.mp3`).
  - Mengunggah gambar dengan caption `.s` atau membalas (*reply*) pesan bergambar dengan `.s` maupun `.meme teks atas | teks bawah` mengubah gambar menjadi stiker WebP 512×512 transparan/proporsional langsung di ruang chat.
  - Mengetik `.brat kata-kata` menghasilkan stiker persegi khas Brat lengkap dengan tombol unduh stiker.
  - Pada mode Grup, mengaktifkan `.antilink on` lalu menekan tombol simulasi *"Kirim Link sebagai Member Biasa"* akan menampilkan pesan tautan yang seketika ditandai terhapus oleh bot disertai peringatan moderasi grup, sedangkan `.hidetag pengumuman` menandai seluruh anggota grup simulasi pada metadata pesan tanpa mengotori teks pengumuman.
- **Katalog Command & Pengaturan**:
  - Pencarian instan dan filter kategori menyaring daftar command secara langsung; tombol *"Coba di Simulator"* otomatis berpindah ke tab Simulator dan mengisi kolom input dengan contoh perintah siap kirim.
  - Mengubah sakelar aktif/nonaktif suatu command atau mengganti awalan perintah (`.` menjadi `!` atau `#`) langsung memperbarui router server dan disinkronkan ke semua klien yang terbuka.
