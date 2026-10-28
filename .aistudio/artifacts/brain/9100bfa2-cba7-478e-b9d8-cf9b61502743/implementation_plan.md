# Adaptasi Ekosistem Stiker, Media & Downloader Komplit + Dukungan `.hdsw` Grup & Solusi Hosting 24/7

Memperluas kemampuan **GepaBot** dengan rangkaian perkakas stiker statis/animasi, konverter gambar-video-audio, serta pengunduh media lintas platform ala **RYO-YAMADA-MD**, membuka fitur **`.hdsw` agar bisa dipakai langsung di dalam Grup** secara aman, merapikan Web Dashboard, serta menyediakan solusi arsitektur **Deployment Vercel (Split Backend) & Server 24/7**.

## User Review & Critical Decisions

> [!IMPORTANT]
> Rencana ini telah diperbarui untuk menjawab dua poin terbaru Anda sekaligus mempertahankan seluruh pilihan sebelumnya:

- **`.hdsw` Kini Aktif di Grup Maupun Chat Pribadi (Aman Anti-Ban)**: Pembatasan `.hdsw` khusus chat pribadi dihapus. Saat anggota atau admin mengirim/membalas *Dokumen* foto atau video ukuran asli dengan `.hdsw` di dalam grup, bot akan membalas media ukuran asli (gaya unggahan WA Web jernih tanpa kompresi) **langsung di ruang grup tersebut** (me-reply pesan pengirim), bukan mengirim pesan pribadi (*cold DM*) ke nomor anggota yang belum dikenal. Dengan begitu, anggota tinggal meneruskan (*Forward*) media jernih tersebut ke Status WA mereka tanpa memicu deteksi spam DM dari Meta.
- **Mengapa Deploy di Vercel Belum Jalan & Solusi Arsitekturnya**:
  > [!WARNING]
  > **Penyebab Teknis di Vercel**: Vercel adalah platform *Stateless / Serverless* yang hanya menayangkan tampilan web statis dan mematikan fungsi server dalam hitungan detik setelah halaman dimuat. Padahal, mesin WhatsApp Multi-Device membutuhkan **koneksi soket terus-menerus 24 jam**, saluran *WebSocket real-time* untuk kode QR/Pairing, ruang simpan sesi permanen, dan pemroses video/audio aktif. Akibatnya, di Vercel tampilan depan bisa terbuka tetapi mesin belakang bot tidak pernah hidup untuk menautkan WhatsApp.
  - **Solusi Ganda yang Diterapkan**:
    1. **Mode Hybrid (Tampilan Web di Vercel + Mesin Bot di Server 24/7)**: Menambahkan pengaturan **Alamat Server Bot Eksternal** langsung di Dashboard beserta izin koneksi lintas domain (*CORS & Remote WebSocket*), serta aturan *routing* halaman agar web di Vercel tidak error saat dimuat ulang dan bisa langsung terhubung ke mesin bot Anda.
    2. **Paket Siap Deploy Utuh 24/7 (Cloud Run / Railway / Render / VPS)**: Menyediakan konfigurasi kontainer produksi lengkap dengan mesin pengolah media sehingga seluruh aplikasi (Dashboard + Mesin Bot WA) bisa dijalankan 24/7 dalam satu klik di platform server persisten (termasuk fitur Deploy bawaan AI Studio Cloud Run, Railway, Render, atau VPS), lengkap dengan panel **Diagnostik & Panduan Hosting** di dalam aplikasi.
- **Paket Fitur Komplit (Stiker, Media & Downloader)**: Mengadaptasi pembuatan stiker komplit (`.s` foto & video/GIF bergerak, Quote Chat `.qc` & `.iqc`, `.brat`/`.bratcolor`/`.bratvid`, `.ttp`/`.attp`, `.emojimix`, `.wm`, `.toimg`, `.tovid`), perkakas media & audio (`.hdsw` grup/pribadi, `.hd`, filter gambar, pembuka *View Once* `.rvo`, video bulat `.toptv`, `.tomp3`, `.tovn`, efek suara `.bass`/`.nightcore`/`.slow`/`.fast`/`.robot`/`.reverse`, `.tourl`, `.qrcode`), serta pengunduh lintas platform (`.aio`, TikTok Video & Slide Foto `.ttslide`, Instagram, Facebook, X/Twitter, Pinterest, CapCut, MediaFire, dan `.play`/YouTube).
- **Prefix Tunggal (`.`) & Perisai Anti-Ban Penuh**: Mempertahankan awalan tunggal konsisten dan mewajibkan setiap perintah baru melewati *cooldown* pengguna, simulasi mengetik/merekam suara natural, antrean kirim berjeda, serta batas ukuran berkas aman.

---

## 1. Overview & Core Concept

- **Apa yang Dihadirkan Pembaruan Ini**: Menjadikan GepaBot asisten kreatif dan pengunduh media serba lengkap cukup dengan satu titik (`.`) di grup maupun chat pribadi — mulai dari konversi dokumen ke media Status WA jernih (`.hdsw`) langsung di grup, pembuatan stiker gelembung percakapan (`.qc`) dan stiker bergerak, pengubah suara & pembuka pesan sekali lihat (`.rvo`), hingga pengunduh video dan slide foto sosial media, didukung arsitektur hosting yang jelas untuk pemakaian 24/7.
- **Target Pengguna**: Pemilik bot, admin komunitas, dan anggota grup WhatsApp yang membutuhkan perkakas harian cepat dan tajam tanpa mengorbankan keamanan akun.
- **Nilai Utama**: Pemrosesan stiker, video, gambar, dan efek audio dilakukan mandiri di mesin server sehingga responsif dan tidak bergantung pada layanan konverter luar yang sering gangguan, sementara antarmuka web dapat dijalankan fleksibel baik secara utuh di server kontainer maupun terpisah melalui Vercel.

---

## 2. User Experience & Visual Design

### Alur Penggunaan Utama (Key User Flows)

1. **Menggunakan `.hdsw` Langsung di Grup maupun Chat Pribadi**:
   - Anggota grup mengirim berkas Foto/Video lewat menu **Dokumen** (agar byte asli tidak dikompresi WhatsApp) dengan caption `.hdsw`, atau membalas dokumen yang sudah dikirim di grup dengan `.hdsw` (opsional `.hdsw nocaption` untuk hasil bersih tanpa teks).
   - Bot memberi reaksi `⏳`, memproses metadata dimensi asli dan pratinjau jernih, lalu membalas langsung di ruang grup tersebut sebagai pesan Foto/Video standar berkualitas asli (reaksi berubah menjadi `✔️`). Pengirim maupun anggota grup lain cukup menekan **Teruskan (Forward) → Status Saya**.
2. **Membuat & Memodifikasi Stiker Komplit**:
   - Mengirim/membalas foto atau video pendek dengan `.s` untuk menghasilkan stiker statis maupun bergerak; mengetik `.qc <teks>` atau me-reply pesan anggota grup dengan `.qc` untuk membuat stiker gelembung chat lengkap dengan nama dan warna pengirim; serta memakai `.iqc`, `.bratcolor`, `.bratvid`, `.attp`, dan `.emojimix`.
   - Membalas stiker dengan `.wm Nama Pack | Author` untuk mengganti identitas hak cipta stiker, atau `.toimg` dan `.tovid` untuk mengembalikan stiker menjadi foto PNG maupun video MP4.
3. **Mengolah Media, View Once & Efek Audio**:
   - Membalas pesan *View Once* dengan `.rvo` untuk menampilkan ulang media di chat, membalas video dengan `.toptv` untuk mengubahnya menjadi Video Note bulat, atau menggunakan `.hd`, `.hitamkan`, `.grayscale`, `.blur`, `.mirror`, `.qrcode`, dan `.tourl`.
   - Membalas video/audio dengan `.tomp3`, `.tovn`, atau efek suara (`.bass`, `.nightcore`, `.slow`, `.fast`, `.robot`, `.reverse`) yang otomatis menampilkan indikator *"sedang merekam audio"* sebelum dikirim.
4. **Mengunduh Video & Album Slide Lintas Platform**:
   - Menggunakan `.aio <link>` untuk deteksi otomatis, `.tt` / `.ttslide <link>` untuk mengunduh video TikTok tanpa watermark maupun rangkaian slide foto beserta audionya secara berjeda aman, serta `.ig`, `.fb`, `.tw`, `.pin`, `.capcut`, `.mf`, dan `.play <judul lagu>`.
5. **Menghubungkan Hosting & Menjelajahi Dashboard 5-Ruang Kerja**:
   - Bilah navigasi atas dirapikan menjadi 5 menu satu baris: **Simulator Chat**, **Katalog & Studio**, **Koneksi WA**, **Keamanan & Gateway**, serta **Pengaturan & Template**.
   - Apabila pengguna membuka Dashboard dari domain statis seperti Vercel, aplikasi otomatis mendeteksi ketiadaan soket lokal dan menampilkan kotak **Koneksi Server Bot 24/7 & Panduan Deploy** yang jelas agar pengguna dapat menempelkan URL mesin bot aktif mereka atau men-deploy server kontainer penuh dengan mudah.

### Identitas Visual & Tata Letak Dashboard

- **Arah Estetika**: Konsol SaaS minimalis dan tenang dengan hirarki informasi tajam serta bebas dekorasi berlebihan.
- **Palet Warna (60-30-10)**:
  - **60% Latar Utama (`--background`)**: Terang hangat (`#FAF9F6`) dan gelap pekat (`#0C0C0E`).
  - **30% Panel Struktural (`--surface`)**: Permukaan satu tingkat (`#FFFFFF` / `#141417`) dengan garis batas tipis 1px dan garis pemisah baris tanpa tumpukan kartu di dalam kartu.
  - **10% Aksen Fungsional (`--primary`)**: Hijau zamrud (`#059669` / `#10B981`) untuk aksi utama dan penanda koneksi aktif; kuning amber dan merah khusus indikator peringatan/kegagalan yang disertai teks keterangan jelas.
- **Tipografi & Keterbacaan Angka**:
  - **Plus Jakarta Sans** untuk judul dan navigasi utama, **DM Sans** untuk teks bacaan dan gelembung simulasi chat, serta **JetBrains Mono** (`tabular-nums`) untuk seluruh sintaks command, angka statistik, waktu proses, dan ukuran berkas.
  - Keterangan kategori, daftar alias, dan syarat media ditulis menggunakan pemisah titik tengah (`·`) yang bersih tanpa lencana kapsul warna-warni pada elemen non-interaktif.

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Balasan `.hdsw` Langsung di Ruang Grup (Tanpa Cold DM)**
  - *Pendekatan Terpilih*: Mengirim hasil konversi media ukuran asli `.hdsw` langsung sebagai balasan (*quoted reply*) di ruang chat tempat perintah diketik — baik di Chat Pribadi maupun di Grup.
  - *Alasan*: Sebelumnya pengiriman hasil ke chat pribadi anggota grup memicu pemblokiran WhatsApp karena dianggap mengirim spam DM ke nomor asing. Membalas langsung di dalam grup 100% aman dari aturan *cold DM*, tetap mempertahankan kualitas byte asli untuk diteruskan ke Status WA, dan bisa dinikmati bersama di grup.

- **Keputusan 2: Arsitektur Koneksi Fleksibel untuk Mengatasi Keterbatasan Serverless Vercel**
  - *Pendekatan Terpilih*: Memisahkan alamat koneksi API & WebSocket di antarmuka web agar dapat diarahkan ke URL server bot eksternal (disimpan di peramban atau variabel lingkungan), menambahkan dukungan lintas domain di server, menyertakan aturan *rewrite* halaman tunggal untuk Vercel, serta menyiapkan cetak biru kontainer lengkap (Node + mesin pengolah video/audio) untuk platform server 24/7.
  - *Alasan*: Koneksi WhatsApp Baileys wajib menyala terus-menerus di latar belakang sehingga mustahil hidup di fungsi *serverless* Vercel murni. Dengan pendekatan ini, pengguna bebas memilih: tetap memakai Vercel untuk tampilan Dashboard sambil menghubungkannya ke mesin bot 24/7, atau men-deploy keduanya sekaligus di Cloud Run / Railway / Render / VPS.

- **Keputusan 3: Pemrosesan Media Lokal & Pengiriman Slide Berjeda Anti-Ban**
  - *Pendekatan Terpilih*: Merender stiker statis/animasi, `.qc`, konversi audio/video, dan efek suara secara lokal di server, serta menyalurkan setiap pengiriman balasan (termasuk rangkaian foto `.ttslide` dan media besar `.hdsw`) melewati antrean keluar berjeda (*paced outbound queue*) dengan batas ukuran aman 35 MB.
  - *Alasan*: Menjamin kecepatan dan ketajaman hasil tanpa ketergantungan API pembuat stiker luar, sekaligus menjaga ritme pengiriman pesan tetap terlihat manusiawi di mata sistem keamanan Meta.

---

## 4. Technical Architecture & Data Strategy

### Diagram Arsitektur Koneksi, Hosting & Pemrosesan Bot

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│           ANTARMUKA WEB DASHBOARD (Bisa di Server Terpadu atau di Vercel)          │
│                                                                                    │
│  ┌────────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Simulator Chat │ │ Katalog & Studio │ │ Koneksi WA & │ │ Keamanan, Gateway,   │ │
│  │ (.hdsw Grup,   │ │ (Filter Kategori │ │ Konfigurasi  │ │ Pengaturan &         │ │
│  │  Video, Audio) │ │  & Toggle Aktif) │ │ URL Server   │ │ Template Balasan     │ │
│  └───────┬────────┘ └────────┬─────────┘ └──────┬───────┘ └──────────┬───────────┘ │
└──────────┴───────────────────┴─────────┬────────┴────────────────────┴─────────────┘
                                         │ HTTP REST + Real-Time WebSocket
                                         │ (Otomatis Lokal atau Lintas Domain / CORS)
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│        MESIN SERVER BOT PERSISTEN 24/7 (Cloud Run / Railway / Render / VPS)        │
│                                                                                    │
│  ┌──────────────────────────────┐        ┌──────────────────────────────────────┐  │
│  │ Perisai Anti-Ban & Antrean   │◄──────►│ Router Command Awalan Tunggal (".")  │  │
│  │ (Cooldown, Typing/Recording, │        │ (Reaksi ⏳/✔️/❌, Konteks Grup & Pribadi,│  │
│  │  Paced Queue, Kunci Manual)  │        │  Ekstraksi Reply Media & ViewOnce)   │  │
│  └──────────────┬───────────────┘        └─────┬────────────────┬───────────────┘  │
│                 │                              │                │                  │
│                 ▼                              ▼                ▼                  │
│  ┌──────────────────────────┐   ┌─────────────────────┐  ┌──────────────────────┐  │
│  │ Studio Stiker & Maker    │   │ Konverter & .hdsw   │  │ Multi-Downloader     │  │
│  │ (.s Foto/Vid, .qc, .iqc, │   │ (.hdsw Grup/Pribadi,│  │ (.aio, .tt, .ttslide,│  │
│  │  .brat/.bratvid, .attp,  │   │  .hd, .rvo, .toptv, │  │  .ig, .fb, .tw, .pin,│  │
│  │  .wm, .toimg, .tovid,    │   │  .tomp3, .tovn,     │  │  .capcut, .mf, .play,│  │
│  │  .meme, .emojimix)       │   │  Efek Audio, QR)    │  │  .yt / .ytmp3)       │  │
│  └──────────────────────────┘   └─────────────────────┘  └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Model Data & Status

- **Pengelola Alamat Backend Dinamis**: Menyimpan konfigurasi opsional alamat server bot (bawaan otomatis mengikuti domain aktif, namun dapat diubah ke alamat server eksternal `https://...` / `wss://...` saat antarmuka dibuka dari hosting statis seperti Vercel) lengkap dengan indikator status jangkauan server.
- **Dukungan `.hdsw` Konteks Grup & Pribadi**: Memperbarui alur ekstraksi dokumen di soket WhatsApp dan Simulator agar menerima dokumen foto/video dari ruang grup maupun pribadi, mempertahankan byte asli video/foto, dan mengirimkan hasilnya kembali di ruang percakapan yang sama.
- **Konteks & Balasan Multi-Media Lengkap**: Mendukung pemrosesan pesan masuk berupa foto, video pendek, audio/Voice Note, stiker statis/animasi, dokumen HD, serta pesan *View Once*, dan mendukung balasan berupa stiker WebP ber-EXIF, video bulat PTV, Voice Note PTT, MP3, maupun galeri foto berurutan.

### Pemetaan Interaksi Komponen & Penanganan Status

- **Panel Koneksi WA & Diagnostik Hosting**:
  - Menampilkan status sambungan ke mesin server bot secara *real-time*. Bila antarmuka berjalan di Vercel tanpa mesin belakang yang terhubung, muncul peringatan informatif beserta input **Hubungkan URL Server Bot** dan panduan ringkas cara menjalankan mesin bot 24/7 di Cloud Run / Railway / Render / VPS.
- **Simulator Chat Grup & Pribadi**:
  - Membuka akses uji coba lampiran *Dokumen Foto/Video HD* (`.hdsw`) baik saat tab Simulator berada di **Chat Pribadi** maupun **Grup Komunitas**, ditambah tombol uji cepat untuk Video, Audio/VN, Stiker, *View Once*, dan fitur *Reply* berantai pada pesan hasil bot.
- **Konsolidasi Ruang Kerja & Menu `.menu` Terkategori**:
  - Menyusun ulang tampilan `.menu` di WhatsApp per sub-kategori (`.menu stiker`, `.menu downloader`, `.menu media`, `.menu audio`, `.menu grup`, `.menu utilitas`) serta menyatukan halaman pengaturan serumpun di Web Dashboard agar seluruh fitur baru dan fitur lama tertata rapi dalam 5 tab utama.
