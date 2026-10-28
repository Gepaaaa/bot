# Adopsi Fitur Lengkap OpenWA ke GepaBot

Adopsi komprehensif arsitektur dan fitur unggulan dari repositori **OpenWA** (`rmyndharis/OpenWA`) ke dalam GepaBot: mencakup **Sistem Keamanan Anti-Ban & Paced Queue**, **REST API Gateway Lengkap** (Kirim Teks, Media, Poll Interaktif, Cek Nomor WA), **Real-Time Webhook Event Dispatcher dengan HMAC**, **Aturan Respon Otomatis (Auto-Responder Rule Engine)**, serta **Tab Navigasi Interaktif "Gateway & Webhook"**.

## User Review & Critical Decisions

> [!IMPORTANT]
> Sesuai arahan revisi Anda, ruang lingkup diperluas tidak hanya pada fitur keamanan, melainkan mengadopsi seluruh rangkaian fitur unggulan OpenWA:
> 1. **REST API Gateway Komprehensif**: Endpoint HTTP modular untuk kirim pesan teks, kirim media, buat polling interaktif WhatsApp, kirim reaksi emoji, dan verifikasi apakah nomor terdaftar di WhatsApp (`onWhatsApp`).
> 2. **Real-Time Webhook Dispatcher**: Meneruskan pesan masuk, event grup, dan status koneksi ke URL webhook kustom Anda (misalnya n8n, Make.com, Zapier, atau backend sendiri) lengkap dengan verifikasi tanda tangan HMAC `X-OpenWA-Signature`.
> 3. **Auto-Responder Rule Engine (Respon Kata Kunci Otomatis)**: Pengaturan aturan chatbot fleksibel (Exact Match, Contains, Regex) untuk membalas otomatis di chat pribadi maupun grup tanpa perlu menyentuh kode.
> 4. **Paced Outbound Queue & Anti-Ban Shield**: Antrean pesan FIFO dengan *Gaussian Jitter* ($1.8\text{s} - 3.8\text{s}$), *Typing Presence Indicator* (`composing`), *Group Encryption Key Caching*, dan *Smart Exponential Backoff*.
> 5. **Tab Navigasi Baru "Gateway & Webhook"**: Antarmuka visual di dashboard untuk memantau antrean, menguji API via REST console, mengatur webhook, dan mengelola aturan auto-responder.

---

## 1. Overview & Core Concept

- **Apa yang Dibangun**:
  - **OpenWA Gateway Router (`server/gatewayRouter.ts`)**: Endpoint REST API berstandar OpenWA yang dapat diakses dengan header `X-API-Key` atau `Bearer`:
    - `POST /api/gateway/send-text`: Kirim teks, mention target, atau quote pesan.
    - `POST /api/gateway/send-media`: Kirim gambar, audio MP3, video MP4, atau PDF dokumen via URL atau base64.
    - `POST /api/gateway/send-poll`: Buat voting interaktif di chat pribadi atau grup.
    - `POST /api/gateway/send-reaction`: Beri reaksi emoji ke pesan mana pun.
    - `POST /api/gateway/check-number`: Cek status keaktifan nomor di jaringan WhatsApp.
    - `GET /api/gateway/status`: Cek kesehatan antrean, sesi WA, dan penggunaan gateway.
  - **Paced Outbound Queue (`server/queueEngine.ts`)**: Seluruh pesan keluar dari perintah bot dan panggilan REST API diproses melalui antrean yang sama dengan jeda acak manusiawi dan simulasi mengetik, mencegah ban akibat lonjakan pesan bersamaan.
  - **Webhook Dispatcher (`server/webhookDispatcher.ts`)**: Meneruskan event `message.received`, `message.ack`, `group.update`, dan `session.status` ke endpoint webhook pengguna dengan payload JSON standar OpenWA dan tanda tangan SHA-256 HMAC.
  - **Auto-Responder Engine (`server/autoResponder.ts`)**: Mesin pencocok kata kunci yang terintegrasi langsung dengan `commandEngine.ts`, memungkinkan bot merespon kata kunci seperti *tanya harga*, *faq*, *link sosmed*, atau jam operasional.
  - **Tab Dashboard "Gateway & Webhook" (`src/components/GatewayWebhookView.tsx`)**: Antarmuka terpadu untuk menguji REST API, mengelola Webhook, dan menambah aturan Auto-Responder.

- **Target Persona & Nilai**: Pengguna dapat memanfaatkan GepaBot tidak hanya sebagai bot chat grup, tetapi juga sebagai gateway WhatsApp serba bisa untuk otomasi notifikasi sistem, integrasi workflow eksternal, dan penanganan auto-reply bisnis/komunitas.

---

## 2. User Experience & Visual Design

### A. Alur Kerja Pengguna pada Tab "Gateway & Webhook"
Tab baru ditambahkan ke navigasi utama: **`[Simulator Chat] [Koneksi WA] [Keamanan & Anti-Ban] [Gateway & Webhook] [Katalog Command] [Template Chat] [Pengaturan]`**.

1. **Sub-Tab 1: REST API Console & Tester**
   - Formulir interaktif untuk mencoba kirim teks, media URL, atau poll ke nomor tujuan mana pun.
   - Penampil respons real-time (JSON payload, status Job ID, dan estimasi waktu eksekusi antrean).
   - Salinan *cURL snippet* instan yang siap di-copy-paste ke terminal atau script eksternal.
   - Tool **Cek Nomor WhatsApp**: Ketik nomor untuk memeriksa apakah terdaftar di WA beserta format JID resminya.

2. **Sub-Tab 2: Konfigurasi Webhook & Log Event**
   - Input URL Webhook (misal `https://webhook.site/...` atau webhook n8n).
   - Input Kunci Rahasia Webhook (*HMAC Secret*) untuk keamanan payload `X-OpenWA-Signature`.
   - Sakelar filter event yang ingin diteruskan: *Pesan Masuk*, *Status Pengiriman*, *Pembaruan Grup*, *Status Sesi*.
   - Tombol **"Kirim Test Ping Webhook"** untuk memeriksa konektivitas seketika.
   - Tabel riwayat 20 event webhook terakhir dengan indikator status HTTP (200 OK, timeout, dll).

3. **Sub-Tab 3: Aturan Respon Otomatis (Auto-Responder Rules)**
   - Daftar kartu aturan respons kata kunci aktif/nonaktif.
   - Modal/Formulir tambah aturan:
     - Kata Kunci / Trigger (contoh: `halo`, `info rules`, `daftar harga`).
     - Tipe Pencocokan: *Exact Match (Tepat)*, *Contains (Mengandung Kata)*, atau *Regex*.
     - Target Obrolan: *Semua*, *Hanya Chat Pribadi*, atau *Hanya Grup*.
     - Teks Balasan (mendukung variabel `{sender}`, `{time}`, `{botName}`, `{groupName}`).

### B. Desain Antarmuka & Tema
- **Konsistensi Visual**: Mengikuti bahasa desain utilitarian Gepa Corner. Bebas *AI slop*, tanpa static pill sandwiches, tanpa dekorasi pulsing dot sembarangan, serta navigasi top bar bersih 1-baris.
- **Tipografi**: Heading display dengan *Plus Jakarta Sans*, teks kontrol dengan *DM Sans*, dan parameter API/Job ID/cURL menggunakan `font-mono tabular-nums`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified Queue Architecture (Semua Pesan Masuk 1 Antrean)**
  - *Pendekatan*: Pesan dari perintah bot WhatsApp, Simulator Chat, maupun dari REST API Gateway OpenWA dimasukkan ke dalam antrean tunggal `OutboundQueue`.
  - *Alasan*: Menjamin nomor bot terlindungi 100% dari lonjakan tak terduga, baik dari chat grup ramai maupun dari skrip eksternal pengguna.

- **Decision 2: Standar Payload Webhook Mengikuti Format OpenWA**
  - *Pendekatan*: Format JSON payload webhook dan header `X-OpenWA-Signature` dibuat kompatibel dengan spesifikasi OpenWA.
  - *Alasan*: Memudahkan integrasi langsung dengan library, workflow n8n, atau platform automasi yang sudah terbiasa dengan struktur OpenWA.

- **Decision 3: Zero-External-Dependency (Tanpa Wajib Redis/Postgres)**
  - *Pendekatan*: Seluruh antrean pesan, konfigurasi webhook, dan aturan auto-responder disimpan dalam memori cerdas dengan persistensi file JSON lokal (`.bot-state.json`).
  - *Alasan*: Aplikasi tetap dapat dijalankan langsung dengan `npm run dev` tanpa memerlukan setup Redis atau database eksternal.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GepaBot Web Dashboard                             │
│  [Simulator] [Koneksi] [Anti-Ban] [Gateway & Webhook] [Katalog] [Pengaturan]│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / Socket.IO
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Express Backend Service                           │
│                                                                             │
│  ┌───────────────────────┐  ┌────────────────────────────────────────────┐  │
│  │   Command Engine      │  │        OpenWA REST API Gateway Router      │  │
│  │   (.tt, .s, .hdsw...) │  │  POST /api/gateway/send-text               │  │
│  └──────────┬────────────┘  │  POST /api/gateway/send-media              │  │
│             │               │  POST /api/gateway/send-poll               │  │
│             │               │  POST /api/gateway/check-number            │  │
│             │               └──────────────────────┬─────────────────────┘  │
│             │                                      │                        │
│  ┌──────────▼────────────┐                         │                        │
│  │  Auto-Responder Engine│                         │                        │
│  │  (Keyword Rule Match) │                         │                        │
│  └──────────┬────────────┘                         │                        │
│             │                                      │                        │
│             └──────────────────┬───────────────────┘                        │
│                                ▼                                            │
│            ┌──────────────────────────────────────────────┐                 │
│            │        Unified Paced Outbound Queue          │                 │
│            │   - FIFO Queue with Jitter (1.8s - 3.8s)     │                 │
│            │   - Typing Presence Simulator (composing)    │                 │
│            │   - Group Encryption Participant Cache       │                 │
│            └──────────────────────┬───────────────────────┘                 │
│                                   │                                         │
│                                   ▼                                         │
│            ┌──────────────────────────────────────────────┐                 │
│            │       Baileys WhatsApp Socket Manager        │                 │
│            │   - Windows 11 Chrome 131 Fingerprint        │                 │
│            │   - Exponential Backoff Auto-Reconnect       │                 │
│            │   - Inbound Events & Webhook Dispatcher      │                 │
│            └──────────────────────┬───────────────────────┘                 │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │ Webhook HTTP POST (HMAC Signed)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           External Systems (n8n, Make, Flowise, Custom Backend)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Baru yang Ditambahkan:

1. **`AutoResponderRule`**:
   - `id`: string
   - `trigger`: string
   - `matchType`: `'exact' | 'contains' | 'regex'`
   - `replyText`: string
   - `scope`: `'all' | 'private_only' | 'group_only'`
   - `enabled`: boolean
   - `hitCount`: number

2. **`WebhookConfig`**:
   - `enabled`: boolean
   - `url`: string
   - `secret`: string (untuk tanda tangan HMAC-SHA256)
   - `events`: string[] (contoh: `['message.received', 'message.sent', 'session.status']`)

3. **`GatewayJob` (Antrean Pesan)**:
   - `id`: string
   - `to`: string
   - `type`: `'text' | 'image' | 'video' | 'audio' | 'document' | 'poll'`
   - `status`: `'queued' | 'composing' | 'sent' | 'failed'`
   - `createdAt`: number
   - `sentAt`?: number

---

## 5. Rencana Tahapan Eksekusi

1. **Tahap 1: Core Engine Backend (Keamanan & Antrean OpenWA)**
   - Buat `server/queueEngine.ts` (FIFO queue, Gaussian jitter, typing simulator).
   - Buat `server/groupCache.ts` (caching metadata enkripsi member grup Baileys).
   - Perbarui `server/baileysManager.ts` dengan *exponential backoff auto-reconnect* dan integrasikan pengiriman pesan ke `queueEngine`.

2. **Tahap 2: OpenWA REST API Gateway Router & Webhook Dispatcher**
   - Buat `server/gatewayRouter.ts` (endpoint `/send-text`, `/send-media`, `/send-poll`, `/check-number`, `/status`).
   - Buat `server/webhookDispatcher.ts` dengan pembuatan hash HMAC-SHA256 `X-OpenWA-Signature` dan sistem logging riwayat event.
   - Daftarkan gateway router pada `server.ts`.

3. **Tahap 3: Mesin Auto-Responder Kata Kunci**
   - Buat `server/autoResponder.ts` untuk memproses kecocokan kata kunci dan integrasikan ke dalam aliran pesan masuk di `server/commandEngine.ts`.
   - Perbarui `server/stateStore.ts` dan `src/shared/types.ts` untuk menyimpan konfigurasi webhook dan aturan auto-responder ke disk.

4. **Tahap 4: Antarmuka Dashboard "Gateway & Webhook"**
   - Buat komponen `src/components/GatewayWebhookView.tsx` dengan 3 sub-seksi: API Console/Tester, Pengaturan Webhook, dan Tabel Aturan Auto-Responder.
   - Hubungkan tab baru ke navigasi utama di `src/App.tsx`.
   - Perbarui `src/components/AntiBanView.tsx` dengan indikator antrean live dan ringkasan metrik OpenWA.

5. **Tahap 5: Verifikasi & Testing**
   - Jalankan `lint_applet` dan `compile_applet` untuk memastikan seluruh tipe data TypeScript valid.
   - Uji endpoint gateway via cURL/internal script (kirim pesan terantre, cek nomor WA, validasi webhook test ping).
   - Restart dev server dan pastikan aplikasi berjalan stabil.
