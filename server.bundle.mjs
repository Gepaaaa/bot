// server.ts
import "dotenv/config";
import { spawn as spawn2 } from "node:child_process";
import fs11 from "node:fs/promises";
import http from "node:http";
import os6 from "node:os";
import path9 from "node:path";
import readline from "node:readline";
import express from "express";
import { WebSocketServer } from "ws";

// src/shared/commands.ts
var OFFICIAL_OWNER_NUMBER = "6289673533963";
var OFFICIAL_OWNER_DISPLAY = "+62 896-7353-3963";
function formatPhoneDisplay(rawPhone) {
  const digits = (rawPhone || OFFICIAL_OWNER_NUMBER).replace(/[^0-9]/g, "");
  if (!digits) return OFFICIAL_OWNER_DISPLAY;
  if (digits.startsWith("62") && digits.length >= 11) {
    const rest = digits.slice(2);
    const p1 = rest.slice(0, 3);
    const p2 = rest.slice(3, 7);
    const p3 = rest.slice(7);
    return `+62 ${[p1, p2, p3].filter(Boolean).join("-")}`;
  }
  return `+${digits}`;
}
var DEFAULT_REACTIONS = {
  enabled: true,
  pending: "\u23F3",
  success: "\u2714\uFE0F",
  error: "\u274C"
};
var DEFAULT_AI_ENHANCE_CONFIG = {
  serviceUrl: "http://127.0.0.1:8001",
  preferredFaceModel: "codeformer",
  faceFidelity: 0.72,
  defaultScale: 2,
  autoDenoise: true,
  autoDeblur: true,
  sendProgressNotice: true,
  maxConcurrentJobs: 2,
  maxQueueSize: 15,
  timeoutMs: 9e4,
  maxFileSizeMb: 15
};
var SUSPENSION_RISK_DISABLED_REPLY = "fitur dinonaktifkan karena berpotensi grup ditangguhkan";
var DEFAULT_TEMPLATES = {
  menuHeader: "*{botName}*\nPrefix: *{prefix}*  \xB7  Fitur Aktif: *{totalCommands}*\nOwner: *wa.me/{ownerNumber}*",
  menuFooter: "_Ketik *{prefix}menu <1-7>* untuk melihat detail kategori._\n_Ketik *{prefix}owner* untuk menghubungi pengembang._",
  downloaderCaption: "*Unduhan Selesai ({platform})*\nJudul: {title}\nKreator: {author}\nDurasi: {duration}",
  audioCaption: "*Audio MP3 Berhasil Diekstrak*\nJudul: {title}\nSumber: {author}",
  stickerReply: "Stiker berhasil dibuat ({packName} \xB7 {authorName})",
  stickerMissingMedia: "Kirim foto/video pendek dengan caption *{prefix}s* atau balas (reply) foto/video dengan *{prefix}s* untuk dijadikan stiker.",
  hdswCaption: "*Media HD Siap Status WA*\nFormat asli tanpa kompresi ({mediaKind} \xB7 {fileSize}) \u2014 tinggal tekan *Teruskan (Forward)* ke *Status Saya*.",
  hdswGroupConfirm: "*Media HD Siap Status WA ({mediaKind} \xB7 {fileSize})*\nSilakan langsung tekan *Teruskan (Forward)* pesan media ini ke *Status Saya*, *@{sender}*!",
  pingReply: "*{botName} Aktif*\n\u2022 Respons: *{latency} ms*\n\u2022 Uptime: *{uptime}*\n\u2022 Prefix: *{prefix}*\n\u2022 Owner: *{ownerDisplay}*",
  kickSuccess: "*Moderasi Grup*\nAnggota *@{target}* berhasil dikeluarkan dari grup oleh admin.",
  addSuccess: "*Anggota Ditambahkan*\nNomor *@{target}* berhasil dimasukkan ke dalam grup.",
  promoteSuccess: "*Pembaruan Admin*\nSelamat! *@{target}* kini telah diangkat menjadi *Admin Grup*.",
  demoteSuccess: "*Pembaruan Admin*\nStatus admin untuk *@{target}* telah dicabut menjadi anggota biasa.",
  groupOpenSuccess: "*Pengaturan Grup Diperbarui*\nRuang chat grup telah *DIBUKA* \u2014 seluruh anggota kini dapat mengirim pesan.",
  groupCloseSuccess: "*Pengaturan Grup Diperbarui*\nRuang chat grup telah *DIKUNCI* \u2014 hanya Admin Grup yang dapat mengirim pesan.",
  antilinkWarn: "Peringatan Moderasi Grup: Tautan dari *@{sender}* otomatis dihapus karena fitur *{prefix}antilink* sedang aktif.",
  welcomeMsg: "Selamat datang *@{target}* di *{groupName}*! Ketik *{prefix}menu* untuk melihat daftar perintah *{botName}*.",
  goodbyeMsg: "Sampai jumpa *@{target}*, terima kasih sudah pernah bergabung di *{groupName}*.",
  unknownCommand: "Perintah *{prefix}{command}* tidak dikenali. Ketik *{prefix}menu* untuk melihat daftar perintah yang tersedia.",
  errorReply: "Gagal memproses *{prefix}{command}*: {error}"
};
function renderBotTemplate(template, variables) {
  let rendered = template.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (match, key) => {
      const val = variables[key];
      return val !== void 0 ? String(val) : match;
    }
  );
  const userTarget = variables.target ?? variables.sender;
  if (userTarget !== void 0) {
    rendered = rendered.replace(/@user\b/gi, `@${userTarget}`);
  }
  if (variables.sender !== void 0) {
    rendered = rendered.replace(/@sender\b/gi, `@${variables.sender}`);
  }
  if (variables.groupName !== void 0) {
    rendered = rendered.replace(
      /@(group|grup|subject)\b/gi,
      String(variables.groupName)
    );
  }
  return rendered;
}
var COMMAND_CATALOG = [
  // ================= DOWNLOADER MULTI-PLATFORM =================
  {
    id: "aio",
    aliases: ["dl", "autodl", "unduh"],
    category: "downloader",
    usage: "aio <link sosmed>",
    description: "All-in-One Downloader pintar: deteksi otomatis link TikTok, IG, X/Twitter, FB, Pinterest, CapCut, YouTube, atau MediaFire.",
    example: "aio https://www.tiktok.com/@tiktok/video/7106594312292453675"
  },
  {
    id: "tt",
    aliases: ["tiktok", "ttdl", "vt"],
    category: "downloader",
    usage: "tt <link tiktok>",
    description: "Download video TikTok kualitas HD tanpa watermark (otomatis mendukung kiriman Slide Foto).",
    example: "tt https://www.tiktok.com/@tiktok/video/7106594312292453675"
  },
  {
    id: "ttslide",
    aliases: ["ttimg", "ttfoto", "tiktokslide"],
    category: "downloader",
    usage: "ttslide <link slide tiktok>",
    description: "Download seluruh foto dari postingan Slide TikTok tanpa watermark dan kirim satu per satu sekaligus sesuai urutan aslinya (Foto 1/N s.d. N/N).",
    example: "ttslide https://www.tiktok.com/@user5449227735440/photo/7703619176962870558"
  },
  {
    id: "ig",
    aliases: ["instagram", "igdl", "reels"],
    category: "downloader",
    usage: "ig <link instagram>",
    description: "Download video Instagram Reels, Story publik, atau postingan foto/video dari tautan.",
    example: "ig https://www.instagram.com/reel/C8xYzExample/"
  },
  {
    id: "fb",
    aliases: ["facebook", "fbdl", "fbwatch"],
    category: "downloader",
    usage: "fb <link facebook>",
    description: "Download video Facebook Reels & Watch publik dalam kualitas terbaik yang tersedia.",
    example: "fb https://www.facebook.com/watch/?v=10153231379946729"
  },
  {
    id: "tw",
    aliases: ["twitter", "x", "xdl"],
    category: "downloader",
    usage: "tw <link x/twitter>",
    description: "Download video MP4 atau foto resolusi asli langsung dari cuitan X (Twitter).",
    example: "tw https://x.com/NASA/status/1800000000000000000"
  },
  {
    id: "pin",
    aliases: ["pinterest", "pindl"],
    category: "downloader",
    usage: "pin <link pinterest>",
    description: "Download video pendek atau gambar kualitas asli dari tautan Pinterest / pin.it.",
    example: "pin https://www.pinterest.com/pin/1234567890/"
  },
  {
    id: "capcut",
    aliases: ["cc", "ccdl"],
    category: "downloader",
    usage: "capcut <link template>",
    description: "Download video pratinjau template CapCut tanpa watermark.",
    example: "capcut https://www.capcut.com/t/Zs8Example/"
  },
  {
    id: "mf",
    aliases: ["mediafire", "mfdl"],
    category: "downloader",
    usage: "mf <link mediafire>",
    description: "Ambil dan kirim berkas langsung dari tautan publik MediaFire (batas aman 35 MB).",
    example: "mf https://www.mediafire.com/file/example/berkas.zip/file"
  },
  {
    id: "yt",
    aliases: ["youtube", "ytmp4", "shorts"],
    category: "downloader",
    usage: "yt <link youtube>",
    description: "Download video YouTube Shorts & video reguler dalam format MP4 siap tonton.",
    example: "yt https://www.youtube.com/watch?v=jNQXAC9IVRw"
  },
  // ================= STUDIO STIKER & MAKER =================
  {
    id: "s",
    aliases: ["stiker", "sticker", "sgif"],
    category: "sticker",
    usage: "s (kirim/reply foto atau video)",
    description: "Ubah foto maupun video/GIF pendek (maks 7 detik) menjadi stiker WebP 512\xD7512 statis atau bergerak lengkap EXIF.",
    example: "s",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "qc",
    aliases: ["quotely", "quotechat", "bubble"],
    category: "sticker",
    usage: "qc <teks> (atau reply pesan)",
    description: "Buat stiker gelembung chat WhatsApp (Quote Chat) lengkap nama, warna pengirim, avatar, dan jam pesan.",
    example: "qc ngopi santai dulu malam ini"
  },
  {
    id: "iqc",
    aliases: ["iphoneqc", "ioschat"],
    category: "sticker",
    usage: "iqc <teks> (atau reply pesan)",
    description: "Buat stiker gelembung percakapan bergaya iPhone iMessage bersih.",
    example: "iqc otw lima menit lagi sampai"
  },
  {
    id: "brat",
    aliases: ["bratgreen"],
    category: "sticker",
    usage: "brat <teks>",
    description: "Buat stiker teks otomatis gaya sampul Brat warna hijau limau khas.",
    example: "brat santai dulu ga sih"
  },
  {
    id: "bratwhite",
    aliases: ["bratw", "bratputih"],
    category: "sticker",
    usage: "bratwhite <teks>",
    description: "Buat stiker teks otomatis gaya Brat versi latar putih bersih.",
    example: "bratwhite tetap tenang walau sibuk"
  },
  {
    id: "bratcolor",
    aliases: ["bratwarna", "bratc"],
    category: "sticker",
    usage: "bratcolor <warna> | <teks>",
    description: "Buat stiker Brat dengan pilihan warna latar (pink, biru, merah, ungu, kuning, hitam, oranye, cyan).",
    example: "bratcolor pink | tetap tenang walau revisi datang"
  },
  {
    id: "bratvid",
    aliases: ["bratvideo", "bratanim", "bratgif"],
    category: "sticker",
    usage: "bratvid <teks>",
    description: "Buat stiker animasi bergerak gaya Brat yang memunculkan teks kata demi kata.",
    example: "bratvid santai dulu ngopi sebentar"
  },
  {
    id: "ttp",
    aliases: ["text2pic", "stikerteks"],
    category: "sticker",
    usage: "ttp <teks>",
    description: "Buat stiker tipografi teks tebal berlatar transparan tajam.",
    example: "ttp GAS MABAR MALAM INI"
  },
  {
    id: "attp",
    aliases: ["animttp", "pelangi"],
    category: "sticker",
    usage: "attp <teks>",
    description: "Buat stiker teks animasi berkedip warna-warni RGB transparan.",
    example: "attp MANTAP JIWA"
  },
  {
    id: "smeme",
    aliases: ["memesticker", "stikermeme", "smemer"],
    category: "sticker",
    usage: "smeme <teks atas> | <teks bawah> (reply foto/stiker)",
    description: "Tambahkan teks meme tebal besar atas & bawah pada foto maupun stiker yang di-reply.",
    example: "smeme niatnya tidur cepat | malah scroll tiktok jam 3 pagi",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "meme",
    aliases: ["memeindo", "memereceh", "candaan", "jokes"],
    category: "media",
    usage: "meme [kategori/topik opsional]",
    description: "Ambil dan kirim gambar meme lucu acak dari berbagai referensi web & komunitas humor (cak.one/candaan/meme-api).",
    example: "meme"
  },
  {
    id: "emojimix",
    aliases: ["emix", "mixemoji"],
    category: "sticker",
    usage: "emojimix <emoji1>+<emoji2>",
    description: "Gabungkan 2 emoji menjadi 1 stiker kombinasi unik ala Google Emoji Kitchen.",
    example: "emojimix \u{1F600}+\u{1F60E}"
  },
  {
    id: "wm",
    aliases: ["take", "colong", "swm", "exif"],
    category: "sticker",
    usage: "wm <nama> atau <pack|author> (reply stiker)",
    description: "Ganti watermark stiker. Bisa hanya nama saja (contoh: .wm yodi) tanpa embel-embel, maupun format pack|author.",
    example: "wm yodi",
    requiresMedia: true,
    mediaKindHint: "sticker"
  },
  {
    id: "toimg",
    aliases: ["topng", "toimage"],
    category: "sticker",
    usage: "toimg (reply stiker)",
    description: "Ubah stiker WebP yang di-reply kembali menjadi gambar PNG jernih.",
    example: "toimg",
    requiresMedia: true,
    mediaKindHint: "sticker"
  },
  {
    id: "tovid",
    aliases: ["tomp4", "togif"],
    category: "sticker",
    usage: "tovid (reply stiker gerak)",
    description: "Ubah stiker animasi bergerak WebP menjadi video MP4 siap putar & simpan.",
    example: "tovid",
    requiresMedia: true,
    mediaKindHint: "sticker"
  },
  // ================= PERKAKAS MEDIA & STATUS HD =================
  {
    id: "hdsw",
    aliases: ["sw", "tosw", "hdstatus", "swori"],
    category: "media",
    usage: "hdsw (kirim/reply dokumen foto/video)",
    description: "Bisa di Grup & Chat Pribadi! Ubah file Dokumen foto/video ukuran asli menjadi balasan media WA Web jernih tanpa kompresi siap diteruskan ke Status WA.",
    example: "hdsw",
    requiresMedia: true,
    mediaKindHint: "document"
  },
  {
    id: "hd",
    aliases: ["enhance", "jernih", "hdr"],
    category: "media",
    usage: "hd [fidelity 0.1-0.95] (kirim/reply foto)",
    description: "Peningkatan kualitas foto otomatis adaptif berbasis AI (Real-ESRGAN + CodeFormer/GFPGAN + SCUNet/NAFNet sesuai kondisi noise, blur, dan wajah).",
    example: "hd",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "remini",
    aliases: ["facehd", "restoreface"],
    category: "media",
    usage: "remini [fidelity 0.1-0.95] (kirim/reply foto)",
    description: "Fokus restorasi detail wajah natural menggunakan CodeFormer / GFPGAN dengan kontrol fidelity agar identitas wajah asli tetap terjaga dan tidak tampak plastik.",
    example: "remini",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "upscale",
    aliases: ["sr", "superres"],
    category: "media",
    usage: "upscale (kirim/reply foto)",
    description: "Tingkatkan resolusi dan ketajaman tekstur umum foto menggunakan pretrained super-resolution Real-ESRGAN.",
    example: "upscale",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "hd2",
    aliases: ["upscale2x", "2x"],
    category: "media",
    usage: "hd2 (kirim/reply foto)",
    description: "Super-resolution AI 2\xD7 lipat dengan Real-ESRGAN x2plus serta penjagaan warna natural.",
    example: "hd2",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "hd4",
    aliases: ["upscale4x", "4x"],
    category: "media",
    usage: "hd4 (kirim/reply foto)",
    description: "Super-resolution AI 4\xD7 lipat resolusi tinggi dengan Real-ESRGAN x4plus dan pipeline restorasi adaptif.",
    example: "hd4",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "rvo",
    aliases: ["readviewonce", "bukavo", "lihatsekali"],
    category: "media",
    usage: "rvo (reply pesan sekali lihat)",
    description: "Buka dan tampilkan kembali foto, video, atau suara View Once (sekali lihat) yang di-reply di ruang chat.",
    example: "rvo",
    requiresMedia: true,
    mediaKindHint: "viewonce"
  },
  {
    id: "toptv",
    aliases: ["ptv", "videobulat"],
    category: "media",
    usage: "toptv (kirim/reply video)",
    description: "Ubah video biasa menjadi pesan Video Note bulat (PTV) khas WhatsApp.",
    example: "toptv",
    requiresMedia: true,
    mediaKindHint: "video"
  },
  {
    id: "hitamkan",
    aliases: ["grayscale", "bw", "hitamputih"],
    category: "media",
    usage: "hitamkan (kirim/reply foto)",
    description: "Ubah foto menjadi nuansa monokrom hitam-putih kontras tinggi.",
    example: "hitamkan",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "imgedit",
    aliases: ["blur", "invert", "negatif", "mirror", "flip", "sepia"],
    category: "media",
    usage: "imgedit <blur|invert|mirror|flip|sepia>",
    description: "Terapkan efek manipulasi gambar instan (bisa langsung ketik .blur, .invert, .mirror, .flip, atau .sepia pada foto).",
    example: "imgedit blur",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "tourl",
    aliases: ["upload", "catbox", "linkmedia"],
    category: "media",
    usage: "tourl (kirim/reply media)",
    description: "Unggah foto, video, audio, atau stiker menjadi tautan URL publik siap bagikan.",
    example: "tourl",
    requiresMedia: true,
    mediaKindHint: "image"
  },
  {
    id: "qrcode",
    aliases: ["qr", "buatqr"],
    category: "media",
    usage: "qrcode <teks atau link>",
    description: "Buat gambar kode QR tajam siap pindai dari teks atau tautan apa pun.",
    example: "qrcode https://wa.me/6289673533963"
  },
  // ================= AUDIO & EFEK SUARA =================
  {
    id: "mp3",
    aliases: ["ttmp3", "ytmp3", "musik"],
    category: "audio",
    usage: "mp3 <link video sosmed>",
    description: "Ekstrak audio MP3 jernih langsung dari tautan TikTok, YouTube, atau sosial media lainnya.",
    example: "mp3 https://www.tiktok.com/@tiktok/video/7106594312292453675"
  },
  {
    id: "play",
    aliases: ["song", "lagu", "cari", "spotify"],
    category: "audio",
    usage: "play <judul lagu / penyanyi>",
    description: "Cari lagu berdasarkan kata kunci judul/artis dan kirimkan audio MP3 langsung ke ruang chat.",
    example: "play Hindia Evaluasi"
  },
  {
    id: "tomp3",
    aliases: ["toaudio", "vn2mp3"],
    category: "audio",
    usage: "tomp3 (reply video / VN)",
    description: "Ekstrak jalur suara dari video atau ubah Voice Note menjadi berkas musik MP3.",
    example: "tomp3",
    requiresMedia: true,
    mediaKindHint: "video"
  },
  {
    id: "tovn",
    aliases: ["toptt", "vn"],
    category: "audio",
    usage: "tovn (reply video / MP3)",
    description: "Ubah musik MP3 atau video menjadi pesan suara Voice Note (PTT gelombang suara WhatsApp).",
    example: "tovn",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  {
    id: "bass",
    aliases: ["bassboost", "jedagjedug"],
    category: "audio",
    usage: "bass (reply audio / VN)",
    description: "Terapkan efek dentuman Bass Boost mantap pada lagu atau Voice Note yang di-reply.",
    example: "bass",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  {
    id: "nightcore",
    aliases: ["nc", "tupai"],
    category: "audio",
    usage: "nightcore (reply audio / VN)",
    description: "Ubah lagu atau Voice Note menjadi gaya Nightcore dengan nada dan tempo energetik.",
    example: "nightcore",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  {
    id: "slow",
    aliases: ["slowed", "reverb"],
    category: "audio",
    usage: "slow (reply audio / VN)",
    description: "Ubah lagu atau Voice Note menjadi nuansa Slowed + Reverb kalem.",
    example: "slow",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  {
    id: "fast",
    aliases: ["speedup", "cepat"],
    category: "audio",
    usage: "fast (reply audio / VN)",
    description: "Percepat tempo pemutaran audio atau Voice Note tanpa merusak kejernihan.",
    example: "fast",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  {
    id: "robot",
    aliases: ["robo", "cyborg"],
    category: "audio",
    usage: "robot (reply audio / VN)",
    description: "Ubah suara pada Voice Note atau audio menjadi efek modulasi suara Robot.",
    example: "robot",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  {
    id: "reverse",
    aliases: ["baliksuara"],
    category: "audio",
    usage: "reverse (reply audio / VN)",
    description: "Putar balik gelombang audio/Voice Note dari akhir ke awal.",
    example: "reverse",
    requiresMedia: true,
    mediaKindHint: "audio"
  },
  // ================= ADMIN & OTOMASI GRUP =================
  {
    id: "kick",
    aliases: ["tendang", "remove", "dor"],
    category: "group",
    usage: "kick <@tag / nomor / reply>",
    description: "Keluarkan anggota dari grup melalui mention, nomor telepon, atau reply pesan.",
    example: "kick @628577000333",
    groupOnly: true
  },
  {
    id: "add",
    aliases: ["tambah", "invite"],
    category: "group",
    usage: "add <nomor>",
    description: "Dinonaktifkan otomatis karena penambahan paksa nomor via bot berisiko tinggi memicu penangguhan grup oleh WhatsApp (gunakan .linkgc).",
    example: "add 628199000777",
    groupOnly: true,
    suspensionRisk: true
  },
  {
    id: "promote",
    aliases: ["jadiadmin", "admin"],
    category: "group",
    usage: "promote <@tag / nomor / reply>",
    description: "Angkat anggota biasa menjadi Admin Grup.",
    example: "promote @628577000333",
    groupOnly: true
  },
  {
    id: "demote",
    aliases: ["unadmin", "turunkan"],
    category: "group",
    usage: "demote <@tag / nomor / reply>",
    description: "Turunkan status Admin Grup kembali menjadi anggota biasa.",
    example: "demote @628138000222",
    groupOnly: true
  },
  {
    id: "group",
    aliases: ["gc", "grup"],
    category: "group",
    usage: "group <open|close>",
    description: "Buka grup agar semua anggota bisa chat atau kunci khusus Admin.",
    example: "group close",
    groupOnly: true
  },
  {
    id: "setname",
    aliases: ["setsubject", "namagrup"],
    category: "group",
    usage: "setname <nama baru>",
    description: "Ganti nama/judul grup WhatsApp secara langsung.",
    example: "setname Ruang Diskusi Komunitas",
    groupOnly: true
  },
  {
    id: "setdesc",
    aliases: ["deskripsi", "setdeskripsi"],
    category: "group",
    usage: "setdesc <teks deskripsi>",
    description: "Perbarui teks deskripsi aturan atau informasi grup.",
    example: "setdesc Ruang diskusi santai anggota komunitas. Dilarang spam link.",
    groupOnly: true
  },
  {
    id: "linkgc",
    aliases: ["linkgrup", "gclink"],
    category: "group",
    usage: "linkgc",
    description: "Ambil tautan undangan (invite link) grup WhatsApp saat ini.",
    example: "linkgc",
    groupOnly: true
  },
  {
    id: "revoke",
    aliases: ["resetlink", "revokelink"],
    category: "group",
    usage: "revoke",
    description: "Hanguskan link undangan grup lama dan buat kode tautan baru.",
    example: "revoke",
    groupOnly: true
  },
  {
    id: "hidetag",
    aliases: ["ht", "pengumuman"],
    category: "group",
    usage: "hidetag <pesan>",
    description: "Kirim pengumuman penting dengan mention tersembunyi ke seluruh anggota grup (Khusus Admin/Owner).",
    example: "hidetag Jangan lupa kumpul komunitas malam ini jam 20.00 WIB!",
    groupOnly: true
  },
  {
    id: "tagall",
    aliases: ["everyone", "mentionall"],
    category: "group",
    usage: "tagall <pesan>",
    description: "Sebutkan dan tag seluruh daftar anggota grup beserta pesan pengumuman (Khusus Admin/Owner).",
    example: "tagall Absen hadir anggota komunitas",
    groupOnly: true
  },
  {
    id: "antilink",
    aliases: ["antigclink"],
    category: "group",
    usage: "antilink <on|off>",
    description: "Otomatis mendeteksi dan menghapus tautan yang dikirim oleh non-admin di grup.",
    example: "antilink on",
    groupOnly: true
  },
  {
    id: "welcome",
    aliases: ["sambutan"],
    category: "group",
    usage: "welcome <on|off>",
    description: "Aktifkan atau matikan pesan sambutan otomatis saat anggota baru masuk grup.",
    example: "welcome on",
    groupOnly: true
  },
  {
    id: "out",
    aliases: ["leave", "bye", "goodbye"],
    category: "group",
    usage: "out <on|off>",
    description: "Aktifkan atau matikan pesan perpisahan otomatis saat anggota keluar dari grup.",
    example: "out on",
    groupOnly: true
  },
  {
    id: "setwelcome",
    aliases: ["setwel", "ubahwelcome"],
    category: "group",
    usage: "setwelcome <teks>",
    description: "Ubah teks sambutan member baru khusus grup ini oleh Admin (mendukung @user & @group).",
    example: "setwelcome Halo *@user*, selamat bergabung di *@group*! Jangan lupa baca deskripsi ya.",
    groupOnly: true
  },
  {
    id: "setout",
    aliases: ["setleave", "setbye", "setgoodbye"],
    category: "group",
    usage: "setout <teks>",
    description: "Ubah teks saat anggota keluar dari grup ini oleh Admin (mendukung @user & @group).",
    example: "setout Sampai jumpa *@user*, semoga sukses selalu di luar *@group*!",
    groupOnly: true
  },
  {
    id: "setpromote",
    aliases: ["ubahpromote"],
    category: "group",
    usage: "setpromote <teks>",
    description: "Ubah teks pengumuman saat anggota diangkat jadi Admin di grup ini.",
    example: "setpromote Mantap *@user* sekarang resmi jadi Admin di *@group*!",
    groupOnly: true
  },
  {
    id: "setdemote",
    aliases: ["ubahdemote"],
    category: "group",
    usage: "setdemote <teks>",
    description: "Ubah teks pengumuman saat jabatan Admin dicabut di grup ini.",
    example: "setdemote Terima kasih *@user*, kini kembali jadi anggota biasa di *@group*.",
    groupOnly: true
  },
  {
    id: "setantilink",
    aliases: ["setwarn", "ubahantilink"],
    category: "group",
    usage: "setantilink <teks>",
    description: "Ubah teks peringatan otomatis saat bot menghapus link dari non-admin di grup ini.",
    example: "setantilink Ups *@sender*, dilarang sebar link promosi di *@group* ya!",
    groupOnly: true
  },
  {
    id: "setopen",
    aliases: ["ubahopen"],
    category: "group",
    usage: "setopen <teks>",
    description: "Ubah teks pengumuman saat Admin membuka chat grup (.group open).",
    example: "setopen Grup *@group* sudah dibuka! Silakan berdiskusi dengan sopan.",
    groupOnly: true
  },
  {
    id: "setclose",
    aliases: ["ubahclose"],
    category: "group",
    usage: "setclose <teks>",
    description: "Ubah teks pengumuman saat Admin mengunci chat grup (.group close).",
    example: "setclose Grup *@group* dikunci sementara khusus pengumuman Admin.",
    groupOnly: true
  },
  {
    id: "cekset",
    aliases: ["setinfo", "listset", "infogc"],
    category: "group",
    usage: "cekset",
    description: "Lihat status fitur grup (welcome, out, antilink) beserta seluruh teks custom grup ini.",
    example: "cekset",
    groupOnly: true
  },
  {
    id: "resetset",
    aliases: ["resetchat", "resetgc"],
    category: "group",
    usage: "resetset",
    description: "Kembalikan seluruh teks custom grup (welcome, out, dll.) ke pengaturan bawaan bot.",
    example: "resetset",
    groupOnly: true
  },
  // ================= UTILITAS & INFO =================
  {
    id: "menu",
    aliases: ["help", "fitur"],
    category: "utility",
    usage: "menu [1-7 / fitur]",
    description: "Tampilkan daftar kategori menu (1\u20137) atau panduan detail fitur bot.",
    example: "menu"
  },
  {
    id: "allmenu",
    aliases: ["semuamenu", "menulengkap", "fullmenu"],
    category: "utility",
    usage: "allmenu",
    description: "Tampilkan seluruh daftar perintah bot lengkap dari semua kategori dalam satu pesan rapi.",
    example: "allmenu"
  },
  {
    id: "menudownload",
    aliases: ["menudl", "menudownloader", "menuunduh"],
    category: "utility",
    usage: "menudownload",
    description: "Tampilkan apa saja perintah unduh sosial media (TikTok, IG, YT, FB, dll.).",
    example: "menudownload"
  },
  {
    id: "menustiker",
    aliases: ["menusticker", "menustik"],
    category: "utility",
    usage: "menustiker",
    description: "Tampilkan apa saja perintah studio stiker WhatsApp (Brat, QC, Smeme, dll.).",
    example: "menustiker"
  },
  {
    id: "menumedia",
    aliases: ["menutools"],
    category: "utility",
    usage: "menumedia",
    description: "Tampilkan apa saja perintah perkakas media, HD foto, Status HD, dan kode QR.",
    example: "menumedia"
  },
  {
    id: "menuaudio",
    aliases: ["menumusik", "menumusic"],
    category: "utility",
    usage: "menuaudio",
    description: "Tampilkan apa saja perintah audio, pemutar lagu MP3, dan efek suara.",
    example: "menuaudio"
  },
  {
    id: "menugrup",
    aliases: ["menugroup", "menuadmin"],
    category: "utility",
    usage: "menugrup",
    description: "Tampilkan apa saja perintah administrasi dan moderasi grup WhatsApp.",
    example: "menugrup"
  },
  {
    id: "menuotomasi",
    aliases: ["menuset", "menuauto"],
    category: "utility",
    usage: "menuotomasi",
    description: "Tampilkan apa saja perintah otomasi grup (sambutan welcome, out, antilink).",
    example: "menuotomasi"
  },
  {
    id: "menuinfo",
    aliases: ["menubantuan", "menuhelp"],
    category: "utility",
    usage: "menuinfo",
    description: "Tampilkan apa saja informasi & bantuan, kontak resmi owner, dan panel.",
    example: "menuinfo"
  },
  {
    id: "owner",
    aliases: ["creator", "pemilik"],
    category: "utility",
    usage: "owner",
    description: "Tampilkan informasi dan kontak WhatsApp resmi Owner Bot (+62 896-7353-3963).",
    example: "owner"
  },
  {
    id: "ping",
    aliases: ["info", "status", "speed"],
    category: "utility",
    usage: "ping",
    description: "Cek kecepatan respons bot, masa aktif sesi server, dan informasi owner.",
    example: "ping"
  },
  {
    id: "panel",
    aliases: ["webpanel", "remotepanel", "linkpanel"],
    category: "utility",
    usage: "panel [on|off|resetkey]",
    description: "Khusus Owner (via Chat Pribadi): buka/ambil tautan Web Control Panel jarak jauh untuk diakses dari HP kedua di mana saja.",
    example: "panel"
  }
];
var COMPACT_COMMAND_META = {
  aio: { shortUsage: "aio <link>", shortDesc: "Auto-unduh link sosmed apa saja" },
  tt: { shortUsage: "tt <link>", shortDesc: "Video/slide TikTok tanpa WM" },
  ttslide: { shortUsage: "ttslide <link>", shortDesc: "Album slide foto TikTok + MP3" },
  ig: { shortUsage: "ig <link>", shortDesc: "Reels & postingan Instagram" },
  fb: { shortUsage: "fb <link>", shortDesc: "Video Facebook Reels & Watch" },
  tw: { shortUsage: "tw <link>", shortDesc: "Video & gambar X / Twitter" },
  pin: { shortUsage: "pin <link>", shortDesc: "Video & foto asli Pinterest" },
  capcut: { shortUsage: "capcut <link>", shortDesc: "Template CapCut tanpa WM" },
  mf: { shortUsage: "mf <link>", shortDesc: "Unduh berkas langsung MediaFire" },
  yt: { shortUsage: "yt <link>", shortDesc: "Video YouTube & Shorts" },
  s: { shortUsage: "s", shortDesc: "Foto/video pendek ke stiker WebP" },
  qc: { shortUsage: "qc <teks/reply>", shortDesc: "Stiker gelembung chat WA" },
  iqc: { shortUsage: "iqc <teks/reply>", shortDesc: "Stiker gelembung iMessage iOS" },
  brat: { shortUsage: "brat <teks>", shortDesc: "Stiker teks hijau Brat" },
  bratwhite: { shortUsage: "bratwhite <teks>", shortDesc: "Stiker teks putih Brat" },
  bratcolor: { shortUsage: "bratcolor <warna|teks>", shortDesc: "Stiker Brat pilih warna" },
  bratvid: { shortUsage: "bratvid <teks>", shortDesc: "Stiker Brat animasi bergerak" },
  ttp: { shortUsage: "ttp <teks>", shortDesc: "Stiker teks tebal transparan" },
  attp: { shortUsage: "attp <teks>", shortDesc: "Stiker animasi teks pelangi RGB" },
  smeme: { shortUsage: "smeme <atas|bawah>", shortDesc: "Stiker meme dari foto & stiker" },
  meme: { shortUsage: "meme [topik]", shortDesc: "Ambil foto meme lucu dari referensi web" },
  emojimix: { shortUsage: "emojimix \u{1F600}+\u{1F60E}", shortDesc: "Gabung 2 emoji jadi stiker" },
  wm: { shortUsage: "wm <nama>", shortDesc: "Ganti nama watermark stiker" },
  toimg: { shortUsage: "toimg", shortDesc: "Ubah stiker kembali jadi foto" },
  tovid: { shortUsage: "tovid", shortDesc: "Ubah stiker gerak jadi video MP4" },
  hdsw: { shortUsage: "hdsw", shortDesc: "Dokumen asli ke Status HD (Grup/PC)" },
  hd: { shortUsage: "hd", shortDesc: "AI Enhance foto adaptif otomatis" },
  remini: { shortUsage: "remini", shortDesc: "AI restorasi wajah natural" },
  upscale: { shortUsage: "upscale", shortDesc: "AI super-resolution Real-ESRGAN" },
  hd2: { shortUsage: "hd2", shortDesc: "AI upscale resolusi foto 2\xD7" },
  hd4: { shortUsage: "hd4", shortDesc: "AI upscale resolusi foto 4\xD7" },
  rvo: { shortUsage: "rvo", shortDesc: "Buka media View Once sekali lihat" },
  toptv: { shortUsage: "toptv", shortDesc: "Ubah video jadi Video Note bulat" },
  hitamkan: { shortUsage: "hitamkan", shortDesc: "Filter foto monokrom hitam-putih" },
  imgedit: { shortUsage: "blur / invert / mirror", shortDesc: "Efek instan foto" },
  tourl: { shortUsage: "tourl", shortDesc: "Ubah media jadi tautan publik" },
  qrcode: { shortUsage: "qrcode <teks>", shortDesc: "Buat gambar kode QR tajam" },
  mp3: { shortUsage: "mp3 <link>", shortDesc: "Ambil audio MP3 dari link sosmed" },
  play: { shortUsage: "play <judul>", shortDesc: "Cari & kirim lagu MP3" },
  tomp3: { shortUsage: "tomp3", shortDesc: "Ubah video/VN jadi musik MP3" },
  tovn: { shortUsage: "tovn", shortDesc: "Ubah audio/video jadi Voice Note" },
  bass: { shortUsage: "bass", shortDesc: "Efek suara Bass Boost" },
  nightcore: { shortUsage: "nightcore", shortDesc: "Efek suara Nightcore cepat" },
  slow: { shortUsage: "slow", shortDesc: "Efek suara Slowed + Reverb" },
  fast: { shortUsage: "fast", shortDesc: "Percepat tempo audio/VN" },
  robot: { shortUsage: "robot", shortDesc: "Efek modulasi suara Robot" },
  reverse: { shortUsage: "reverse", shortDesc: "Putar balik suara audio/VN" },
  kick: { shortUsage: "kick <@tag/reply>", shortDesc: "Keluarkan anggota dari grup" },
  add: { shortUsage: "add <nomor>", shortDesc: "Dikunci cegah suspend grup" },
  promote: { shortUsage: "promote <@tag/reply>", shortDesc: "Angkat jadi Admin Grup" },
  demote: { shortUsage: "demote <@tag/reply>", shortDesc: "Cabut jabatan Admin Grup" },
  group: { shortUsage: "group <open|close>", shortDesc: "Buka / kunci chat grup" },
  hidetag: { shortUsage: "hidetag <pesan>", shortDesc: "Pengumuman mention tersembunyi" },
  tagall: { shortUsage: "tagall <pesan>", shortDesc: "Tag daftar semua anggota grup" },
  setname: { shortUsage: "setname <nama>", shortDesc: "Ganti nama grup WA" },
  setdesc: { shortUsage: "setdesc <teks>", shortDesc: "Ganti deskripsi grup WA" },
  linkgc: { shortUsage: "linkgc", shortDesc: "Ambil link undangan grup" },
  revoke: { shortUsage: "revoke", shortDesc: "Reset link undangan grup" },
  welcome: { shortUsage: "welcome <on|off>", shortDesc: "Sambutan member masuk" },
  out: { shortUsage: "out <on|off>", shortDesc: "Pesan member keluar grup" },
  antilink: { shortUsage: "antilink <on|off>", shortDesc: "Hapus link non-admin" },
  setwelcome: { shortUsage: "setwelcome <teks>", shortDesc: "Edit teks sambutan" },
  setout: { shortUsage: "setout <teks>", shortDesc: "Edit teks keluar grup" },
  setpromote: { shortUsage: "setpromote <teks>", shortDesc: "Edit teks promote admin" },
  setdemote: { shortUsage: "setdemote <teks>", shortDesc: "Edit teks demote admin" },
  setopen: { shortUsage: "setopen <teks>", shortDesc: "Edit teks grup dibuka" },
  setclose: { shortUsage: "setclose <teks>", shortDesc: "Edit teks grup dikunci" },
  setantilink: { shortUsage: "setantilink <teks>", shortDesc: "Edit peringatan antilink" },
  cekset: { shortUsage: "cekset", shortDesc: "Lihat status & teks grup" },
  resetset: { shortUsage: "resetset", shortDesc: "Reset teks grup ke bawaan" },
  menu: { shortUsage: "menu [1-7]", shortDesc: "Daftar fitur & panduan kategori" },
  owner: { shortUsage: "owner", shortDesc: "Kontak resmi Owner Bot" },
  ping: { shortUsage: "ping", shortDesc: "Cek kecepatan & status bot" },
  panel: { shortUsage: "panel", shortDesc: "Link Web Panel jarak jauh (Owner)" }
};
var MENU_SECTIONS = [
  {
    key: "downloader",
    code: "01",
    emoji: "\u{1F4C2}",
    title: "DOWNLOADER",
    categoryCmd: "menudownload",
    categoryDesc: "(untuk menampilkan apa saja perintah download)",
    keywords: [
      "1",
      "01",
      "dl",
      "download",
      "downloader",
      "unduh",
      "sosmed",
      "menudownload",
      "menudl",
      "menudownloader",
      "menuunduh"
    ],
    ids: ["aio", "tt", "ttslide", "ig", "fb", "tw", "pin", "capcut", "mf", "yt"],
    compactRows: [
      { ids: ["aio"], argHint: "<link>", summary: "Auto-unduh semua sosmed" },
      { ids: ["tt", "ttslide"], summary: "Video & slide foto TikTok HD" },
      { ids: ["ig", "fb", "tw"], summary: "Reels IG, FB & X/Twitter" },
      { ids: ["pin", "capcut", "mf"], summary: "Pinterest, CapCut & MediaFire" },
      { ids: ["yt"], argHint: "<link>", summary: "Video YouTube & Shorts" }
    ]
  },
  {
    key: "stiker",
    code: "02",
    emoji: "\u{1F3A8}",
    title: "STUDIO STIKER",
    categoryCmd: "menustiker",
    categoryDesc: "(untuk menampilkan apa saja perintah studio stiker)",
    keywords: [
      "2",
      "02",
      "stiker",
      "sticker",
      "maker",
      "brat",
      "qc",
      "menustiker",
      "menusticker",
      "menustik"
    ],
    ids: [
      "s",
      "qc",
      "iqc",
      "brat",
      "bratwhite",
      "bratcolor",
      "bratvid",
      "ttp",
      "attp",
      "smeme",
      "emojimix",
      "wm",
      "toimg",
      "tovid"
    ],
    compactRows: [
      { ids: ["s"], summary: "Foto / video ke stiker WebP" },
      { ids: ["qc", "iqc"], summary: "Stiker bubble chat WA & iPhone" },
      { ids: ["brat", "bratwhite", "bratcolor"], summary: "Stiker teks gaya Brat" },
      { ids: ["bratvid", "ttp", "attp"], summary: "Stiker teks & animasi RGB" },
      { ids: ["smeme", "emojimix"], summary: "Stiker meme teks besar & mix emoji" },
      { ids: ["wm", "toimg", "tovid"], summary: "Ubah EXIF & konversi stiker" }
    ]
  },
  {
    key: "media",
    code: "03",
    emoji: "\u{1F6E0}\uFE0F",
    title: "PERKAKAS MEDIA",
    categoryCmd: "menumedia",
    categoryDesc: "(untuk menampilkan apa saja perintah perkakas media)",
    keywords: [
      "3",
      "03",
      "media",
      "tools",
      "hd",
      "remini",
      "upscale",
      "hd2",
      "hd4",
      "sw",
      "hdsw",
      "foto",
      "meme",
      "menumedia",
      "menutools"
    ],
    ids: [
      "hdsw",
      "hd",
      "remini",
      "upscale",
      "hd2",
      "hd4",
      "meme",
      "rvo",
      "toptv",
      "hitamkan",
      "imgedit",
      "tourl",
      "qrcode"
    ],
    compactRows: [
      { ids: ["hdsw"], summary: "Dokumen ke Status HD (Grup & PC)" },
      { ids: ["hd", "remini", "upscale"], summary: "AI Enhance adaptif, wajah & SR" },
      { ids: ["hd2", "hd4"], summary: "AI Super-Resolution 2\xD7 & 4\xD7" },
      { ids: ["hitamkan", "imgedit"], summary: "Hitam-putih, blur, invert, mirror" },
      { ids: ["meme", "rvo", "toptv"], summary: "Meme web lucu, ViewOnce & video PTV" },
      { ids: ["tourl", "qrcode"], summary: "Link media publik & kode QR" }
    ]
  },
  {
    key: "audio",
    code: "04",
    emoji: "\u{1F3B5}",
    title: "AUDIO & MUSIK",
    categoryCmd: "menuaudio",
    categoryDesc: "(untuk menampilkan apa saja perintah audio & musik)",
    keywords: [
      "4",
      "04",
      "audio",
      "musik",
      "music",
      "vn",
      "sound",
      "efek",
      "menuaudio",
      "menumusik",
      "menumusic"
    ],
    ids: [
      "play",
      "mp3",
      "tomp3",
      "tovn",
      "bass",
      "nightcore",
      "slow",
      "fast",
      "robot",
      "reverse"
    ],
    compactRows: [
      { ids: ["play"], argHint: "<judul>", summary: "Cari lagu & kirim MP3" },
      { ids: ["mp3", "tomp3", "tovn"], summary: "Ekstrak MP3 & Voice Note" },
      { ids: ["bass", "nightcore", "slow"], summary: "Efek Bass, Nightcore & Slowed" },
      { ids: ["fast", "robot", "reverse"], summary: "Efek Speedup, Robot & Reverse" }
    ]
  },
  {
    key: "grup",
    code: "05",
    emoji: "\u{1F6E1}\uFE0F",
    title: "ADMIN GRUP",
    categoryCmd: "menugrup",
    categoryDesc: "(untuk menampilkan apa saja perintah admin grup)",
    keywords: [
      "5",
      "05",
      "grup",
      "group",
      "admin",
      "moderasi",
      "mod",
      "gc",
      "menugrup",
      "menugroup",
      "menuadmin"
    ],
    ids: [
      "kick",
      "promote",
      "demote",
      "hidetag",
      "tagall",
      "group",
      "setname",
      "setdesc",
      "linkgc",
      "revoke"
    ],
    compactRows: [
      { ids: ["kick", "promote", "demote"], summary: "Kelola anggota & admin" },
      { ids: ["hidetag", "tagall"], summary: "Pengumuman & mention semua member" },
      { ids: ["group"], argHint: "open|close", summary: "Buka / kunci chat grup" },
      { ids: ["setname", "setdesc"], summary: "Ubah nama & deskripsi grup" },
      { ids: ["linkgc", "revoke"], summary: "Ambil / reset tautan grup" }
    ]
  },
  {
    key: "set",
    code: "06",
    emoji: "\u2699\uFE0F",
    title: "OTOMASI GRUP",
    categoryCmd: "menuotomasi",
    categoryDesc: "(untuk menampilkan apa saja perintah otomasi grup)",
    keywords: [
      "6",
      "06",
      "set",
      "teks",
      "custom",
      "otomasi",
      "setting",
      "sambutan",
      "menuotomasi",
      "menuset",
      "menuauto"
    ],
    ids: [
      "welcome",
      "out",
      "antilink",
      "setwelcome",
      "setout",
      "setpromote",
      "setdemote",
      "cekset",
      "resetset"
    ],
    compactRows: [
      { ids: ["welcome", "out", "antilink"], summary: "Sakelar sambutan & antilink" },
      { ids: ["setwelcome", "setout"], summary: "Atur teks masuk & keluar" },
      { ids: ["setpromote", "setdemote"], summary: "Atur teks jabatan admin" },
      { ids: ["cekset", "resetset"], summary: "Lihat / reset setelan grup" }
    ]
  },
  {
    key: "info",
    code: "07",
    emoji: "\u2139\uFE0F",
    title: "INFO & BANTUAN",
    categoryCmd: "menuinfo",
    categoryDesc: "(untuk menampilkan apa saja informasi & bantuan)",
    keywords: [
      "7",
      "07",
      "info",
      "utilitas",
      "utility",
      "bot",
      "bantuan",
      "panel",
      "menuinfo",
      "menubantuan",
      "menuhelp"
    ],
    ids: ["menu", "allmenu", "owner", "ping", "panel"],
    compactRows: [
      { ids: ["menu"], argHint: "<1-7>", summary: "Panduan detail per kategori" },
      { ids: ["allmenu"], summary: "Daftar lengkap semua perintah" },
      { ids: ["owner", "ping"], summary: "Kontak owner & cek kecepatan" },
      { ids: ["panel"], summary: "Link Web Panel jarak jauh (Owner)" }
    ]
  }
];
var MENU_DIVIDER = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
function buildBotMenuText(opts) {
  const p = opts.prefix || ".";
  const cleanOwnerNumber = (opts.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(/[^0-9]/g, "") || OFFICIAL_OWNER_NUMBER;
  const disabledSet = new Set(opts.disabledCommands || []);
  const isSuspensionLocked = (id) => {
    const canonical = id === "allmenu" ? "menu" : id;
    const found = COMMAND_CATALOG.find((c) => c.id === canonical);
    return Boolean(found?.suspensionRisk);
  };
  const isEnabled = (id) => {
    const canonical = id === "allmenu" ? "menu" : id;
    if (isSuspensionLocked(canonical)) return false;
    return !disabledSet.has(canonical);
  };
  const normalizedAlias = (opts.invokedAlias || "").trim().toLowerCase().replace(new RegExp(`^\\${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
  const normalizedQuery = (opts.query || "").trim().toLowerCase().replace(new RegExp(`^\\${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
  const wantsFullList = normalizedAlias === "allmenu" || ["all", "semua", "lengkap", "full", "allmenu"].includes(normalizedQuery);
  if (wantsFullList) {
    const lines2 = [];
    for (let i = 0; i < MENU_SECTIONS.length; i++) {
      const sec = MENU_SECTIONS[i];
      lines2.push(MENU_DIVIDER);
      lines2.push(`${sec.emoji} *${sec.code} \xB7 ${sec.title}*`);
      lines2.push(MENU_DIVIDER);
      for (const row of sec.compactRows) {
        const cmdLabels = row.ids.map((id) => `*${p}${id}*`).join(" / ");
        const argPart = row.argHint ? ` ${row.argHint}` : "";
        lines2.push(`\u2022 ${cmdLabels}${argPart} \u2014 ${row.summary}`);
      }
      if (i < MENU_SECTIONS.length - 1) {
        lines2.push("");
      }
    }
    lines2.push(MENU_DIVIDER);
    lines2.push(`_Ketik *${p}menu <1-7>* untuk melihat detail kategori._`);
    lines2.push(`_Ketik *${p}owner* untuk menghubungi pengembang._`);
    return lines2.join("\n");
  }
  const matchedSection = MENU_SECTIONS.find(
    (sec) => sec.categoryCmd.toLowerCase() === normalizedAlias || sec.keywords.includes(normalizedAlias) || normalizedQuery && sec.keywords.includes(normalizedQuery)
  );
  if (matchedSection && (normalizedQuery || normalizedAlias !== "menu")) {
    const lines2 = [
      MENU_DIVIDER,
      `${matchedSection.emoji} *${matchedSection.code} \xB7 ${matchedSection.title}*`,
      MENU_DIVIDER
    ];
    for (const row of matchedSection.compactRows) {
      const cmdLabels = row.ids.map((id) => `*${p}${id}*`).join(" / ");
      const argPart = row.argHint ? ` ${row.argHint}` : "";
      lines2.push(`\u2022 ${cmdLabels}${argPart} \u2014 ${row.summary}`);
    }
    lines2.push(MENU_DIVIDER);
    lines2.push(`_Ketik *${p}menu* untuk kembali ke daftar kategori._`);
    lines2.push(`_Ketik *${p}allmenu* untuk melihat seluruh perintah._`);
    return lines2.join("\n");
  }
  if (normalizedQuery) {
    const matchedCmd = COMMAND_CATALOG.find(
      (c) => c.id === normalizedQuery || c.aliases.includes(normalizedQuery)
    );
    if (matchedCmd) {
      const meta = COMPACT_COMMAND_META[matchedCmd.id];
      const aliasList = matchedCmd.aliases.length > 0 ? matchedCmd.aliases.map((a) => `${p}${a}`).join(", ") : "-";
      const scopeLabel = matchedCmd.groupOnly ? "Khusus Grup WhatsApp" : "Chat Pribadi & Grup";
      const statusLabel = matchedCmd.suspensionRisk ? "Dikunci (Proteksi Anti-Suspend Grup)" : isEnabled(matchedCmd.id) ? "Aktif" : "Nonaktif";
      return [
        MENU_DIVIDER,
        `*Detail Perintah \xB7 ${p}${matchedCmd.id}*`,
        MENU_DIVIDER,
        `\u2022 *Fungsi:* ${matchedCmd.description}`,
        `\u2022 *Format:* *${p}${matchedCmd.usage}*`,
        `\u2022 *Contoh:* *${p}${meta?.compactExample || matchedCmd.example}*`,
        `\u2022 *Alias:* ${aliasList}`,
        `\u2022 *Ruang:* ${scopeLabel}`,
        `\u2022 *Status:* ${statusLabel}`,
        MENU_DIVIDER,
        `_Ketik *${p}menu* untuk kembali ke daftar kategori._`,
        `_Ketik *${p}allmenu* untuk melihat seluruh perintah._`
      ].join("\n");
    }
    return [
      MENU_DIVIDER,
      `Kategori atau fitur *${opts.query?.trim()}* tidak ditemukan.`,
      MENU_DIVIDER,
      `*Daftar Kategori:*`,
      ...MENU_SECTIONS.map(
        (sec, idx) => `${idx + 1}. *${p}${sec.categoryCmd}* ${sec.categoryDesc}`
      ),
      MENU_DIVIDER,
      `_Ketik *${p}allmenu* untuk melihat semua perintah._`
    ].join("\n");
  }
  const botTitle = (opts.botName || "WABOT").toUpperCase();
  const lines = [
    MENU_DIVIDER,
    `\u{1F4C2} *KATEGORI MENU ${botTitle}*`,
    MENU_DIVIDER,
    `Silakan pilih dan ketik perintah kategori di bawah:`,
    ""
  ];
  MENU_SECTIONS.forEach((sec, idx) => {
    lines.push(`${idx + 1}. *${p}${sec.categoryCmd}* ${sec.categoryDesc}`);
  });
  lines.push("");
  lines.push(MENU_DIVIDER);
  lines.push(`\u{1F4A1} *Pilihan Pintasan:*`);
  lines.push(`\u2022 Ketik *${p}allmenu* \u2014 Tampilkan seluruh perintah sekaligus`);
  lines.push(`\u2022 Ketik *${p}menu <1-7>* \u2014 Contoh: *${p}menu 1* atau *${p}menu 2*`);
  lines.push(MENU_DIVIDER);
  lines.push(`_Ketik *${p}menu <1-7>* untuk melihat detail kategori._`);
  lines.push(`_Ketik *${p}owner* untuk menghubungi pengembang._`);
  return lines.join("\n");
}
var LEGACY_BRAND_REGEX = new RegExp(
  `${["ge", "pa"].join("")}|gpcrnr`,
  "i"
);
function hasLegacyIdentity(value) {
  if (!value) return false;
  return LEGACY_BRAND_REGEX.test(value);
}
var CLEAN_DEFAULT_RULES = [
  {
    id: "rule-halo",
    trigger: "halo",
    matchType: "contains",
    replyText: "Halo {sender}! Ada yang bisa {botName} bantu hari ini? Ketik *{prefix}menu* untuk melihat seluruh fitur.",
    scope: "all",
    enabled: true,
    hitCount: 0,
    createdAt: 17145e8
  },
  {
    id: "rule-owner",
    trigger: "owner",
    matchType: "exact",
    replyText: `Kontak resmi Owner {botName}: https://wa.me/${OFFICIAL_OWNER_NUMBER} (${OFFICIAL_OWNER_DISPLAY})`,
    scope: "all",
    enabled: true,
    hitCount: 0,
    createdAt: 17145e8
  }
];
function sanitizeBotConfig(raw) {
  let changed = false;
  const rawAi = raw.aiEnhance || DEFAULT_AI_ENHANCE_CONFIG;
  const clampedFidelity = Number.isFinite(Number(rawAi.faceFidelity)) ? Math.min(0.98, Math.max(0.05, Number(rawAi.faceFidelity))) : DEFAULT_AI_ENHANCE_CONFIG.faceFidelity;
  const clampedConcurrency = Number.isFinite(Number(rawAi.maxConcurrentJobs)) ? Math.min(8, Math.max(1, Math.round(Number(rawAi.maxConcurrentJobs)))) : DEFAULT_AI_ENHANCE_CONFIG.maxConcurrentJobs;
  const clampedQueue = Number.isFinite(Number(rawAi.maxQueueSize)) ? Math.min(60, Math.max(1, Math.round(Number(rawAi.maxQueueSize)))) : DEFAULT_AI_ENHANCE_CONFIG.maxQueueSize;
  const clampedTimeout = Number.isFinite(Number(rawAi.timeoutMs)) ? Math.min(3e5, Math.max(1e4, Math.round(Number(rawAi.timeoutMs)))) : DEFAULT_AI_ENHANCE_CONFIG.timeoutMs;
  const clampedMaxMb = Number.isFinite(Number(rawAi.maxFileSizeMb)) ? Math.min(30, Math.max(1, Math.round(Number(rawAi.maxFileSizeMb)))) : DEFAULT_AI_ENHANCE_CONFIG.maxFileSizeMb;
  const next = {
    ...raw,
    reactions: { ...DEFAULT_REACTIONS, ...raw.reactions || {} },
    templates: { ...DEFAULT_TEMPLATES, ...raw.templates || {} },
    groupSettings: {
      antilink: raw.groupSettings?.antilink ?? true,
      welcome: raw.groupSettings?.welcome ?? true,
      goodbye: raw.groupSettings?.goodbye ?? true
    },
    groupOverrides: raw.groupOverrides ? { ...raw.groupOverrides } : {},
    antiBan: { ...raw.antiBan },
    aiEnhance: {
      serviceUrl: String(
        rawAi.serviceUrl ?? DEFAULT_AI_ENHANCE_CONFIG.serviceUrl
      ).trim().replace(/\/+$/, ""),
      preferredFaceModel: rawAi.preferredFaceModel === "gfpgan" ? "gfpgan" : "codeformer",
      faceFidelity: Math.round(clampedFidelity * 100) / 100,
      defaultScale: rawAi.defaultScale === 4 ? 4 : 2,
      autoDenoise: rawAi.autoDenoise ?? true,
      autoDeblur: rawAi.autoDeblur ?? true,
      sendProgressNotice: rawAi.sendProgressNotice ?? true,
      maxConcurrentJobs: clampedConcurrency,
      maxQueueSize: clampedQueue,
      timeoutMs: clampedTimeout,
      maxFileSizeMb: clampedMaxMb
    },
    autoResponder: Array.isArray(raw.autoResponder) ? [...raw.autoResponder] : [...CLEAN_DEFAULT_RULES]
  };
  if (!next.botName?.trim() || hasLegacyIdentity(next.botName)) {
    next.botName = "WABot";
    changed = true;
  }
  if (!next.ownerName?.trim() || hasLegacyIdentity(next.ownerName)) {
    next.ownerName = "Owner Bot";
    changed = true;
  }
  if (!next.ownerWebsite?.trim() || hasLegacyIdentity(next.ownerWebsite)) {
    next.ownerWebsite = `wa.me/${OFFICIAL_OWNER_NUMBER}`;
    changed = true;
  }
  if (!next.stickerPackName?.trim() || hasLegacyIdentity(next.stickerPackName)) {
    next.stickerPackName = "WA Sticker";
    changed = true;
  }
  if (!next.stickerAuthor?.trim() || hasLegacyIdentity(next.stickerAuthor)) {
    next.stickerAuthor = OFFICIAL_OWNER_NUMBER;
    changed = true;
  }
  const cleanOwnerDigits = (next.antiBan?.ownerNumber || "").replace(
    /[^0-9]/g,
    ""
  );
  if (!cleanOwnerDigits || cleanOwnerDigits === "628129000111" || hasLegacyIdentity(next.antiBan?.ownerNumber)) {
    next.antiBan = {
      ...next.antiBan,
      ownerNumber: OFFICIAL_OWNER_NUMBER
    };
    changed = true;
  }
  if (hasLegacyIdentity(next.antiBan?.callRejectNotice)) {
    next.antiBan = {
      ...next.antiBan,
      callRejectNotice: "Maaf, bot ini berjalan secara otomatis dan tidak menerima panggilan telepon atau video WhatsApp."
    };
    changed = true;
  }
  const templateKeys = Object.keys(DEFAULT_TEMPLATES);
  for (const key of templateKeys) {
    const val = next.templates[key];
    const isOldVerboseTemplate = key === "menuHeader" && val?.includes("Pack Stiker: *{packName}*") || key === "menuFooter" && val?.includes("Dibuat untuk ekosistem") || key === "pingReply" && val?.includes("Pack Stiker: *{packName}*");
    if (!val || hasLegacyIdentity(val) || isOldVerboseTemplate) {
      next.templates[key] = DEFAULT_TEMPLATES[key];
      changed = true;
    }
  }
  if (next.groupOverrides) {
    const cleanedOverrides = {};
    for (const [gid, ov] of Object.entries(next.groupOverrides)) {
      if (!ov) continue;
      const ovTemplates = { ...ov.templates || {} };
      for (const [tKey, tVal] of Object.entries(ovTemplates)) {
        if (hasLegacyIdentity(tVal)) {
          delete ovTemplates[tKey];
          changed = true;
        }
      }
      cleanedOverrides[gid] = {
        ...ov,
        templates: ovTemplates
      };
    }
    next.groupOverrides = cleanedOverrides;
  }
  const filteredRules = (next.autoResponder || []).filter(
    (r) => !hasLegacyIdentity(r.trigger) && !hasLegacyIdentity(r.replyText)
  );
  if (filteredRules.length !== (next.autoResponder || []).length) {
    const hasOwnerRule = filteredRules.some((r) => r.trigger === "owner");
    next.autoResponder = hasOwnerRule ? filteredRules : [...filteredRules, CLEAN_DEFAULT_RULES[1]];
    changed = true;
  }
  return { config: next, changed };
}
function sanitizeLogs(logs) {
  if (!Array.isArray(logs)) return [];
  const cleaned = [];
  for (const entry of logs) {
    if (hasLegacyIdentity(entry.summary)) continue;
    if (hasLegacyIdentity(entry.sender)) {
      cleaned.push({ ...entry, sender: "Kamu (Owner)" });
    } else {
      cleaned.push(entry);
    }
  }
  return cleaned;
}

// server/aiEnhancer.ts
import fs3 from "node:fs/promises";
import os2 from "node:os";
import path2 from "node:path";

// server/imageAdapter.ts
import { execFile } from "node:child_process";
import fs2 from "node:fs/promises";
import { createRequire as createRequire2 } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import WebP from "node-webpmux";

// server/ffmpegBin.ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var cachedBin = null;
function getFfmpegBin() {
  if (cachedBin) return cachedBin;
  try {
    const check = spawnSync("ffmpeg", ["-version"], {
      stdio: "ignore",
      timeout: 3e3
    });
    if (check.status === 0) {
      cachedBin = "ffmpeg";
      return cachedBin;
    }
  } catch {
  }
  try {
    const ffmpegStatic = require2("ffmpeg-static");
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      try {
        fs.chmodSync(ffmpegStatic, 493);
      } catch {
      }
      cachedBin = ffmpegStatic;
      return cachedBin;
    }
  } catch {
  }
  cachedBin = "ffmpeg";
  return cachedBin;
}

// server/imageAdapter.ts
var execFileAsync = promisify(execFile);
var nodeRequire = createRequire2(import.meta.url);
var cachedSharp;
function getOptionalSharp() {
  if (cachedSharp !== void 0) return cachedSharp;
  try {
    const mod = nodeRequire("sharp");
    const fn = mod?.default || mod;
    if (typeof fn === "function") {
      cachedSharp = fn;
      return cachedSharp;
    }
  } catch {
  }
  cachedSharp = null;
  return null;
}
function getActiveImageBackend() {
  return getOptionalSharp() ? "sharp-native" : "resvg-wasm+ffmpeg";
}
async function withTempDir(fn) {
  const dir = await fs2.mkdtemp(path.join(os.tmpdir(), "wabot-img-"));
  try {
    return await fn(dir);
  } finally {
    await fs2.rm(dir, { recursive: true, force: true }).catch(() => {
    });
  }
}
var wasmInitPromise = null;
var cachedFontsPromise = null;
async function ensureResvgInitialized() {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      let wasmPath = path.join(
        process.cwd(),
        "node_modules",
        "@resvg",
        "resvg-wasm",
        "index_bg.wasm"
      );
      try {
        const entryPath = nodeRequire.resolve("@resvg/resvg-wasm");
        wasmPath = path.join(path.dirname(entryPath), "index_bg.wasm");
      } catch {
      }
      const wasmBytes = await fs2.readFile(wasmPath);
      await initWasm(wasmBytes);
    })().catch((err) => {
      wasmInitPromise = null;
      throw err;
    });
  }
  return wasmInitPromise;
}
async function loadFontBuffersOnce() {
  if (!cachedFontsPromise) {
    cachedFontsPromise = (async () => {
      const fontGroups = [
        {
          family: "Roboto",
          files: [
            "/system/fonts/Roboto-Regular.ttf",
            "/system/fonts/Roboto-Bold.ttf",
            "/system/fonts/DroidSans.ttf"
          ]
        },
        {
          family: "DejaVu Sans",
          files: [
            "/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
          ]
        },
        {
          family: "Liberation Sans",
          files: [
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
          ]
        }
      ];
      for (const group of fontGroups) {
        const loaded = [];
        for (const fpath of group.files) {
          try {
            const buf = await fs2.readFile(fpath);
            loaded.push(new Uint8Array(buf));
            if (loaded.length >= 2) break;
          } catch {
          }
        }
        if (loaded.length > 0) {
          return { buffers: loaded, family: group.family };
        }
      }
      return { buffers: [], family: "sans-serif" };
    })();
  }
  return cachedFontsPromise;
}
async function renderSvgViaResvgWasm(svg) {
  await ensureResvgInitialized();
  const fonts = await loadFontBuffersOnce();
  const normalizedSvg = fonts.buffers.length > 0 ? svg.replace(
    /font-family="([^"]*)"/g,
    (_m, existing) => `font-family="${fonts.family}, ${existing}"`
  ) : svg;
  const resvg = new Resvg(normalizedSvg, {
    font: fonts.buffers.length > 0 ? {
      fontBuffers: fonts.buffers,
      defaultFontFamily: fonts.family,
      sansSerifFamily: fonts.family
    } : {
      loadSystemFonts: true
    }
  });
  try {
    const rendered = resvg.render();
    try {
      return Buffer.from(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}
function xmlEscapeAttr(raw) {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
async function measureSvgTextWidth(text, fontSize, fontWeight = 400) {
  if (!text) return 0;
  const trimmed = text.replace(/\r/g, "");
  if (!trimmed.trim()) {
    return trimmed.length * fontSize * 0.28;
  }
  await ensureResvgInitialized();
  const fonts = await loadFontBuffersOnce();
  const familyAttr = fonts.buffers.length > 0 ? `${fonts.family}, Arial, Helvetica, DejaVu Sans, sans-serif` : "Arial, Helvetica, DejaVu Sans, sans-serif";
  const probeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="256"><text x="32" y="128" xml:space="preserve" font-family="${familyAttr}" font-size="${fontSize}" font-weight="${fontWeight}">${xmlEscapeAttr(
    trimmed
  )}</text></svg>`;
  const resvg = new Resvg(probeSvg, {
    font: fonts.buffers.length > 0 ? {
      fontBuffers: fonts.buffers,
      defaultFontFamily: fonts.family,
      sansSerifFamily: fonts.family
    } : {
      loadSystemFonts: true
    }
  });
  let bboxWidth = 0;
  try {
    const bbox = resvg.getBBox();
    if (bbox) {
      try {
        bboxWidth = Math.max(0, bbox.x - 32 + bbox.width);
      } finally {
        bbox.free();
      }
    }
  } finally {
    resvg.free();
  }
  let emojiExtra = 0;
  for (const ch of Array.from(trimmed)) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 127744) {
      emojiExtra += fontSize * 0.35;
    }
  }
  const trailingSpaces = trimmed.length - trimmed.trimEnd().length;
  const spaceExtra = trailingSpaces > 0 ? trailingSpaces * fontSize * 0.28 : 0;
  return Math.max(bboxWidth + spaceExtra, emojiExtra > 0 ? bboxWidth + emojiExtra * 0.4 : 0);
}
async function renderSvgConsistentToWebp(svg, quality = 92) {
  const pngBuf = await renderSvgViaResvgWasm(svg);
  return pngBufferToWebp(pngBuf, quality);
}
function sniffImageMetadata(buf) {
  if (buf.length >= 24 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) {
    return {
      format: "png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20)
    };
  }
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return {
      format: "gif",
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8)
    };
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buf.length >= 30) {
      const w = 1 + (buf[24] | buf[25] << 8 | buf[26] << 16);
      const h = 1 + (buf[27] | buf[28] << 8 | buf[29] << 16);
      return { format: "webp", width: w, height: h };
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      const w = buf.readUInt16LE(26) & 16383;
      const h = buf.readUInt16LE(28) & 16383;
      return { format: "webp", width: w, height: h };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const w = 1 + ((b1 & 63) << 8 | b0);
      const h = 1 + ((b3 & 15) << 10 | b2 << 2 | (b1 & 192) >> 6);
      return { format: "webp", width: w, height: h };
    }
    return { format: "webp" };
  }
  if (buf.length >= 4 && buf[0] === 255 && buf[1] === 216) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 255) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 255) {
        offset += 1;
        continue;
      }
      if (marker === 216 || marker === 217) {
        offset += 2;
        continue;
      }
      const segLen = buf.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      if (marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207) {
        const h = buf.readUInt16BE(offset + 5);
        const w = buf.readUInt16BE(offset + 7);
        return { format: "jpeg", width: w, height: h };
      }
      offset += 2 + segLen;
    }
    return { format: "jpeg" };
  }
  return { format: "unknown" };
}
async function renderSvgToPng(svg) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  return renderSvgViaResvgWasm(svg);
}
async function pngBufferToWebp(pngBuffer, quality = 88) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(pngBuffer).webp({ quality }).toBuffer();
  }
  return withTempDir(async (dir) => {
    const inPng = path.join(dir, "in.png");
    const outWebp = path.join(dir, "out.webp");
    await fs2.writeFile(inPng, pngBuffer);
    await execFileAsync(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        inPng,
        "-vcodec",
        "libwebp",
        "-lossless",
        "0",
        "-compression_level",
        "4",
        "-q:v",
        String(quality),
        "-an",
        outWebp
      ],
      { timeout: 2e4 }
    );
    return fs2.readFile(outWebp);
  });
}
async function renderSvgToWebp(svg, quality = 90) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(Buffer.from(svg)).webp({ quality }).toBuffer();
  }
  const pngBuf = await renderSvgViaResvgWasm(svg);
  return pngBufferToWebp(pngBuf, quality);
}
async function renderBratFramePngAdapter(svg) {
  const sharp = getOptionalSharp();
  if (sharp) {
    const lowFiPng = await sharp(Buffer.from(svg)).resize(330, 330).blur(1.15).png().toBuffer();
    return sharp(lowFiPng).resize(512, 512, { kernel: "linear" }).png().toBuffer();
  }
  const basePng = await renderSvgViaResvgWasm(svg);
  return withTempDir(async (dir) => {
    const inPng = path.join(dir, "brat_in.png");
    const outPng = path.join(dir, "brat_out.png");
    await fs2.writeFile(inPng, basePng);
    await execFileAsync(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        inPng,
        "-vf",
        "scale=330:330:flags=bilinear,gblur=sigma=1.15,scale=512:512:flags=bilinear",
        "-frames:v",
        "1",
        outPng
      ],
      { timeout: 2e4 }
    );
    return fs2.readFile(outPng);
  });
}
async function imageBufferToStickerWebp(imageBuffer) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(imageBuffer, { animated: true }).rotate().resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }).webp({ quality: 84 }).toBuffer();
  }
  const meta = sniffImageMetadata(imageBuffer);
  if (meta.format === "webp") {
    try {
      const wimg = new WebP.Image();
      await wimg.load(imageBuffer);
      if (wimg.hasAnim) {
        return imageBuffer;
      }
    } catch {
    }
  }
  return withTempDir(async (dir) => {
    const ext = meta.format === "png" ? "png" : meta.format === "gif" ? "gif" : meta.format === "webp" ? "webp" : "jpg";
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, "out.webp");
    await fs2.writeFile(inPath, imageBuffer);
    if (meta.format === "gif") {
      await execFileAsync(
        getFfmpegBin(),
        [
          "-y",
          "-i",
          inPath,
          "-t",
          "7",
          "-vf",
          "fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
          "-vcodec",
          "libwebp",
          "-lossless",
          "0",
          "-compression_level",
          "4",
          "-q:v",
          "75",
          "-loop",
          "0",
          "-an",
          "-vsync",
          "0",
          outPath
        ],
        { timeout: 25e3 }
      );
    } else {
      await execFileAsync(
        getFfmpegBin(),
        [
          "-y",
          "-i",
          inPath,
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
          "-vcodec",
          "libwebp",
          "-lossless",
          "0",
          "-compression_level",
          "4",
          "-q:v",
          "84",
          "-an",
          outPath
        ],
        { timeout: 2e4 }
      );
    }
    return fs2.readFile(outPath);
  });
}
async function webpBufferToPng(webpBuffer) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(webpBuffer, { animated: false }).png().toBuffer();
  }
  return withTempDir(async (dir) => {
    let staticFrameBuf = webpBuffer;
    try {
      const wimg = new WebP.Image();
      await wimg.load(webpBuffer);
      if (wimg.hasAnim) {
        const demuxed = await wimg.demux({ buffers: true, frame: 0 });
        if (demuxed && demuxed[0]) {
          staticFrameBuf = Buffer.from(demuxed[0]);
        }
      }
    } catch {
    }
    const inPath = path.join(dir, "in.webp");
    const outPath = path.join(dir, "out.png");
    await fs2.writeFile(inPath, staticFrameBuf);
    await execFileAsync(
      getFfmpegBin(),
      ["-y", "-i", inPath, "-frames:v", "1", outPath],
      { timeout: 2e4 }
    );
    return fs2.readFile(outPath);
  });
}
async function webpStickerToMp4Buffer(webpBuffer) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return withTempDir(async (dir) => {
      const meta = await sharp(webpBuffer, { animated: true }).metadata();
      const pages = Math.min(meta.pages || 1, 90);
      const pageHeight = meta.pageHeight || (meta.height && meta.pages ? Math.floor(meta.height / meta.pages) : meta.height || 512);
      const width = meta.width || 512;
      if (pages <= 1) {
        const singlePng = path.join(dir, "frame.png");
        const outMp42 = path.join(dir, "out.mp4");
        await sharp(webpBuffer).flatten({ background: "#111114" }).resize(512, 512, { fit: "contain", background: "#111114" }).png().toFile(singlePng);
        await execFileAsync(
          getFfmpegBin(),
          [
            "-y",
            "-loop",
            "1",
            "-i",
            singlePng,
            "-t",
            "3",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            outMp42
          ],
          { timeout: 2e4 }
        );
        return fs2.readFile(outMp42);
      }
      const delays = meta.delay || [];
      const avgDelayMs = delays.length > 0 ? Math.max(
        40,
        Math.round(
          delays.reduce((a, b) => a + b, 0) / delays.length
        )
      ) : 90;
      const fps = Math.max(4, Math.min(25, Math.round(1e3 / avgDelayMs)));
      const stripPng = await sharp(webpBuffer, { animated: true }).flatten({ background: "#111114" }).png().toBuffer();
      for (let i = 0; i < pages; i += 1) {
        const framePath = path.join(
          dir,
          `frame_${String(i).padStart(3, "0")}.png`
        );
        await sharp(stripPng).extract({
          left: 0,
          top: i * pageHeight,
          width,
          height: pageHeight
        }).resize(512, 512, { fit: "contain", background: "#111114" }).png().toFile(framePath);
      }
      const outMp4 = path.join(dir, "out.mp4");
      await execFileAsync(
        getFfmpegBin(),
        [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          path.join(dir, "frame_%03d.png"),
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          outMp4
        ],
        { timeout: 25e3 }
      );
      return fs2.readFile(outMp4);
    });
  }
  return withTempDir(async (dir) => {
    const wimg = new WebP.Image();
    await wimg.load(webpBuffer);
    if (!wimg.hasAnim || !wimg.frames || wimg.frames.length <= 1) {
      const inPath = path.join(dir, "single.webp");
      const outMp42 = path.join(dir, "out.mp4");
      await fs2.writeFile(inPath, webpBuffer);
      await execFileAsync(
        getFfmpegBin(),
        [
          "-y",
          "-loop",
          "1",
          "-i",
          inPath,
          "-t",
          "3",
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#111114,format=yuv420p",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          outMp42
        ],
        { timeout: 25e3 }
      );
      return fs2.readFile(outMp42);
    }
    const totalFrames = Math.min(wimg.frames.length, 90);
    const demuxed = await wimg.demux({ buffers: true, start: 0, end: totalFrames - 1 }) || [];
    const delays = wimg.frames.slice(0, totalFrames).map((f) => f.delay || 90);
    const avgDelayMs = delays.length > 0 ? Math.max(
      40,
      Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
    ) : 90;
    const fps = Math.max(4, Math.min(25, Math.round(1e3 / avgDelayMs)));
    for (let i = 0; i < demuxed.length; i += 1) {
      await fs2.writeFile(
        path.join(dir, `frame_${String(i).padStart(3, "0")}.webp`),
        Buffer.from(demuxed[i])
      );
    }
    const outMp4 = path.join(dir, "out.mp4");
    await execFileAsync(
      getFfmpegBin(),
      [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        path.join(dir, "frame_%03d.webp"),
        "-vf",
        "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#111114,format=yuv420p",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outMp4
      ],
      { timeout: 25e3 }
    );
    return fs2.readFile(outMp4);
  });
}
async function compositeMemeToWebp(sourceBuffer, overlaySvg) {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(sourceBuffer).rotate().resize(512, 512, { fit: "cover" }).composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]).webp({ quality: 88 }).toBuffer();
  }
  const overlayPng = await renderSvgViaResvgWasm(overlaySvg);
  return withTempDir(async (dir) => {
    const meta = sniffImageMetadata(sourceBuffer);
    const ext = meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpg";
    const baseIn = path.join(dir, `base.${ext}`);
    const overIn = path.join(dir, "overlay.png");
    const outWebp = path.join(dir, "meme.webp");
    await fs2.writeFile(baseIn, sourceBuffer);
    await fs2.writeFile(overIn, overlayPng);
    await execFileAsync(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        baseIn,
        "-i",
        overIn,
        "-filter_complex",
        "[0:v]scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba[bg];[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto",
        "-vcodec",
        "libwebp",
        "-lossless",
        "0",
        "-compression_level",
        "4",
        "-q:v",
        "88",
        "-an",
        outWebp
      ],
      { timeout: 25e3 }
    );
    return fs2.readFile(outWebp);
  });
}
async function applyImageFilterAdapter(imageBuffer, filter) {
  const sharp = getOptionalSharp();
  if (sharp) {
    let pipeline = sharp(imageBuffer).rotate();
    switch (filter) {
      case "hitamkan":
      case "grayscale":
        pipeline = pipeline.grayscale().linear(1.12, -8);
        break;
      case "invert":
        pipeline = pipeline.negate({ alpha: false });
        break;
      case "blur":
        pipeline = pipeline.blur(8);
        break;
      case "mirror":
        pipeline = pipeline.flop();
        break;
      case "flip":
        pipeline = pipeline.flip();
        break;
      case "sepia":
        pipeline = pipeline.recomb([
          [0.393, 0.769, 0.189],
          [0.349, 0.686, 0.168],
          [0.272, 0.534, 0.131]
        ]);
        break;
    }
    return pipeline.jpeg({ quality: 91 }).toBuffer();
  }
  let vf = "hue=s=0,eq=contrast=1.12:brightness=-0.03";
  switch (filter) {
    case "hitamkan":
    case "grayscale":
      vf = "hue=s=0,eq=contrast=1.12:brightness=-0.03";
      break;
    case "invert":
      vf = "negate";
      break;
    case "blur":
      vf = "gblur=sigma=8";
      break;
    case "mirror":
      vf = "hflip";
      break;
    case "flip":
      vf = "vflip";
      break;
    case "sepia":
      vf = "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
      break;
  }
  return withTempDir(async (dir) => {
    const sniffed = sniffImageMetadata(imageBuffer);
    const ext = sniffed.format === "png" ? "png" : sniffed.format === "webp" ? "webp" : "jpg";
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, "filtered.jpg");
    await fs2.writeFile(inPath, imageBuffer);
    await execFileAsync(
      getFfmpegBin(),
      ["-y", "-i", inPath, "-vf", vf, "-q:v", "3", "-frames:v", "1", outPath],
      { timeout: 25e3 }
    );
    return fs2.readFile(outPath);
  });
}
async function prepareHdStatusImage(buffer, mimeType, fallbackThumbBase64) {
  const sharp = getOptionalSharp();
  if (sharp) {
    try {
      let finalBuffer = buffer;
      let finalMime = mimeType;
      const meta = await sharp(finalBuffer).metadata();
      const width = meta.width;
      const height = meta.height;
      if (meta.format === "webp" || finalMime.toLowerCase().includes("webp")) {
        finalBuffer = await sharp(finalBuffer).png({ compressionLevel: 0 }).toBuffer();
        finalMime = "image/png";
      } else if (meta.format === "png") {
        finalMime = "image/png";
      } else {
        finalMime = "image/jpeg";
      }
      const thumbBuf = await sharp(finalBuffer).resize(72, 72, { fit: "inside" }).jpeg({ quality: 65 }).toBuffer();
      return {
        buffer: finalBuffer,
        mimeType: finalMime,
        width,
        height,
        jpegThumbnail: thumbBuf.toString("base64")
      };
    } catch {
      return {
        buffer,
        mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
        jpegThumbnail: fallbackThumbBase64
      };
    }
  }
  try {
    let finalBuffer = buffer;
    let sniffed = sniffImageMetadata(finalBuffer);
    let finalMime = mimeType;
    if (sniffed.format === "webp" || finalMime.toLowerCase().includes("webp")) {
      finalBuffer = await webpBufferToPng(finalBuffer);
      sniffed = sniffImageMetadata(finalBuffer);
      finalMime = "image/png";
    } else if (sniffed.format === "png") {
      finalMime = "image/png";
    } else {
      finalMime = "image/jpeg";
    }
    const thumbBase64 = await withTempDir(async (dir) => {
      const ext = finalMime === "image/png" ? "png" : "jpg";
      const inPath = path.join(dir, `in.${ext}`);
      const thumbPath = path.join(dir, "thumb.jpg");
      await fs2.writeFile(inPath, finalBuffer);
      await execFileAsync(
        getFfmpegBin(),
        [
          "-y",
          "-i",
          inPath,
          "-vf",
          "scale=72:72:force_original_aspect_ratio=decrease",
          "-q:v",
          "6",
          "-frames:v",
          "1",
          thumbPath
        ],
        { timeout: 15e3 }
      );
      const tbuf = await fs2.readFile(thumbPath);
      return tbuf.toString("base64");
    }).catch(() => fallbackThumbBase64);
    return {
      buffer: finalBuffer,
      mimeType: finalMime,
      width: sniffed.width,
      height: sniffed.height,
      jpegThumbnail: thumbBase64
    };
  } catch {
    return {
      buffer,
      mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
      jpegThumbnail: fallbackThumbBase64
    };
  }
}
async function ensureWhatsappImageBuffer(buffer, mimeType = "image/jpeg") {
  const sniffed = sniffImageMetadata(buffer);
  if (sniffed.format === "jpeg") {
    return { buffer, mimeType: "image/jpeg" };
  }
  if (sniffed.format === "png") {
    return { buffer, mimeType: "image/png" };
  }
  const sharp = getOptionalSharp();
  if (sharp) {
    try {
      const jpg = await sharp(buffer, { animated: false }).flatten({ background: "#000000" }).jpeg({ quality: 92 }).toBuffer();
      return { buffer: jpg, mimeType: "image/jpeg" };
    } catch {
    }
  }
  try {
    const jpgBuf = await withTempDir(async (dir) => {
      const inPath = path.join(dir, "slide.img");
      const outPath = path.join(dir, "slide.jpg");
      await fs2.writeFile(inPath, buffer);
      await execFileAsync(
        getFfmpegBin(),
        ["-y", "-i", inPath, "-frames:v", "1", "-q:v", "2", outPath],
        { timeout: 18e3 }
      );
      return fs2.readFile(outPath);
    });
    return { buffer: jpgBuf, mimeType: "image/jpeg" };
  } catch {
    return {
      buffer,
      mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg"
    };
  }
}

// server/aiEnhancer.ts
var ALLOWED_INPUT_MIMES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/octet-stream"
]);
var AiEnhanceServiceError = class extends Error {
  constructor(code, message) {
    super(redactSecrets(message));
    this.name = "AiEnhanceServiceError";
    this.code = code;
  }
};
function redactSecrets(input) {
  if (!input) return "";
  let out = input;
  const apiKey = (process.env.AI_ENHANCE_API_KEY || "").trim();
  if (apiKey && apiKey.length >= 4) {
    out = out.split(apiKey).join("[REDACTED]");
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");
  out = out.replace(
    /(x-api-key\s*[:=]\s*)[^\s,;]+/gi,
    "$1[REDACTED]"
  );
  out = out.replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1[REDACTED]@");
  return out;
}
function buildAuthHeaders() {
  const apiKey = (process.env.AI_ENHANCE_API_KEY || "").trim();
  if (!apiKey) return {};
  return {
    "X-API-Key": apiKey,
    Authorization: `Bearer ${apiKey}`
  };
}
function normalizeServiceBaseUrl(rawUrl) {
  const trimmed = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new AiEnhanceServiceError(
      "UNCONFIGURED_URL",
      "URL layanan AI GPU belum diatur. Atur endpoint FastAPI GPU di tab Pengaturan atau variabel AI_ENHANCE_SERVICE_URL."
    );
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AiEnhanceServiceError(
      "UNCONFIGURED_URL",
      "Format URL layanan AI GPU tidak valid (gunakan http:// atau https://)."
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AiEnhanceServiceError(
      "UNCONFIGURED_URL",
      "Protokol URL layanan AI GPU harus http:// atau https://."
    );
  }
  return trimmed;
}
function describeModeLabel(mode, defaultScale) {
  switch (mode) {
    case "face":
      return "Restorasi Wajah Natural (CodeFormer / GFPGAN)";
    case "upscale":
      return `Super-Resolution Real-ESRGAN ${defaultScale}\xD7`;
    case "2x":
      return "AI Super-Resolution 2\xD7";
    case "4x":
      return "AI Super-Resolution 4\xD7";
    case "auto":
    default:
      return "AI Enhance Adaptif Otomatis";
  }
}
var AiEnhanceOrchestrator = class {
  constructor() {
    this.activeJobs = 0;
    this.waitQueue = [];
  }
  getQueueMetrics() {
    return {
      activeJobs: this.activeJobs,
      queuedJobs: this.waitQueue.length
    };
  }
  async acquireSlot(maxConcurrent, maxQueue) {
    const safeConcurrency = Math.max(1, Math.min(8, maxConcurrent || 2));
    const safeMaxQueue = Math.max(1, Math.min(60, maxQueue || 15));
    if (this.activeJobs < safeConcurrency) {
      this.activeJobs += 1;
      return { queuedPosition: 0 };
    }
    if (this.waitQueue.length >= safeMaxQueue) {
      throw new AiEnhanceServiceError(
        "QUEUE_FULL",
        `Antrean pemrosesan foto AI sedang penuh (${this.waitQueue.length}/${safeMaxQueue}). Silakan tunggu beberapa saat lalu coba kembali.`
      );
    }
    const position = this.waitQueue.length + 1;
    await new Promise((resolve) => {
      this.waitQueue.push({ resolve });
    });
    return { queuedPosition: position };
  }
  releaseSlot() {
    const next = this.waitQueue.shift();
    if (next) {
      next.resolve();
      return;
    }
    this.activeJobs = Math.max(0, this.activeJobs - 1);
  }
  validateInputImage(buffer, mimeType, maxFileSizeMb) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
      throw new AiEnhanceServiceError(
        "INVALID_IMAGE",
        "Berkas gambar kosong atau rusak."
      );
    }
    const safeLimitMb = Math.max(1, Math.min(30, maxFileSizeMb || 15));
    const maxBytes = safeLimitMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
      const actualMb = (buffer.length / (1024 * 1024)).toFixed(2);
      throw new AiEnhanceServiceError(
        "FILE_TOO_LARGE",
        `Ukuran foto (${actualMb} MB) melebihi batas aman pemrosesan AI (${safeLimitMb} MB).`
      );
    }
    const normalizedMime = (mimeType || "").trim().toLowerCase().split(";")[0];
    if (normalizedMime && !ALLOWED_INPUT_MIMES.has(normalizedMime)) {
      throw new AiEnhanceServiceError(
        "INVALID_IMAGE",
        `Format berkas (${normalizedMime}) tidak didukung. Kirim foto berformat JPG, PNG, atau WebP statis.`
      );
    }
    const sniffed = sniffImageMetadata(buffer);
    if (sniffed.format !== "jpeg" && sniffed.format !== "png" && sniffed.format !== "webp") {
      throw new AiEnhanceServiceError(
        "INVALID_IMAGE",
        "Header biner berkas bukan foto JPG, PNG, atau WebP yang valid."
      );
    }
    if (sniffed.width && sniffed.height && (sniffed.width < 24 || sniffed.height < 24)) {
      throw new AiEnhanceServiceError(
        "INVALID_IMAGE",
        `Dimensi foto terlalu kecil (${sniffed.width}\xD7${sniffed.height} px, minimal 24\xD724 px).`
      );
    }
    const resolvedMime = sniffed.format === "png" ? "image/png" : sniffed.format === "webp" ? "image/webp" : "image/jpeg";
    return {
      format: sniffed.format,
      mimeType: resolvedMime,
      width: sniffed.width,
      height: sniffed.height
    };
  }
  async enhancePhoto(req) {
    const { config } = req;
    const baseUrl = normalizeServiceBaseUrl(config.serviceUrl);
    const inputInfo = this.validateInputImage(
      req.imageBuffer,
      req.mimeType,
      config.maxFileSizeMb
    );
    const modeLabel = describeModeLabel(req.mode, config.defaultScale);
    const willQueue = this.activeJobs >= Math.max(1, config.maxConcurrentJobs || 2);
    if (willQueue && config.sendProgressNotice && req.onStatus) {
      const estPos = this.waitQueue.length + 1;
      await req.onStatus(
        `\u23F3 *Antrean AI Enhance (#${estPos})*
Mode: *${modeLabel}*
Foto sedang menunggu giliran server GPU...`
      ).catch(() => {
      });
    }
    await this.acquireSlot(config.maxConcurrentJobs, config.maxQueueSize);
    if (!willQueue && config.sendProgressNotice && req.onStatus) {
      await req.onStatus(
        `\u23F3 *Memproses Foto dengan AI...*
Mode: *${modeLabel}*
Menjalankan analisis kualitas, deteksi wajah, dan super-resolution di server GPU.`
      ).catch(() => {
      });
    }
    let tempDir = null;
    try {
      tempDir = await fs3.mkdtemp(path2.join(os2.tmpdir(), "wabot-ai-hd-"));
      const ext = inputInfo.format === "png" ? "png" : inputInfo.format === "webp" ? "webp" : "jpg";
      const tempInputPath = path2.join(tempDir, `input.${ext}`);
      await fs3.writeFile(tempInputPath, req.imageBuffer);
      const stagedBytes = await fs3.readFile(tempInputPath);
      const effectiveScale = req.scaleOverride ?? (req.mode === "2x" ? 2 : req.mode === "4x" ? 4 : config.defaultScale);
      const effectiveFaceModel = req.faceModelOverride ?? config.preferredFaceModel;
      const rawFidelity = req.fidelityOverride ?? config.faceFidelity;
      const effectiveFidelity = Math.min(
        0.98,
        Math.max(0.05, Number.isFinite(rawFidelity) ? rawFidelity : 0.72)
      );
      const form = new FormData();
      const fileBlob = new Blob([new Uint8Array(stagedBytes)], {
        type: inputInfo.mimeType
      });
      form.append("image", fileBlob, `input.${ext}`);
      form.append("mode", req.mode);
      form.append("scale", String(effectiveScale));
      form.append("face_model", effectiveFaceModel);
      form.append("fidelity", effectiveFidelity.toFixed(2));
      form.append("enable_denoise", config.autoDenoise ? "true" : "false");
      form.append("enable_deblur", config.autoDeblur ? "true" : "false");
      form.append("output_format", "jpeg");
      const timeoutMs = Math.min(
        3e5,
        Math.max(1e4, config.timeoutMs || 9e4)
      );
      let response;
      try {
        response = await fetch(`${baseUrl}/v1/enhance`, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: form,
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        const errName = err instanceof Error ? err.name : "";
        const errMsg = redactSecrets(
          err instanceof Error ? err.message : String(err)
        );
        if (errName === "TimeoutError" || errName === "AbortError" || /timed?\s*out|aborted/i.test(errMsg)) {
          throw new AiEnhanceServiceError(
            "TIMEOUT",
            `Pemrosesan AI melebihi batas waktu (${Math.round(
              timeoutMs / 1e3
            )} detik). Coba gunakan foto berukuran lebih ringan atau mode 2\xD7.`
          );
        }
        throw new AiEnhanceServiceError(
          "SERVICE_UNAVAILABLE",
          "Layanan pemrosesan AI GPU sedang tidak aktif atau belum terhubung. Pastikan microservice Python FastAPI (/ai_service) berjalan dan URL-nya sesuai di Pengaturan."
        );
      }
      if (!response.ok) {
        let upstreamDetail = `HTTP ${response.status}`;
        try {
          const textBody = await response.text();
          if (textBody) {
            try {
              const parsed = JSON.parse(textBody);
              upstreamDetail = parsed.detail || parsed.error || textBody.slice(0, 220);
            } catch {
              upstreamDetail = textBody.slice(0, 220);
            }
          }
        } catch {
        }
        upstreamDetail = redactSecrets(upstreamDetail);
        if (response.status === 401 || response.status === 403) {
          throw new AiEnhanceServiceError(
            "UPSTREAM_ERROR",
            "Autentikasi ke server AI GPU ditolak (periksa kesesuaian variabel server AI_ENHANCE_API_KEY)."
          );
        }
        if (response.status === 429) {
          throw new AiEnhanceServiceError(
            "QUEUE_FULL",
            "Server GPU sedang menangani antrean maksimum. Silakan coba beberapa saat lagi."
          );
        }
        if (response.status === 504) {
          throw new AiEnhanceServiceError("TIMEOUT", upstreamDetail);
        }
        throw new AiEnhanceServiceError(
          "UPSTREAM_ERROR",
          `Layanan AI gagal memproses foto: ${upstreamDetail}`
        );
      }
      const outArrayBuf = await response.arrayBuffer();
      const outBuffer = Buffer.from(outArrayBuf);
      if (outBuffer.length < 64) {
        throw new AiEnhanceServiceError(
          "UPSTREAM_ERROR",
          "Server AI mengembalikan berkas gambar kosong."
        );
      }
      const outSniff = sniffImageMetadata(outBuffer);
      if (outSniff.format !== "jpeg" && outSniff.format !== "png") {
        throw new AiEnhanceServiceError(
          "UPSTREAM_ERROR",
          "Hasil keluaran dari server AI bukan berkas gambar JPG/PNG yang valid."
        );
      }
      const outExt = outSniff.format === "png" ? "png" : "jpg";
      const tempOutPath = path2.join(tempDir, `enhanced.${outExt}`);
      await fs3.writeFile(tempOutPath, outBuffer);
      let parsedMeta = {};
      const rawMetaHeader = response.headers.get("x-enhance-meta");
      if (rawMetaHeader) {
        try {
          parsedMeta = JSON.parse(rawMetaHeader);
        } catch {
          parsedMeta = {};
        }
      }
      const meta = {
        mode: req.mode,
        inputWidth: Number(parsedMeta.input_width || inputInfo.width || 0),
        inputHeight: Number(parsedMeta.input_height || inputInfo.height || 0),
        outputWidth: Number(parsedMeta.output_width || outSniff.width || 0),
        outputHeight: Number(parsedMeta.output_height || outSniff.height || 0),
        effectiveScale: Number(parsedMeta.effective_scale || effectiveScale),
        facesDetected: Number(parsedMeta.faces_detected || 0),
        fidelityUsed: Number(parsedMeta.fidelity_used ?? effectiveFidelity),
        faceModelUsed: parsedMeta.face_model_used ? String(parsedMeta.face_model_used) : null,
        stagesExecuted: Array.isArray(parsedMeta.stages_executed) ? parsedMeta.stages_executed.map(String) : [],
        modelsUsed: Array.isArray(parsedMeta.models_used) ? parsedMeta.models_used.map(String) : ["Real-ESRGAN"],
        inputSharpness: Number(parsedMeta.input_sharpness || 0),
        outputSharpness: Number(parsedMeta.output_sharpness || 0),
        noiseSigma: Number(parsedMeta.noise_sigma || 0),
        durationMs: Number(parsedMeta.duration_ms || 0),
        note: String(
          parsedMeta.note || "Detail mikro direkonstruksi oleh model AI pretrained (estimasi restorasi, bukan rekaman optik asli)."
        )
      };
      return {
        buffer: outBuffer,
        mimeType: outSniff.format === "png" ? "image/png" : "image/jpeg",
        meta
      };
    } finally {
      this.releaseSlot();
      if (tempDir) {
        await fs3.rm(tempDir, { recursive: true, force: true }).catch(() => {
        });
      }
    }
  }
};
var aiEnhancer = new AiEnhanceOrchestrator();
async function checkAiServiceHealth(config) {
  const localMetrics = aiEnhancer.getQueueMetrics();
  const apiKeyConfigured = Boolean(
    (process.env.AI_ENHANCE_API_KEY || "").trim()
  );
  const rawUrl = (config.serviceUrl || "").trim().replace(/\/+$/, "");
  if (!rawUrl) {
    return {
      ok: false,
      reachable: false,
      serviceUrl: "",
      apiKeyConfigured,
      botActiveJobs: localMetrics.activeJobs,
      botQueuedJobs: localMetrics.queuedJobs,
      error: "URL layanan AI GPU belum diisi."
    };
  }
  const startedAt = Date.now();
  try {
    const response = await fetch(`${rawUrl}/health`, {
      method: "GET",
      headers: buildAuthHeaders(),
      signal: AbortSignal.timeout(6e3)
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        ok: false,
        reachable: true,
        serviceUrl: rawUrl,
        apiKeyConfigured,
        botActiveJobs: localMetrics.activeJobs,
        botQueuedJobs: localMetrics.queuedJobs,
        latencyMs,
        error: response.status === 401 ? "API key server tidak cocok (HTTP 401)." : `Respon tidak normal dari server GPU (HTTP ${response.status}).`
      };
    }
    const body = await response.json();
    return {
      ok: true,
      reachable: true,
      serviceUrl: rawUrl,
      apiKeyConfigured,
      device: body.device ? String(body.device) : void 0,
      gpuName: body.gpu_name ? String(body.gpu_name) : null,
      vramTotalGb: typeof body.vram_total_gb === "number" ? body.vram_total_gb : null,
      fp16: Boolean(body.fp16),
      weightsPresent: body.weights_present && typeof body.weights_present === "object" ? body.weights_present : void 0,
      upstreamActiveJobs: typeof body.active_jobs === "number" ? body.active_jobs : void 0,
      upstreamQueuedJobs: typeof body.queued_jobs === "number" ? body.queued_jobs : void 0,
      botActiveJobs: localMetrics.activeJobs,
      botQueuedJobs: localMetrics.queuedJobs,
      latencyMs
    };
  } catch (err) {
    const msg = redactSecrets(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      reachable: false,
      serviceUrl: rawUrl,
      apiKeyConfigured,
      botActiveJobs: localMetrics.activeJobs,
      botQueuedJobs: localMetrics.queuedJobs,
      error: /timeout|aborted/i.test(msg) ? "Koneksi ke server GPU timeout (6 detik)." : "Server FastAPI GPU belum aktif atau tidak terjangkau."
    };
  }
}
async function pushRuntimeConfigToAiService(config) {
  const rawUrl = (config.serviceUrl || "").trim().replace(/\/+$/, "");
  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
    return;
  }
  try {
    await fetch(`${rawUrl}/v1/config`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({
        default_face_model: config.preferredFaceModel,
        default_fidelity: config.faceFidelity
      }),
      signal: AbortSignal.timeout(4e3)
    });
  } catch {
  }
}

// server/stateStore.ts
import fs6 from "node:fs";
import path4 from "node:path";

// server/cloudSync.ts
import fs4 from "node:fs/promises";
import path3 from "node:path";
import pg from "pg";
var { Pool } = pg;
var mockKvStore = /* @__PURE__ */ new Map();
function createMockPool() {
  return {
    async query(text, values = []) {
      const normalized = text.trim().toUpperCase();
      if (normalized.startsWith("SELECT KEY, VALUE FROM WABOT_KV")) {
        const rows = [];
        for (const [key, entry] of mockKvStore.entries()) {
          rows.push({ key, value: entry.value });
        }
        return { rows };
      }
      if (normalized.startsWith("INSERT INTO WABOT_KV")) {
        if (normalized.includes("VALUES ('STATE:BOT-STATE.JSON'")) {
          const val = String(values[0] ?? "");
          const ts = Number(values[1] ?? Date.now());
          mockKvStore.set("state:bot-state.json", { value: val, updatedAt: ts });
        } else {
          const key = String(values[0] ?? "");
          const val = String(values[1] ?? "");
          const ts = Number(values[2] ?? Date.now());
          if (key) {
            mockKvStore.set(key, { value: val, updatedAt: ts });
          }
        }
        return { rows: [] };
      }
      if (normalized.startsWith("DELETE FROM WABOT_KV WHERE KEY LIKE 'AUTH:%'")) {
        for (const key of Array.from(mockKvStore.keys())) {
          if (key.startsWith("auth:")) {
            mockKvStore.delete(key);
          }
        }
        return { rows: [] };
      }
      if (normalized.startsWith("DELETE FROM WABOT_KV WHERE KEY = $1")) {
        const key = String(values[0] ?? "");
        mockKvStore.delete(key);
        return { rows: [] };
      }
      return { rows: [] };
    },
    async end() {
    }
  };
}
function shouldForceSsl(connectionString) {
  const lower = connectionString.toLowerCase();
  return lower.includes("sslmode=require") || lower.includes(".render.com") || lower.includes(".neon.tech") || lower.includes(".supabase.co") || lower.includes(".aivencloud.com") || lower.includes(".cockroachlabs.cloud");
}
var CloudSessionSync = class {
  constructor() {
    this.pool = null;
    this.ready = false;
    this.usingMock = false;
    this.lastSyncedAuth = /* @__PURE__ */ new Map();
    this.lastSyncedState = "";
    this.authTimer = null;
    this.stateTimer = null;
    this.pendingStateJson = null;
    this.activeAuthSync = Promise.resolve();
  }
  isEnabled() {
    return this.ready && this.pool !== null && !this.usingMock;
  }
  async connectPool(connectionString) {
    const isUnixSocket = connectionString.includes("/cloudsql/");
    const preferSsl = !isUnixSocket && shouldForceSsl(connectionString);
    const candidates = isUnixSocket ? [false] : preferSsl ? [{ rejectUnauthorized: false }, false] : [false, { rejectUnauthorized: false }];
    for (const sslOption of candidates) {
      let candidatePool;
      try {
        candidatePool = new Pool({
          connectionString,
          ssl: sslOption,
          max: 3,
          idleTimeoutMillis: 3e4,
          connectionTimeoutMillis: 3e3
        });
      } catch (err) {
        console.warn(
          "[CloudSync] Pool initialization failed \u2014 mock active:",
          err instanceof Error ? err.message : String(err)
        );
        return null;
      }
      candidatePool.on("error", (err) => {
        console.warn("[CloudSync] Idle PostgreSQL client notice:", err.message);
      });
      try {
        await candidatePool.query(`
          CREATE TABLE IF NOT EXISTS wabot_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at BIGINT NOT NULL
          )
        `);
        return candidatePool;
      } catch (err) {
        try {
          await candidatePool.end();
        } catch {
        }
        console.warn(
          `[CloudSync] Connection attempt (ssl=${Boolean(sslOption)}) failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
    return null;
  }
  async initAndRestore(dataDir) {
    const dbUrl = (process.env.DATABASE_URL || "").trim();
    if (!dbUrl) {
      return;
    }
    const connected = await this.connectPool(dbUrl);
    if (!connected) {
      console.warn(
        "[CloudSync] DB not connected \u2014 in-memory mock & local storage fallback active."
      );
      this.pool = createMockPool();
      this.usingMock = true;
      this.ready = true;
      return;
    }
    this.pool = connected;
    this.usingMock = false;
    this.ready = true;
    try {
      const { rows } = await this.pool.query(
        "SELECT key, value FROM wabot_kv"
      );
      const authDir = path3.join(dataDir, ".baileys_auth");
      await fs4.mkdir(authDir, { recursive: true });
      let restoredAuthFiles = 0;
      for (const row of rows) {
        if (row.key === "state:bot-state.json") {
          const statePath = path3.join(dataDir, ".bot-state.json");
          await fs4.writeFile(statePath, row.value, "utf-8");
          this.lastSyncedState = row.value;
        } else if (row.key.startsWith("auth:")) {
          const rawName = row.key.slice("auth:".length);
          const safeName = path3.basename(rawName);
          if (!safeName || safeName !== rawName) continue;
          const filePath = path3.join(authDir, safeName);
          await fs4.writeFile(filePath, row.value, "utf-8");
          this.lastSyncedAuth.set(safeName, row.value);
          restoredAuthFiles += 1;
        }
      }
      console.log(
        `[CloudSync] Aktif \u2014 berhasil memulihkan ${restoredAuthFiles} berkas sesi WhatsApp dari PostgreSQL.`
      );
    } catch (err) {
      console.error("[CloudSync] Gagal memulihkan sesi dari PostgreSQL:", err);
    }
  }
  scheduleAuthSync(authDir) {
    if (!this.ready || !this.pool) return;
    if (this.authTimer) {
      clearTimeout(this.authTimer);
    }
    this.authTimer = setTimeout(() => {
      this.authTimer = null;
      void this.flushAuthNow(authDir);
    }, 750);
    this.authTimer.unref();
  }
  flushAuthNow(authDir) {
    if (!this.ready || !this.pool) return Promise.resolve();
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
    const run = async () => {
      const pool = this.pool;
      if (!pool) return;
      let entries = [];
      try {
        entries = await fs4.readdir(authDir);
      } catch {
        return;
      }
      const currentFiles = /* @__PURE__ */ new Set();
      const upserts = [];
      for (const name of entries) {
        if (!name.endsWith(".json")) continue;
        currentFiles.add(name);
        try {
          const content = await fs4.readFile(path3.join(authDir, name), "utf-8");
          if (this.lastSyncedAuth.get(name) !== content) {
            upserts.push({ key: `auth:${name}`, value: content });
          }
        } catch {
        }
      }
      const removedNames = [];
      for (const prevName of this.lastSyncedAuth.keys()) {
        if (!currentFiles.has(prevName)) {
          removedNames.push(prevName);
        }
      }
      const now = Date.now();
      for (const item of upserts) {
        try {
          await pool.query(
            `INSERT INTO wabot_kv (key, value, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            [item.key, item.value, now]
          );
          this.lastSyncedAuth.set(item.key.slice("auth:".length), item.value);
        } catch (err) {
          console.warn("[CloudSync] Gagal menyimpan berkas auth:", err);
        }
      }
      for (const gone of removedNames) {
        try {
          await pool.query("DELETE FROM wabot_kv WHERE key = $1", [
            `auth:${gone}`
          ]);
          this.lastSyncedAuth.delete(gone);
        } catch {
        }
      }
    };
    const next = this.activeAuthSync.then(run, run);
    this.activeAuthSync = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  scheduleStateSync(stateJson) {
    if (!this.ready || !this.pool) return;
    if (stateJson === this.lastSyncedState) return;
    this.pendingStateJson = stateJson;
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
    }
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      void this.flushStateNow();
    }, 1e3);
    this.stateTimer.unref();
  }
  async flushStateNow(explicitJson) {
    if (!this.ready || !this.pool) return;
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
    const payload = explicitJson ?? this.pendingStateJson;
    this.pendingStateJson = null;
    if (!payload || payload === this.lastSyncedState) return;
    try {
      await this.pool.query(
        `INSERT INTO wabot_kv (key, value, updated_at)
         VALUES ('state:bot-state.json', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [payload, Date.now()]
      );
      this.lastSyncedState = payload;
    } catch (err) {
      console.warn("[CloudSync] Gagal menyimpan state bot:", err);
    }
  }
  async clearAuth() {
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
    this.lastSyncedAuth.clear();
    if (!this.ready || !this.pool) return;
    try {
      await this.pool.query("DELETE FROM wabot_kv WHERE key LIKE 'auth:%'");
    } catch (err) {
      console.warn("[CloudSync] Gagal membersihkan sesi auth di cloud:", err);
    }
  }
  async flushAllNow(authDir) {
    await Promise.allSettled([
      this.flushAuthNow(authDir),
      this.flushStateNow()
    ]);
  }
};
var cloudSync = new CloudSessionSync();

// server/queueEngine.ts
var PacedOutboundQueue = class {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.isPaused = false;
    this.recentJobs = [];
    this.stats = {
      totalSent: 0,
      queuedNow: 0,
      failedCount: 0,
      webhooksDelivered: 0
    };
    // Socket provider reference set by baileysManager
    this.socketProvider = null;
  }
  setSocketProvider(provider) {
    this.socketProvider = provider;
  }
  enqueue(item) {
    const job = {
      id: item.id,
      to: item.jid,
      type: item.jobType || "text",
      text: item.summaryText || "Pesan WhatsApp",
      status: "queued",
      createdAt: Date.now()
    };
    this.addJobRecord(job);
    if (item.isPriority) {
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }
    this.updateStats();
    this.processNext();
    return item.id;
  }
  getStats() {
    return {
      ...this.stats,
      queuedNow: this.queue.length
    };
  }
  getRecentJobs() {
    return [...this.recentJobs];
  }
  clearQueue() {
    this.queue = [];
    this.updateStats();
  }
  setPaused(paused) {
    this.isPaused = paused;
    if (!paused) {
      this.processNext();
    }
  }
  getIsPaused() {
    return this.isPaused;
  }
  addJobRecord(job) {
    this.recentJobs = [job, ...this.recentJobs.filter((j) => j.id !== job.id)].slice(0, 50);
    botStore.broadcast("gateway:jobs", this.recentJobs);
  }
  updateJobStatus(id, status, error) {
    const target = this.recentJobs.find((j) => j.id === id);
    if (target) {
      target.status = status;
      if (status === "sent") {
        target.sentAt = Date.now();
      }
      if (error) {
        target.error = error;
      }
      botStore.broadcast("gateway:jobs", this.recentJobs);
    }
  }
  updateStats() {
    this.stats.queuedNow = this.queue.length;
    botStore.broadcast("gateway:stats", this.getStats());
  }
  async processNext() {
    if (this.isProcessing || this.isPaused || this.queue.length === 0) {
      return;
    }
    const item = this.queue.shift();
    if (!item) return;
    this.isProcessing = true;
    this.updateStats();
    try {
      this.updateJobStatus(item.id, "composing");
      const antiBan = botStore.config.antiBan;
      const sock = this.socketProvider ? this.socketProvider() : null;
      let minDelay = antiBan?.minTypingDelayMs || 1800;
      let maxDelay = antiBan?.maxTypingDelayMs || 3500;
      if (antiBan?.warmUpMode) {
        minDelay = Math.max(minDelay, 2500);
        maxDelay = Math.max(maxDelay, 4200);
      }
      const randomJitter = Math.floor(Math.random() * (maxDelay - minDelay));
      const totalWaitMs = minDelay + randomJitter;
      if (sock && antiBan?.humanizeTyping && item.jid.includes("@")) {
        try {
          await sock.sendPresenceUpdate("composing", item.jid);
        } catch {
        }
      }
      await new Promise((resolve) => setTimeout(resolve, totalWaitMs));
      if (sock) {
        await sock.sendMessage(item.jid, item.content, item.options);
        try {
          await sock.sendPresenceUpdate("paused", item.jid);
        } catch {
        }
      } else {
        console.log(`[QueueEngine] Mock dispatch to ${item.jid}:`, item.summaryText);
      }
      this.stats.totalSent += 1;
      this.updateJobStatus(item.id, "sent");
      item.onSuccess?.();
    } catch (err) {
      console.error(`[QueueEngine] Failed to dispatch message ${item.id}:`, err?.message || err);
      this.stats.failedCount += 1;
      this.updateJobStatus(item.id, "failed", err?.message || "Gagal mengirim pesan ke socket WA");
      item.onError?.(err);
    } finally {
      this.isProcessing = false;
      this.updateStats();
      const restGap = 400 + Math.floor(Math.random() * 600);
      setTimeout(() => {
        this.processNext();
      }, restGap);
    }
  }
};
var queueEngine = new PacedOutboundQueue();

// server/storagePath.ts
import fs5 from "node:fs";
function resolveDataDir() {
  const explicit = (process.env.DATA_DIR || "").trim();
  if (explicit) {
    try {
      fs5.mkdirSync(explicit, { recursive: true });
      return explicit;
    } catch {
    }
  }
  try {
    if (fs5.existsSync("/data") && fs5.statSync("/data").isDirectory()) {
      fs5.accessSync("/data", fs5.constants.W_OK);
      return "/data";
    }
  } catch {
  }
  return process.cwd();
}

// server/webhookDispatcher.ts
import crypto from "crypto";
var WebhookDispatcher = class {
  constructor() {
    this.deliveryLogs = [];
  }
  getDeliveryLogs() {
    return [...this.deliveryLogs];
  }
  async dispatch(event, data) {
    const { webhook } = botStore.config;
    if (!webhook || !webhook.enabled || !webhook.url) {
      return;
    }
    if (webhook.events && webhook.events.length > 0 && !webhook.events.includes(event)) {
      return;
    }
    const payload = {
      event,
      timestamp: Date.now(),
      session: "default",
      data
    };
    const payloadString = JSON.stringify(payload);
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "WABot-OpenWA-Gateway/1.0"
    };
    if (webhook.secret) {
      const hmac = crypto.createHmac("sha256", webhook.secret).update(payloadString).digest("hex");
      headers["X-OpenWA-Signature"] = `sha256=${hmac}`;
    }
    const startTime = Date.now();
    const logId = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const res = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const log = {
        id: logId,
        timestamp: Date.now(),
        event,
        url: webhook.url,
        statusCode: res.status,
        success: res.ok,
        durationMs
      };
      this.addLog(log);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const log = {
        id: logId,
        timestamp: Date.now(),
        event,
        url: webhook.url,
        statusCode: 0,
        success: false,
        durationMs,
        error: err?.message || "Gagal mengirim webhook (Network/Timeout)"
      };
      this.addLog(log);
    }
  }
  async testPing(url, secret) {
    const payload = {
      event: "session.status",
      timestamp: Date.now(),
      session: "default",
      data: {
        status: botStore.waState.status,
        botName: botStore.config.botName,
        ping: "test-verification"
      }
    };
    const payloadString = JSON.stringify(payload);
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "WABot-OpenWA-Gateway/1.0"
    };
    if (secret) {
      const hmac = crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
      headers["X-OpenWA-Signature"] = `sha256=${hmac}`;
    }
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6e3);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      return {
        success: res.ok,
        statusCode: res.status,
        durationMs,
        error: res.ok ? void 0 : `Server merespon dengan HTTP ${res.status}`
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        statusCode: 0,
        durationMs,
        error: err?.message || "Koneksi gagal atau waktu habis (timeout)"
      };
    }
  }
  addLog(log) {
    this.deliveryLogs = [log, ...this.deliveryLogs].slice(0, 30);
    botStore.broadcast("webhook:logs", this.deliveryLogs);
  }
};
var webhookDispatcher = new WebhookDispatcher();

// server/stateStore.ts
var STATE_FILE = path4.join(resolveDataDir(), ".bot-state.json");
var DEFAULT_WEBHOOK_CONFIG = {
  enabled: false,
  url: "",
  secret: "",
  events: ["message.received", "message.sent", "session.status"]
};
var DEFAULT_AUTORESPONDER_RULES = [
  {
    id: "rule-halo",
    trigger: "halo",
    matchType: "contains",
    replyText: "Halo {sender}! Ada yang bisa {botName} bantu hari ini? Ketik *{prefix}menu* untuk melihat seluruh fitur.",
    scope: "all",
    enabled: true,
    hitCount: 0,
    createdAt: 17145e8
  },
  {
    id: "rule-owner",
    trigger: "owner",
    matchType: "exact",
    replyText: "Kontak resmi Owner {botName}: https://wa.me/6289673533963 (+62 896-7353-3963)",
    scope: "all",
    enabled: true,
    hitCount: 0,
    createdAt: 17145e8
  }
];
var DEFAULT_ANTIBAN_CONFIG = {
  enabled: true,
  warmUpMode: true,
  humanizeTyping: true,
  minTypingDelayMs: 1800,
  maxTypingDelayMs: 3800,
  userCooldownSeconds: 6,
  maxCommandsPerMinutePerUser: 4,
  hidetagCooldownSeconds: 45,
  hidetagAdminOnly: true,
  maxMentionsLimit: 40,
  autoRejectCalls: true,
  callRejectNotice: "Maaf, bot ini berjalan secara otomatis dan tidak menerima panggilan telepon atau video WhatsApp.",
  ownerOnlyMode: false,
  ownerNumber: OFFICIAL_OWNER_NUMBER,
  browserProfile: "windows_chrome"
};
function buildInitialAiEnhanceConfig() {
  const envUrl = (process.env.AI_ENHANCE_SERVICE_URL || "").trim();
  const envFace = (process.env.AI_ENHANCE_FACE_MODEL || "").trim().toLowerCase();
  const envFidelity = Number(process.env.AI_ENHANCE_FIDELITY);
  const envConc = Number(process.env.AI_ENHANCE_CONCURRENCY);
  const envTimeout = Number(process.env.AI_ENHANCE_TIMEOUT_MS);
  const envMaxMb = Number(process.env.AI_ENHANCE_MAX_FILE_MB);
  return {
    ...DEFAULT_AI_ENHANCE_CONFIG,
    serviceUrl: (envUrl || DEFAULT_AI_ENHANCE_CONFIG.serviceUrl).replace(
      /\/+$/,
      ""
    ),
    preferredFaceModel: envFace === "gfpgan" ? "gfpgan" : DEFAULT_AI_ENHANCE_CONFIG.preferredFaceModel,
    faceFidelity: Number.isFinite(envFidelity) && envFidelity >= 0.05 && envFidelity <= 0.98 ? envFidelity : DEFAULT_AI_ENHANCE_CONFIG.faceFidelity,
    maxConcurrentJobs: Number.isFinite(envConc) && envConc >= 1 && envConc <= 8 ? Math.round(envConc) : DEFAULT_AI_ENHANCE_CONFIG.maxConcurrentJobs,
    timeoutMs: Number.isFinite(envTimeout) && envTimeout >= 1e4 ? Math.round(envTimeout) : DEFAULT_AI_ENHANCE_CONFIG.timeoutMs,
    maxFileSizeMb: Number.isFinite(envMaxMb) && envMaxMb >= 1 && envMaxMb <= 30 ? Math.round(envMaxMb) : DEFAULT_AI_ENHANCE_CONFIG.maxFileSizeMb
  };
}
var INITIAL_AI_ENHANCE_CONFIG = buildInitialAiEnhanceConfig();
var DEFAULT_CONFIG = {
  prefix: ".",
  botName: "WABot",
  ownerName: "Owner Bot",
  ownerWebsite: `wa.me/${OFFICIAL_OWNER_NUMBER}`,
  stickerPackName: "WA Sticker",
  stickerAuthor: OFFICIAL_OWNER_NUMBER,
  autoRead: true,
  selfMode: false,
  disabledCommands: [],
  reactions: { ...DEFAULT_REACTIONS },
  templates: { ...DEFAULT_TEMPLATES },
  groupSettings: {
    antilink: true,
    welcome: true,
    goodbye: true
  },
  groupOverrides: {},
  antiBan: { ...DEFAULT_ANTIBAN_CONFIG },
  aiEnhance: { ...INITIAL_AI_ENHANCE_CONFIG },
  lockSettingsManualOnly: false,
  webhook: { ...DEFAULT_WEBHOOK_CONFIG },
  autoResponder: [...DEFAULT_AUTORESPONDER_RULES]
};
var INITIAL_GROUP_MEMBERS = [
  {
    jid: `${OFFICIAL_OWNER_NUMBER}@s.whatsapp.net`,
    name: "Owner Bot",
    phone: OFFICIAL_OWNER_NUMBER,
    isAdmin: true
  },
  {
    jid: "628138000222@s.whatsapp.net",
    name: "Raka Pratama",
    phone: "628138000222",
    isAdmin: true
  },
  {
    jid: "628577000333@s.whatsapp.net",
    name: "Nadia Putri",
    phone: "628577000333",
    isAdmin: false
  },
  {
    jid: "628966000444@s.whatsapp.net",
    name: "Dimas Saputra",
    phone: "628966000444",
    isAdmin: false
  },
  {
    jid: "628215000555@s.whatsapp.net",
    name: "Alya Maharani",
    phone: "628215000555",
    isAdmin: false
  }
];
var INITIAL_GROUP_STATE = {
  subject: "Ruang Diskusi Komunitas",
  description: "Ruang diskusi komunitas & berbagi media. Dilarang mengirim spam tautan.",
  isAnnouncementOnly: false,
  inviteCode: "Komunitas2026Official"
};
var INITIAL_MESSAGES = [
  {
    id: "msg-welcome-private",
    chatMode: "private",
    sender: "bot",
    senderName: "WABot",
    senderPhone: "Bot Engine",
    text: "Halo! Selamat datang di ruang uji WABot.\n\nKetik *.menu* untuk melihat daftar perintah yang sudah dirapikan, *.owner* untuk info kontak owner, kirim dokumen foto/video dengan *.hdsw* agar jadi media ukuran asli siap diteruskan ke Status WA, atau uji *.tt <link tiktok>* dan *.qc*.",
    timestamp: Date.now() - 6e4
  },
  {
    id: "msg-welcome-group",
    chatMode: "group",
    sender: "bot",
    senderName: "WABot",
    senderPhone: "Bot Engine",
    text: "Grup *Ruang Diskusi Komunitas* aktif.\nAdmin & Owner dapat mengelola grup serta menguji fitur stiker, perkakas media (*.hdsw*, *.rvo*, *.toptv*), maupun moderasi *.kick*, *.promote*, dan *.demote*.",
    timestamp: Date.now() - 55e3
  }
];
var BotStateStore = class {
  constructor() {
    this.waState = {
      status: "disconnected",
      qrDataUrl: null,
      pairingCode: null,
      pairingPhone: null,
      connectedUser: null,
      connectedAt: null,
      statusMessage: null,
      lastError: null
    };
    this.config = {
      ...DEFAULT_CONFIG,
      reactions: { ...DEFAULT_REACTIONS },
      templates: { ...DEFAULT_TEMPLATES },
      groupSettings: { ...DEFAULT_CONFIG.groupSettings },
      groupOverrides: {},
      antiBan: { ...DEFAULT_ANTIBAN_CONFIG },
      aiEnhance: { ...INITIAL_AI_ENHANCE_CONFIG },
      lockSettingsManualOnly: true,
      webhook: { ...DEFAULT_WEBHOOK_CONFIG },
      autoResponder: [...DEFAULT_AUTORESPONDER_RULES]
    };
    this.simulatorMessages = [...INITIAL_MESSAGES];
    this.logs = [];
    this.groupMembers = [...INITIAL_GROUP_MEMBERS];
    this.groupState = { ...INITIAL_GROUP_STATE };
    this.stats = {
      totalCommands: 0,
      stickersCreated: 0,
      mediaDownloaded: 0,
      linksModerated: 0,
      antiBan: {
        throttledSpams: 0,
        callsDeclined: 0,
        hidetagProtected: 0
      }
    };
    this.stickerCache = /* @__PURE__ */ new Map();
    this.hdMediaCache = /* @__PURE__ */ new Map();
    this.clients = /* @__PURE__ */ new Set();
    this.loadFromDisk();
  }
  reloadFromDisk() {
    this.loadFromDisk();
    this.broadcast("state:init", this.getSnapshot());
  }
  loadFromDisk() {
    try {
      if (fs6.existsSync(STATE_FILE)) {
        const raw = JSON.parse(fs6.readFileSync(STATE_FILE, "utf-8"));
        let migrated = false;
        if (raw.config) {
          const mergedConfig = {
            ...DEFAULT_CONFIG,
            ...raw.config,
            reactions: {
              ...DEFAULT_REACTIONS,
              ...raw.config.reactions || {}
            },
            templates: {
              ...DEFAULT_TEMPLATES,
              ...raw.config.templates || {}
            },
            groupSettings: {
              ...DEFAULT_CONFIG.groupSettings,
              ...raw.config.groupSettings || {}
            },
            groupOverrides: raw.config.groupOverrides || {},
            antiBan: {
              ...DEFAULT_ANTIBAN_CONFIG,
              ...raw.config.antiBan || {}
            },
            aiEnhance: {
              ...INITIAL_AI_ENHANCE_CONFIG,
              ...raw.config.aiEnhance || {},
              ...process.env.AI_ENHANCE_SERVICE_URL?.trim() ? {
                serviceUrl: process.env.AI_ENHANCE_SERVICE_URL.trim().replace(
                  /\/+$/,
                  ""
                )
              } : {}
            },
            lockSettingsManualOnly: raw.config.lockSettingsManualOnly !== void 0 ? Boolean(raw.config.lockSettingsManualOnly) : true,
            webhook: {
              ...DEFAULT_WEBHOOK_CONFIG,
              ...raw.config.webhook || {}
            },
            autoResponder: Array.isArray(raw.config.autoResponder) ? raw.config.autoResponder : [...DEFAULT_AUTORESPONDER_RULES]
          };
          const { config: cleanedCfg, changed } = sanitizeBotConfig(mergedConfig);
          this.config = cleanedCfg;
          if (changed) {
            migrated = true;
          }
        }
        if (raw.stats) {
          this.stats = {
            ...this.stats,
            ...raw.stats,
            antiBan: {
              ...this.stats.antiBan,
              ...raw.stats.antiBan || {}
            }
          };
        }
        if (Array.isArray(raw.logs)) {
          const cleanedLogs = sanitizeLogs(raw.logs);
          if (cleanedLogs.length !== raw.logs.length) {
            migrated = true;
          }
          this.logs = cleanedLogs.slice(0, 60);
        }
        if (migrated) {
          this.saveToDisk();
        }
      }
    } catch {
    }
  }
  incrementAntiBanStat(key) {
    if (!this.stats.antiBan) {
      this.stats.antiBan = {
        throttledSpams: 0,
        callsDeclined: 0,
        hidetagProtected: 0
      };
    }
    this.stats.antiBan[key] = (this.stats.antiBan[key] || 0) + 1;
    this.broadcast("stats:update", this.stats);
    this.saveToDisk();
  }
  saveToDisk() {
    const serialized = JSON.stringify(
      {
        config: this.config,
        stats: this.stats,
        logs: this.logs.slice(0, 50)
      },
      null,
      2
    );
    try {
      fs6.mkdirSync(path4.dirname(STATE_FILE), { recursive: true });
      fs6.writeFileSync(STATE_FILE, serialized);
    } catch {
    }
    cloudSync.scheduleStateSync(serialized);
  }
  attachClient(ws) {
    this.clients.add(ws);
    this.sendTo(ws, { type: "state:init", payload: this.getSnapshot() });
    ws.on("close", () => {
      this.clients.delete(ws);
    });
  }
  sendTo(ws, message) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }
  broadcast(type, payload) {
    const encoded = JSON.stringify({ type, payload });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(encoded);
      }
    }
  }
  getSnapshot() {
    return {
      waState: this.waState,
      config: this.config,
      simulatorMessages: this.simulatorMessages,
      logs: this.logs,
      groupMembers: this.groupMembers,
      groupState: this.groupState,
      stats: this.stats,
      webhookLogs: webhookDispatcher.getDeliveryLogs(),
      gatewayJobs: queueEngine.getRecentJobs(),
      gatewayStats: queueEngine.getStats()
    };
  }
  updateWAState(patch) {
    this.waState = { ...this.waState, ...patch };
    this.broadcast("wa:update", this.waState);
  }
  updateConfig(patch) {
    this.config = {
      ...this.config,
      ...patch,
      prefix: (patch.prefix ?? this.config.prefix).trim().slice(0, 3) || ".",
      reactions: {
        ...this.config.reactions,
        ...patch.reactions || {}
      },
      templates: {
        ...this.config.templates,
        ...patch.templates || {}
      },
      groupSettings: {
        ...this.config.groupSettings,
        ...patch.groupSettings || {}
      },
      groupOverrides: patch.groupOverrides ?? this.config.groupOverrides ?? {},
      antiBan: {
        ...this.config.antiBan,
        ...patch.antiBan || {}
      },
      aiEnhance: {
        ...this.config.aiEnhance,
        ...patch.aiEnhance || {}
      },
      lockSettingsManualOnly: patch.lockSettingsManualOnly !== void 0 ? patch.lockSettingsManualOnly : this.config.lockSettingsManualOnly,
      webhook: {
        ...this.config.webhook,
        ...patch.webhook || {}
      },
      autoResponder: patch.autoResponder !== void 0 ? patch.autoResponder : this.config.autoResponder
    };
    this.config = sanitizeBotConfig(this.config).config;
    this.saveToDisk();
    this.broadcast("config:update", this.config);
    return this.config;
  }
  addAutoResponderRule(rule) {
    const newRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      hitCount: 0,
      createdAt: Date.now()
    };
    this.config.autoResponder = [newRule, ...this.config.autoResponder || []];
    this.saveToDisk();
    this.broadcast("config:update", this.config);
    return newRule;
  }
  updateAutoResponderRule(id, patch) {
    const list = this.config.autoResponder || [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this.config.autoResponder = [...list];
    this.saveToDisk();
    this.broadcast("config:update", this.config);
    return list[idx];
  }
  deleteAutoResponderRule(id) {
    const list = this.config.autoResponder || [];
    const nextList = list.filter((r) => r.id !== id);
    if (nextList.length === list.length) return false;
    this.config.autoResponder = nextList;
    this.saveToDisk();
    this.broadcast("config:update", this.config);
    return true;
  }
  getEffectiveGroupSettings(groupId) {
    const base = this.config.groupSettings;
    if (!groupId) return base;
    const ov = this.config.groupOverrides?.[groupId];
    if (!ov) return base;
    return {
      antilink: ov.antilink ?? base.antilink,
      welcome: ov.welcome ?? base.welcome,
      goodbye: ov.goodbye ?? base.goodbye
    };
  }
  getEffectiveTemplate(key, groupId) {
    if (groupId) {
      const custom = this.config.groupOverrides?.[groupId]?.templates?.[key];
      if (custom && custom.trim()) {
        return custom;
      }
    }
    return this.config.templates[key] || DEFAULT_TEMPLATES[key];
  }
  updateGroupCustomConfig(groupId, patch) {
    const currentOverrides = { ...this.config.groupOverrides || {} };
    const existing = currentOverrides[groupId] || {};
    currentOverrides[groupId] = {
      ...existing,
      ...patch,
      templates: {
        ...existing.templates || {},
        ...patch.templates || {}
      }
    };
    this.config = {
      ...this.config,
      groupOverrides: currentOverrides
    };
    this.saveToDisk();
    this.broadcast("config:update", this.config);
  }
  resetGroupCustomTemplates(groupId, singleKey) {
    const currentOverrides = { ...this.config.groupOverrides || {} };
    const existing = currentOverrides[groupId];
    if (!existing) return;
    if (singleKey) {
      const nextTemplates = { ...existing.templates || {} };
      delete nextTemplates[singleKey];
      currentOverrides[groupId] = {
        ...existing,
        templates: nextTemplates
      };
    } else {
      delete currentOverrides[groupId];
    }
    this.config = {
      ...this.config,
      groupOverrides: currentOverrides
    };
    this.saveToDisk();
    this.broadcast("config:update", this.config);
  }
  broadcastGroupSync() {
    this.broadcast("group:update", {
      groupMembers: this.groupMembers,
      groupState: this.groupState
    });
  }
  updateGroupState(patch) {
    this.groupState = { ...this.groupState, ...patch };
    this.broadcastGroupSync();
  }
  setGroupMembers(members) {
    this.groupMembers = members;
    this.broadcastGroupSync();
  }
  resetGroupSimulator() {
    this.groupMembers = [...INITIAL_GROUP_MEMBERS];
    this.groupState = { ...INITIAL_GROUP_STATE };
    this.broadcastGroupSync();
  }
  addSimulatorMessage(msg) {
    if (this.simulatorMessages.some((m) => m.id === msg.id)) return;
    this.simulatorMessages = [...this.simulatorMessages.slice(-99), msg];
    this.broadcast("simulator:message", msg);
  }
  updateSimulatorMessage(id, patch) {
    let updated = null;
    this.simulatorMessages = this.simulatorMessages.map((m) => {
      if (m.id === id) {
        updated = { ...m, ...patch };
        return updated;
      }
      return m;
    });
    if (updated) {
      this.broadcast("simulator:update_message", updated);
    }
  }
  clearSimulatorMessages(chatMode) {
    if (chatMode) {
      const defaults = INITIAL_MESSAGES.filter((m) => m.chatMode === chatMode);
      this.simulatorMessages = [
        ...this.simulatorMessages.filter((m) => m.chatMode !== chatMode),
        ...defaults
      ];
      if (chatMode === "group") {
        this.resetGroupSimulator();
      }
    } else {
      this.simulatorMessages = [...INITIAL_MESSAGES];
      this.resetGroupSimulator();
    }
    this.broadcast("simulator:reset", this.simulatorMessages);
  }
  addLog(entry) {
    if (this.logs.some((l) => l.id === entry.id)) return;
    this.logs = [entry, ...this.logs].slice(0, 60);
    this.saveToDisk();
    this.broadcast("log:new", entry);
  }
  incrementStat(key) {
    this.stats[key] += 1;
    this.saveToDisk();
    this.broadcast("stats:update", this.stats);
  }
  storeSticker(buffer) {
    const id = `stk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.stickerCache.set(id, buffer);
    if (this.stickerCache.size > 80) {
      const oldestKey = this.stickerCache.keys().next().value;
      if (oldestKey) this.stickerCache.delete(oldestKey);
    }
    return `/api/stickers/${id}.webp`;
  }
  storeHdMedia(buffer, mimeType, fileName, ttlMs) {
    const id = `hd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.hdMediaCache.set(id, { buffer, mimeType, fileName });
    if (ttlMs && ttlMs > 0) {
      const timer = setTimeout(() => {
        this.hdMediaCache.delete(id);
      }, ttlMs);
      timer.unref?.();
    }
    const maxItems = 8;
    const maxTotalBytes = 36 * 1024 * 1024;
    let totalBytes = 0;
    for (const item of this.hdMediaCache.values()) {
      totalBytes += item.buffer.length;
    }
    while (this.hdMediaCache.size > 1 && (this.hdMediaCache.size > maxItems || totalBytes > maxTotalBytes)) {
      const oldestKey = this.hdMediaCache.keys().next().value;
      if (!oldestKey) break;
      const evicted = this.hdMediaCache.get(oldestKey);
      if (evicted) totalBytes -= evicted.buffer.length;
      this.hdMediaCache.delete(oldestKey);
    }
    return `/api/hd-media/${id}`;
  }
};
var botStore = new BotStateStore();

// server/autoResponder.ts
function evaluateAutoResponder(text, context) {
  const rules = botStore.config.autoResponder || [];
  const normalized = text.trim();
  const lower = normalized.toLowerCase();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.scope === "private_only" && context.isGroup) continue;
    if (rule.scope === "group_only" && !context.isGroup) continue;
    let isMatch = false;
    const ruleTrigger = rule.trigger.trim();
    const ruleLower = ruleTrigger.toLowerCase();
    if (rule.matchType === "exact") {
      isMatch = lower === ruleLower;
    } else if (rule.matchType === "contains") {
      isMatch = lower.includes(ruleLower);
    } else if (rule.matchType === "regex") {
      try {
        const re = new RegExp(ruleTrigger, "i");
        isMatch = re.test(normalized);
      } catch {
        isMatch = false;
      }
    }
    if (isMatch) {
      rule.hitCount = (rule.hitCount || 0) + 1;
      botStore.saveToDisk();
      botStore.broadcast("config:update", botStore.config);
      const now = /* @__PURE__ */ new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")} WIB`;
      let reply = rule.replyText.replace(/\{sender\}/gi, `@${context.senderPhone}`).replace(/\{senderName\}/gi, context.senderName || context.senderPhone).replace(/\{botName\}/gi, botStore.config.botName).replace(/\{prefix\}/gi, botStore.config.prefix).replace(/\{groupName\}/gi, context.groupName || "Grup WhatsApp").replace(/\{time\}/gi, timeStr);
      return {
        matched: true,
        replyText: reply,
        ruleId: rule.id,
        trigger: rule.trigger
      };
    }
  }
  return { matched: false };
}

// server/mediaDownloader.ts
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
var execFileAsync2 = promisify2(execFile2);
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var BOT_UA = "TelegramBot (like TwitterBot)";
var TIKTOK_APP_UA = "com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)";
var TIOO_BASE = "https://backend1.tioo.eu.org";
var TIOO_VERSION = "6.4.0";
function cleanExtractedUrl(raw) {
  return raw.replace(/[),.;!?\]>]+$/g, "").trim();
}
function extractFirstUrl(text) {
  if (!text) return null;
  const fullMatch = text.match(/https?:\/\/[^\s<>"]+/i);
  if (fullMatch) {
    return cleanExtractedUrl(fullMatch[0]);
  }
  const bareMatch = text.match(
    /\b((?:www\.|vt\.|vm\.|m\.|mobile\.)?(?:tiktok\.com|instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.com|twitter\.com|x\.com|t\.co|pinterest\.[a-z.]+|pin\.it|capcut\.com|mediafire\.com|youtube\.com|youtu\.be)\/[^\s<>"]+)/i
  );
  if (bareMatch?.[1]) {
    return `https://${cleanExtractedUrl(bareMatch[1])}`;
  }
  return null;
}
function detectPlatformFromUrl(url) {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com") || lower.includes("vt.tiktok") || lower.includes("vm.tiktok")) {
    return "tiktok";
  }
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) {
    return "instagram";
  }
  if (lower.includes("facebook.com") || lower.includes("fb.watch") || lower.includes("fb.com")) {
    return "facebook";
  }
  if (lower.includes("twitter.com") || lower.includes("x.com") || lower.includes("t.co/") || lower.includes("fxtwitter.com") || lower.includes("vxtwitter.com")) {
    return "twitter";
  }
  if (lower.includes("pinterest.") || lower.includes("pin.it")) {
    return "pinterest";
  }
  if (lower.includes("capcut.com")) {
    return "capcut";
  }
  if (lower.includes("mediafire.com")) {
    return "mediafire";
  }
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return "youtube";
  }
  return "social";
}
function resolveTikwmUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return void 0;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) {
    return `https://www.tikwm.com${rawUrl}`;
  }
  return `https://www.tikwm.com/${rawUrl}`;
}
function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\u0025/g, "%").replace(/\\u0026/g, "&").replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
}
function unwrapProxyCdnUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return void 0;
  const bicIdx = rawUrl.indexOf("/api/cdn/");
  if (bicIdx !== -1) {
    const b64 = rawUrl.slice(bicIdx + "/api/cdn/".length).split(/[?&]/)[0];
    if (b64) {
      try {
        const decoded = Buffer.from(b64, "base64").toString("utf8").trim();
        if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
          return decoded;
        }
      } catch {
      }
    }
  }
  return rawUrl;
}
async function fetchTiooEndpoint(endpoint, urlOrQuery, timeoutMs = 14e3) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const target = new URL(`${TIOO_BASE}/${endpoint}`);
      target.searchParams.set("url", urlOrQuery);
      const res = await fetch(target, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": `btch/${TIOO_VERSION}`,
          "X-Client-Version": TIOO_VERSION
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        continue;
      }
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  }
  return null;
}
async function resolveFinalUrl(url, timeoutMs = 8e3) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    res.body?.cancel().catch(() => {
    });
    return res.url || url;
  } catch {
    return url;
  }
}
async function fetchOembedMetadata(url) {
  try {
    const oembedEndpoint = url.includes("youtube.com") || url.includes("youtu.be") ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json` : `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedEndpoint, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6e3)
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    return json;
  } catch {
    return null;
  }
}
function randomNumericDigits(len) {
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}
function randomHexChars(len) {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += hex[Math.floor(Math.random() * hex.length)];
  }
  return out;
}
function extractAwemeIdFromTikTokUrl(rawUrl) {
  const pathIdMatch = rawUrl.match(
    /(?:\/(?:video|photo|v|embed)\/|[?&](?:item_id|share_item_id)=)(\d{17,21})/i
  );
  if (pathIdMatch?.[1]) return pathIdMatch[1];
  const fallbackDigits = rawUrl.match(/\b(\d{18,21})\b/);
  return fallbackDigits?.[1] || null;
}
function decodeTikTokIoTokenTarget(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const token = parsed.searchParams.get("token");
    if (!token || token.length < 16) return "";
    const cleanedB64 = ("aHR0" + token.slice(8)).replace(/(?:O0O0O)+$/g, "");
    return Buffer.from(cleanedB64, "base64").toString("utf8");
  } catch {
    return "";
  }
}
function isLikelyTikTokSlideAsset(rawUrl) {
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(rawUrl)) return true;
  if (/photomode/i.test(rawUrl)) return true;
  const decoded = decodeTikTokIoTokenTarget(rawUrl);
  if (decoded) {
    if (/photomode/i.test(decoded)) return true;
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(decoded)) return true;
  }
  return false;
}
async function downloadTikTokMedia(url) {
  let resolvedUrl = url;
  let awemeId = extractAwemeIdFromTikTokUrl(url);
  if (!awemeId || /\/\/(?:vt|vm|t)\.tiktok\.com\//i.test(url) || /tiktok\.com\/t\//i.test(url)) {
    resolvedUrl = await resolveFinalUrl(url, 8500);
    awemeId = extractAwemeIdFromTikTokUrl(resolvedUrl) || awemeId;
  }
  const urlIndicatesPhotoSlide = /\/photo\/\d+/i.test(resolvedUrl) || /\/photo\/\d+/i.test(url);
  if (awemeId) {
    const feedHosts = [
      "https://api16-normal-useast5.tiktokv.us",
      "https://api16-normal-c-useast1a.tiktokv.com"
    ];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const host = feedHosts[attempt % feedHosts.length];
      try {
        const params = new URLSearchParams({
          aweme_id: awemeId,
          version_name: "1.1.9",
          version_code: "2018111632",
          build_number: "1.1.9",
          device_id: `73${randomNumericDigits(17)}`,
          iid: `73${randomNumericDigits(17)}`,
          manifest_version_code: "2018111632",
          update_version_code: "2018111632",
          openudid: randomHexChars(16),
          uuid: randomNumericDigits(16),
          _rticket: String(Date.now() * 1e3),
          ts: String(Math.floor(Date.now() / 1e3)),
          device_brand: "Google",
          device_type: "Pixel 4",
          device_platform: "android",
          resolution: "1080*1920",
          dpi: "420",
          os_version: "10",
          os_api: "29",
          carrier_region: "ID",
          sys_region: "ID",
          region: "ID",
          timezone_name: "Asia/Jakarta",
          timezone_offset: "25200",
          channel: "googleplay",
          ac: "wifi",
          mcc_mnc: "51010",
          is_my_cn: "0",
          ssmix: "a",
          as: "a1qwert123",
          cp: "cbfhckdckkde1"
        });
        const feedRes = await fetch(`${host}/aweme/v1/feed/?${params.toString()}`, {
          method: "OPTIONS",
          headers: { "User-Agent": TIKTOK_APP_UA },
          signal: AbortSignal.timeout(9e3)
        });
        if (feedRes.ok) {
          const feedJson = await feedRes.json();
          const content = feedJson?.aweme_list?.find(
            (item) => String(item?.aweme_id) === awemeId
          );
          if (content) {
            const authorHandle = content.author?.unique_id ? `@${content.author.unique_id}` : content.author?.nickname || "Kreator TikTok";
            const musicUrls = Array.isArray(content.music?.play_url?.url_list) ? content.music.play_url.url_list.filter(
              (u) => typeof u === "string" && u.startsWith("http")
            ) : [];
            const descText = typeof content.desc === "string" ? content.desc.trim() : "";
            const rawSlideItems = content.image_post_info?.images;
            if (Array.isArray(rawSlideItems) && rawSlideItems.length > 0) {
              const primarySlides = [];
              const fallbackSlides = [];
              for (const slideObj of rawSlideItems.slice(0, 35)) {
                const cleanUrls = Array.isArray(
                  slideObj?.display_image?.url_list
                ) ? slideObj.display_image.url_list.filter(
                  (u) => typeof u === "string" && u.startsWith("http")
                ) : [];
                const wmUrls = Array.isArray(
                  slideObj?.owner_watermark_image?.url_list
                ) ? slideObj.owner_watermark_image.url_list.filter(
                  (u) => typeof u === "string" && u.startsWith("http")
                ) : [];
                const allForSlide = [...cleanUrls, ...wmUrls];
                if (allForSlide.length === 0) continue;
                const preferredJpeg = cleanUrls.find((u) => /\.jpe?g(\?|$)/i.test(u)) || cleanUrls.find((u) => /\.png(\?|$)/i.test(u)) || allForSlide[0];
                const backups = allForSlide.filter((u) => u !== preferredJpeg);
                primarySlides.push(preferredJpeg);
                fallbackSlides.push(backups);
              }
              if (primarySlides.length > 0) {
                return {
                  platform: "tiktok",
                  title: descText || `Album Slide Foto TikTok (${primarySlides.length} Foto)`,
                  author: authorHandle,
                  slideImages: primarySlides,
                  slideFallbackImageUrls: fallbackSlides,
                  audioUrl: musicUrls[0],
                  fallbackAudioUrls: musicUrls.slice(1),
                  coverUrl: primarySlides[0]
                };
              }
            }
            const playUrls = Array.isArray(content.video?.play_addr?.url_list) ? content.video.play_addr.url_list.filter(
              (u) => typeof u === "string" && u.startsWith("http")
            ) : [];
            const dlUrls = Array.isArray(content.video?.download_addr?.url_list) ? content.video.download_addr.url_list.filter(
              (u) => typeof u === "string" && u.startsWith("http")
            ) : [];
            const allVideoCandidates = [...playUrls, ...dlUrls];
            if (allVideoCandidates.length > 0 && !urlIndicatesPhotoSlide) {
              return {
                platform: "tiktok",
                title: descText || "Video TikTok Tanpa Watermark",
                author: authorHandle,
                duration: content.video?.duration ? Math.round(Number(content.video.duration) / 1e3) || Number(content.video.duration) : void 0,
                videoUrl: allVideoCandidates[0],
                fallbackVideoUrls: allVideoCandidates.slice(1),
                audioUrl: musicUrls[0],
                fallbackAudioUrls: musicUrls.slice(1),
                coverUrl: content.video?.cover?.url_list?.[0]
              };
            }
          }
        }
      } catch {
      }
    }
  }
  const tioo = await fetchTiooEndpoint("ttdl", resolvedUrl || url);
  if (tioo && tioo.status !== false) {
    const rawMediaEntries = Array.isArray(tioo.images) && tioo.images.length > 0 ? tioo.images : Array.isArray(tioo.video) ? tioo.video : [tioo.video];
    const mediaUrls = rawMediaEntries.map(
      (v) => typeof v === "string" ? v : typeof v?.url === "string" ? v.url : ""
    ).filter((v) => v.startsWith("http"));
    const audios = (Array.isArray(tioo.audio) ? tioo.audio : [tioo.audio]).map(
      (a) => typeof a === "string" ? a : typeof a?.url === "string" ? a.url : ""
    ).filter((a) => a.startsWith("http"));
    const thumbIsPhotomode = typeof tioo.thumbnail === "string" && /photomode/i.test(tioo.thumbnail);
    const slideDetected = Array.isArray(tioo.images) && tioo.images.length > 0 ? true : urlIndicatesPhotoSlide || thumbIsPhotomode || mediaUrls.length > 0 && mediaUrls.every((u) => isLikelyTikTokSlideAsset(u)) || mediaUrls.length > 1 && mediaUrls.some((u) => isLikelyTikTokSlideAsset(u));
    if (slideDetected && mediaUrls.length > 0) {
      const orderedSlides = mediaUrls.slice(0, 35);
      return {
        platform: "tiktok",
        title: typeof tioo.title === "string" && tioo.title.trim() || `Album Slide Foto TikTok (${orderedSlides.length} Foto)`,
        author: tioo.author || "Kreator TikTok",
        slideImages: orderedSlides,
        audioUrl: audios[0],
        fallbackAudioUrls: audios.slice(1),
        coverUrl: tioo.thumbnail || orderedSlides[0]
      };
    }
    if (mediaUrls[0]) {
      return {
        platform: "tiktok",
        title: typeof tioo.title === "string" && tioo.title.trim() || "Video TikTok Tanpa Watermark",
        author: tioo.author || "Kreator TikTok",
        videoUrl: mediaUrls[0],
        fallbackVideoUrls: mediaUrls.slice(1),
        audioUrl: audios[0],
        fallbackAudioUrls: audios.slice(1),
        coverUrl: tioo.thumbnail
      };
    }
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const form = new URLSearchParams({ url: resolvedUrl || url, hd: "1" });
      const res = await fetch("https://www.tikwm.com/api/", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://www.tikwm.com",
          Referer: "https://www.tikwm.com/"
        },
        body: form,
        signal: AbortSignal.timeout(1e4)
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.code === -1 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1150));
          continue;
        }
        if (payload.code === 0 && payload.data) {
          const d = payload.data;
          const slideImages = Array.isArray(d.images) ? d.images.map((img) => resolveTikwmUrl(img)).filter((u) => Boolean(u)).slice(0, 35) : void 0;
          const playUrl = resolveTikwmUrl(d.play);
          const hdUrl = resolveTikwmUrl(d.hdplay);
          const wmUrl = resolveTikwmUrl(d.wmplay);
          const candidates = [playUrl, hdUrl, wmUrl].filter(
            (u) => Boolean(u)
          );
          const videoUrl = slideImages && slideImages.length > 0 ? void 0 : candidates[0];
          const audioUrl = resolveTikwmUrl(d.music || d.music_info?.play);
          if (videoUrl || slideImages && slideImages.length > 0) {
            return {
              platform: "tiktok",
              title: d.title?.trim() || (slideImages?.length ? `Album Slide Foto TikTok (${slideImages.length} Foto)` : "Video TikTok Tanpa Watermark"),
              author: d.author?.unique_id ? `@${d.author.unique_id}` : d.author?.nickname || "Kreator TikTok",
              duration: d.duration,
              videoUrl,
              fallbackVideoUrls: candidates.slice(1),
              audioUrl,
              slideImages,
              coverUrl: resolveTikwmUrl(d.cover)
            };
          }
        }
      }
      break;
    } catch {
      break;
    }
  }
  try {
    const pathMatch = resolvedUrl.match(
      /tiktok\.com\/(@[^/?#]+\/(?:video|photo)\/[0-9]+)/i
    );
    if (pathMatch?.[1]) {
      const vxRes = await fetch(`https://tnktok.com/${pathMatch[1]}`, {
        headers: { "User-Agent": BOT_UA },
        redirect: "follow",
        signal: AbortSignal.timeout(1e4)
      });
      if (vxRes.ok) {
        const html = await vxRes.text();
        const descMatch = html.match(
          /property=["']og:description["']\s+content=["']([^"']+)["']/i
        ) || html.match(
          /content=["']([^"']+)["']\s+property=["']og:description/i
        );
        const authorTag = `@${pathMatch[1].split("/")[0].replace(/^@/, "")}`;
        if (urlIndicatesPhotoSlide) {
          const ogImgs = [
            ...html.matchAll(
              /property=["']og:image["']\s+content=["']([^"']+)["']|content=["']([^"']+)["']\s+property=["']og:image["']/gi
            )
          ].map((m) => decodeHtmlEntities(m[1] || m[2] || "")).filter((u) => u.startsWith("http"));
          if (ogImgs.length > 0) {
            return {
              platform: "tiktok",
              title: descMatch?.[1] ? decodeHtmlEntities(descMatch[1]).slice(0, 100) : `Album Slide Foto TikTok (${ogImgs.length} Foto)`,
              author: authorTag,
              slideImages: ogImgs.slice(0, 35)
            };
          }
        }
        const vidMatch = html.match(
          /property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i
        ) || html.match(/content=["']([^"']+)["']\s+property=["']og:video/i);
        const rawVid = vidMatch?.[1] ? decodeHtmlEntities(vidMatch[1]) : void 0;
        if (rawVid && rawVid.startsWith("http")) {
          return {
            platform: "tiktok",
            title: descMatch?.[1] ? decodeHtmlEntities(descMatch[1]).slice(0, 100) : "Video TikTok Tanpa Watermark",
            author: authorTag,
            videoUrl: rawVid
          };
        }
      }
    }
  } catch {
  }
  throw new Error(
    "Tidak dapat mengambil media TikTok saat ini (pastikan tautan video/slide bersifat publik)."
  );
}
async function extractInstagramPath(rawUrl) {
  const direct = rawUrl.match(
    /instagram\.com\/(?:[^/?#]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  if (direct) {
    const rawKind = direct[1].toLowerCase();
    const kind = rawKind === "reels" ? "reel" : rawKind;
    return { kind, shortcode: direct[2] };
  }
  const resolved = await resolveFinalUrl(rawUrl);
  const after = resolved.match(
    /instagram\.com\/(?:[^/?#]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  if (after) {
    const rawKind = after[1].toLowerCase();
    const kind = rawKind === "reels" ? "reel" : rawKind;
    return { kind, shortcode: after[2] };
  }
  return null;
}
async function downloadInstagramMedia(url) {
  const parsed = await extractInstagramPath(url);
  if (!parsed) {
    throw new Error(
      "Format tautan Instagram tidak dikenali. Gunakan tautan Reels atau Postingan publik."
    );
  }
  const { kind, shortcode } = parsed;
  const igPath = `/${kind}/${shortcode}/`;
  const [kkSettled, eeSettled, vxSettled] = await Promise.allSettled([
    fetch(`https://kkinstagram.com${igPath}`, {
      headers: { "User-Agent": BOT_UA },
      redirect: "manual",
      signal: AbortSignal.timeout(1e4)
    }),
    fetch(`https://eeinstagram.com${igPath}`, {
      headers: { "User-Agent": BOT_UA },
      redirect: "manual",
      signal: AbortSignal.timeout(1e4)
    }),
    fetch(`https://vxinstagram.com${igPath}`, {
      headers: { "User-Agent": BOT_UA },
      redirect: "manual",
      signal: AbortSignal.timeout(1e4)
    })
  ]);
  let caption = "";
  let author = "Instagram";
  const videoCandidates = [];
  const imageCandidates = [];
  if (eeSettled.status === "fulfilled") {
    const res = eeSettled.value;
    const loc = res.headers.get("location");
    if (loc && loc.startsWith("http")) {
      if (loc.includes(".mp4") || kind === "reel") videoCandidates.push(loc);
      else imageCandidates.push(loc);
    } else if (res.ok) {
      const html = await res.text();
      const descM = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["']\s+property=["']og:description/i);
      const titleM = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["']\s+property=["']og:title/i);
      if (descM?.[1]) caption = decodeHtmlEntities(descM[1]).trim();
      if (titleM?.[1] && !titleM[1].toLowerCase().includes("instagram")) {
        author = decodeHtmlEntities(titleM[1]).trim();
      }
      const vidM = html.match(/property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["']\s+property=["']og:video/i);
      if (vidM?.[1]) {
        const vUrl = vidM[1].startsWith("/") ? `https://eeinstagram.com${vidM[1]}` : decodeHtmlEntities(vidM[1]);
        if (vUrl.startsWith("http") && !vUrl.includes("/videos/" + shortcode)) {
          videoCandidates.push(vUrl);
        }
      }
    }
  }
  if (kkSettled.status === "fulfilled") {
    const res = kkSettled.value;
    const loc = res.headers.get("location");
    if (loc && loc.startsWith("http")) {
      const cleanLoc = decodeHtmlEntities(loc);
      const isVideoCdn = /\.mp4(\?|$)/i.test(cleanLoc) || cleanLoc.includes("/o1/v/") || cleanLoc.includes("video_dashinit");
      if (isVideoCdn) {
        videoCandidates.unshift(cleanLoc);
      } else {
        imageCandidates.unshift(cleanLoc);
      }
    } else if (res.ok) {
      const html = await res.text();
      const vidM = html.match(
        /property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i
      );
      if (vidM?.[1]?.startsWith("http")) {
        videoCandidates.push(decodeHtmlEntities(vidM[1]));
      }
      const imgs = [
        ...html.matchAll(
          /property=["']og:image["']\s+content=["']([^"']+)["']/gi
        )
      ].map((m) => decodeHtmlEntities(m[1])).filter((u) => u.startsWith("http"));
      imageCandidates.push(...imgs);
    }
  }
  if (vxSettled.status === "fulfilled") {
    const res = vxSettled.value;
    const loc = res.headers.get("location");
    if (loc && loc.startsWith("http")) {
      if (loc.includes(".mp4")) videoCandidates.push(loc);
      else imageCandidates.push(loc);
    } else if (res.ok) {
      const html = await res.text();
      const authorM = html.match(
        /name=["']twitter:title["']\s+content=["']([^"']+)["']/i
      );
      if (authorM?.[1] && author === "Instagram") {
        author = decodeHtmlEntities(authorM[1]).trim();
      }
      const vidM = html.match(/property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["']\s+property=["']og:video/i);
      if (vidM?.[1]?.startsWith("http")) {
        const cleanV = decodeHtmlEntities(vidM[1]);
        if (cleanV.endsWith(".mp4") || kind === "reel") {
          videoCandidates.push(cleanV);
        } else {
          imageCandidates.push(cleanV);
        }
      }
      const imgs = [
        ...html.matchAll(
          /property=["']og:image["']\s+content=["']([^"']+)["']/gi
        )
      ].map((m) => decodeHtmlEntities(m[1])).filter((u) => u.startsWith("http") && !u.endsWith(".mp4"));
      imageCandidates.push(...imgs);
    }
  }
  const uniqueVideos = [...new Set(videoCandidates)];
  const uniqueImages = [...new Set(imageCandidates)];
  const cleanTitle = caption.split("\n")[0]?.slice(0, 100) || (kind === "reel" ? "Instagram Reels" : "Postingan Instagram");
  if (uniqueVideos.length > 0) {
    return {
      platform: "instagram",
      title: cleanTitle,
      author,
      videoUrl: uniqueVideos[0],
      fallbackVideoUrls: uniqueVideos.slice(1)
    };
  }
  if (uniqueImages.length > 1) {
    return {
      platform: "instagram",
      title: cleanTitle,
      author,
      slideImages: uniqueImages.slice(0, 8)
    };
  }
  if (uniqueImages.length === 1) {
    return {
      platform: "instagram",
      title: cleanTitle,
      author,
      imageUrl: uniqueImages[0]
    };
  }
  throw new Error(
    "Tidak dapat mengekstrak media Instagram (pastikan akun/postingan bersifat publik dan tidak dibatasi usia)."
  );
}
async function downloadFacebookMedia(rawUrl) {
  const canonicalUrl = rawUrl.includes("fb.watch") || rawUrl.includes("/share/") ? await resolveFinalUrl(rawUrl) : rawUrl;
  try {
    const res = await fetch(canonicalUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12e3)
    });
    if (res.ok) {
      const html = await res.text();
      const extractFbField = (patterns) => {
        for (const pat of patterns) {
          const m = html.match(pat);
          if (m?.[1]) {
            const decoded = decodeHtmlEntities(
              JSON.parse(`"${m[1].replace(/"/g, '\\"')}"`)
            );
            if (decoded.startsWith("http")) return decoded;
          }
        }
        return void 0;
      };
      const hdUrl = extractFbField([
        /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
        /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
        /hd_src\s*:\s*"([^"]+)"/
      ]);
      const sdUrl = extractFbField([
        /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
        /"playable_url"\s*:\s*"([^"]+)"/,
        /sd_src\s*:\s*"([^"]+)"/
      ]);
      const titleMatch = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const candidates = [hdUrl, sdUrl].filter((u) => Boolean(u));
      if (candidates.length > 0) {
        return {
          platform: "facebook",
          title: titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]).slice(0, 100) : "Video Facebook",
          author: "Facebook Watch / Reels",
          videoUrl: candidates[0],
          fallbackVideoUrls: candidates.slice(1)
        };
      }
    }
  } catch {
  }
  try {
    const res = await fetch(
      `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(
        canonicalUrl
      )}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12e3)
      }
    );
    if (res.ok) {
      const json = await res.json();
      const downloads = (json.data?.downloads || []).map((d) => d.url).filter((u) => Boolean(u && u.startsWith("http")));
      if (json.data?.url?.startsWith("http")) {
        downloads.push(json.data.url);
      }
      if (downloads.length > 0) {
        return {
          platform: "facebook",
          title: json.data?.title || "Video Facebook",
          author: "Facebook",
          videoUrl: downloads[0],
          fallbackVideoUrls: downloads.slice(1),
          coverUrl: json.data?.thumbnail
        };
      }
    }
  } catch {
  }
  const tioo = await fetchTiooEndpoint("fbdown", canonicalUrl);
  if (tioo) {
    const candidates = [tioo.HD, tioo.Normal_video, tioo.url].flat().filter((u) => typeof u === "string" && u.startsWith("http"));
    if (candidates.length > 0) {
      return {
        platform: "facebook",
        title: tioo.title || "Video Facebook",
        author: "Facebook",
        videoUrl: candidates[0],
        fallbackVideoUrls: candidates.slice(1)
      };
    }
  }
  throw new Error(
    "Tidak dapat mengekstrak video Facebook (pastikan video/Reels bersifat publik)."
  );
}
async function downloadTwitterMedia(rawUrl) {
  const targetUrl = rawUrl.includes("t.co/") ? await resolveFinalUrl(rawUrl) : rawUrl;
  const match = targetUrl.match(
    /(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com)\/(?:([^/?#]+)\/status|i\/web\/status|i\/status)\/([0-9]+)/i
  );
  if (!match) {
    throw new Error("Format tautan cuitan X/Twitter tidak valid.");
  }
  const user = match[1] || "i";
  const statusId = match[2];
  try {
    const fxRes = await fetch(
      `https://api.fxtwitter.com/${user}/status/${statusId}`,
      {
        headers: { "User-Agent": "WABot/2.0", Accept: "application/json" },
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (fxRes.ok) {
      const fx = await fxRes.json();
      const t = fx.tweet;
      if (t) {
        const vid = t.media?.videos?.[0];
        const sortedVariants = (vid?.variants || []).filter(
          (v) => v.url?.startsWith("http") && (!v.content_type || v.content_type.includes("mp4"))
        ).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)).map((v) => v.url);
        const vidCandidates = [
          ...vid?.url ? [vid.url] : [],
          ...sortedVariants
        ].filter((u, idx, arr) => arr.indexOf(u) === idx);
        const photos = (t.media?.photos || []).map((p) => p.url).filter((u) => Boolean(u && u.startsWith("http")));
        if (vidCandidates.length > 0 || photos.length > 0) {
          return {
            platform: "twitter",
            title: t.text?.trim().slice(0, 100) || "Media Cuitan X / Twitter",
            author: t.author?.screen_name ? `@${t.author.screen_name}` : t.author?.name || "Pengguna X",
            duration: vid?.duration ? Math.round(vid.duration) : void 0,
            videoUrl: vidCandidates[0],
            fallbackVideoUrls: vidCandidates.slice(1),
            imageUrl: vidCandidates.length === 0 && photos.length === 1 ? photos[0] : void 0,
            slideImages: vidCandidates.length === 0 && photos.length > 1 ? photos.slice(0, 8) : void 0,
            coverUrl: vid?.thumbnail_url
          };
        }
      }
    }
  } catch {
  }
  const tioo = await fetchTiooEndpoint("twitter", targetUrl);
  if (tioo && Array.isArray(tioo.url) && tioo.url.length > 0) {
    const urls = [];
    for (const item of tioo.url) {
      if (typeof item === "string" && item.startsWith("http")) {
        urls.push(item);
      } else if (item && typeof item === "object") {
        const candidate = item.hd || item.sd || item.url || item.image;
        if (typeof candidate === "string" && candidate.startsWith("http")) {
          urls.push(candidate);
        }
      }
    }
    if (urls.length > 0) {
      const isImg = /\.(jpe?g|png|webp)(\?|$)/i.test(urls[0]);
      return {
        platform: "twitter",
        title: tioo.title?.slice(0, 100) || "Media Cuitan X / Twitter",
        author: user !== "i" ? `@${user}` : "Pengguna X",
        videoUrl: isImg ? void 0 : urls[0],
        fallbackVideoUrls: isImg ? void 0 : urls.slice(1),
        imageUrl: isImg && urls.length === 1 ? urls[0] : void 0,
        slideImages: isImg && urls.length > 1 ? urls.slice(0, 8) : void 0
      };
    }
  }
  throw new Error(
    "Tidak dapat mengambil media dari cuitan X/Twitter tersebut (pastikan cuitan berisi foto/video publik)."
  );
}
function extractYouTubeVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m?.[1]) return m[1];
  }
  return null;
}
async function convertViaNoTube(canonicalYtUrl, format) {
  const mirrors = ["s64.notube.net", "s62.notube.net", "s65.notube.net"];
  for (const mirror of mirrors) {
    try {
      const step1 = await fetch(`https://${mirror}/recover_weight.php`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://notube.net",
          Referer: "https://notube.net/"
        },
        body: new URLSearchParams({
          url: canonicalYtUrl,
          format,
          lang: "en",
          subscribed: "false"
        }),
        signal: AbortSignal.timeout(14e3)
      });
      if (!step1.ok) continue;
      const j1 = await step1.json();
      if (!j1.token) continue;
      await fetch(`https://${mirror}/recover_file.php?lang=en`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://notube.net",
          Referer: "https://notube.net/"
        },
        body: new URLSearchParams({
          url: canonicalYtUrl,
          format,
          name_mp4: j1.name_mp4 || "",
          lang: "en",
          token: j1.token,
          subscribed: "false",
          playlist: "false",
          adblock: "false"
        }),
        signal: AbortSignal.timeout(22e3)
      }).catch(() => {
      });
      const step3 = await fetch(
        `https://notube.net/en/download?token=${encodeURIComponent(j1.token)}`,
        {
          headers: { "User-Agent": UA, Referer: "https://notube.net/" },
          signal: AbortSignal.timeout(12e3)
        }
      );
      if (!step3.ok) continue;
      const html = await step3.text();
      const dlMatch = html.match(
        /href=["'](https?:\/\/s[0-9]+\.notube\.net\/download\.php\?token=[^"']+)["']/i
      ) || html.match(
        /https?:\/\/s[0-9]+\.notube\.net\/download\.php\?[^\s"'<>]+/i
      );
      const dlUrl = dlMatch ? dlMatch[1] || dlMatch[0] : null;
      if (dlUrl) {
        const cleanTitle = j1.titre_mp4 ? decodeURIComponent(j1.titre_mp4.replace(/\+/g, " ")) : void 0;
        return { downloadUrl: decodeHtmlEntities(dlUrl), title: cleanTitle };
      }
    } catch {
    }
  }
  return null;
}
async function tryLocalYtDlpUrl(canonicalYtUrl, audioOnly) {
  try {
    const fmt = audioOnly ? "bestaudio[filesize<30M]/best[filesize<30M]/bestaudio" : "best[ext=mp4][height<=720][filesize<32M]/best[ext=mp4]/best";
    const { stdout } = await execFileAsync2(
      "yt-dlp",
      ["--no-playlist", "--no-warnings", "-f", fmt, "-j", canonicalYtUrl],
      { timeout: 18e3, maxBuffer: 4 * 1024 * 1024 }
    );
    const info = JSON.parse(stdout.trim().split("\n")[0]);
    if (info?.url?.startsWith("http")) {
      return {
        url: info.url,
        title: info.title,
        uploader: info.uploader,
        duration: info.duration
      };
    }
  } catch {
  }
  return null;
}
async function downloadYouTubeMedia(rawUrl, options) {
  const videoId = extractYouTubeVideoId(rawUrl);
  const canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
  const wantAudioOnly = Boolean(options?.audioOnly);
  const [oembed, notube] = await Promise.all([
    fetchOembedMetadata(canonicalUrl),
    convertViaNoTube(canonicalUrl, wantAudioOnly ? "mp3" : "mp4")
  ]);
  if (notube?.downloadUrl) {
    return {
      platform: "youtube",
      title: oembed?.title || notube.title || "Video YouTube",
      author: oembed?.author_name || "YouTube",
      videoUrl: wantAudioOnly ? void 0 : notube.downloadUrl,
      audioUrl: wantAudioOnly ? notube.downloadUrl : void 0,
      coverUrl: oembed?.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : void 0)
    };
  }
  const ytdlp = await tryLocalYtDlpUrl(canonicalUrl, wantAudioOnly);
  if (ytdlp) {
    return {
      platform: "youtube",
      title: ytdlp.title || oembed?.title || "Media YouTube",
      author: ytdlp.uploader || oembed?.author_name || "YouTube",
      duration: ytdlp.duration,
      videoUrl: wantAudioOnly ? void 0 : ytdlp.url,
      audioUrl: wantAudioOnly ? ytdlp.url : void 0
    };
  }
  throw new Error(
    "Server pengunduh YouTube sedang sibuk atau durasi video terlalu panjang (gunakan video publik berdurasi wajar)."
  );
}
async function downloadPinterestMedia(url) {
  const tioo = await fetchTiooEndpoint("pinterest", url);
  if (tioo?.result) {
    const r = tioo.result;
    const vidUrl = r.video_url || r.videos?.video_list?.V_720P?.url || r.videos?.video_list?.V_HLSV4?.url;
    const imgUrl = r.images?.orig?.url || r.image || (Array.isArray(r.images) ? r.images[0] : void 0);
    if (typeof vidUrl === "string" && vidUrl.startsWith("http") || typeof imgUrl === "string" && imgUrl.startsWith("http")) {
      return {
        platform: "pinterest",
        title: r.title?.trim() || r.description?.trim().slice(0, 90) || "Pin Kreatif Pinterest",
        author: r.uploader?.full_name || r.pinner?.full_name || "Pinterest",
        videoUrl: typeof vidUrl === "string" && vidUrl.endsWith(".mp4") ? vidUrl : void 0,
        imageUrl: typeof imgUrl === "string" ? imgUrl : void 0
      };
    }
  }
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(12e3)
  });
  if (!res.ok) {
    throw new Error("Tidak dapat membuka halaman Pinterest tersebut.");
  }
  const html = await res.text();
  const titleMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );
  const videoMatch = html.match(/https:\/\/v1\.pinimg\.com\/videos\/[^\s"'<>]+\.mp4/i) || html.match(
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+\.mp4[^"']*)["']/i
  );
  const imgMatch = html.match(
    /https:\/\/i\.pinimg\.com\/originals\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/i
  ) || html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );
  const videoUrl = videoMatch ? videoMatch[1] || videoMatch[0] : void 0;
  const imageUrl = !videoUrl && imgMatch ? imgMatch[1] || imgMatch[0] : void 0;
  if (!videoUrl && !imageUrl) {
    throw new Error("Media publik tidak ditemukan pada tautan Pinterest ini.");
  }
  return {
    platform: "pinterest",
    title: titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : "Pin Kreatif Pinterest",
    author: "Pinterest",
    videoUrl,
    imageUrl
  };
}
async function downloadMediaFireFile(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(12e3)
    });
    if (res.ok) {
      const html = await res.text();
      let directUrl2 = html.match(
        /href=["'](https?:\/\/download[0-9]*\.mediafire\.com\/[^"']+)["']/i
      )?.[1] || "";
      if (!directUrl2) {
        const scrambled = html.match(/data-scrambled-url=["']([^"']+)["']/i)?.[1];
        if (scrambled) {
          const decoded = Buffer.from(scrambled, "base64").toString("utf8");
          if (decoded.startsWith("http")) directUrl2 = decoded;
        }
      }
      if (directUrl2) {
        const decodedName = decodeURIComponent(
          directUrl2.split("/").pop()?.split("?")[0] || "mediafire-file"
        );
        return {
          platform: "mediafire",
          title: decodedName,
          author: "MediaFire Cloud",
          fileUrl: directUrl2,
          fileName: decodedName,
          fileMimeType: "application/octet-stream"
        };
      }
    }
  } catch {
  }
  const tioo = await fetchTiooEndpoint("mediafire", url);
  const directUrl = tioo?.url || tioo?.result?.url;
  if (typeof directUrl === "string" && directUrl.startsWith("http")) {
    const fname = tioo?.filename || decodeURIComponent(directUrl.split("/").pop() || "mediafire-file");
    return {
      platform: "mediafire",
      title: fname,
      author: tioo?.owner || "MediaFire Cloud",
      fileUrl: directUrl,
      fileName: fname,
      fileMimeType: tioo?.mimetype || "application/octet-stream"
    };
  }
  throw new Error(
    "Tautan unduhan langsung MediaFire tidak ditemukan (pastikan file bersifat publik dan belum dihapus)."
  );
}
async function downloadCapCutMedia(url) {
  const tioo = await fetchTiooEndpoint("capcut", url);
  if (tioo) {
    const rawVid = tioo.originalVideoUrl || tioo.videoUrl || tioo.contentUrl || tioo.data?.originalVideoUrl;
    const unwrapped = unwrapProxyCdnUrl(rawVid);
    if (unwrapped && unwrapped.startsWith("http")) {
      return {
        platform: "capcut",
        title: tioo.title?.trim() || "Template CapCut Tanpa Watermark",
        author: tioo.author?.name || tioo.author || "Kreator CapCut",
        videoUrl: unwrapped,
        coverUrl: unwrapProxyCdnUrl(tioo.coverUrl)
      };
    }
  }
  const page = await fetch(url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(12e3)
  });
  if (page.ok) {
    const html = await page.text();
    const ssrVid = html.match(/"video_url"\s*:\s*"(https?:[^"]+)"/i)?.[1] || html.match(/https?:\/\/[^\s"'<>]+capcutvod[^\s"'<>]+/i)?.[0] || html.match(/https?:\/\/[^\s"'<>]+capcut[^\s"'<>]+\.mp4[^\s"'<>]*/i)?.[0];
    if (ssrVid) {
      const cleanVid = decodeHtmlEntities(ssrVid);
      const titleMatch = html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      );
      return {
        platform: "capcut",
        title: titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : "Template CapCut Tanpa Watermark",
        author: "CapCut",
        videoUrl: cleanVid
      };
    }
  }
  throw new Error(
    "Tidak dapat mengekstrak video dari tautan template CapCut tersebut."
  );
}
async function resolveSocialMedia(url, preferredPlatform, options) {
  const detected = preferredPlatform && preferredPlatform !== "auto" ? preferredPlatform : detectPlatformFromUrl(url);
  if (detected === "tiktok") {
    return downloadTikTokMedia(url);
  }
  if (detected === "instagram") {
    return downloadInstagramMedia(url);
  }
  if (detected === "facebook") {
    return downloadFacebookMedia(url);
  }
  if (detected === "twitter") {
    return downloadTwitterMedia(url);
  }
  if (detected === "pinterest") {
    return downloadPinterestMedia(url);
  }
  if (detected === "mediafire") {
    return downloadMediaFireFile(url);
  }
  if (detected === "capcut") {
    return downloadCapCutMedia(url);
  }
  if (detected === "youtube") {
    return downloadYouTubeMedia(url, options);
  }
  const redirected = await resolveFinalUrl(url);
  const redetected = detectPlatformFromUrl(redirected);
  if (redetected !== "social") {
    return resolveSocialMedia(redirected, redetected, options);
  }
  throw new Error(
    "Tautan tidak dikenali atau platform belum didukung. Gunakan tautan publik TikTok, Instagram, Facebook, X/Twitter, YouTube, Pinterest, CapCut, atau MediaFire."
  );
}
async function searchYouTubeTopVideo(query) {
  try {
    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": UA
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20250101.00.00",
              hl: "id",
              gl: "ID"
            }
          },
          query
        }),
        signal: AbortSignal.timeout(9e3)
      }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const idMatch = text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!idMatch?.[1]) return null;
    return { videoId: idMatch[1] };
  } catch {
    return null;
  }
}
async function searchAndDownloadPlay(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error("Masukkan judul lagu atau nama penyanyi.");
  }
  const [ytTask, itunesTask] = await Promise.allSettled([
    (async () => {
      const ytHit = await searchYouTubeTopVideo(`${cleanQuery} lyrics`);
      if (!ytHit?.videoId) return null;
      const ytUrl = `https://www.youtube.com/watch?v=${ytHit.videoId}`;
      const [oembed, notube] = await Promise.all([
        fetchOembedMetadata(ytUrl),
        convertViaNoTube(ytUrl, "mp3")
      ]);
      if (!notube?.downloadUrl) return null;
      return {
        title: oembed?.title || notube.title || cleanQuery,
        author: oembed?.author_name || "YouTube Music",
        audioUrl: notube.downloadUrl,
        coverUrl: oembed?.thumbnail_url || `https://i.ytimg.com/vi/${ytHit.videoId}/hqdefault.jpg`
      };
    })(),
    (async () => {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        cleanQuery
      )}&media=music&entity=song&limit=1`;
      const res = await fetch(itunesUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(1e4)
      });
      if (!res.ok) return null;
      const json = await res.json();
      const hit = json.results?.[0];
      if (!hit?.previewUrl) return null;
      return {
        title: hit.trackName || cleanQuery,
        author: hit.artistName || "Artis Musik",
        duration: 30,
        audioUrl: hit.previewUrl,
        coverUrl: hit.artworkUrl100?.replace("100x100", "600x600")
      };
    })()
  ]);
  const ytResult = ytTask.status === "fulfilled" ? ytTask.value : null;
  const itunesResult = itunesTask.status === "fulfilled" ? itunesTask.value : null;
  const audioCandidates = [ytResult?.audioUrl, itunesResult?.audioUrl].filter(
    (u) => Boolean(u)
  );
  if (audioCandidates.length > 0) {
    const metaTitle = itunesResult?.title || ytResult?.title || cleanQuery;
    const metaAuthor = itunesResult?.author || ytResult?.author || "Artis Musik";
    return {
      platform: "youtube",
      title: metaTitle,
      author: metaAuthor,
      duration: ytResult ? void 0 : itunesResult?.duration,
      audioUrl: audioCandidates[0],
      fallbackAudioUrls: audioCandidates.slice(1),
      coverUrl: itunesResult?.coverUrl || ytResult?.coverUrl
    };
  }
  try {
    const tikSearch = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(
      cleanQuery
    )}&count=3`;
    const res = await fetch(tikSearch, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      const payload = await res.json();
      const item = payload.data?.videos?.[0];
      const audioUrl = resolveTikwmUrl(
        item?.music_info?.play || item?.music || item?.play
      );
      if (audioUrl) {
        return {
          platform: "tiktok",
          title: item?.music_info?.title || item?.title || cleanQuery,
          author: item?.music_info?.author || item?.author?.nickname || "Pencarian Audio",
          duration: item?.duration,
          audioUrl
        };
      }
    }
  } catch {
  }
  throw new Error(`Lagu dengan kata kunci "${cleanQuery}" tidak ditemukan.`);
}
function buildCdnRequestHeaders(targetUrl) {
  const lower = targetUrl.toLowerCase();
  const headers = {
    "User-Agent": UA,
    Accept: "*/*"
  };
  if (lower.includes("tikwm.com")) {
    headers.Referer = "https://www.tikwm.com/";
  } else if (lower.includes("notube.net")) {
    headers.Referer = "https://notube.net/";
  } else if (lower.includes("tiktokio.com")) {
    headers.Referer = "https://tiktokio.com/";
  } else if (lower.includes("snapcdn.app")) {
    headers.Referer = "https://snapsave.app/";
  }
  return headers;
}
async function fetchRemoteBuffer(url, maxBytes = 35 * 1024 * 1024, fallbackUrls = []) {
  const candidates = [url, ...fallbackUrls].map((u) => unwrapProxyCdnUrl(u) || u).filter((u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx);
  let lastError = null;
  for (const candidateUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e4);
    try {
      const res = await fetch(candidateUrl, {
        headers: buildCdnRequestHeaders(candidateUrl),
        redirect: "follow",
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error(`Gagal mengunduh media (HTTP ${res.status})`);
      }
      const contentType = (res.headers.get("content-type") || "application/octet-stream").toLowerCase();
      if (contentType.includes("text/html")) {
        throw new Error(
          "Sumber media mengembalikan halaman proteksi HTML, bukan berkas media."
        );
      }
      const contentLength = Number(res.headers.get("content-length") || "0");
      if (contentLength > maxBytes) {
        throw new Error(
          "Ukuran file media melebihi batas pengiriman aman Anti-Ban bot (35 MB)."
        );
      }
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength < 256) {
        throw new Error("Berkas media dari server sumber kosong atau rusak.");
      }
      if (arrayBuf.byteLength > maxBytes) {
        throw new Error(
          "Ukuran file media melebihi batas pengiriman aman Anti-Ban bot (35 MB)."
        );
      }
      return {
        buffer: Buffer.from(arrayBuf),
        contentType
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Gagal mengunduh berkas media.");
      if (lastError.message.includes("35 MB")) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Gagal mengunduh media dari server sumber.");
}

// server/mediaProcessor.ts
import { execFile as execFile3 } from "node:child_process";
import fs7 from "node:fs/promises";
import os3 from "node:os";
import path5 from "node:path";
import { promisify as promisify3 } from "node:util";
import QRCode from "qrcode";
var execFileAsync3 = promisify3(execFile3);
async function withTempDir2(fn) {
  const dir = await fs7.mkdtemp(path5.join(os3.tmpdir(), "wabot-media-"));
  try {
    return await fn(dir);
  } finally {
    await fs7.rm(dir, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function applyImageFilter(imageBuffer, filter) {
  return applyImageFilterAdapter(imageBuffer, filter);
}
async function convertVideoToPtv(videoBuffer) {
  return withTempDir2(async (dir) => {
    const inPath = path5.join(dir, "input.mp4");
    const outPath = path5.join(dir, "ptv.mp4");
    await fs7.writeFile(inPath, videoBuffer);
    await execFileAsync3(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        inPath,
        "-t",
        "20",
        "-vf",
        "crop='min(iw,ih):min(iw,ih)',scale=480:480",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        outPath
      ],
      { timeout: 25e3 }
    );
    return fs7.readFile(outPath);
  });
}
async function extractOrConvertAudio(inputBuffer, target) {
  return withTempDir2(async (dir) => {
    const inPath = path5.join(dir, "input.media");
    await fs7.writeFile(inPath, inputBuffer);
    if (target === "vn") {
      const outPath2 = path5.join(dir, "out.ogg");
      await execFileAsync3(
        getFfmpegBin(),
        [
          "-y",
          "-i",
          inPath,
          "-vn",
          "-c:a",
          "libopus",
          "-b:a",
          "64k",
          "-vbr",
          "on",
          "-application",
          "voip",
          outPath2
        ],
        { timeout: 25e3 }
      );
      return {
        buffer: await fs7.readFile(outPath2),
        mimeType: "audio/ogg; codecs=opus",
        ext: "ogg"
      };
    }
    const outPath = path5.join(dir, "out.mp3");
    await execFileAsync3(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        inPath,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        outPath
      ],
      { timeout: 25e3 }
    );
    return {
      buffer: await fs7.readFile(outPath),
      mimeType: "audio/mpeg",
      ext: "mp3"
    };
  });
}
async function applyAudioEffect(inputBuffer, effect) {
  return withTempDir2(async (dir) => {
    const inPath = path5.join(dir, "input.media");
    const outPath = path5.join(dir, "effect.mp3");
    await fs7.writeFile(inPath, inputBuffer);
    let af = "volume=1.0";
    switch (effect) {
      case "bass":
        af = "equalizer=f=75:width_type=o:width=2:g=14,volume=1.1";
        break;
      case "nightcore":
        af = "asetrate=44100*1.25,aresample=44100,atempo=1.05";
        break;
      case "slow":
        af = "asetrate=44100*0.84,aresample=44100,aecho=0.8:0.88:45:0.25";
        break;
      case "fast":
        af = "atempo=1.45";
        break;
      case "robot":
        af = "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75";
        break;
      case "reverse":
        af = "areverse";
        break;
    }
    await execFileAsync3(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        inPath,
        "-vn",
        "-af",
        af,
        "-ar",
        "44100",
        "-ac",
        "2",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        outPath
      ],
      { timeout: 25e3 }
    );
    return {
      buffer: await fs7.readFile(outPath),
      mimeType: "audio/mpeg"
    };
  });
}
async function generateQrImage(text) {
  return QRCode.toBuffer(text.trim(), {
    width: 600,
    margin: 2,
    color: {
      dark: "#111114",
      light: "#FFFFFF"
    }
  });
}
async function uploadBufferToPublicUrl(buffer, fileName, mimeType) {
  try {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("time", "72h");
    form.append(
      "fileToUpload",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      fileName
    );
    const res = await fetch(
      "https://litterbox.catbox.moe/resources/internals/api.php",
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(12e3)
      }
    );
    if (res.ok) {
      const txt = (await res.text()).trim();
      if (txt.startsWith("https://")) return txt;
    }
  } catch {
  }
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      fileName
    );
    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(12e3)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data?.url) {
        return json.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
      }
    }
  } catch {
  }
  return null;
}
var cachedSampleVideo = null;
var cachedSampleAudio = null;
async function getOrCreateSampleVideoBuffer() {
  if (cachedSampleVideo) return cachedSampleVideo;
  cachedSampleVideo = await withTempDir2(async (dir) => {
    const out = path5.join(dir, "sample.mp4");
    await execFileAsync3(
      getFfmpegBin(),
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=2.5:size=480x480:rate=15",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=523.25:duration=2.5",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        out
      ],
      { timeout: 15e3 }
    );
    return fs7.readFile(out);
  });
  return cachedSampleVideo;
}
async function getOrCreateSampleAudioBuffer() {
  if (cachedSampleAudio) return cachedSampleAudio;
  cachedSampleAudio = await withTempDir2(async (dir) => {
    const out = path5.join(dir, "sample.mp3");
    await execFileAsync3(
      getFfmpegBin(),
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:beep_factor=2:duration=3",
        "-af",
        "aecho=0.8:0.88:60:0.4",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        out
      ],
      { timeout: 15e3 }
    );
    return fs7.readFile(out);
  });
  return cachedSampleAudio;
}

// server/remoteTunnel.ts
import { execFileSync, spawn } from "node:child_process";
import crypto2 from "node:crypto";
import fs8 from "node:fs";
import os4 from "node:os";
import path6 from "node:path";
function getLocalLanUrls(port) {
  const urls = [];
  try {
    const nets = os4.networkInterfaces();
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const net of entries) {
        const fam = String(net.family);
        if ((fam === "IPv4" || fam === "4") && !net.internal && net.address) {
          const url = `http://${net.address}:${port}`;
          if (!urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }
  } catch {
  }
  return urls;
}
function detectBinaryAvailable(binName) {
  try {
    execFileSync(binName, ["--version"], {
      stdio: "ignore",
      timeout: 3e3
    });
    return true;
  } catch {
    const termuxPath = `/data/data/com.termux/files/usr/bin/${binName}`;
    return fs8.existsSync(termuxPath);
  }
}
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}
function isTrustedLocalOrPreviewHost(rawHost) {
  if (!rawHost) return true;
  const host = rawHost.split(":")[0].trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }
  if (host.startsWith("192.168.") || host.startsWith("10.") || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) || /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host) || host.endsWith(".local") || host.endsWith(".ts.net")) {
    return true;
  }
  if (host.endsWith(".run.app") || host.endsWith(".googleusercontent.com") || host.endsWith(".google.com") || host.endsWith(".goog") || host.endsWith(".cloudworkstations.dev") || host.endsWith(".web.app")) {
    return true;
  }
  return false;
}
function isRequestFromPublicTunnel(headers, activePublicUrl) {
  const forwardedHost = Array.isArray(headers["x-forwarded-host"]) ? headers["x-forwarded-host"][0] : headers["x-forwarded-host"];
  const effectiveHost = (forwardedHost || headers.host || "").split(",")[0].split(":")[0].trim().toLowerCase();
  if (isTrustedLocalOrPreviewHost(effectiveHost)) {
    return false;
  }
  if (effectiveHost.endsWith(".trycloudflare.com") || effectiveHost.endsWith(".lhr.life")) {
    return true;
  }
  if (activePublicUrl) {
    try {
      const tunnelHost = new URL(activePublicUrl).hostname.toLowerCase();
      if (effectiveHost === tunnelHost) {
        return true;
      }
    } catch {
    }
    if (headers["cf-ray"] || headers["cf-connecting-ip"]) {
      return true;
    }
  }
  return false;
}
var RemoteTunnelManager = class {
  constructor() {
    this.autoStartTunnel = false;
    this.status = "stopped";
    this.provider = null;
    this.publicUrl = null;
    this.lastError = null;
    this.child = null;
    this.reconnectTimer = null;
    this.activePort = 3e3;
    this.intentionalStop = false;
    this.expressMiddleware = (req, res, next) => {
      if (req.path === "/ping" || req.path === "/api/health") {
        next();
        return;
      }
      if (!isRequestFromPublicTunnel(req.headers, this.publicUrl)) {
        next();
        return;
      }
      if (req.path === "/api/remote-auth" && req.method === "POST") {
        const submitted = String(req.body?.key || "").trim();
        if (submitted && submitted === this.accessKey) {
          const secureFlag = req.secure || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
          res.setHeader(
            "Set-Cookie",
            `wabot_owner_key=${encodeURIComponent(
              this.accessKey
            )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`
          );
          res.json({ ok: true });
        } else {
          res.status(401).json({ ok: false, error: "Kunci Akses Owner tidak sesuai." });
        }
        return;
      }
      const queryKey = typeof req.query.key === "string" ? req.query.key.trim() : "";
      if (queryKey && queryKey === this.accessKey) {
        const secureFlag = req.secure || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
        res.setHeader(
          "Set-Cookie",
          `wabot_owner_key=${encodeURIComponent(
            this.accessKey
          )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`
        );
        if (req.method === "GET" && !req.path.startsWith("/api/")) {
          res.redirect(302, req.path || "/");
          return;
        }
        next();
        return;
      }
      const cookies = parseCookies(req.headers.cookie);
      const headerKey = String(req.headers["x-owner-key"] || "").trim();
      if (cookies.wabot_owner_key === this.accessKey || headerKey && headerKey === this.accessKey) {
        next();
        return;
      }
      if (req.path.startsWith("/api/")) {
        res.status(401).json({
          ok: false,
          error: "Akses jarak jauh terkunci. Buka tautan dari perintah .panel di WhatsApp Owner atau masukkan Kunci Akses."
        });
        return;
      }
      res.status(401).setHeader("Content-Type", "text/html; charset=utf-8").send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kunci Akses Owner \u2014 WABot Control Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
  <script>
    (function() {
      try {
        if (localStorage.getItem('wabot_theme') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    })();
  </script>
  <style>
    :root {
      --bg: #FAF9F6;
      --surface: #FFFFFF;
      --surface-sub: #F4F4F5;
      --border: rgba(228, 228, 231, 0.85);
      --text: #18181B;
      --muted: #52525B;
      --subtle: #71717A;
      --btn-bg: #18181B;
      --btn-fg: #FFFFFF;
      --accent: #059669;
      --danger: #E11D48;
    }
    html.dark {
      --bg: #0C0C0E;
      --surface: #141417;
      --surface-sub: #09090B;
      --border: #27272A;
      --text: #F4F4F5;
      --muted: #A1A1AA;
      --subtle: #71717A;
      --btn-bg: #059669;
      --btn-fg: #FFFFFF;
      --accent: #34D399;
      --danger: #FB7185;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      color: var(--text);
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    header {
      height: 64px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
    }
    .brand {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .theme-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 7px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .box {
      width: 100%;
      max-width: 420px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
    }
    .meta {
      font-size: 12px;
      color: var(--subtle);
      margin-bottom: 6px;
    }
    h1 {
      margin: 0 0 8px;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0 0 20px;
      font-size: 13.5px;
      color: var(--muted);
      line-height: 1.55;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--text);
      margin-bottom: 6px;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 11px 14px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface-sub);
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      margin-bottom: 12px;
      outline: none;
    }
    input:focus { border-color: #10B981; }
    button.primary {
      width: 100%;
      padding: 11px 16px;
      border-radius: 12px;
      border: none;
      background: var(--btn-bg);
      color: var(--btn-fg);
      font-weight: 600;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
    }
    button.primary:hover { opacity: 0.92; }
    .err {
      color: var(--danger);
      font-size: 12px;
      margin-top: 10px;
      min-height: 16px;
    }
    .hint {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
      line-height: 1.55;
    }
    code {
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">WABot</div>
    <button type="button" class="theme-btn" id="tbtn">Tema Gelap / Terang</button>
  </header>
  <main>
    <div class="box">
      <div class="meta">Keamanan Akses Jarak Jauh \xB7 Termux 24/7</div>
      <h1>Verifikasi Kunci Akses Owner</h1>
      <p>Masukkan kunci akses untuk membuka penuh Web Control Panel, Simulator, dan Pengaturan WhatsApp Bot kamu.</p>
      <form id="f">
        <label for="k">Kunci Akses Owner</label>
        <input id="k" type="password" placeholder="Masukkan kunci akses..." autocomplete="off" required />
        <button type="submit" class="primary">Buka Dashboard Panel</button>
        <div id="err" class="err"></div>
      </form>
      <div class="hint">
        Lupa kunci akses? Kirim chat pribadi <code>.panel</code> dari nomor WhatsApp Owner ke nomor bot untuk menerima tautan masuk otomatis.
      </div>
    </div>
  </main>
  <script>
    document.getElementById('tbtn').addEventListener('click', function () {
      const isDark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('wabot_theme', isDark ? 'dark' : 'light'); } catch (e) {}
    });
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('err');
      err.textContent = '';
      const key = document.getElementById('k').value.trim();
      const res = await fetch('/api/remote-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      if (res.ok) location.reload();
      else err.textContent = 'Kunci akses tidak sesuai.';
    });
  </script>
</body>
</html>`);
    };
    this.configFile = path6.join(resolveDataDir(), ".remote-access.json");
    const loaded = this.loadConfig();
    this.accessKey = loaded.accessKey;
    this.autoStartTunnel = loaded.autoStartTunnel;
  }
  generateKey() {
    return crypto2.randomBytes(9).toString("base64url");
  }
  loadConfig() {
    try {
      if (fs8.existsSync(this.configFile)) {
        const raw = JSON.parse(
          fs8.readFileSync(this.configFile, "utf-8")
        );
        if (raw.accessKey && raw.accessKey.length >= 8) {
          return {
            accessKey: raw.accessKey,
            autoStartTunnel: Boolean(raw.autoStartTunnel)
          };
        }
      }
    } catch {
    }
    const fresh = {
      accessKey: this.generateKey(),
      autoStartTunnel: false
    };
    this.saveConfig(fresh);
    return fresh;
  }
  saveConfig(cfg) {
    const payload = cfg || {
      accessKey: this.accessKey,
      autoStartTunnel: this.autoStartTunnel
    };
    try {
      fs8.mkdirSync(path6.dirname(this.configFile), { recursive: true });
      fs8.writeFileSync(this.configFile, JSON.stringify(payload, null, 2));
    } catch {
    }
  }
  setPort(port) {
    if (port > 0) this.activePort = port;
  }
  getPort() {
    return this.activePort;
  }
  rotateAccessKey() {
    this.accessKey = this.generateKey();
    this.saveConfig();
    return this.accessKey;
  }
  getSnapshot(portOverride) {
    const port = portOverride || this.activePort;
    const magicUrl = this.publicUrl ? `${this.publicUrl}/?key=${encodeURIComponent(this.accessKey)}` : null;
    return {
      ok: true,
      status: this.status,
      provider: this.provider,
      publicUrl: this.publicUrl,
      magicUrl,
      lanUrls: getLocalLanUrls(port),
      localhostUrl: `http://localhost:${port}`,
      accessKey: this.accessKey,
      autoStartTunnel: this.autoStartTunnel,
      cloudflaredInstalled: detectBinaryAvailable("cloudflared"),
      lastError: this.lastError
    };
  }
  async autoResumeIfEnabled(port) {
    this.setPort(port);
    if (this.autoStartTunnel) {
      await this.startTunnel(port, 4e3).catch(() => {
      });
    }
  }
  async startTunnel(portOverride, waitReadyMs = 9500) {
    if (portOverride && portOverride > 0) {
      this.activePort = portOverride;
    }
    this.intentionalStop = false;
    this.autoStartTunnel = true;
    this.saveConfig();
    if (this.status === "online" && this.publicUrl && this.child) {
      return this.getSnapshot();
    }
    this.killExistingProcess();
    this.status = "starting";
    this.publicUrl = null;
    this.lastError = null;
    const hasCloudflared = detectBinaryAvailable("cloudflared");
    const hasSsh = detectBinaryAvailable("ssh");
    if (!hasCloudflared && !hasSsh) {
      this.status = "error";
      this.provider = null;
      this.lastError = "Paket cloudflared belum terpasang di Termux. Jalankan: pkg install -y cloudflared";
      return this.getSnapshot();
    }
    const targetLocal = `http://127.0.0.1:${this.activePort}`;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(finish, waitReadyMs);
      const handleOutputChunk = (chunk) => {
        const text = chunk.toString("utf8");
        const cfMatch = text.match(
          /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i
        );
        const lhrMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/i);
        const foundUrl = cfMatch?.[0] || lhrMatch?.[0];
        if (foundUrl) {
          this.publicUrl = foundUrl.replace(/\/+$/, "");
          this.status = "online";
          this.lastError = null;
          finish();
        }
      };
      if (hasCloudflared) {
        this.provider = "cloudflared";
        const cfBin = fs8.existsSync(
          "/data/data/com.termux/files/usr/bin/cloudflared"
        ) ? "/data/data/com.termux/files/usr/bin/cloudflared" : "cloudflared";
        const proc = spawn(
          cfBin,
          [
            "tunnel",
            "--protocol",
            "http2",
            "--edge-ip-version",
            "4",
            "--no-autoupdate",
            "--url",
            targetLocal
          ],
          { stdio: ["ignore", "pipe", "pipe"] }
        );
        this.child = proc;
        proc.stdout?.on("data", handleOutputChunk);
        proc.stderr?.on("data", handleOutputChunk);
        proc.on("error", (err) => {
          this.status = "error";
          this.lastError = `Gagal menjalankan cloudflared: ${err.message}`;
          finish();
        });
        proc.on("exit", () => {
          if (this.child === proc) {
            this.child = null;
            if (!this.intentionalStop && this.autoStartTunnel) {
              this.status = "starting";
              this.scheduleReconnect();
            } else {
              this.status = "stopped";
              this.publicUrl = null;
            }
          }
          finish();
        });
      } else {
        this.provider = "ssh-localhost-run";
        const proc = spawn(
          "ssh",
          [
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "-o",
            "ServerAliveInterval=30",
            "-o",
            "ExitOnForwardFailure=yes",
            "-R",
            `80:127.0.0.1:${this.activePort}`,
            "nokey@localhost.run"
          ],
          { stdio: ["ignore", "pipe", "pipe"] }
        );
        this.child = proc;
        proc.stdout?.on("data", handleOutputChunk);
        proc.stderr?.on("data", handleOutputChunk);
        proc.on("error", (err) => {
          this.status = "error";
          this.lastError = `Gagal membuka tunnel SSH: ${err.message}`;
          finish();
        });
        proc.on("exit", () => {
          if (this.child === proc) {
            this.child = null;
            if (!this.intentionalStop && this.autoStartTunnel) {
              this.status = "starting";
              this.scheduleReconnect();
            } else {
              this.status = "stopped";
              this.publicUrl = null;
            }
          }
          finish();
        });
      }
    });
    return this.getSnapshot();
  }
  scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalStop || !this.autoStartTunnel) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalStop && this.autoStartTunnel) {
        this.startTunnel(this.activePort, 8e3).catch(() => {
        });
      }
    }, 6e3);
    this.reconnectTimer.unref?.();
  }
  killExistingProcess() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.child) {
      const old = this.child;
      this.child = null;
      try {
        old.kill("SIGTERM");
      } catch {
      }
    }
  }
  stopTunnel() {
    this.intentionalStop = true;
    this.autoStartTunnel = false;
    this.saveConfig();
    this.killExistingProcess();
    this.status = "stopped";
    this.provider = null;
    this.publicUrl = null;
    this.lastError = null;
    return this.getSnapshot();
  }
  isAuthorizedWsUpgrade(req) {
    const host = req.headers.host;
    if (!isRequestFromPublicTunnel(req.headers, this.publicUrl)) {
      return true;
    }
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.wabot_owner_key === this.accessKey) {
      return true;
    }
    try {
      const parsed = new URL(req.url || "/", `http://${host || "localhost"}`);
      if (parsed.searchParams.get("key") === this.accessKey) {
        return true;
      }
    } catch {
    }
    return false;
  }
};
var remoteTunnel = new RemoteTunnelManager();

// server/stickerStudio.ts
import { execFile as execFile4 } from "node:child_process";
import fs9 from "node:fs/promises";
import os5 from "node:os";
import path7 from "node:path";
import { promisify as promisify4 } from "node:util";
import WebP2 from "node-webpmux";
var execFileAsync4 = promisify4(execFile4);
function escapeXml(input) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
async function withTempDir3(fn) {
  const dir = await fs9.mkdtemp(path7.join(os5.tmpdir(), "wabot-stk-"));
  try {
    return await fn(dir);
  } finally {
    await fs9.rm(dir, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function injectWhatsAppExif(webpBuffer, packName, author) {
  try {
    const img = new WebP2.Image();
    await img.load(webpBuffer);
    const jsonPayload = JSON.stringify({
      "sticker-pack-id": "com.wabot.sticker.pack",
      "sticker-pack-name": packName ?? "",
      "sticker-pack-publisher": author ?? "",
      emojis: ["\u2728", "\u{1F525}"]
    });
    const exifAttr = Buffer.from([
      73,
      73,
      42,
      0,
      8,
      0,
      0,
      0,
      1,
      0,
      65,
      87,
      7,
      0,
      0,
      0,
      0,
      0,
      22,
      0,
      0,
      0
    ]);
    const jsonBuffer = Buffer.from(jsonPayload, "utf-8");
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = exif;
    const muxed = await img.save(null);
    return Buffer.from(muxed);
  } catch {
    return webpBuffer;
  }
}
async function rewriteStickerExif(stickerBuffer, packName, author) {
  return injectWhatsAppExif(stickerBuffer, packName, author);
}
async function imageToStickerWebp(imageBuffer, packName, author) {
  const rawWebp = await imageBufferToStickerWebp(imageBuffer);
  return injectWhatsAppExif(rawWebp, packName, author);
}
async function videoToAnimatedStickerWebp(videoBuffer, packName, author) {
  return withTempDir3(async (dir) => {
    const inPath = path7.join(dir, "input.mp4");
    const outPath = path7.join(dir, "output.webp");
    await fs9.writeFile(inPath, videoBuffer);
    await execFileAsync4(
      getFfmpegBin(),
      [
        "-y",
        "-i",
        inPath,
        "-t",
        "7",
        "-vf",
        "fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
        "-vcodec",
        "libwebp",
        "-lossless",
        "0",
        "-compression_level",
        "4",
        "-q:v",
        "65",
        "-loop",
        "0",
        "-preset",
        "default",
        "-an",
        "-vsync",
        "0",
        outPath
      ],
      { timeout: 25e3 }
    );
    const webpBuf = await fs9.readFile(outPath);
    return injectWhatsAppExif(webpBuf, packName, author);
  });
}
async function stickerWebpToPng(webpBuffer) {
  return webpBufferToPng(webpBuffer);
}
async function animatedWebpToMp4(webpBuffer) {
  return webpStickerToMp4Buffer(webpBuffer);
}
function wrapTextLines(text, maxCharsPerLine, maxLines) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["santai"];
  const lines = [];
  let current = "";
  for (const word of words) {
    const chunkedWord = word.length > maxCharsPerLine ? word.slice(0, maxCharsPerLine) : word;
    if (!current) {
      current = chunkedWord;
    } else if ((current + " " + chunkedWord).length <= maxCharsPerLine) {
      current += " " + chunkedWord;
    } else {
      lines.push(current);
      current = chunkedWord;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}
var BRAT_COLOR_PALETTE = {
  lime: { bg: "#8ACE00", fg: "#0A0A0A" },
  hijau: { bg: "#8ACE00", fg: "#0A0A0A" },
  green: { bg: "#8ACE00", fg: "#0A0A0A" },
  white: { bg: "#FFFFFF", fg: "#0A0A0A" },
  putih: { bg: "#FFFFFF", fg: "#0A0A0A" },
  pink: { bg: "#FF77B4", fg: "#0A0A0A" },
  merahmuda: { bg: "#FF77B4", fg: "#0A0A0A" },
  biru: { bg: "#5CB8FF", fg: "#0A0A0A" },
  blue: { bg: "#5CB8FF", fg: "#0A0A0A" },
  merah: { bg: "#FF4D4D", fg: "#0A0A0A" },
  red: { bg: "#FF4D4D", fg: "#0A0A0A" },
  ungu: { bg: "#B983FF", fg: "#0A0A0A" },
  purple: { bg: "#B983FF", fg: "#0A0A0A" },
  kuning: { bg: "#FFE600", fg: "#0A0A0A" },
  yellow: { bg: "#FFE600", fg: "#0A0A0A" },
  oranye: { bg: "#FF922B", fg: "#0A0A0A" },
  orange: { bg: "#FF922B", fg: "#0A0A0A" },
  cyan: { bg: "#3AE3D6", fg: "#0A0A0A" },
  tosca: { bg: "#3AE3D6", fg: "#0A0A0A" },
  hitam: { bg: "#111113", fg: "#F4F4F5" },
  black: { bg: "#111113", fg: "#F4F4F5" }
};
async function renderBratFramePng(rawText, colorKey) {
  const cleanText = rawText.trim().toLowerCase() || "santai dulu";
  const charCount = cleanText.length;
  let fontSize = 84;
  let maxChars = 10;
  if (charCount > 60) {
    fontSize = 44;
    maxChars = 18;
  } else if (charCount > 32) {
    fontSize = 54;
    maxChars = 15;
  } else if (charCount > 16) {
    fontSize = 68;
    maxChars = 12;
  }
  const lines = wrapTextLines(cleanText, maxChars, 7);
  const theme = BRAT_COLOR_PALETTE[colorKey.toLowerCase()] || BRAT_COLOR_PALETTE.lime;
  const lineHeight = Math.round(fontSize * 1.14);
  const totalBlockHeight = lines.length * lineHeight;
  const startY = Math.max(
    fontSize + 28,
    Math.round((512 - totalBlockHeight) / 2) + Math.round(fontSize * 0.8)
  );
  const svgTextElements = lines.map((line, index) => {
    const y = startY + index * lineHeight;
    return `<text x="44" y="${y}" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="500" fill="${theme.fg}" letter-spacing="-1.5" transform="scale(0.92, 1.05)">${escapeXml(
      line
    )}</text>`;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="20" fill="${theme.bg}" />
    ${svgTextElements}
  </svg>`;
  return renderBratFramePngAdapter(svg);
}
async function createBratSticker(rawText, colorKey, packName, author) {
  const pngBuf = await renderBratFramePng(rawText, colorKey);
  const finalWebp = await pngBufferToWebp(pngBuf, 84);
  return injectWhatsAppExif(finalWebp, packName, author);
}
async function createBratAnimatedSticker(rawText, packName, author) {
  return withTempDir3(async (dir) => {
    const words = rawText.trim().split(/\s+/).filter(Boolean).slice(0, 12);
    const steps = words.length > 1 ? words : [rawText.trim() || "santai", `${rawText.trim() || "santai"}!`];
    const frames = [];
    for (let i = 0; i < steps.length; i += 1) {
      const partial = steps.slice(0, i + 1).join(" ");
      frames.push(await renderBratFramePng(partial, "lime"));
    }
    frames.push(frames[frames.length - 1]);
    frames.push(frames[frames.length - 1]);
    for (let idx = 0; idx < frames.length; idx += 1) {
      await fs9.writeFile(
        path7.join(dir, `frame_${String(idx).padStart(3, "0")}.png`),
        frames[idx]
      );
    }
    const outPath = path7.join(dir, "bratvid.webp");
    await execFileAsync4(
      getFfmpegBin(),
      [
        "-y",
        "-framerate",
        "2.4",
        "-i",
        path7.join(dir, "frame_%03d.png"),
        "-vcodec",
        "libwebp",
        "-lossless",
        "0",
        "-q:v",
        "75",
        "-loop",
        "0",
        "-an",
        outPath
      ],
      { timeout: 2e4 }
    );
    const webpBuf = await fs9.readFile(outPath);
    return injectWhatsAppExif(webpBuf, packName, author);
  });
}
function buildTtpSvg(text, fillHex, strokeHex = "#000000") {
  const clean = text.trim() || "STIKER";
  const len = clean.length;
  const fontSize = len > 45 ? 48 : len > 24 ? 62 : len > 12 ? 78 : 96;
  const maxChars = len > 45 ? 16 : len > 24 ? 12 : 10;
  const lines = wrapTextLines(clean, maxChars, 6);
  const lineHeight = Math.round(fontSize * 1.15);
  const blockH = lines.length * lineHeight;
  const startY = Math.round((512 - blockH) / 2 + fontSize * 0.82);
  const nodes = lines.map((line, i) => {
    const y = startY + i * lineHeight;
    return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" fill="${fillHex}" stroke="${strokeHex}" stroke-width="12" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
      line
    )}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${nodes}</svg>`;
}
async function createTtpSticker(rawText, packName, author) {
  const svg = buildTtpSvg(rawText, "#FFFFFF", "#09090B");
  const webp = await renderSvgToWebp(svg, 90);
  return injectWhatsAppExif(webp, packName, author);
}
async function createAttpSticker(rawText, packName, author) {
  return withTempDir3(async (dir) => {
    const colors = [
      "#FF3B30",
      "#FF9500",
      "#FFCC00",
      "#34C759",
      "#00C7BE",
      "#32ADE6",
      "#AF52DE",
      "#FF2D55"
    ];
    for (let i = 0; i < colors.length; i += 1) {
      const svg = buildTtpSvg(rawText, colors[i], "#09090B");
      const png = await renderSvgToPng(svg);
      await fs9.writeFile(
        path7.join(dir, `frame_${String(i).padStart(3, "0")}.png`),
        png
      );
    }
    const outPath = path7.join(dir, "attp.webp");
    await execFileAsync4(
      getFfmpegBin(),
      [
        "-y",
        "-framerate",
        "7",
        "-i",
        path7.join(dir, "frame_%03d.png"),
        "-vcodec",
        "libwebp",
        "-lossless",
        "0",
        "-q:v",
        "80",
        "-loop",
        "0",
        "-an",
        outPath
      ],
      { timeout: 2e4 }
    );
    const webpBuf = await fs9.readFile(outPath);
    return injectWhatsAppExif(webpBuf, packName, author);
  });
}
var QC_NAME_COLORS = [
  "#10B981",
  "#38BDF8",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
  "#FB7185"
];
function pickNameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = hash * 31 + name.charCodeAt(i) >>> 0;
  }
  return QC_NAME_COLORS[hash % QC_NAME_COLORS.length];
}
async function splitLongWordByPixelWidth(word, maxLinePx, fontSize, fontWeight) {
  const chars = Array.from(word);
  const chunks = [];
  let current = "";
  for (const ch of chars) {
    const candidate = current + ch;
    const width = await measureSvgTextWidth(candidate, fontSize, fontWeight);
    if (width <= maxLinePx || current.length === 0) {
      current = candidate;
    } else {
      chunks.push(current);
      current = ch;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}
async function wrapTextByPixelWidth(rawText, maxLinePx, fontSize, maxLines, fontWeight = 400) {
  const paragraphs = rawText.replace(/\r\n/g, "\n").split("\n").map((p) => p.trim()).filter((p, idx, arr) => p.length > 0 || arr.length === 1 && idx === 0);
  const lines = [];
  for (const para of paragraphs) {
    if (lines.length >= maxLines) break;
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = "";
    for (const rawWord of words) {
      if (lines.length >= maxLines) break;
      const wordWidth = await measureSvgTextWidth(
        rawWord,
        fontSize,
        fontWeight
      );
      const segments = wordWidth > maxLinePx ? await splitLongWordByPixelWidth(
        rawWord,
        maxLinePx,
        fontSize,
        fontWeight
      ) : [rawWord];
      for (const seg of segments) {
        if (lines.length >= maxLines) break;
        if (!current) {
          current = seg;
        } else {
          const candidate = `${current} ${seg}`;
          const candidateWidth = await measureSvgTextWidth(
            candidate,
            fontSize,
            fontWeight
          );
          if (candidateWidth <= maxLinePx) {
            current = candidate;
          } else {
            lines.push(current);
            current = seg;
            if (lines.length >= maxLines) {
              current = "";
              break;
            }
          }
        }
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines : ["Halo!"];
}
async function buildAvatarSvgMarkup(avatarBuffer, cx, cy, r, accentColor) {
  const clipId = "qcAvatarClip";
  const defs = `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}" /></clipPath>`;
  if (avatarBuffer && avatarBuffer.length > 0) {
    try {
      const normalized = await ensureWhatsappImageBuffer(avatarBuffer);
      const b64 = normalized.buffer.toString("base64");
      const dataUri = `data:${normalized.mimeType};base64,${b64}`;
      const size = r * 2;
      const body2 = [
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1F2C34" />`,
        `<image href="${dataUri}" x="${cx - r}" y="${cy - r}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="1.5" />`
      ].join("\n");
      return { defs, body: body2 };
    } catch {
    }
  }
  const headR = Math.round(r * 0.34);
  const headCy = Math.round(cy - r * 0.16);
  const bodyRx = Math.round(r * 0.64);
  const bodyRy = Math.round(r * 0.52);
  const bodyCy = Math.round(cy + r * 0.68);
  const body = [
    `<g clip-path="url(#${clipId})">`,
    `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#2A3942" />`,
    `  <circle cx="${cx}" cy="${headCy}" r="${headR}" fill="#CFD8DC" />`,
    `  <ellipse cx="${cx}" cy="${bodyCy}" rx="${bodyRx}" ry="${bodyRy}" fill="#CFD8DC" />`,
    `</g>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="1.5" />`
  ].join("\n");
  return { defs, body };
}
async function createQuoteChatSticker(opts) {
  const cleanName = (opts.senderName || "Pengguna").trim().slice(0, 25) || "Pengguna";
  const cleanText = (opts.text || "Halo!").trim().slice(0, 260) || "Halo!";
  const now = /* @__PURE__ */ new Date();
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
  const accent = pickNameColor(cleanName);
  let svg;
  if (opts.style === "ios") {
    const avatarR = 30;
    const avatarCx = 32;
    const bubbleX = 76;
    const padX = 18;
    const maxBubbleW = 404;
    const maxContentW = maxBubbleW - padX * 2;
    const textFontSize = 23;
    const lineH = 29;
    const wrapped = await wrapTextByPixelWidth(
      cleanText,
      maxContentW,
      textFontSize,
      8,
      400
    );
    const lineWidths = await Promise.all(
      wrapped.map((ln) => measureSvgTextWidth(ln, textFontSize, 400))
    );
    const maxLinePx = Math.max(...lineWidths, 18);
    const contentW = Math.min(maxContentW, Math.ceil(maxLinePx));
    const bubbleW = Math.max(58, contentW + padX * 2);
    const bubbleH = Math.max(50, 24 + wrapped.length * lineH);
    const headerLabel = `${cleanName} \xB7 ${timeStr}`;
    const headerPx = await measureSvgTextWidth(headerLabel, 14, 500);
    const bubbleTopY = 22;
    const avatarCy = bubbleTopY + bubbleH - avatarR;
    const avatarMarkup = await buildAvatarSvgMarkup(
      opts.avatarBuffer,
      avatarCx,
      avatarCy,
      avatarR,
      "#0A84FF"
    );
    const textSvg = wrapped.map(
      (ln, i) => `<text x="${bubbleX + padX}" y="${bubbleTopY + 31 + i * lineH}" xml:space="preserve" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${textFontSize}" font-weight="400" fill="#FFFFFF">${escapeXml(
        ln
      )}</text>`
    ).join("\n");
    const naturalW = Math.max(bubbleX + bubbleW, bubbleX + 8 + Math.ceil(headerPx));
    const naturalH = bubbleTopY + bubbleH + 4;
    const scale = Math.min(1.42, 484 / Math.max(naturalW, 1), 480 / Math.max(naturalH, 1));
    const tx = 14;
    const ty = Math.max(12, Math.round((512 - naturalH * scale) / 2));
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>${avatarMarkup.defs}</defs>
      <g transform="translate(${tx}, ${ty}) scale(${scale.toFixed(4)})">
        <text x="${bubbleX + 10}" y="14" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="14" font-weight="500" fill="#8E8E93">${escapeXml(
      headerLabel
    )}</text>
        ${avatarMarkup.body}
        <rect x="${bubbleX}" y="${bubbleTopY}" width="${bubbleW}" height="${bubbleH}" rx="24" fill="#0A84FF" />
        ${textSvg}
      </g>
    </svg>`;
  } else {
    const avatarR = 32;
    const avatarCx = 34;
    const avatarCy = 34;
    const bubbleX = 80;
    const padX = 16;
    const maxBubbleW = 404;
    const maxContentW = maxBubbleW - padX * 2;
    const nameFontSize = 16;
    const textFontSize = 24;
    const timeFontSize = 13;
    const lineH = 30;
    const wrapped = await wrapTextByPixelWidth(
      cleanText,
      maxContentW,
      textFontSize,
      8,
      400
    );
    const [namePx, timePx, ...lineWidths] = await Promise.all([
      measureSvgTextWidth(cleanName, nameFontSize, 700),
      measureSvgTextWidth(timeStr, timeFontSize, 400),
      ...wrapped.map((ln) => measureSvgTextWidth(ln, textFontSize, 400))
    ]);
    const maxLinePx = Math.max(...lineWidths, 16);
    const contentW = Math.min(
      maxContentW,
      Math.ceil(Math.max(namePx, maxLinePx, timePx))
    );
    const bubbleW = Math.max(66, contentW + padX * 2);
    const lastLinePx = lineWidths[lineWidths.length - 1] || 0;
    const inlineTimeFits = contentW - lastLinePx >= timePx + 12;
    const firstTextY = 54;
    const lastTextY = firstTextY + (wrapped.length - 1) * lineH;
    const timeY = inlineTimeFits ? lastTextY + 4 : lastTextY + 19;
    const bubbleH = inlineTimeFits ? lastTextY + 17 : timeY + 11;
    const avatarMarkup = await buildAvatarSvgMarkup(
      opts.avatarBuffer,
      avatarCx,
      avatarCy,
      avatarR,
      accent
    );
    const textSvg = wrapped.map(
      (ln, i) => `<text x="${bubbleX + padX}" y="${firstTextY + i * lineH}" xml:space="preserve" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${textFontSize}" font-weight="400" fill="#F4F4F5">${escapeXml(
        ln
      )}</text>`
    ).join("\n");
    const naturalW = bubbleX + bubbleW;
    const naturalH = Math.max(avatarCy + avatarR + 4, bubbleH);
    const scale = Math.min(
      1.42,
      484 / Math.max(naturalW, 1),
      480 / Math.max(naturalH, 1)
    );
    const tx = 14;
    const ty = Math.max(12, Math.round((512 - naturalH * scale) / 2));
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>${avatarMarkup.defs}</defs>
      <g transform="translate(${tx}, ${ty}) scale(${scale.toFixed(4)})">
        ${avatarMarkup.body}
        <path d="M ${bubbleX - 10} 0 L ${bubbleX + 12} 0 L ${bubbleX + 4} 18 Z" fill="#1F2C34" />
        <rect x="${bubbleX}" y="0" width="${bubbleW}" height="${bubbleH}" rx="18" fill="#1F2C34" />
        <rect x="${bubbleX}" y="0" width="18" height="18" fill="#1F2C34" />
        <text x="${bubbleX + padX}" y="24" xml:space="preserve" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${nameFontSize}" font-weight="700" fill="${accent}">${escapeXml(
      cleanName
    )}</text>
        ${textSvg}
        <text x="${bubbleX + bubbleW - 13}" y="${timeY}" text-anchor="end" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${timeFontSize}" fill="#8696A0">${escapeXml(
      timeStr
    )}</text>
      </g>
    </svg>`;
  }
  const webp = await renderSvgConsistentToWebp(svg, 92);
  return injectWhatsAppExif(webp, opts.packName, opts.author);
}
function emojiToCodepointHex(emoji) {
  const codepoints = [];
  for (const ch of Array.from(emoji.trim())) {
    const cp = ch.codePointAt(0);
    if (cp && cp !== 65039) {
      codepoints.push(cp.toString(16).toLowerCase());
    }
  }
  return codepoints.join("-u");
}
function emojiToCodepointWithFe0f(emoji) {
  const codepoints = [];
  for (const ch of Array.from(emoji.trim())) {
    const cp = ch.codePointAt(0);
    if (cp) codepoints.push(cp.toString(16).toLowerCase());
  }
  return codepoints.join("-u");
}
var EMOJI_KITCHEN_DATES = [
  "20240206",
  "20231113",
  "20230418",
  "20220815",
  "20210831",
  "20201001"
];
async function createEmojiMixSticker(rawInput, packName, author) {
  const parts = rawInput.includes("+") ? rawInput.split("+") : rawInput.includes("|") ? rawInput.split("|") : Array.from(Intl.Segmenter ? new Intl.Segmenter().segment(rawInput.replace(/\s+/g, "")) : []).map((s) => s.segment);
  const e1 = (parts[0] || "").trim();
  const e2 = (parts[1] || "").trim();
  if (!e1 || !e2) {
    throw new Error("Masukkan 2 emoji dipisah tanda tambah, contoh: *.emojimix \u{1F600}+\u{1F60E}*");
  }
  const candidates = [
    [emojiToCodepointHex(e1), emojiToCodepointHex(e2)],
    [emojiToCodepointHex(e2), emojiToCodepointHex(e1)],
    [emojiToCodepointWithFe0f(e1), emojiToCodepointWithFe0f(e2)],
    [emojiToCodepointWithFe0f(e2), emojiToCodepointWithFe0f(e1)]
  ];
  for (const date of EMOJI_KITCHEN_DATES) {
    for (const [left, right] of candidates) {
      if (!left || !right) continue;
      const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${left}/u${left}_u${right}.png`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4e3) });
        if (res.ok) {
          const arr = await res.arrayBuffer();
          return imageToStickerWebp(Buffer.from(arr), packName, author);
        }
      } catch {
      }
    }
  }
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="220" fill="#18181B" stroke="#10B981" stroke-width="8"/>
    <text x="185" y="295" text-anchor="middle" font-size="165">${escapeXml(e1)}</text>
    <text x="330" y="315" text-anchor="middle" font-size="165">${escapeXml(e2)}</text>
  </svg>`;
  const webp = await renderSvgToWebp(fallbackSvg, 90);
  return injectWhatsAppExif(webp, packName, author);
}
async function getFallbackMemeBackground() {
  const sampleImagePath = path7.join(
    process.cwd(),
    "src",
    "assets",
    "images",
    "sample_sticker_cat_1793095457845.jpg"
  );
  try {
    return await fs9.readFile(sampleImagePath);
  } catch {
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#18181B"/>
          <stop offset="100%" stop-color="#27272A"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill="url(#g)"/>
    </svg>`;
    return renderSvgToPng(fallbackSvg);
  }
}
async function createMemeSticker(topText, bottomText, baseImageBuffer, packName, author) {
  let sourceBuffer = baseImageBuffer ?? await getFallbackMemeBackground();
  if (sourceBuffer && sourceBuffer.length >= 12 && sourceBuffer.subarray(0, 4).toString("ascii") === "RIFF" && sourceBuffer.subarray(8, 12).toString("ascii") === "WEBP") {
    try {
      sourceBuffer = await stickerWebpToPng(sourceBuffer);
    } catch {
    }
  }
  const cleanTop = topText.trim().toUpperCase();
  const cleanBottom = bottomText.trim().toUpperCase();
  const topLines = cleanTop ? wrapTextLines(cleanTop, 15, 2) : [];
  const bottomLines = cleanBottom ? wrapTextLines(cleanBottom, 15, 2) : [];
  const maxLen = Math.max(
    ...topLines.map((l) => l.length),
    ...bottomLines.map((l) => l.length),
    1
  );
  let fontSize = 58;
  let lineHeight = 64;
  let strokeWidth = 11;
  if (maxLen <= 8) {
    fontSize = 70;
    lineHeight = 76;
    strokeWidth = 12;
  } else if (maxLen <= 12) {
    fontSize = 62;
    lineHeight = 68;
    strokeWidth = 11;
  } else if (maxLen <= 16) {
    fontSize = 54;
    lineHeight = 60;
    strokeWidth = 10;
  } else {
    fontSize = 46;
    lineHeight = 52;
    strokeWidth = 9;
  }
  const topSvg = topLines.map((line, idx) => {
    const y = 32 + fontSize + idx * lineHeight;
    return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, Montserrat, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="1px" fill="#FFFFFF" stroke="#000000" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
      line
    )}</text>`;
  }).join("\n");
  const totalBottomHeight = (bottomLines.length - 1) * lineHeight;
  const bottomStartY = 512 - 24 - totalBottomHeight;
  const bottomSvg = bottomLines.map((line, idx) => {
    const y = bottomStartY + idx * lineHeight;
    return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, Montserrat, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="1px" fill="#FFFFFF" stroke="#000000" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
      line
    )}</text>`;
  }).join("\n");
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${topSvg}
      ${bottomSvg}
    </svg>`;
  const webpBuffer = await compositeMemeToWebp(sourceBuffer, overlaySvg);
  return injectWhatsAppExif(webpBuffer, packName, author);
}

// server/memeFetcher.ts
var FALLBACK_MEMES = [
  {
    title: "Ketika Niat Belajar Coding Tapi Malah Buka Sosmed",
    url: "https://images.unsplash.com/photo-1534972195531-a756b1126f24?auto=format&fit=crop&w=720&q=80",
    source: "Koleksi Humor Santai"
  },
  {
    title: "Ekspektasi vs Realita Begadang",
    url: "https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=720&q=80",
    source: "Koleksi Humor Santai"
  }
];
async function fetchMemeFromWeb(query) {
  const cleanQ = (query || "").trim().toLowerCase();
  const fetchers = [];
  if (cleanQ) {
    let sub = cleanQ;
    if (sub.includes("indo")) sub = "indonesia";
    else if (sub.includes("program") || sub.includes("koding") || sub.includes("it")) sub = "programmerhumor";
    else if (sub.includes("kucing") || sub.includes("cat")) sub = "catmemes";
    else if (sub.includes("lucu") || sub.includes("funny")) sub = "wholesomememes";
    fetchers.push(async () => {
      const res = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(sub)}`, {
        signal: AbortSignal.timeout(6e3)
      });
      const data = await res.json();
      if (data?.url && typeof data.url === "string") {
        return {
          url: data.url,
          title: data.title || `Meme r/${sub}`,
          source: `Reddit r/${data.subreddit || sub}`
        };
      }
      throw new Error("Meme API empty");
    });
  }
  fetchers.push(async () => {
    const res = await fetch("https://candaan-api.vercel.app/api/image/random", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(5e3)
    });
    const data = await res.json();
    if (data?.data?.url && typeof data.data.url === "string") {
      return {
        url: data.data.url,
        title: "Meme Candaan & Jokes Lucu",
        source: "Candaan Web API"
      };
    }
    throw new Error("Candaan API empty");
  });
  fetchers.push(async () => {
    const res = await fetch("https://meme-api.com/gimme/indonesia", {
      signal: AbortSignal.timeout(5e3)
    });
    const data = await res.json();
    if (data?.url && typeof data.url === "string") {
      return {
        url: data.url,
        title: data.title || "Meme Komunitas Indonesia",
        source: "r/indonesia Humor"
      };
    }
    throw new Error("Meme-API Indonesia empty");
  });
  fetchers.push(async () => {
    const res = await fetch("https://rest.cak.one/api/random/meme", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4e3)
    });
    const data = await res.json();
    const targetUrl = data?.url || data?.result?.url || data?.image;
    if (targetUrl && typeof targetUrl === "string") {
      return {
        url: targetUrl,
        title: data?.title || data?.caption || "Meme Referensi Cak.one",
        source: "Cak.one API"
      };
    }
    throw new Error("Cak.one empty");
  });
  fetchers.push(async () => {
    const res = await fetch("https://meme-api.com/gimme", {
      signal: AbortSignal.timeout(5e3)
    });
    const data = await res.json();
    if (data?.url && typeof data.url === "string") {
      return {
        url: data.url,
        title: data.title || "Trending Meme",
        source: `Reddit r/${data.subreddit || "dankmemes"}`
      };
    }
    throw new Error("Meme-API Trending empty");
  });
  if (!cleanQ) {
    fetchers.sort(() => Math.random() - 0.5);
  }
  for (const fn of fetchers) {
    try {
      const candidate = await fn();
      if (!candidate?.url) continue;
      const { buffer: rawBuf2, contentType: contentType2 } = await fetchRemoteBuffer(
        candidate.url,
        15 * 1024 * 1024
      );
      const { buffer: buffer2, mimeType: mimeType2 } = await ensureWhatsappImageBuffer(rawBuf2, contentType2);
      if (buffer2 && buffer2.length > 256) {
        return {
          title: candidate.title,
          source: candidate.source,
          url: candidate.url,
          buffer: buffer2,
          mimeType: mimeType2
        };
      }
    } catch {
    }
  }
  const fallback = FALLBACK_MEMES[Math.floor(Math.random() * FALLBACK_MEMES.length)];
  const { buffer: rawBuf, contentType } = await fetchRemoteBuffer(
    fallback.url,
    15 * 1024 * 1024
  );
  const { buffer, mimeType } = await ensureWhatsappImageBuffer(rawBuf, contentType);
  return {
    title: fallback.title,
    source: fallback.source,
    url: fallback.url,
    buffer,
    mimeType
  };
}

// server/commandEngine.ts
var LINK_REGEX = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+)/i;
var SERVER_BOOT_TIME = Date.now();
var LINK_COMMAND_ALLOWLIST = /* @__PURE__ */ new Set([
  "aio",
  "dl",
  "autodl",
  "unduh",
  "tt",
  "tiktok",
  "ttdl",
  "vt",
  "ttslide",
  "ttimg",
  "ttfoto",
  "tiktokslide",
  "ig",
  "instagram",
  "igdl",
  "reels",
  "fb",
  "facebook",
  "fbdl",
  "fbwatch",
  "tw",
  "twitter",
  "x",
  "xdl",
  "pin",
  "pinterest",
  "pindl",
  "capcut",
  "cc",
  "ccdl",
  "mf",
  "mediafire",
  "mfdl",
  "yt",
  "youtube",
  "ytmp4",
  "shorts",
  "mp3",
  "ttmp3",
  "ytmp3",
  "musik",
  "qrcode",
  "qr",
  "buatqr"
]);
var groupActionLastRun = /* @__PURE__ */ new Map();
var senderLastCmdRun = /* @__PURE__ */ new Map();
function isSenderBotOwner(ctx) {
  const configuredOwner = normalizePhoneInput(
    botStore.config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
  );
  const senderNormalized = normalizePhoneInput(ctx.senderPhone || "");
  return Boolean(
    configuredOwner && senderNormalized && configuredOwner === senderNormalized
  );
}
function checkSenderRateLimit(ctx) {
  if (ctx.source !== "whatsapp") return false;
  if (isSenderBotOwner(ctx)) return false;
  const senderKey = ctx.senderJid || ctx.senderPhone;
  if (!senderKey) return false;
  const now = Date.now();
  const prev = senderLastCmdRun.get(senderKey) || 0;
  if (now - prev < 3500) {
    return true;
  }
  senderLastCmdRun.set(senderKey, now);
  return false;
}
function checkGroupActionCooldown(ctx, bucket, cooldownMs) {
  if (ctx.source !== "whatsapp" || !ctx.isGroup || !ctx.groupId) {
    return null;
  }
  const key = `${ctx.groupId}:${bucket}`;
  const now = Date.now();
  const prev = groupActionLastRun.get(key) || 0;
  const elapsed = now - prev;
  if (elapsed < cooldownMs) {
    const waitSec = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1e3));
    return `Proteksi keamanan grup aktif: tunggu *${waitSec} detik* lagi sebelum menjalankan aksi grup berikutnya agar grup aman dari deteksi spam WhatsApp.`;
  }
  groupActionLastRun.set(key, now);
  return null;
}
function shouldSendPendingReaction(rawText) {
  const { config } = botStore;
  if (!config.reactions.enabled) return false;
  const trimmed = rawText.trim();
  if (!trimmed.startsWith(config.prefix)) return false;
  const withoutPrefix = trimmed.slice(config.prefix.length).trim();
  return withoutPrefix.length > 0;
}
function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1e3);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec % 3600 / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}j ${m}m ${s}d`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s} detik`;
}
function formatByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function normalizePhoneInput(raw) {
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("08")) {
    digits = "62" + digits.slice(1);
  } else if (digits.startsWith("8") && digits.length >= 9) {
    digits = "62" + digits;
  }
  return digits;
}
function resolveGroupTarget(argsText, ctx) {
  const members = ctx.groupMembers || botStore.groupMembers;
  if (ctx.quotedParticipantJid || ctx.quotedParticipantPhone) {
    const qJid = ctx.quotedParticipantJid || "";
    const qPhone = ctx.quotedParticipantPhone || qJid.split(":")[0]?.split("@")[0] || "";
    const found = members.find(
      (m) => m.jid === qJid || m.lid && m.lid === qJid || qPhone && m.phone === qPhone
    );
    if (found) {
      return { jid: found.jid, phone: found.phone, member: found };
    }
    if (qJid) {
      return { jid: qJid, phone: qPhone || qJid.split("@")[0] };
    }
  }
  if (ctx.mentionedJids && ctx.mentionedJids.length > 0) {
    const mJid = ctx.mentionedJids[0];
    const mPhone = mJid.split(":")[0]?.split("@")[0] || "";
    const found = members.find(
      (m) => m.jid === mJid || m.lid && m.lid === mJid || mPhone && m.phone === mPhone
    );
    if (found) {
      return { jid: found.jid, phone: found.phone, member: found };
    }
    return { jid: mJid, phone: mPhone };
  }
  const digits = normalizePhoneInput(argsText);
  if (digits.length >= 7) {
    const found = members.find(
      (m) => m.phone === digits || m.phone.endsWith(digits)
    );
    if (found) {
      return { jid: found.jid, phone: found.phone, member: found };
    }
    return { jid: `${digits}@s.whatsapp.net`, phone: digits };
  }
  if (argsText.trim()) {
    const cleanQuery = argsText.replace(/^@/, "").trim().toLowerCase();
    const byName = members.find(
      (m) => m.name.toLowerCase().includes(cleanQuery)
    );
    if (byName) {
      return { jid: byName.jid, phone: byName.phone, member: byName };
    }
  }
  return null;
}
function buildMenuText(query, invokedAlias, senderName) {
  const { config } = botStore;
  const ownerDigits = normalizePhoneInput(config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER) || OFFICIAL_OWNER_NUMBER;
  return buildBotMenuText({
    prefix: config.prefix,
    botName: config.botName,
    ownerName: config.ownerName,
    ownerNumber: ownerDigits,
    ownerWebsite: config.ownerWebsite,
    stickerPackName: config.stickerPackName,
    stickerAuthor: config.stickerAuthor,
    disabledCommands: config.disabledCommands,
    menuHeaderTemplate: config.templates.menuHeader,
    menuFooterTemplate: config.templates.menuFooter,
    query,
    invokedAlias,
    senderName
  });
}
function isAllowedLinkCommand(trimmed, prefix) {
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return false;
  const cmdPart = trimmed.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
  return Boolean(cmdPart && LINK_COMMAND_ALLOWLIST.has(cmdPart));
}
async function processBotMessage(ctx) {
  const startTime = Date.now();
  const { config } = botStore;
  const trimmed = ctx.text.trim();
  const effectiveGroupId = ctx.groupId || (ctx.isGroup ? "simulator-group" : void 0);
  const effectiveGroupSettings = botStore.getEffectiveGroupSettings(effectiveGroupId);
  if (ctx.isGroup && effectiveGroupSettings.antilink && !ctx.isAdmin && LINK_REGEX.test(trimmed) && !isAllowedLinkCommand(trimmed, config.prefix)) {
    botStore.incrementStat("linksModerated");
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: "antilink:guard",
      source: ctx.source,
      sender: ctx.senderName,
      status: "blocked",
      summary: `Menghapus pesan bertautan dari ${ctx.senderName}`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    });
    const warnTpl = botStore.getEffectiveTemplate(
      "antilinkWarn",
      effectiveGroupId
    );
    return {
      handled: true,
      moderatedLink: true,
      replyText: renderBotTemplate(warnTpl, {
        sender: ctx.senderPhone,
        target: ctx.senderPhone,
        prefix: config.prefix,
        botName: config.botName,
        groupName: ctx.groupName || botStore.groupState.subject
      }),
      mentions: ctx.senderJid ? [ctx.senderJid] : [`${ctx.senderPhone}@s.whatsapp.net`]
    };
  }
  if (ctx.source === "simulator" && ctx.isGroup && botStore.groupState.isAnnouncementOnly && !ctx.isAdmin) {
    return {
      handled: true,
      moderatedLink: true,
      replyText: `Grup sedang *DIKUNCI* (Hanya Admin yang dapat mengirim pesan).`
    };
  }
  let normalizedTrimmed = trimmed;
  const numberedMatch = trimmed.match(/^([1-7])\.\s*(.+)$/);
  if (numberedMatch) {
    const rest = numberedMatch[2].trim();
    normalizedTrimmed = rest.startsWith(config.prefix) ? rest : `${config.prefix}${rest}`;
  }
  if (!normalizedTrimmed.startsWith(config.prefix)) {
    const autoReply = evaluateAutoResponder(normalizedTrimmed, {
      isGroup: Boolean(ctx.isGroup),
      senderPhone: ctx.senderPhone,
      senderName: ctx.senderName,
      groupName: ctx.groupName || botStore.groupState.subject
    });
    if (autoReply.matched && autoReply.replyText) {
      return {
        handled: true,
        reactionStatus: "success",
        replyText: autoReply.replyText
      };
    }
    return { handled: false };
  }
  const withoutPrefix = normalizedTrimmed.slice(config.prefix.length).trim();
  if (!withoutPrefix) {
    return { handled: false };
  }
  const firstSpaceIdx = withoutPrefix.search(/\s/);
  const rawCmd = (firstSpaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSpaceIdx)).toLowerCase();
  const argsText = firstSpaceIdx === -1 ? "" : withoutPrefix.slice(firstSpaceIdx + 1).trim();
  const NUMBER_TO_MENU = {
    "1": "menudownload",
    "2": "menustiker",
    "3": "menumedia",
    "4": "menuaudio",
    "5": "menugrup",
    "6": "menuotomasi",
    "7": "menuinfo"
  };
  const effectiveCmdId = NUMBER_TO_MENU[rawCmd] || rawCmd;
  const matchedCmd = COMMAND_CATALOG.find(
    (c) => c.id === effectiveCmdId || c.aliases.includes(effectiveCmdId)
  );
  if (!matchedCmd) {
    return {
      handled: true,
      reactionStatus: "error",
      replyText: renderBotTemplate(config.templates.unknownCommand, {
        prefix: config.prefix,
        command: rawCmd,
        botName: config.botName
      })
    };
  }
  if (matchedCmd.suspensionRisk) {
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: "blocked",
      summary: `Proteksi anti-suspend: ${config.prefix}${matchedCmd.id} dinonaktifkan`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    });
    return {
      handled: true,
      reactionStatus: "error",
      replyText: SUSPENSION_RISK_DISABLED_REPLY
    };
  }
  if (config.disabledCommands.includes(matchedCmd.id)) {
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: "blocked",
      summary: `Command ${config.prefix}${matchedCmd.id} sedang dinonaktifkan`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    });
    return {
      handled: true,
      reactionStatus: "error",
      replyText: `Maaf, fitur *${config.prefix}${matchedCmd.id}* sedang dinonaktifkan sementara oleh pengelola bot.`
    };
  }
  if (matchedCmd.groupOnly && !ctx.isGroup) {
    return {
      handled: true,
      reactionStatus: "error",
      replyText: `Perintah *${config.prefix}${matchedCmd.id}* khusus digunakan di dalam ruang Grup WhatsApp.`
    };
  }
  if (checkSenderRateLimit(ctx)) {
    return { handled: false };
  }
  botStore.incrementStat("totalCommands");
  const failReply = (msg) => ({
    handled: true,
    reactionStatus: "error",
    replyText: msg
  });
  const ensureSenderGroupAdmin = () => {
    if (!ctx.isAdmin && !isSenderBotOwner(ctx)) {
      return failReply(
        `Hanya *Admin Grup* atau *Owner Bot* yang diizinkan menjalankan perintah *${config.prefix}${matchedCmd.id}*.`
      );
    }
    return null;
  };
  const ensureFullGroupAdminWithBot = () => {
    const senderCheck = ensureSenderGroupAdmin();
    if (senderCheck) return senderCheck;
    if (ctx.source === "whatsapp" && ctx.isBotGroupAdmin === false) {
      return failReply(
        `Jadikan nomor *${config.botName}* sebagai *Admin Grup* terlebih dahulu agar bisa mengeksekusi *${config.prefix}${matchedCmd.id}*.`
      );
    }
    return null;
  };
  const checkManualOnlySettingsGuard = () => {
    if (config.lockSettingsManualOnly ?? true) {
      return {
        handled: true,
        reactionStatus: "error",
        replyText: "\u{1F512} *Perubahan Pengaturan Dikunci Manual*\n\nBot ini dikunci agar *tidak dapat* mengubah setelan grup maupun setelan nomor/akun bot melalui perintah chat WhatsApp.\n\nSeluruh pengaturan (buka/tutup grup, nama & deskripsi grup, reset link grup, antilink, welcome/out, template, dan preferensi bot) hanya bisa diubah secara *MANUAL* oleh Owner lewat aplikasi WhatsApp atau Web Control Panel."
      };
    }
    return null;
  };
  const handleGroupTemplateSetter = (templateKey, titleLabel, sampleHint) => {
    const guard = ensureSenderGroupAdmin();
    if (guard) return guard;
    const gid = effectiveGroupId || "simulator-group";
    if (!argsText) {
      const currentTpl = botStore.getEffectiveTemplate(templateKey, gid);
      return {
        handled: true,
        reactionStatus: "success",
        replyText: [
          `*Pengaturan ${titleLabel} Grup Ini*`,
          `Teks aktif saat ini:`,
          `${currentTpl}`,
          "",
          `Untuk mengubah, ketik:`,
          `*${config.prefix}${matchedCmd.id} ${sampleHint}*`,
          `Variabel otomatis: *@user*, *@group*, *{prefix}*, *{botName}*`,
          `Ketik *${config.prefix}${matchedCmd.id} reset* untuk kembali ke teks bawaan.`
        ].join("\n")
      };
    }
    if (argsText.toLowerCase() === "reset") {
      botStore.resetGroupCustomTemplates(gid, templateKey);
      return {
        handled: true,
        reactionStatus: "success",
        replyText: `Teks *${titleLabel}* untuk grup ini berhasil dikembalikan ke pengaturan bawaan bot.`
      };
    }
    botStore.updateGroupCustomConfig(gid, {
      templates: {
        [templateKey]: argsText
      }
    });
    const previewRendered = renderBotTemplate(argsText, {
      target: ctx.senderPhone,
      sender: ctx.senderPhone,
      groupName: ctx.groupName || botStore.groupState.subject,
      prefix: config.prefix,
      botName: config.botName
    });
    return {
      handled: true,
      reactionStatus: "success",
      replyText: [
        `*${titleLabel} Berhasil Diperbarui!*`,
        "",
        `*Contoh Pratinjau:*`,
        previewRendered
      ].join("\n"),
      mentions: ctx.senderJid ? [ctx.senderJid] : void 0
    };
  };
  const isNativeMp3Buffer = (buf, contentType) => {
    if (buf.length < 12) return false;
    if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
      return false;
    }
    if (buf.subarray(0, 3).toString("ascii") === "ID3") {
      return true;
    }
    if (buf[0] === 255 && (buf[1] & 224) === 224) {
      return true;
    }
    return contentType.includes("audio/mpeg") || contentType.includes("audio/mp3");
  };
  const ensurePlayableMp3Buffer = async (rawBuffer, contentType) => {
    if (isNativeMp3Buffer(rawBuffer, contentType)) {
      return rawBuffer;
    }
    const converted = await extractOrConvertAudio(rawBuffer, "mp3");
    return converted.buffer;
  };
  const buildSocialDownloadResponse = async (targetUrl, platformHint, options) => {
    const media = platformHint === "tiktok" ? await downloadTikTokMedia(targetUrl) : await resolveSocialMedia(targetUrl, platformHint);
    if (options?.requireSlides && (!media.slideImages || media.slideImages.length === 0)) {
      return failReply(
        `Tautan TikTok tersebut berupa *Video*, bukan postingan *Slide Foto*.
Gunakan perintah *${config.prefix}tt <link>* untuk mengunduh videonya.`
      );
    }
    if (media.slideImages && media.slideImages.length > 0) {
      botStore.incrementStat("mediaDownloaded");
      const caption2 = renderBotTemplate(config.templates.downloaderCaption, {
        platform: media.platform.toUpperCase(),
        title: media.title,
        author: media.author,
        duration: media.duration ? `${media.duration} detik` : "-",
        botName: config.botName,
        prefix: config.prefix
      });
      const proxySlides = media.slideImages.map(
        (u) => `/api/proxy-media?url=${encodeURIComponent(u)}&type=image`
      );
      return {
        handled: true,
        reactionStatus: "success",
        slideImageUrls: media.slideImages,
        slideFallbackImageUrls: media.slideFallbackImageUrls,
        slideProxyUrls: proxySlides,
        audioRemoteUrl: media.audioUrl,
        audioProxyUrl: media.audioUrl ? `/api/proxy-media?url=${encodeURIComponent(
          media.audioUrl
        )}&type=audio` : void 0,
        mediaTitle: media.title,
        mediaAuthor: media.author,
        replyText: `${caption2}
Total Urutan: *${media.slideImages.length} Foto*`
      };
    }
    if (media.fileUrl) {
      const { buffer, contentType } = await fetchRemoteBuffer(media.fileUrl);
      botStore.incrementStat("mediaDownloaded");
      const fname = media.fileName || "berkas-unduhan";
      const storedUrl = botStore.storeHdMedia(buffer, contentType, fname);
      return {
        handled: true,
        reactionStatus: "success",
        documentBuffer: buffer,
        documentMimeType: contentType,
        documentFileName: fname,
        documentWebUrl: storedUrl,
        replyText: `*Unduhan Berkas Selesai (${media.platform.toUpperCase()})*
Nama: *${fname}*
Ukuran: *${formatByteSize(
          buffer.length
        )}*`
      };
    }
    const caption = renderBotTemplate(config.templates.downloaderCaption, {
      platform: media.platform.toUpperCase(),
      title: media.title,
      author: media.author,
      duration: media.duration ? `${media.duration} detik` : "-",
      botName: config.botName,
      prefix: config.prefix
    });
    if (media.imageUrl && !media.videoUrl) {
      const { buffer, contentType } = await fetchRemoteBuffer(media.imageUrl);
      botStore.incrementStat("mediaDownloaded");
      const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
      const webUrl = botStore.storeHdMedia(buffer, mime, "social-photo.jpg");
      return {
        handled: true,
        reactionStatus: "success",
        imageBuffer: buffer,
        imageMimeType: mime,
        imageWebUrl: webUrl,
        replyText: caption
      };
    }
    if (!media.videoUrl) {
      throw new Error("URL media tidak ditemukan pada tautan tersebut.");
    }
    const { buffer: videoBuf } = await fetchRemoteBuffer(
      media.videoUrl,
      35 * 1024 * 1024,
      media.fallbackVideoUrls || []
    );
    botStore.incrementStat("mediaDownloaded");
    const videoWebUrl = botStore.storeHdMedia(
      videoBuf,
      "video/mp4",
      `wabot-${media.platform}.mp4`
    );
    return {
      handled: true,
      reactionStatus: "success",
      videoBuffer: videoBuf,
      videoMimeType: "video/mp4",
      videoWebUrl,
      mediaTitle: media.title,
      mediaAuthor: media.author,
      mediaDuration: media.duration,
      replyText: caption
    };
  };
  try {
    let result = { handled: true, reactionStatus: "success" };
    switch (matchedCmd.id) {
      case "menu":
      case "allmenu":
      case "menudownload":
      case "menustiker":
      case "menumedia":
      case "menuaudio":
      case "menugrup":
      case "menuotomasi":
      case "menuinfo": {
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: buildMenuText(argsText, matchedCmd.id, ctx.senderName)
        };
        break;
      }
      case "owner": {
        const ownerDigits = normalizePhoneInput(
          config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
        ) || OFFICIAL_OWNER_NUMBER;
        const ownerDisplay = formatPhoneDisplay(ownerDigits);
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: [
            `*Kontak Resmi Owner ${config.botName}*`,
            "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
            `\u2022 *Nama:* ${config.ownerName || "Owner Bot"}`,
            `\u2022 *Nomor:* *${ownerDisplay}*`,
            `\u2022 *Chat Langsung:* https://wa.me/${ownerDigits}`,
            "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
            `_Silakan hubungi nomor di atas untuk keperluan izin grup atau kendala bot._`
          ].join("\n")
        };
        break;
      }
      case "ping": {
        const latency = Math.max(1, Date.now() - startTime);
        const uptime = formatUptime(Date.now() - SERVER_BOOT_TIME);
        const ownerDigits = normalizePhoneInput(
          config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
        ) || OFFICIAL_OWNER_NUMBER;
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: renderBotTemplate(config.templates.pingReply, {
            botName: config.botName,
            latency,
            uptime,
            prefix: config.prefix,
            packName: config.stickerPackName,
            authorName: config.stickerAuthor,
            ownerNumber: ownerDigits,
            ownerDisplay: formatPhoneDisplay(ownerDigits),
            website: config.ownerWebsite
          })
        };
        break;
      }
      case "panel": {
        const ownerDigits = normalizePhoneInput(
          config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
        ) || OFFICIAL_OWNER_NUMBER;
        const botSelfDigits = normalizePhoneInput(
          botStore.waState.connectedUser?.phone || ""
        );
        const senderDigits = normalizePhoneInput(ctx.senderPhone || "");
        const isAuthorizedOwner = isSenderBotOwner(ctx) || Boolean(
          botSelfDigits && senderDigits && botSelfDigits === senderDigits
        );
        if (!isAuthorizedOwner) {
          return failReply(
            `Perintah *${config.prefix}panel* dikhususkan bagi *Owner Bot* (*${formatPhoneDisplay(
              ownerDigits
            )}*).

Jika ini HP keduamu, pastikan nomor WA HP ini sudah didaftarkan sebagai *Nomor Owner* (ketik \`bot owner 628xxx\` di Termux Redmi 9C atau ubah di Pengaturan Panel).`
          );
        }
        if (ctx.isGroup) {
          return failReply(
            `Demi keamanan bot kamu, tautan rahasia Web Control Panel tidak dikirim di dalam Grup.

Silakan kirim perintah *${config.prefix}panel* lewat *Chat Pribadi (Japri)* langsung ke nomor bot ini.`
          );
        }
        const sub = argsText.trim().toLowerCase();
        if (sub === "off" || sub === "stop" || sub === "mati") {
          const snap2 = remoteTunnel.stopTunnel();
          const lanInfo = snap2.lanUrls.length > 0 ? snap2.lanUrls.join("\n\u2022 ") : "Hubungkan ke Wi-Fi yang sama dengan Redmi 9C";
          result = {
            handled: true,
            reactionStatus: "success",
            replyText: [
              `*Akses Panel Luar Rumah Dimatikan*`,
              "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
              `Tunnel publik internet telah dihentikan. Orang luar tidak dapat mengakses server.`,
              "",
              `*Akses Dalam Rumah (Satu Wi-Fi):*`,
              `\u2022 ${lanInfo}`,
              "",
              `_Ketik *${config.prefix}panel* kapan saja untuk menyalakan kembali akses luar rumah._`
            ].join("\n")
          };
          break;
        }
        if (sub === "resetkey" || sub === "reset") {
          remoteTunnel.rotateAccessKey();
          const snap2 = remoteTunnel.getSnapshot().status === "online" ? remoteTunnel.getSnapshot() : await remoteTunnel.startTunnel();
          result = {
            handled: true,
            reactionStatus: "success",
            replyText: [
              `*Kunci Akses Panel Berhasil Diperbarui*`,
              "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
              snap2.magicUrl ? `*Klik Tautan Baru (Otomatis Masuk):*
${snap2.magicUrl}` : `*Kunci Akses Baru:* \`${snap2.accessKey}\``,
              "",
              `Tautan lama otomatis hangus dan tidak berlaku lagi.`
            ].join("\n")
          };
          break;
        }
        const snap = await remoteTunnel.startTunnel();
        const lanLines = snap.lanUrls.length > 0 ? snap.lanUrls.map((u) => `\u2022 ${u}`).join("\n") : `\u2022 ${snap.localhostUrl} _(cek Wi-Fi Redmi 9C)_`;
        const lines = [
          `*Akses Web Control Panel \u2014 ${config.botName}*`,
          "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
        ];
        if (snap.magicUrl) {
          lines.push(`*1. Luar Rumah / Beda Jaringan (4G/5G):*`);
          lines.push(`Klik langsung dari browser HP kedua kamu:`);
          lines.push(`${snap.magicUrl}`);
          lines.push(
            `_(Sudah berisi Kunci Owner \u2014 otomatis login tanpa ketik sandi)_`
          );
        } else {
          lines.push(`*1. Luar Rumah / Beda Jaringan (4G/5G):*`);
          lines.push(
            `Tunnel belum aktif: ${snap.lastError || "Jalankan sekali di Termux Redmi 9C: pkg install -y cloudflared"}`
          );
        }
        lines.push("");
        lines.push(`*2. Dalam Rumah (Satu Wi-Fi dgn Redmi 9C):*`);
        lines.push(lanLines);
        lines.push("");
        lines.push(`*Kunci Akses Cadangan:* \`${snap.accessKey}\``);
        lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
        lines.push(
          `_Perintah cepat: *${config.prefix}panel off* (matikan publik) \xB7 *${config.prefix}panel resetkey* (ganti kunci)_`
        );
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: lines.join("\n")
        };
        break;
      }
      // ================= PERKAKAS MEDIA & .HDSW (GRUP & CHAT PRIBADI) =================
      case "hdsw": {
        if (!ctx.documentMedia) {
          if (ctx.attachedNonDocumentMedia) {
            return failReply(
              `Supaya kualitas & ukuran file tetap 100% asli (tidak dikompresi WhatsApp), kirim file foto/video melalui menu *Dokumen (Document)* lalu beri caption *${config.prefix}hdsw* atau balas dokumen tersebut dengan *${config.prefix}hdsw*.`
            );
          }
          return failReply(
            `Kirim file *Foto* atau *Video* lewat menu *Dokumen (Document)* dengan caption *${config.prefix}hdsw* (atau balas file dokumen foto/video dengan *${config.prefix}hdsw*).

Bisa dipakai di *Grup* maupun *Chat Pribadi*! Bot akan membalasnya sebagai media ukuran asli ala WA Web agar tinggal kamu *Teruskan (Forward)* jernih ke Status WA.`
          );
        }
        if (ctx.documentMedia.kind === "unsupported" || !ctx.documentMedia.buffer) {
          return failReply(
            `Fitur *${config.prefix}hdsw* hanya berfungsi untuk file Dokumen berupa *Foto* (JPG, PNG, WebP) atau *Video* (MP4, MOV). File *${ctx.documentMedia.fileName || ctx.documentMedia.mimeType || "terlampir"}* tidak didukung.`
          );
        }
        const doc = ctx.documentMedia;
        const validKind = doc.kind === "video" ? "video" : "image";
        let finalBuffer = doc.buffer;
        let finalMime = doc.mimeType;
        let width;
        let height;
        let jpegThumbnail = doc.jpegThumbnail ? doc.jpegThumbnail.toString("base64") : void 0;
        if (validKind === "image") {
          const prepared = await prepareHdStatusImage(
            finalBuffer,
            finalMime,
            jpegThumbnail
          );
          finalBuffer = prepared.buffer;
          finalMime = prepared.mimeType;
          width = prepared.width;
          height = prepared.height;
          jpegThumbnail = prepared.jpegThumbnail;
        } else {
          finalMime = "video/mp4";
        }
        const fileSizeLabel = formatByteSize(finalBuffer.length);
        const mediaKindLabel = validKind === "video" ? "Video Asli" : "Foto Asli";
        const webUrl = botStore.storeHdMedia(
          finalBuffer,
          finalMime,
          doc.fileName || (validKind === "video" ? "hd-status.mp4" : "hd-status.jpg")
        );
        const resolvedCaption = argsText.toLowerCase() === "nocaption" ? "" : argsText ? argsText : ctx.isGroup ? renderBotTemplate(config.templates.hdswGroupConfirm, {
          mediaKind: mediaKindLabel,
          fileName: doc.fileName || mediaKindLabel,
          fileSize: fileSizeLabel,
          sender: ctx.senderPhone,
          target: ctx.senderPhone,
          botName: config.botName,
          prefix: config.prefix
        }) : renderBotTemplate(config.templates.hdswCaption, {
          mediaKind: mediaKindLabel,
          fileSize: fileSizeLabel,
          fileName: doc.fileName || mediaKindLabel,
          botName: config.botName,
          prefix: config.prefix
        });
        botStore.incrementStat("mediaDownloaded");
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: resolvedCaption,
          mentions: ctx.isGroup ? [ctx.senderJid || `${ctx.senderPhone}@s.whatsapp.net`] : void 0,
          hdswMedia: {
            kind: validKind,
            buffer: finalBuffer,
            mimeType: finalMime,
            fileName: doc.fileName || (validKind === "video" ? "status-hd.mp4" : "status-hd.jpg"),
            fileSizeLabel,
            caption: resolvedCaption,
            webUrl,
            width,
            height,
            jpegThumbnail
          }
        };
        break;
      }
      case "hd":
      case "remini":
      case "upscale":
      case "hd2":
      case "hd4": {
        const imgBuf = ctx.imageBuffer || (ctx.documentMedia?.kind === "image" ? ctx.documentMedia.buffer : null);
        const inputMime = ctx.imageMimeType || (ctx.documentMedia?.kind === "image" ? ctx.documentMedia.mimeType : void 0);
        if (!imgBuf) {
          return failReply(
            `Kirim sebuah foto dengan caption *${config.prefix}${matchedCmd.id}* atau balas (reply) foto seseorang dengan perintah *${config.prefix}${matchedCmd.id}*.`
          );
        }
        const modeMap = {
          hd: "auto",
          remini: "face",
          upscale: "upscale",
          hd2: "2x",
          hd4: "4x"
        };
        const enhanceMode = modeMap[matchedCmd.id] || "auto";
        const scaleOverride = matchedCmd.id === "hd2" ? 2 : matchedCmd.id === "hd4" ? 4 : void 0;
        let faceModelOverride;
        let fidelityOverride;
        if (argsText) {
          const tokens = argsText.toLowerCase().split(/\s+/).filter(Boolean);
          for (const tok of tokens) {
            if (tok === "codeformer" || tok === "cf") {
              faceModelOverride = "codeformer";
            } else if (tok === "gfpgan" || tok === "gfp") {
              faceModelOverride = "gfpgan";
            } else {
              const maybeNum = Number(tok.replace(",", "."));
              if (Number.isFinite(maybeNum) && maybeNum >= 0.05 && maybeNum <= 0.98) {
                fidelityOverride = maybeNum;
              }
            }
          }
        }
        const enhanced = await aiEnhancer.enhancePhoto({
          imageBuffer: imgBuf,
          mimeType: inputMime,
          mode: enhanceMode,
          scaleOverride,
          faceModelOverride,
          fidelityOverride,
          config: config.aiEnhance,
          onStatus: ctx.onProgressStatus
        });
        const ephemeralWebUrl = ctx.source === "simulator" ? botStore.storeHdMedia(
          enhanced.buffer,
          enhanced.mimeType,
          `wabot-${matchedCmd.id}.${enhanced.mimeType === "image/png" ? "png" : "jpg"}`,
          5 * 60 * 1e3
        ) : void 0;
        botStore.incrementStat("mediaDownloaded");
        const headerTitle = enhanceMode === "face" ? "*AI Face Restoration Selesai*" : enhanceMode === "2x" ? "*AI Super-Resolution 2\xD7 Selesai*" : enhanceMode === "4x" ? "*AI Super-Resolution 4\xD7 Selesai*" : enhanceMode === "upscale" ? "*AI Super-Resolution Selesai*" : "*AI Photo Enhance Selesai*";
        const { meta } = enhanced;
        const captionLines = [
          headerTitle,
          `\u2022 Resolusi: *${meta.inputWidth}\xD7${meta.inputHeight} px* \u2192 *${meta.outputWidth}\xD7${meta.outputHeight} px* (*${meta.effectiveScale}\xD7*)`,
          `\u2022 Pipeline Model: *${meta.modelsUsed.join(" + ")}*`
        ];
        if (meta.facesDetected > 0 && meta.faceModelUsed) {
          captionLines.push(
            `\u2022 Restorasi Wajah: *${meta.facesDetected} wajah* (Fidelity: *${meta.fidelityUsed.toFixed(
              2
            )}*)`
          );
        }
        const elapsedSec = meta.durationMs > 0 ? `${(meta.durationMs / 1e3).toFixed(1)} dtk \xB7 ` : "";
        captionLines.push(
          `\u2022 Berkas: *${elapsedSec}${formatByteSize(enhanced.buffer.length)}*`
        );
        captionLines.push(
          "_Catatan: Detail mikro direkonstruksi oleh model AI pretrained sebagai estimasi restorasi visual, bukan rekaman optik asli yang hilang._"
        );
        result = {
          handled: true,
          reactionStatus: "success",
          imageBuffer: enhanced.buffer,
          imageMimeType: enhanced.mimeType,
          imageWebUrl: ephemeralWebUrl,
          replyText: captionLines.join("\n")
        };
        break;
      }
      case "hitamkan":
      case "imgedit": {
        const imgBuf = ctx.imageBuffer || (ctx.documentMedia?.kind === "image" ? ctx.documentMedia.buffer : null);
        if (!imgBuf) {
          return failReply(
            `Kirim atau balas (reply) sebuah foto.
Contoh: *${config.prefix}hitamkan*, *${config.prefix}blur*, *${config.prefix}invert*, *${config.prefix}mirror*, atau *${config.prefix}sepia*.`
          );
        }
        let filterMode = "grayscale";
        const sub = (matchedCmd.id === "hitamkan" ? "hitamkan" : rawCmd !== "imgedit" ? rawCmd : argsText.split(/\s+/)[0] || "blur").toLowerCase();
        if (sub === "negatif" || sub === "invert") filterMode = "invert";
        else if (sub === "blur") filterMode = "blur";
        else if (sub === "mirror") filterMode = "mirror";
        else if (sub === "flip") filterMode = "flip";
        else if (sub === "sepia") filterMode = "sepia";
        else filterMode = "hitamkan";
        const outBuf = await applyImageFilter(imgBuf, filterMode);
        const webUrl = botStore.storeHdMedia(
          outBuf,
          "image/jpeg",
          `wabot-${filterMode}.jpg`
        );
        result = {
          handled: true,
          reactionStatus: "success",
          imageBuffer: outBuf,
          imageMimeType: "image/jpeg",
          imageWebUrl: webUrl,
          replyText: `*Efek Gambar (${filterMode.toUpperCase()}) Selesai*`
        };
        break;
      }
      case "rvo": {
        if (!ctx.viewOnceMedia) {
          if (ctx.viewOnceError) {
            return failReply(ctx.viewOnceError);
          }
          return failReply(
            `Ketik *${config.prefix}rvo* (atau balas pesan View Once) untuk membuka foto/video sekali lihat terakhir di chat ini.`
          );
        }
        const vo = ctx.viewOnceMedia;
        const caption = vo.caption ? `*Media View Once Dibuka*
Caption asli: ${vo.caption}` : `*Media View Once Berhasil Dibuka*`;
        if (vo.kind === "image") {
          const webUrl = botStore.storeHdMedia(
            vo.buffer,
            vo.mimeType || "image/jpeg",
            "viewonce.jpg"
          );
          result = {
            handled: true,
            reactionStatus: "success",
            imageBuffer: vo.buffer,
            imageMimeType: vo.mimeType || "image/jpeg",
            imageWebUrl: webUrl,
            replyText: caption
          };
        } else if (vo.kind === "video") {
          const webUrl = botStore.storeHdMedia(
            vo.buffer,
            vo.mimeType || "video/mp4",
            "viewonce.mp4"
          );
          result = {
            handled: true,
            reactionStatus: "success",
            videoBuffer: vo.buffer,
            videoMimeType: vo.mimeType || "video/mp4",
            videoWebUrl: webUrl,
            replyText: caption
          };
        } else {
          const webUrl = botStore.storeHdMedia(
            vo.buffer,
            vo.mimeType || "audio/ogg; codecs=opus",
            "viewonce-audio.ogg"
          );
          result = {
            handled: true,
            reactionStatus: "success",
            audioBuffer: vo.buffer,
            audioMimeType: vo.mimeType || "audio/mpeg",
            audioWebUrl: webUrl,
            asVoiceNote: Boolean(vo.isVoiceNote),
            replyText: caption
          };
        }
        break;
      }
      case "toptv": {
        const vidBuf = ctx.videoBuffer || (ctx.documentMedia?.kind === "video" ? ctx.documentMedia.buffer : null);
        if (!vidBuf) {
          return failReply(
            `Kirim atau balas (reply) video dengan *${config.prefix}toptv* untuk mengubahnya menjadi Video Note bulat (PTV).`
          );
        }
        const ptvBuf = await convertVideoToPtv(vidBuf);
        const webUrl = botStore.storeHdMedia(ptvBuf, "video/mp4", "ptv-note.mp4");
        result = {
          handled: true,
          reactionStatus: "success",
          videoBuffer: ptvBuf,
          videoMimeType: "video/mp4",
          videoWebUrl: webUrl,
          asPtv: true,
          replyText: "Video Note bulat (PTV) berhasil dibuat."
        };
        break;
      }
      case "qrcode": {
        if (!argsText && !ctx.quotedText) {
          return failReply(
            `Ketik teks atau tautan setelah perintah.
Contoh: *${config.prefix}qrcode https://wa.me/${OFFICIAL_OWNER_NUMBER}*`
          );
        }
        const targetStr = argsText || ctx.quotedText || "";
        const qrBuf = await generateQrImage(targetStr);
        const webUrl = botStore.storeHdMedia(qrBuf, "image/png", "qrcode.png");
        result = {
          handled: true,
          reactionStatus: "success",
          imageBuffer: qrBuf,
          imageMimeType: "image/png",
          imageWebUrl: webUrl,
          replyText: `*Kode QR Siap Pindai*
Isi: ${targetStr.slice(0, 140)}`
        };
        break;
      }
      case "tourl": {
        let buf = null;
        let mime = "application/octet-stream";
        let name = "media.bin";
        if (ctx.imageBuffer) {
          buf = ctx.imageBuffer;
          mime = "image/jpeg";
          name = "image.jpg";
        } else if (ctx.videoBuffer) {
          buf = ctx.videoBuffer;
          mime = "video/mp4";
          name = "video.mp4";
        } else if (ctx.audioBuffer) {
          buf = ctx.audioBuffer;
          mime = "audio/mpeg";
          name = "audio.mp3";
        } else if (ctx.stickerBuffer) {
          buf = ctx.stickerBuffer;
          mime = "image/webp";
          name = "sticker.webp";
        } else if (ctx.documentMedia?.buffer) {
          buf = ctx.documentMedia.buffer;
          mime = ctx.documentMedia.mimeType;
          name = ctx.documentMedia.fileName || "file.bin";
        }
        if (!buf) {
          return failReply(
            `Kirim atau balas (reply) foto, video, audio, atau stiker dengan *${config.prefix}tourl* untuk mendapatkan tautan publik.`
          );
        }
        const localPath = botStore.storeHdMedia(buf, mime, name);
        const remoteLink = await uploadBufferToPublicUrl(buf, name, mime);
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: [
            `*Media Berhasil Diunggah*`,
            `Ukuran: *${formatByteSize(buf.length)}*`,
            remoteLink ? `Tautan Publik: ${remoteLink}` : `Tautan Server Lokal: ${localPath}`
          ].join("\n")
        };
        break;
      }
      // ================= DOWNLOADER MULTI-PLATFORM =================
      case "aio":
      case "tt":
      case "ttslide":
      case "ig":
      case "fb":
      case "tw":
      case "pin":
      case "capcut":
      case "mf":
      case "yt": {
        const targetUrl = extractFirstUrl(argsText) || extractFirstUrl(ctx.quotedText || "");
        if (!targetUrl) {
          return failReply(
            `Masukkan tautan yang valid (atau reply pesan berisi link).
Contoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const hintMap = {
          aio: "auto",
          tt: "tiktok",
          ttslide: "tiktok",
          ig: "instagram",
          fb: "facebook",
          tw: "twitter",
          pin: "pinterest",
          capcut: "capcut",
          mf: "mediafire",
          yt: "youtube"
        };
        result = await buildSocialDownloadResponse(
          targetUrl,
          hintMap[matchedCmd.id] || "auto",
          { requireSlides: matchedCmd.id === "ttslide" }
        );
        break;
      }
      // ================= AUDIO, MUSIK & EFEK SUARA =================
      case "mp3": {
        const targetUrl = extractFirstUrl(argsText) || extractFirstUrl(ctx.quotedText || "");
        if (!targetUrl) {
          return failReply(
            `Masukkan tautan video sosmed yang ingin diambil MP3-nya.
Contoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const media = await resolveSocialMedia(targetUrl, "auto", {
          audioOnly: true
        });
        const streamUrl = media.audioUrl || media.videoUrl;
        if (!streamUrl) {
          throw new Error(
            "Jalur audio MP3 tidak tersedia pada tautan tersebut."
          );
        }
        const fallbacks = media.audioUrl ? [...media.fallbackAudioUrls || [], ...media.videoUrl ? [media.videoUrl] : []] : media.fallbackVideoUrls || [];
        const { buffer: rawStreamBuf, contentType } = await fetchRemoteBuffer(
          streamUrl,
          35 * 1024 * 1024,
          fallbacks
        );
        const mp3Buf = await ensurePlayableMp3Buffer(rawStreamBuf, contentType);
        botStore.incrementStat("mediaDownloaded");
        const audioWebUrl = botStore.storeHdMedia(
          mp3Buf,
          "audio/mpeg",
          "wabot-audio.mp3"
        );
        result = {
          handled: true,
          reactionStatus: "success",
          audioBuffer: mp3Buf,
          audioMimeType: "audio/mpeg",
          audioWebUrl,
          mediaTitle: media.title,
          mediaAuthor: media.author,
          mediaDuration: media.duration,
          replyText: renderBotTemplate(config.templates.audioCaption, {
            title: media.title,
            author: media.author,
            duration: media.duration ? `${media.duration} detik` : "-",
            botName: config.botName,
            prefix: config.prefix
          })
        };
        break;
      }
      case "play": {
        const query = argsText || ctx.quotedText || "";
        if (!query.trim()) {
          return failReply(
            `Ketik judul lagu atau nama penyanyi.
Contoh: *${config.prefix}play Hindia Evaluasi*`
          );
        }
        const track = await searchAndDownloadPlay(query);
        if (!track.audioUrl) {
          throw new Error("Sumber audio lagu tidak tersedia saat ini.");
        }
        const { buffer: rawAudioBuf, contentType } = await fetchRemoteBuffer(
          track.audioUrl,
          35 * 1024 * 1024,
          track.fallbackAudioUrls || []
        );
        const mp3Buf = await ensurePlayableMp3Buffer(rawAudioBuf, contentType);
        botStore.incrementStat("mediaDownloaded");
        const audioWebUrl = botStore.storeHdMedia(
          mp3Buf,
          "audio/mpeg",
          "wabot-song.mp3"
        );
        result = {
          handled: true,
          reactionStatus: "success",
          audioBuffer: mp3Buf,
          audioMimeType: "audio/mpeg",
          audioWebUrl,
          mediaTitle: track.title,
          mediaAuthor: track.author,
          mediaDuration: track.duration,
          replyText: `*Lagu Ditemukan*
Judul: *${track.title}*
Artis: *${track.author}*`
        };
        break;
      }
      case "tomp3":
      case "tovn": {
        const mediaBuf = ctx.audioBuffer || ctx.videoBuffer || (ctx.documentMedia?.kind === "video" ? ctx.documentMedia.buffer : null);
        if (!mediaBuf) {
          return failReply(
            `Balas (reply) sebuah video, musik, atau Voice Note dengan *${config.prefix}${matchedCmd.id}*.`
          );
        }
        const isVn = matchedCmd.id === "tovn";
        const converted = await extractOrConvertAudio(
          mediaBuf,
          isVn ? "vn" : "mp3"
        );
        const webUrl = botStore.storeHdMedia(
          converted.buffer,
          converted.mimeType,
          `wabot-audio.${converted.ext}`
        );
        result = {
          handled: true,
          reactionStatus: "success",
          audioBuffer: converted.buffer,
          audioMimeType: converted.mimeType,
          audioWebUrl: webUrl,
          asVoiceNote: isVn,
          mediaTitle: isVn ? "Voice Note (PTT)" : "Ekstraksi Audio MP3",
          replyText: isVn ? "Berhasil diubah menjadi pesan suara Voice Note." : "Audio MP3 berhasil diekstrak."
        };
        break;
      }
      case "bass":
      case "nightcore":
      case "slow":
      case "fast":
      case "robot":
      case "reverse": {
        const audioInput = ctx.audioBuffer || ctx.videoBuffer;
        if (!audioInput) {
          return failReply(
            `Balas (reply) sebuah lagu, Voice Note, atau video dengan *${config.prefix}${matchedCmd.id}* untuk menerapkan efek suara.`
          );
        }
        const effectMode = matchedCmd.id;
        const processed = await applyAudioEffect(audioInput, effectMode);
        const webUrl = botStore.storeHdMedia(
          processed.buffer,
          processed.mimeType,
          `wabot-${effectMode}.mp3`
        );
        result = {
          handled: true,
          reactionStatus: "success",
          audioBuffer: processed.buffer,
          audioMimeType: processed.mimeType,
          audioWebUrl: webUrl,
          mediaTitle: `Efek Suara ${effectMode.toUpperCase()}`,
          replyText: `*Efek Audio (${effectMode.toUpperCase()}) Selesai*`
        };
        break;
      }
      // ================= STUDIO STIKER & MAKER =================
      case "s": {
        const vidSource = ctx.videoBuffer || (ctx.documentMedia?.kind === "video" ? ctx.documentMedia.buffer : null);
        const imgSource = ctx.imageBuffer || (ctx.documentMedia?.kind === "image" ? ctx.documentMedia.buffer : null);
        if (!imgSource && !vidSource) {
          return failReply(
            renderBotTemplate(config.templates.stickerMissingMedia, {
              prefix: config.prefix,
              botName: config.botName,
              packName: config.stickerPackName,
              authorName: config.stickerAuthor
            })
          );
        }
        const stickerBuf = vidSource ? await videoToAnimatedStickerWebp(
          vidSource,
          config.stickerPackName,
          config.stickerAuthor
        ) : await imageToStickerWebp(
          imgSource,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
          replyText: renderBotTemplate(config.templates.stickerReply, {
            packName: config.stickerPackName,
            authorName: config.stickerAuthor,
            botName: config.botName
          })
        };
        break;
      }
      case "qc":
      case "iqc": {
        const bubbleText = argsText || ctx.quotedText || "";
        if (!bubbleText.trim()) {
          return failReply(
            `Ketik teks setelah perintah atau balas (reply) pesan teman dengan *${config.prefix}${matchedCmd.id}*.
Contoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const rawSender = !argsText && ctx.quotedSenderName ? ctx.quotedSenderName : ctx.senderName;
        const bubbleSender = ctx.source === "simulator" ? rawSender.replace(/\s*\((Owner|Member)\)\s*$/i, "").trim() || rawSender : rawSender;
        const avatarBuffer = ctx.senderAvatarBuffer ?? (!argsText && ctx.quotedAvatarBuffer ? ctx.quotedAvatarBuffer : null) ?? ctx.imageBuffer ?? null;
        const stickerBuf = await createQuoteChatSticker({
          text: bubbleText,
          senderName: bubbleSender,
          style: matchedCmd.id === "iqc" ? "ios" : "wa",
          packName: config.stickerPackName,
          author: config.stickerAuthor,
          avatarBuffer
        });
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "brat":
      case "bratwhite": {
        const textVal = argsText || ctx.quotedText || "";
        if (!textVal) {
          return failReply(
            `Ketik teks setelah perintah.
Contoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const variant = matchedCmd.id === "brat" ? "lime" : "white";
        const stickerBuf = await createBratSticker(
          textVal,
          variant,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "bratcolor": {
        if (!argsText) {
          return failReply(
            `Gunakan format *${config.prefix}bratcolor warna | teks*.
Pilihan warna: pink, biru, merah, ungu, kuning, hitam, oranye, cyan.
Contoh: *${config.prefix}bratcolor pink | santai dulu*`
          );
        }
        let colorKey = "pink";
        let content = argsText;
        if (argsText.includes("|")) {
          const [c, ...rest] = argsText.split("|");
          colorKey = (c || "pink").trim();
          content = rest.join("|").trim();
        } else {
          const [firstWord, ...restWords] = argsText.split(/\s+/);
          if (restWords.length > 0) {
            colorKey = firstWord;
            content = restWords.join(" ");
          }
        }
        const stickerBuf = await createBratSticker(
          content || "santai",
          colorKey,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "bratvid": {
        const textVal = argsText || ctx.quotedText || "";
        if (!textVal) {
          return failReply(
            `Ketik kalimat singkat setelah perintah untuk dibuat stiker Brat bergerak.
Contoh: *${config.prefix}bratvid santai dulu ngopi sebentar*`
          );
        }
        const stickerBuf = await createBratAnimatedSticker(
          textVal,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "ttp":
      case "attp": {
        const textVal = argsText || ctx.quotedText || "";
        if (!textVal) {
          return failReply(
            `Ketik teks setelah perintah.
Contoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const stickerBuf = matchedCmd.id === "attp" ? await createAttpSticker(
          textVal,
          config.stickerPackName,
          config.stickerAuthor
        ) : await createTtpSticker(
          textVal,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "meme": {
        try {
          const meme = await fetchMemeFromWeb(argsText);
          const webUrl = botStore.storeHdMedia(
            meme.buffer,
            meme.mimeType,
            "meme.jpg"
          );
          result = {
            handled: true,
            reactionStatus: "success",
            imageBuffer: meme.buffer,
            imageMimeType: meme.mimeType,
            imageWebUrl: webUrl,
            replyText: `\u{1F602} *${meme.title}*
\u{1F310} _Sumber: ${meme.source}_`
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Gagal mengambil meme";
          return failReply(
            `Gagal mengambil gambar meme dari referensi web (${errMsg}). Coba ketik *${config.prefix}meme* kembali.`
          );
        }
        break;
      }
      case "smeme": {
        if (!argsText && !ctx.imageBuffer && !ctx.stickerBuffer) {
          return failReply(
            `Gunakan format *${config.prefix}smeme teks atas | teks bawah* (bisa sambil melampirkan atau me-reply foto maupun stiker untuk dijadikan stiker meme).`
          );
        }
        const parts = argsText.split("|");
        const topText = (parts[0] || "").trim();
        const bottomText = (parts.slice(1).join(" ") || "").trim();
        let baseImg = ctx.imageBuffer ?? null;
        if (!baseImg && ctx.stickerBuffer) {
          try {
            baseImg = await stickerWebpToPng(ctx.stickerBuffer);
          } catch {
            baseImg = null;
          }
        }
        const stickerBuf = await createMemeSticker(
          topText || (bottomText ? "" : "SANTAI DULU"),
          bottomText,
          baseImg,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "emojimix": {
        if (!argsText) {
          return failReply(
            `Masukkan 2 emoji dipisah tanda tambah.
Contoh: *${config.prefix}emojimix \u{1F600}+\u{1F60E}*`
          );
        }
        const stickerBuf = await createEmojiMixSticker(
          argsText,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat("stickersCreated");
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl
        };
        break;
      }
      case "wm": {
        let targetSticker = ctx.stickerBuffer;
        if (!targetSticker && ctx.imageBuffer) {
          targetSticker = await imageToStickerWebp(
            ctx.imageBuffer,
            config.stickerPackName,
            config.stickerAuthor
          );
        }
        if (!targetSticker) {
          return failReply(
            `Balas (reply) sebuah stiker (atau foto) dengan format *${config.prefix}wm <nama>* atau *${config.prefix}wm <pack> | <author>* untuk mengubah hak cipta stiker.`
          );
        }
        let newPack;
        let newAuthor;
        if (argsText.includes("|")) {
          const parts = argsText.split("|");
          newPack = (parts[0] || "").trim() || config.stickerPackName || "WA Sticker";
          newAuthor = (parts.slice(1).join("|") || "").trim();
        } else if (argsText.trim()) {
          const singleName = argsText.trim();
          newPack = singleName;
          newAuthor = "";
        } else {
          newPack = config.stickerPackName || "WA Sticker";
          newAuthor = "";
        }
        const rebranded = await rewriteStickerExif(
          targetSticker,
          newPack,
          newAuthor
        );
        const webUrl = botStore.storeSticker(rebranded);
        botStore.incrementStat("stickersCreated");
        const labelConfirmed = newAuthor ? `*${newPack}* \xB7 *${newAuthor}*` : `*${newPack}*`;
        result = {
          handled: true,
          reactionStatus: "success",
          stickerBuffer: rebranded,
          stickerWebUrl: webUrl,
          stickerPackOverride: { pack: newPack, author: newAuthor || newPack },
          replyText: `Watermark stiker diperbarui: ${labelConfirmed}`
        };
        break;
      }
      case "toimg": {
        if (!ctx.stickerBuffer) {
          return failReply(
            `Balas (reply) sebuah stiker dengan *${config.prefix}toimg* untuk mengubahnya menjadi foto PNG.`
          );
        }
        const pngBuf = await stickerWebpToPng(ctx.stickerBuffer);
        const webUrl = botStore.storeHdMedia(
          pngBuf,
          "image/png",
          "sticker-to-image.png"
        );
        result = {
          handled: true,
          reactionStatus: "success",
          imageBuffer: pngBuf,
          imageMimeType: "image/png",
          imageWebUrl: webUrl,
          replyText: "*Stiker berhasil diubah menjadi gambar PNG*"
        };
        break;
      }
      case "tovid": {
        if (!ctx.stickerBuffer) {
          return failReply(
            `Balas (reply) sebuah stiker animasi bergerak dengan *${config.prefix}tovid* untuk mengubahnya menjadi video MP4.`
          );
        }
        const mp4Buf = await animatedWebpToMp4(ctx.stickerBuffer);
        const webUrl = botStore.storeHdMedia(
          mp4Buf,
          "video/mp4",
          "sticker-to-video.mp4"
        );
        result = {
          handled: true,
          reactionStatus: "success",
          videoBuffer: mp4Buf,
          videoMimeType: "video/mp4",
          videoWebUrl: webUrl,
          replyText: "*Stiker berhasil diubah menjadi video MP4*"
        };
        break;
      }
      // ================= ADMIN & MODERASI GRUP =================
      case "kick": {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        const target = resolveGroupTarget(argsText, ctx);
        if (!target) {
          return failReply(
            `Tag anggota, masukkan nomor, atau reply pesan anggota yang ingin dikeluarkan.
Contoh: *${config.prefix}kick @628577000333*`
          );
        }
        if (target.phone === ctx.senderPhone) {
          return failReply(
            "Kamu tidak dapat mengeluarkan nomor kamu sendiri."
          );
        }
        const kickCooldown = checkGroupActionCooldown(ctx, "mutation", 12e3);
        if (kickCooldown) return failReply(kickCooldown);
        if (ctx.waGroupOps) {
          await ctx.waGroupOps.removeParticipant(target.jid);
        } else {
          const exists = botStore.groupMembers.some(
            (m) => m.jid === target.jid || m.phone === target.phone
          );
          if (!exists) {
            return failReply(
              `Anggota dengan nomor *+${target.phone}* tidak ditemukan di grup ini.`
            );
          }
          botStore.setGroupMembers(
            botStore.groupMembers.filter(
              (m) => m.jid !== target.jid && m.phone !== target.phone
            )
          );
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: renderBotTemplate(config.templates.kickSuccess, {
            target: target.phone,
            sender: ctx.senderPhone,
            targetName: target.member?.name || `+${target.phone}`,
            botName: config.botName,
            prefix: config.prefix,
            groupName: ctx.groupName || botStore.groupState.subject
          }),
          mentions: [target.jid]
        };
        break;
      }
      case "add": {
        return failReply(SUSPENSION_RISK_DISABLED_REPLY);
      }
      case "promote": {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        const target = resolveGroupTarget(argsText, ctx);
        if (!target) {
          return failReply(
            `Tag anggota, masukkan nomor, atau reply pesan anggota yang ingin dijadikan Admin.
Contoh: *${config.prefix}promote @628577000333*`
          );
        }
        const promoteCooldown = checkGroupActionCooldown(
          ctx,
          "mutation",
          12e3
        );
        if (promoteCooldown) return failReply(promoteCooldown);
        if (ctx.waGroupOps) {
          await ctx.waGroupOps.promoteParticipant(target.jid);
        } else {
          const exists = botStore.groupMembers.some(
            (m) => m.jid === target.jid || m.phone === target.phone
          );
          if (!exists) {
            return failReply(
              `Anggota *+${target.phone}* tidak ditemukan di grup.`
            );
          }
          botStore.setGroupMembers(
            botStore.groupMembers.map(
              (m) => m.jid === target.jid || m.phone === target.phone ? { ...m, isAdmin: true } : m
            )
          );
        }
        const promoteTpl = botStore.getEffectiveTemplate(
          "promoteSuccess",
          effectiveGroupId
        );
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: renderBotTemplate(promoteTpl, {
            target: target.phone,
            sender: ctx.senderPhone,
            targetName: target.member?.name || `+${target.phone}`,
            botName: config.botName,
            prefix: config.prefix,
            groupName: ctx.groupName || botStore.groupState.subject
          }),
          mentions: [target.jid]
        };
        break;
      }
      case "demote": {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        const target = resolveGroupTarget(argsText, ctx);
        if (!target) {
          return failReply(
            `Tag admin, masukkan nomor, atau reply pesan admin yang ingin diturunkan.
Contoh: *${config.prefix}demote @628138000222*`
          );
        }
        const demoteCooldown = checkGroupActionCooldown(ctx, "mutation", 12e3);
        if (demoteCooldown) return failReply(demoteCooldown);
        if (ctx.waGroupOps) {
          await ctx.waGroupOps.demoteParticipant(target.jid);
        } else {
          const exists = botStore.groupMembers.some(
            (m) => m.jid === target.jid || m.phone === target.phone
          );
          if (!exists) {
            return failReply(
              `Anggota *+${target.phone}* tidak ditemukan di grup.`
            );
          }
          botStore.setGroupMembers(
            botStore.groupMembers.map(
              (m) => m.jid === target.jid || m.phone === target.phone ? { ...m, isAdmin: false } : m
            )
          );
        }
        const demoteTpl = botStore.getEffectiveTemplate(
          "demoteSuccess",
          effectiveGroupId
        );
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: renderBotTemplate(demoteTpl, {
            target: target.phone,
            sender: ctx.senderPhone,
            targetName: target.member?.name || `+${target.phone}`,
            botName: config.botName,
            prefix: config.prefix,
            groupName: ctx.groupName || botStore.groupState.subject
          }),
          mentions: [target.jid]
        };
        break;
      }
      case "group": {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        const arg = argsText.toLowerCase();
        const isOpen = arg === "open" || arg === "buka" || arg === "unlocked";
        const isClose = arg === "close" || arg === "tutup" || arg === "locked";
        if (!isOpen && !isClose) {
          return failReply(
            `Gunakan *${config.prefix}group open* (buka chat semua member) atau *${config.prefix}group close* (khusus admin).`
          );
        }
        const announcementOnly = isClose;
        const groupLockCooldown = checkGroupActionCooldown(
          ctx,
          "mutation",
          1e4
        );
        if (groupLockCooldown) return failReply(groupLockCooldown);
        if (ctx.waGroupOps) {
          await ctx.waGroupOps.setGroupAnnouncement(announcementOnly);
        } else {
          botStore.updateGroupState({ isAnnouncementOnly: announcementOnly });
        }
        const groupTpl = botStore.getEffectiveTemplate(
          announcementOnly ? "groupCloseSuccess" : "groupOpenSuccess",
          effectiveGroupId
        );
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: renderBotTemplate(groupTpl, {
            botName: config.botName,
            prefix: config.prefix,
            sender: ctx.senderPhone,
            groupName: ctx.groupName || botStore.groupState.subject
          })
        };
        break;
      }
      case "setname": {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        if (!argsText) {
          return failReply(
            `Masukkan nama grup baru.
Contoh: *${config.prefix}setname Ruang Diskusi Komunitas*`
          );
        }
        const newSubject = argsText.slice(0, 80);
        const setNameCooldown = checkGroupActionCooldown(
          ctx,
          "mutation",
          15e3
        );
        if (setNameCooldown) return failReply(setNameCooldown);
        if (ctx.waGroupOps) {
          await ctx.waGroupOps.setGroupSubject(newSubject);
        } else {
          botStore.updateGroupState({ subject: newSubject });
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `Nama grup berhasil diperbarui menjadi *${newSubject}*.`
        };
        break;
      }
      case "setdesc": {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        if (!argsText) {
          return failReply(
            `Masukkan teks deskripsi baru.
Contoh: *${config.prefix}setdesc Ruang diskusi santai anggota komunitas*`
          );
        }
        const setDescCooldown = checkGroupActionCooldown(
          ctx,
          "mutation",
          15e3
        );
        if (setDescCooldown) return failReply(setDescCooldown);
        if (ctx.waGroupOps) {
          await ctx.waGroupOps.setGroupDescription(argsText);
        } else {
          botStore.updateGroupState({ description: argsText });
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `Deskripsi grup berhasil diperbarui:
_${argsText}_`
        };
        break;
      }
      case "linkgc": {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        const linkCooldown = checkGroupActionCooldown(
          ctx,
          "invite_link",
          2e4
        );
        if (linkCooldown) return failReply(linkCooldown);
        let code;
        if (ctx.waGroupOps) {
          code = await ctx.waGroupOps.getGroupInviteCode();
        } else {
          code = botStore.groupState.inviteCode;
        }
        if (!code) {
          throw new Error("Tidak dapat mengambil kode tautan undangan grup.");
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `*Tautan Undangan Grup*
https://chat.whatsapp.com/${code}`
        };
        break;
      }
      case "revoke": {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;
        const revokeCooldown = checkGroupActionCooldown(
          ctx,
          "revoke_link",
          6e4
        );
        if (revokeCooldown) return failReply(revokeCooldown);
        let newCode;
        if (ctx.waGroupOps) {
          newCode = await ctx.waGroupOps.revokeGroupInviteCode();
        } else {
          newCode = `Invite${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
          botStore.updateGroupState({ inviteCode: newCode });
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `Tautan undangan grup lama telah dihanguskan.
Tautan baru: https://chat.whatsapp.com/${newCode || "diperbarui"}`
        };
        break;
      }
      case "hidetag": {
        if (config.antiBan?.hidetagAdminOnly ?? true) {
          const guard = ensureSenderGroupAdmin();
          if (guard) return guard;
        }
        if (!isSenderBotOwner(ctx) && config.antiBan?.enabled) {
          const cooldownSec = Math.max(
            10,
            config.antiBan.hidetagCooldownSeconds || 30
          );
          const htCooldown = checkGroupActionCooldown(
            ctx,
            "hidetag",
            cooldownSec * 1e3
          );
          if (htCooldown) {
            botStore.incrementAntiBanStat("hidetagProtected");
            return failReply(htCooldown);
          }
        }
        const members = ctx.groupMembers || botStore.groupMembers;
        const allJids = Array.from(
          new Set(members.map((m) => m.jid).filter(Boolean))
        );
        const announceText = argsText || ctx.quotedText || `\u{1F4E2} *Pengumuman Grup (${ctx.groupName || botStore.groupState.subject})*`;
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: announceText,
          hiddenMentions: allJids
        };
        break;
      }
      case "tagall": {
        if (config.antiBan?.hidetagAdminOnly ?? true) {
          const guard = ensureSenderGroupAdmin();
          if (guard) return guard;
        }
        if (!isSenderBotOwner(ctx) && config.antiBan?.enabled) {
          const cooldownSec = Math.max(
            10,
            config.antiBan.hidetagCooldownSeconds || 30
          );
          const tagCooldown = checkGroupActionCooldown(
            ctx,
            "hidetag",
            cooldownSec * 1e3
          );
          if (tagCooldown) {
            botStore.incrementAntiBanStat("hidetagProtected");
            return failReply(tagCooldown);
          }
        }
        const members = ctx.groupMembers || botStore.groupMembers;
        const allJids = Array.from(
          new Set(members.map((m) => m.jid).filter(Boolean))
        );
        const headerMsg = argsText || ctx.quotedText || "Panggilan seluruh anggota grup";
        const gTitle = ctx.groupName || botStore.groupState.subject;
        const mentionLines = members.map((m, idx) => {
          const tagId = m.jid.split(":")[0]?.split("@")[0] || m.phone;
          return `${idx + 1}. @${tagId}`;
        });
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: [
            `*TAG ALL \xB7 ${gTitle}*`,
            `Pesan: *${headerMsg}*`,
            "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
            ...mentionLines
          ].join("\n"),
          mentions: allJids
        };
        break;
      }
      case "antilink": {
        const mode = argsText.toLowerCase();
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;
        if (mode !== "on" && mode !== "off") {
          return {
            handled: true,
            reactionStatus: "success",
            replyText: `Status Antilink grup ini: *${effectiveGroupSettings.antilink ? "AKTIF" : "NONAKTIF"}*.

Ketik *${config.prefix}antilink on* atau *${config.prefix}antilink off* untuk menyetel.`
          };
        }
        const nextVal = mode === "on";
        if (effectiveGroupId) {
          botStore.updateGroupCustomConfig(effectiveGroupId, {
            antilink: nextVal
          });
        }
        if (ctx.source === "simulator") {
          botStore.updateConfig({
            groupSettings: {
              ...config.groupSettings,
              antilink: nextVal
            }
          });
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: nextVal ? `Moderasi *Antilink Grup* berhasil *DIAKTIFKAN*. Pesan berisi tautan dari non-admin akan dihapus otomatis.` : `Moderasi *Antilink Grup* telah *DINONAKTIFKAN*.`
        };
        break;
      }
      case "welcome": {
        const mode = argsText.toLowerCase();
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;
        if (mode !== "on" && mode !== "off") {
          const currentTpl = botStore.getEffectiveTemplate("welcomeMsg", effectiveGroupId);
          return {
            handled: true,
            reactionStatus: "success",
            replyText: [
              `Sambutan member baru di grup ini: *${effectiveGroupSettings.welcome ? "AKTIF" : "NONAKTIF"}*`,
              "",
              `\u2022 Ketik *${config.prefix}welcome on* atau *${config.prefix}welcome off* untuk sakelar.`,
              `\u2022 Ketik *${config.prefix}setwelcome <teks>* untuk mengubah teks sambutan.`,
              "",
              `*Teks Sambutan Saat Ini:*`,
              currentTpl
            ].join("\n")
          };
        }
        const nextVal = mode === "on";
        if (effectiveGroupId) {
          botStore.updateGroupCustomConfig(effectiveGroupId, {
            welcome: nextVal
          });
        }
        if (ctx.source === "simulator") {
          botStore.updateConfig({
            groupSettings: {
              ...config.groupSettings,
              welcome: nextVal
            }
          });
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `Pesan sambutan anggota baru berhasil diatur ke *${nextVal ? "AKTIF" : "NONAKTIF"}*.`
        };
        break;
      }
      case "out": {
        const mode = argsText.toLowerCase();
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;
        if (mode !== "on" && mode !== "off") {
          const currentTpl = botStore.getEffectiveTemplate("goodbyeMsg", effectiveGroupId);
          return {
            handled: true,
            reactionStatus: "success",
            replyText: [
              `Pesan keluar grup (*out/leave*) saat ini: *${effectiveGroupSettings.goodbye ? "AKTIF" : "NONAKTIF"}*`,
              "",
              `\u2022 Ketik *${config.prefix}out on* atau *${config.prefix}out off* untuk sakelar.`,
              `\u2022 Ketik *${config.prefix}setout <teks>* untuk mengubah teks perpisahan.`,
              "",
              `*Teks Perpisahan Saat Ini:*`,
              currentTpl
            ].join("\n")
          };
        }
        const nextVal = mode === "on";
        if (effectiveGroupId) {
          botStore.updateGroupCustomConfig(effectiveGroupId, {
            goodbye: nextVal
          });
        }
        if (ctx.source === "simulator") {
          botStore.updateConfig({
            groupSettings: {
              ...config.groupSettings,
              goodbye: nextVal
            }
          });
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `Pesan otomatis saat anggota keluar grup diatur ke *${nextVal ? "AKTIF" : "NONAKTIF"}*.`
        };
        break;
      }
      case "setwelcome": {
        const lowerArg = argsText.toLowerCase();
        if (lowerArg === "on" || lowerArg === "off") {
          const nextVal = lowerArg === "on";
          const guard = ensureSenderGroupAdmin();
          if (guard) return guard;
          if (effectiveGroupId) {
            botStore.updateGroupCustomConfig(effectiveGroupId, {
              welcome: nextVal
            });
          }
          if (ctx.source === "simulator") {
            botStore.updateConfig({
              groupSettings: {
                ...config.groupSettings,
                welcome: nextVal
              }
            });
          }
          return {
            handled: true,
            reactionStatus: "success",
            replyText: `Pesan sambutan anggota baru berhasil diatur ke *${nextVal ? "AKTIF" : "NONAKTIF"}*.`
          };
        }
        result = handleGroupTemplateSetter(
          "welcomeMsg",
          "Sambutan Masuk (Welcome)",
          "Halo *@user*, selamat bergabung di *@group*!"
        );
        break;
      }
      case "setout": {
        const lowerArg = argsText.toLowerCase();
        if (lowerArg === "on" || lowerArg === "off") {
          const nextVal = lowerArg === "on";
          const guard = ensureSenderGroupAdmin();
          if (guard) return guard;
          if (effectiveGroupId) {
            botStore.updateGroupCustomConfig(effectiveGroupId, {
              goodbye: nextVal
            });
          }
          if (ctx.source === "simulator") {
            botStore.updateConfig({
              groupSettings: {
                ...config.groupSettings,
                goodbye: nextVal
              }
            });
          }
          return {
            handled: true,
            reactionStatus: "success",
            replyText: `Pesan otomatis saat anggota keluar grup diatur ke *${nextVal ? "AKTIF" : "NONAKTIF"}*.`
          };
        }
        result = handleGroupTemplateSetter(
          "goodbyeMsg",
          "Pesan Keluar Grup (Out/Leave)",
          "Sampai jumpa *@user*, terima kasih sudah meramaikan *@group*!"
        );
        break;
      }
      case "setpromote": {
        result = handleGroupTemplateSetter(
          "promoteSuccess",
          "Pengumuman Promote Admin",
          "Selamat *@user*, kamu resmi diangkat menjadi Admin di *@group*!"
        );
        break;
      }
      case "setdemote": {
        result = handleGroupTemplateSetter(
          "demoteSuccess",
          "Pengumuman Demote Admin",
          "Status Admin *@user* di *@group* telah dicabut."
        );
        break;
      }
      case "setantilink": {
        result = handleGroupTemplateSetter(
          "antilinkWarn",
          "Peringatan Antilink",
          "Maaf *@sender*, dilarang mengirim tautan luar di *@group*!"
        );
        break;
      }
      case "setopen": {
        result = handleGroupTemplateSetter(
          "groupOpenSuccess",
          "Pengumuman Buka Grup",
          "Grup *@group* telah dibuka, silakan berdiskusi kembali!"
        );
        break;
      }
      case "setclose": {
        result = handleGroupTemplateSetter(
          "groupCloseSuccess",
          "Pengumuman Kunci Grup",
          "Grup *@group* dikunci sementara khusus pengumuman Admin."
        );
        break;
      }
      case "cekset": {
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;
        const gid = effectiveGroupId || "simulator-group";
        const gName = ctx.groupName || botStore.groupState.subject;
        const lines = [
          `*Pengaturan Fitur & Chat Grup (${gName})*`,
          "",
          `\u2022 Welcome Masuk: *${effectiveGroupSettings.welcome ? "AKTIF" : "NONAKTIF"}*`,
          `\u2022 Pesan Keluar (Out): *${effectiveGroupSettings.goodbye ? "AKTIF" : "NONAKTIF"}*`,
          `\u2022 Moderasi Antilink: *${effectiveGroupSettings.antilink ? "AKTIF" : "NONAKTIF"}*`,
          "",
          `*Teks Welcome (${config.prefix}setwelcome):*`,
          botStore.getEffectiveTemplate("welcomeMsg", gid),
          "",
          `*Teks Out/Keluar (${config.prefix}setout):*`,
          botStore.getEffectiveTemplate("goodbyeMsg", gid),
          "",
          `*Teks Antilink (${config.prefix}setantilink):*`,
          botStore.getEffectiveTemplate("antilinkWarn", gid)
        ];
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: lines.join("\n")
        };
        break;
      }
      case "resetset": {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;
        if (effectiveGroupId) {
          botStore.resetGroupCustomTemplates(effectiveGroupId);
        }
        result = {
          handled: true,
          reactionStatus: "success",
          replyText: `Seluruh pengaturan teks custom grup berhasil dikembalikan ke bawaan *${config.botName}*.`
        };
        break;
      }
    }
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: result.reactionStatus === "error" ? "error" : "success",
      summary: argsText ? `${config.prefix}${matchedCmd.id} ${argsText.slice(0, 48)}` : `${config.prefix}${matchedCmd.id}`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    });
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses perintah.";
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: "error",
      summary: errMsg.slice(0, 80),
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    });
    return {
      handled: true,
      reactionStatus: "error",
      replyText: renderBotTemplate(config.templates.errorReply, {
        prefix: config.prefix,
        command: matchedCmd.id,
        error: errMsg,
        botName: config.botName
      })
    };
  }
}

// server/gatewayRouter.ts
import { Router } from "express";

// server/groupCache.ts
var GroupMetadataCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.TTL_MS = 10 * 60 * 1e3;
  }
  // 10 minutes
  get(groupId) {
    const item = this.cache.get(groupId);
    if (!item) return null;
    if (Date.now() - item.cachedAt > this.TTL_MS) {
      this.cache.delete(groupId);
      return null;
    }
    return item.metadata;
  }
  set(groupId, metadata) {
    this.cache.set(groupId, {
      metadata,
      cachedAt: Date.now()
    });
  }
  invalidate(groupId) {
    this.cache.delete(groupId);
  }
  updateParticipants(groupId, action, participants) {
    const cached = this.get(groupId);
    if (!cached) return;
    const ids = participants.map((p) => typeof p === "string" ? p : p.id).filter(Boolean);
    if (action === "remove") {
      cached.participants = cached.participants.filter(
        (p) => !ids.includes(p.id)
      );
    } else if (action === "promote") {
      for (const p of cached.participants) {
        if (ids.includes(p.id)) {
          p.admin = "admin";
        }
      }
    } else if (action === "demote") {
      for (const p of cached.participants) {
        if (ids.includes(p.id)) {
          p.admin = null;
        }
      }
    }
    this.set(groupId, cached);
  }
  size() {
    return this.cache.size;
  }
  clear() {
    this.cache.clear();
  }
};
var groupCache = new GroupMetadataCache();

// server/gatewayRouter.ts
var gatewayRouter = Router();
function formatToJid(target) {
  const clean = target.replace(/[^0-9@.a-zA-Z_-]/g, "");
  if (clean.includes("@")) return clean;
  const digits = clean.replace(/[^0-9]/g, "");
  if (digits.length > 15) {
    return `${digits}@g.us`;
  }
  return `${digits}@s.whatsapp.net`;
}
gatewayRouter.post("/send-text", async (req, res) => {
  try {
    const { to, text, quotedMsgId, mentions } = req.body;
    if (!to || !text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: 'Parameter "to" (nomor/grup tujuan) dan "text" (isi pesan) wajib diisi.'
      });
    }
    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: "text",
      summaryText: text.slice(0, 60),
      content: {
        text: text.trim(),
        mentions: Array.isArray(mentions) ? mentions : void 0
      },
      options: quotedMsgId ? { quoted: { key: { id: quotedMsgId } } } : void 0
    });
    return res.json({
      ok: true,
      jobId,
      to: jid,
      status: "queued",
      message: "Pesan berhasil dimasukkan ke dalam antrean OpenWA Paced Queue."
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal memproses pesan" });
  }
});
gatewayRouter.post("/send-media", async (req, res) => {
  try {
    const { to, mediaUrl, mediaBase64, mediaType = "image", caption, fileName } = req.body;
    if (!to) {
      return res.status(400).json({ ok: false, error: 'Parameter "to" wajib diisi.' });
    }
    if (!mediaUrl && !mediaBase64) {
      return res.status(400).json({
        ok: false,
        error: 'Sediakan "mediaUrl" atau "mediaBase64" untuk mengirim media.'
      });
    }
    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let content = {};
    const mediaBuffer = mediaBase64 ? Buffer.from(mediaBase64.replace(/^data:[^;]+;base64,/, ""), "base64") : { url: mediaUrl };
    if (mediaType === "image") {
      content = { image: mediaBuffer, caption: caption || void 0 };
    } else if (mediaType === "video") {
      content = { video: mediaBuffer, caption: caption || void 0 };
    } else if (mediaType === "audio") {
      content = { audio: mediaBuffer, mimetype: "audio/mp4", ptt: false };
    } else {
      content = {
        document: mediaBuffer,
        mimetype: "application/octet-stream",
        fileName: fileName || "document.pdf",
        caption: caption || void 0
      };
    }
    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: mediaType,
      summaryText: caption || `Media (${mediaType})`,
      content
    });
    return res.json({
      ok: true,
      jobId,
      to: jid,
      status: "queued",
      message: "Media berhasil dimasukkan ke dalam antrean pengiriman OpenWA."
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal memproses media" });
  }
});
gatewayRouter.post("/send-poll", async (req, res) => {
  try {
    const { to, name, values, selectableCount = 1 } = req.body;
    if (!to || !name || !Array.isArray(values) || values.length < 2) {
      return res.status(400).json({
        ok: false,
        error: 'Parameter "to", "name" (judul poll), dan minimal 2 "values" (pilihan) wajib diisi.'
      });
    }
    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: "poll",
      summaryText: `Polling: ${name}`,
      content: {
        poll: {
          name: name.trim(),
          values: values.map((v) => String(v).trim()),
          selectableCount: Number(selectableCount) || 1
        }
      }
    });
    return res.json({
      ok: true,
      jobId,
      to: jid,
      status: "queued",
      message: "Polling berhasil dimasukkan ke dalam antrean pengiriman OpenWA."
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal memproses polling" });
  }
});
gatewayRouter.post("/send-reaction", async (req, res) => {
  try {
    const { to, emoji, messageId } = req.body;
    if (!to || !emoji || !messageId) {
      return res.status(400).json({
        ok: false,
        error: 'Parameter "to", "emoji", dan "messageId" wajib diisi.'
      });
    }
    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: "text",
      summaryText: `Reaksi ${emoji}`,
      content: {
        react: {
          text: emoji,
          key: { remoteJid: jid, id: messageId }
        }
      },
      isPriority: true
    });
    return res.json({ ok: true, jobId, message: "Reaksi emoji dimasukkan ke antrean." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal memproses reaksi" });
  }
});
gatewayRouter.post("/check-number", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ ok: false, error: "Nomor telepon wajib diisi." });
    }
    const digits = String(phone).replace(/[^0-9]/g, "");
    if (digits.length < 7) {
      return res.status(400).json({ ok: false, error: "Format nomor telepon tidak valid." });
    }
    const socket = global.__BAILEYS_SOCKET__;
    if (socket && botStore.waState.status === "connected") {
      try {
        const [result] = await socket.onWhatsApp(digits);
        if (result && result.exists) {
          return res.json({
            ok: true,
            phone: digits,
            exists: true,
            jid: result.jid,
            message: `Nomor terverifikasi aktif di WhatsApp (${result.jid}).`
          });
        }
        return res.json({
          ok: true,
          phone: digits,
          exists: false,
          jid: `${digits}@s.whatsapp.net`,
          message: "Nomor tidak terdaftar atau tidak aktif di WhatsApp."
        });
      } catch (err) {
        return res.json({
          ok: true,
          phone: digits,
          exists: true,
          jid: `${digits}@s.whatsapp.net`,
          simulated: true
        });
      }
    }
    return res.json({
      ok: true,
      phone: digits,
      exists: true,
      jid: `${digits}@s.whatsapp.net`,
      simulated: true,
      message: "Format nomor valid. (Sambungkan WhatsApp untuk verifikasi live real-time)."
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal memeriksa nomor" });
  }
});
gatewayRouter.post("/test-webhook", async (req, res) => {
  try {
    const { url, secret } = req.body;
    const targetUrl = url || botStore.config.webhook?.url;
    const targetSecret = secret !== void 0 ? secret : botStore.config.webhook?.secret;
    if (!targetUrl) {
      return res.status(400).json({ ok: false, error: "URL Webhook wajib diisi." });
    }
    const result = await webhookDispatcher.testPing(targetUrl, targetSecret);
    return res.json({ ok: result.success, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal mengirim ping webhook" });
  }
});
gatewayRouter.get("/status", (_req, res) => {
  return res.json({
    ok: true,
    waStatus: botStore.waState.status,
    connectedUser: botStore.waState.connectedUser,
    stats: queueEngine.getStats(),
    isPaused: queueEngine.getIsPaused(),
    cachedGroups: groupCache.size(),
    webhook: botStore.config.webhook,
    autoResponderCount: (botStore.config.autoResponder || []).length
  });
});
gatewayRouter.get("/jobs", (_req, res) => {
  return res.json({
    ok: true,
    jobs: queueEngine.getRecentJobs()
  });
});
gatewayRouter.post("/queue/clear", (_req, res) => {
  queueEngine.clearQueue();
  return res.json({ ok: true, message: "Antrean pesan berhasil dikosongkan." });
});
gatewayRouter.post("/queue/pause", (req, res) => {
  const { paused } = req.body;
  queueEngine.setPaused(Boolean(paused));
  return res.json({
    ok: true,
    isPaused: queueEngine.getIsPaused(),
    message: paused ? "Antrean pesan dijeda." : "Antrean pesan dilanjutkan."
  });
});
gatewayRouter.post("/auto-responder/add", (req, res) => {
  try {
    const { trigger, matchType = "contains", replyText, scope = "all", enabled = true } = req.body;
    if (!trigger || !replyText) {
      return res.status(400).json({
        ok: false,
        error: 'Kata kunci "trigger" dan teks "replyText" wajib diisi.'
      });
    }
    const rule = botStore.addAutoResponderRule({
      trigger: String(trigger).trim(),
      matchType,
      replyText: String(replyText).trim(),
      scope,
      enabled: Boolean(enabled)
    });
    return res.json({ ok: true, rule, message: "Aturan respon otomatis berhasil ditambahkan." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal menambah aturan" });
  }
});
gatewayRouter.put("/auto-responder/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updated = botStore.updateAutoResponderRule(id, req.body);
    if (!updated) {
      return res.status(404).json({ ok: false, error: "Aturan tidak ditemukan." });
    }
    return res.json({ ok: true, rule: updated, message: "Aturan respon otomatis diperbarui." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal memperbarui aturan" });
  }
});
gatewayRouter.delete("/auto-responder/:id", (req, res) => {
  try {
    const { id } = req.params;
    const deleted = botStore.deleteAutoResponderRule(id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: "Aturan tidak ditemukan." });
    }
    return res.json({ ok: true, message: "Aturan respon otomatis dihapus." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Gagal menghapus aturan" });
  }
});

// server/waManager.ts
import fs10 from "node:fs/promises";
import path8 from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode2 from "qrcode";
var AUTH_DIR = path8.join(resolveDataDir(), ".baileys_auth");
var VIEWONCE_DIR = path8.join(resolveDataDir(), "viewonce_cache");
var silentLogger = pino({ level: "silent" });
var WhatsAppSessionManager = class {
  constructor() {
    this.sock = null;
    this.authContext = null;
    this.pendingCredsSave = Promise.resolve();
    this.isStarting = false;
    this.manualDisconnect = false;
    this.pairingRequested = false;
    this.sawNewLogin = false;
    this.reconnectAttempts = 0;
    this.sessionGeneration = 0;
    this.reconnectTimer = null;
    this.groupMetaCache = /* @__PURE__ */ new Map();
    this.pendingGroupMeta = /* @__PURE__ */ new Map();
    this.groupGreetingLastSent = /* @__PURE__ */ new Map();
    this.userCommandTimestamps = /* @__PURE__ */ new Map();
    this.lastHidetagPerGroup = /* @__PURE__ */ new Map();
    this.recentViewOnceCache = /* @__PURE__ */ new Map();
    this.lastViewOnceByChat = /* @__PURE__ */ new Map();
    this.avatarCache = /* @__PURE__ */ new Map();
    this.outboundQueue = Promise.resolve();
    this.lastOutboundSentAt = 0;
    void this.loadRecentViewOnceFromDisk();
  }
  normalizeUserJid(rawJid) {
    if (!rawJid) return null;
    const trimmed = rawJid.trim();
    if (!trimmed || trimmed.endsWith("@g.us") || trimmed === "status@broadcast") {
      return null;
    }
    const atIdx = trimmed.indexOf("@");
    if (atIdx === -1) {
      const digits = trimmed.replace(/[^0-9]/g, "");
      return digits.length >= 8 ? `${digits}@s.whatsapp.net` : null;
    }
    const userPart = trimmed.slice(0, atIdx).split(":")[0]?.trim() || "";
    const domainPart = trimmed.slice(atIdx + 1).trim().toLowerCase();
    if (!userPart) return null;
    if (domainPart === "s.whatsapp.net" || domainPart === "c.us") {
      return `${userPart}@s.whatsapp.net`;
    }
    if (domainPart === "lid") {
      return `${userPart}@lid`;
    }
    return null;
  }
  async fetchUserProfilePicBuffer(sock, candidateJids) {
    const normalizedJids = [];
    for (const raw of candidateJids) {
      const norm = this.normalizeUserJid(raw);
      if (norm && !normalizedJids.includes(norm)) {
        normalizedJids.push(norm);
      }
    }
    if (normalizedJids.length === 0) return null;
    const now = Date.now();
    for (const jid of normalizedJids) {
      const cached = this.avatarCache.get(jid);
      if (cached && cached.expiresAt > now && cached.buffer) {
        return cached.buffer;
      }
    }
    const allNegativelyCached = normalizedJids.every((jid) => {
      const cached = this.avatarCache.get(jid);
      return Boolean(cached && cached.expiresAt > now && cached.buffer === null);
    });
    if (allNegativelyCached) {
      return null;
    }
    const queryPpUrl = async (jid, kind, timeoutMs) => {
      try {
        const url = await Promise.race([
          sock.profilePictureUrl(jid, kind),
          new Promise(
            (resolve) => setTimeout(() => resolve(void 0), timeoutMs)
          )
        ]);
        return url && /^https?:\/\//i.test(url) ? url : null;
      } catch {
        return null;
      }
    };
    for (const jid of normalizedJids) {
      const ppUrl = await queryPpUrl(jid, "image", 4500) || await queryPpUrl(jid, "preview", 3500);
      if (!ppUrl) continue;
      try {
        const fetched = await fetchRemoteBuffer(ppUrl, 8e3);
        if (fetched.buffer && fetched.buffer.length > 0) {
          const normalizedImg = await ensureWhatsappImageBuffer(
            fetched.buffer,
            fetched.contentType || "image/jpeg"
          );
          if (this.avatarCache.size >= 60) {
            const oldestKey = this.avatarCache.keys().next().value;
            if (oldestKey) this.avatarCache.delete(oldestKey);
          }
          for (const aliasJid of normalizedJids) {
            this.avatarCache.set(aliasJid, {
              buffer: normalizedImg.buffer,
              expiresAt: Date.now() + 5 * 60 * 1e3
            });
          }
          return normalizedImg.buffer;
        }
      } catch {
      }
    }
    for (const jid of normalizedJids) {
      this.avatarCache.set(jid, {
        buffer: null,
        expiresAt: Date.now() + 45 * 1e3
      });
    }
    return null;
  }
  async getProfilePictureForUser(phoneOrJid) {
    if (!this.sock) return null;
    const candidates = [phoneOrJid];
    if (this.sock.user?.id) {
      const botPhone = this.sock.user.id.split(":")[0]?.split("@")[0] || "";
      const cleanTarget = (phoneOrJid || "").replace(/[^0-9]/g, "");
      if (!cleanTarget || cleanTarget === botPhone) {
        candidates.push(this.sock.user.id);
        candidates.push(this.sock.user.lid);
      }
    }
    return this.fetchUserProfilePicBuffer(this.sock, candidates);
  }
  sleepRandom(minMs, maxMs) {
    const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, duration));
  }
  enqueueOutboundSend(task) {
    const run = async () => {
      const isWarmUp = botStore.config.antiBan.enabled && botStore.config.antiBan.warmUpMode;
      const minGap = isWarmUp ? Math.floor(Math.random() * (4500 - 2800 + 1)) + 2800 : Math.floor(Math.random() * (2900 - 1600 + 1)) + 1600;
      const elapsed = Date.now() - this.lastOutboundSentAt;
      if (this.lastOutboundSentAt > 0 && elapsed < minGap) {
        await new Promise((r) => setTimeout(r, minGap - elapsed));
      }
      try {
        return await task();
      } finally {
        this.lastOutboundSentAt = Date.now();
      }
    };
    const next = this.outboundQueue.then(run, run);
    this.outboundQueue = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  getCachedGroupMetadata(jid) {
    const entry = this.groupMetaCache.get(jid);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.groupMetaCache.delete(jid);
      return void 0;
    }
    return entry.data;
  }
  async getOrFetchGroupMetadata(sock, jid) {
    const cached = this.getCachedGroupMetadata(jid);
    if (cached) return cached;
    const inflight = this.pendingGroupMeta.get(jid);
    if (inflight) return inflight;
    const promise = sock.groupMetadata(jid).then((meta) => {
      this.groupMetaCache.set(jid, {
        data: meta,
        expiresAt: Date.now() + 5 * 60 * 1e3
        // 5 minutes TTL
      });
      this.pendingGroupMeta.delete(jid);
      return meta;
    }).catch((err) => {
      this.pendingGroupMeta.delete(jid);
      throw err;
    });
    this.pendingGroupMeta.set(jid, promise);
    return promise;
  }
  resolveBrowserProfile() {
    const profile = botStore.config.antiBan?.browserProfile || "windows_chrome";
    switch (profile) {
      case "macos_safari":
        return ["macOS", "Safari", "18.1"];
      case "windows_edge":
        return ["Windows", "Edge", "131.0.2903.112"];
      case "ubuntu_chrome":
        return Browsers.ubuntu("Chrome");
      case "windows_chrome":
      default:
        return ["Windows", "Chrome", "131.0.6778.205"];
    }
  }
  async simulateHumanTyping(sock, jid, isGroup, type = "text") {
    const { antiBan } = botStore.config;
    if (antiBan && !antiBan.humanizeTyping && !antiBan.enabled) {
      return;
    }
    try {
      const presenceState = type === "audio" ? "recording" : "composing";
      await sock.sendPresenceUpdate(presenceState, jid);
      const warmUpExtra = antiBan && antiBan.enabled && antiBan.warmUpMode ? 1400 : 0;
      const baseMin = antiBan?.minTypingDelayMs || 1800;
      const baseMax = antiBan?.maxTypingDelayMs || 3800;
      const minD = Math.max(800, baseMin + (isGroup ? 400 : 0) + warmUpExtra);
      const maxD = Math.max(
        minD + 500,
        baseMax + (isGroup ? 800 : 0) + warmUpExtra
      );
      await this.sleepRandom(minD, maxD);
      await sock.sendPresenceUpdate("paused", jid);
    } catch {
    }
  }
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  isDevicePaired(state) {
    if (this.sawNewLogin) return true;
    const creds = state?.creds;
    if (!creds) return false;
    if (creds.registered) return true;
    if (creds.account) return true;
    if (creds.me?.id && creds.me.id.includes(":")) return true;
    return false;
  }
  async initAutoResume() {
    try {
      const credsPath = path8.join(AUTH_DIR, "creds.json");
      const raw = await fs10.readFile(credsPath, "utf-8");
      const parsed = JSON.parse(raw);
      const hasValidSession = Boolean(
        parsed.registered || parsed.account || parsed.me?.id && parsed.me.id.includes(":")
      );
      if (hasValidSession) {
        this.manualDisconnect = false;
        await this.launchSocket({ mode: "resume" });
        return true;
      }
    } catch {
    }
    return false;
  }
  destroyActiveSocketOnly() {
    if (this.sock) {
      const oldSock = this.sock;
      this.sock = null;
      try {
        oldSock.ev.removeAllListeners("connection.update");
        oldSock.ev.removeAllListeners("creds.update");
        oldSock.ev.removeAllListeners("messages.upsert");
        oldSock.ev.removeAllListeners("groups.update");
        oldSock.ev.removeAllListeners("group-participants.update");
        oldSock.end(void 0);
      } catch {
      }
    }
  }
  async disconnect(clearCredentials = true) {
    this.manualDisconnect = true;
    this.sessionGeneration += 1;
    this.clearReconnectTimer();
    this.isStarting = false;
    this.pairingRequested = false;
    this.sawNewLogin = false;
    this.reconnectAttempts = 0;
    this.destroyActiveSocketOnly();
    if (clearCredentials) {
      this.authContext = null;
      try {
        await this.pendingCredsSave;
      } catch {
      }
      try {
        await fs10.rm(AUTH_DIR, { recursive: true, force: true });
      } catch {
      }
      await cloudSync.clearAuth();
    }
    botStore.updateWAState({
      status: "disconnected",
      qrDataUrl: null,
      pairingCode: null,
      pairingPhone: null,
      connectedUser: null,
      connectedAt: null,
      statusMessage: null,
      lastError: null
    });
  }
  async shutdownGracefully() {
    this.manualDisconnect = true;
    this.sessionGeneration += 1;
    this.clearReconnectTimer();
    this.isStarting = false;
    this.destroyActiveSocketOnly();
    try {
      await this.pendingCredsSave;
      await cloudSync.flushAllNow(AUTH_DIR);
    } catch {
    }
  }
  normalizePhoneNumber(raw) {
    let digits = raw.replace(/[^0-9]/g, "");
    if (digits.startsWith("08")) {
      digits = "62" + digits.slice(1);
    } else if (digits.startsWith("8") && digits.length >= 9) {
      digits = "62" + digits;
    }
    return digits;
  }
  async connectWithQR() {
    if (this.isStarting) return;
    await this.disconnect(true);
    this.manualDisconnect = false;
    await this.launchSocket({ mode: "qr" });
  }
  async connectWithPairingCode(rawPhone) {
    const cleanPhone = this.normalizePhoneNumber(rawPhone);
    if (cleanPhone.length < 9 || cleanPhone.length > 16) {
      throw new Error(
        "Masukkan nomor WhatsApp yang valid dengan kode negara (contoh: 6281234567890)."
      );
    }
    if (this.isStarting) return;
    await this.disconnect(true);
    this.manualDisconnect = false;
    await this.launchSocket({ mode: "pairing", phoneNumber: cleanPhone });
  }
  async resolveWaVersion() {
    if (this.cachedWaVersion) return this.cachedWaVersion;
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((resolve) => setTimeout(() => resolve(null), 4e3))
      ]);
      if (latest && Array.isArray(latest.version)) {
        this.cachedWaVersion = latest.version;
        return latest.version;
      }
    } catch {
    }
    return void 0;
  }
  async launchSocket(options) {
    if (this.isStarting) return;
    this.isStarting = true;
    this.clearReconnectTimer();
    this.destroyActiveSocketOnly();
    const currentGen = ++this.sessionGeneration;
    if (options.mode !== "resume") {
      this.pairingRequested = false;
      this.sawNewLogin = false;
      this.reconnectAttempts = 0;
    }
    botStore.updateWAState({
      status: "connecting",
      ...options.mode !== "resume" ? {
        qrDataUrl: null,
        pairingCode: null,
        pairingPhone: options.mode === "pairing" ? options.phoneNumber : null
      } : {},
      statusMessage: options.mode === "resume" ? "Menyelesaikan sinkronisasi sesi WhatsApp..." : options.mode === "pairing" ? "Menyiapkan jalur Pairing Code 8 digit..." : "Menyiapkan Kode QR Multi-Device...",
      lastError: null
    });
    try {
      await fs10.mkdir(AUTH_DIR, { recursive: true });
      if (!this.authContext) {
        const loaded = await useMultiFileAuthState(AUTH_DIR);
        const origKeysSet = loaded.state.keys.set.bind(loaded.state.keys);
        loaded.state.keys.set = async (data) => {
          await origKeysSet(data);
          cloudSync.scheduleAuthSync(AUTH_DIR);
        };
        this.authContext = loaded;
      }
      const { state, saveCreds } = this.authContext;
      const queueSaveCreds = () => {
        this.pendingCredsSave = this.pendingCredsSave.then(async () => {
          await saveCreds();
          cloudSync.scheduleAuthSync(AUTH_DIR);
        }).catch(() => {
        });
        return this.pendingCredsSave;
      };
      const version = await this.resolveWaVersion();
      const sock = makeWASocket({
        ...version ? { version } : {},
        logger: silentLogger,
        auth: state,
        printQRInTerminal: false,
        browser: this.resolveBrowserProfile(),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        qrTimeout: 6e4,
        connectTimeoutMs: 6e4,
        defaultQueryTimeoutMs: 6e4,
        keepAliveIntervalMs: 2e4,
        retryRequestDelayMs: 500,
        cachedGroupMetadata: async (jid) => {
          const cached = groupCache.get(jid);
          if (cached) return cached;
          return this.getCachedGroupMetadata(jid);
        },
        getMessage: async (key) => {
          if (key?.id) {
            const cachedVo = this.recentViewOnceCache.get(key.id);
            if (cachedVo?.fullMsg?.message) {
              return cachedVo.fullMsg.message;
            }
          }
          return void 0;
        }
      });
      if (currentGen !== this.sessionGeneration || this.manualDisconnect) {
        try {
          sock.end(void 0);
        } catch {
        }
        this.isStarting = false;
        return;
      }
      this.sock = sock;
      global.__BAILEYS_SOCKET__ = sock;
      queueEngine.setSocketProvider(() => this.sock);
      this.isStarting = false;
      sock.ev.on("creds.update", () => {
        void queueSaveCreds();
      });
      sock.ev.on("call", async (callEvents) => {
        if (!botStore.config.antiBan?.autoRejectCalls) return;
        for (const call of callEvents) {
          if (call.status === "offer") {
            try {
              await sock.rejectCall(call.id, call.from);
              botStore.incrementAntiBanStat("callsDeclined");
              if (botStore.config.antiBan?.callRejectNotice) {
                const noticeText = botStore.config.antiBan.callRejectNotice;
                const callerJid = call.from;
                setTimeout(async () => {
                  try {
                    await sock.sendMessage(callerJid, {
                      text: `\u{1F6E1}\uFE0F *Perlindungan Otomatis ${botStore.config.botName}*

${noticeText}`
                    });
                  } catch {
                  }
                }, 2500);
              }
            } catch {
            }
          }
        }
      });
      const triggerPairingCode = async () => {
        if (options.mode !== "pairing" || this.pairingRequested || this.isDevicePaired(state)) {
          return;
        }
        this.pairingRequested = true;
        try {
          const rawCode = await sock.requestPairingCode(options.phoneNumber);
          await queueSaveCreds();
          const formatted = rawCode && rawCode.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
          botStore.updateWAState({
            status: "pairing_code_ready",
            pairingCode: formatted,
            pairingPhone: options.phoneNumber,
            qrDataUrl: null,
            statusMessage: null,
            lastError: null
          });
          console.log(
            [
              "",
              "============================================================",
              `[WABot 24/7] PAIRING CODE WHATSAPP (+${options.phoneNumber}):`,
              "",
              `   >>>   ${formatted}   <<<`,
              "",
              "Buka WhatsApp di HP -> Perangkat Tertaut -> Tautkan Perangkat",
              '-> "Tautkan dengan nomor telepon saja" -> Masukkan 8 kode di atas!',
              "============================================================",
              ""
            ].join("\n")
          );
        } catch (err) {
          this.pairingRequested = false;
          const msg = err instanceof Error ? err.message : "Gagal meminta kode pairing dari server WhatsApp.";
          botStore.updateWAState({
            status: "disconnected",
            statusMessage: null,
            lastError: `Gagal membuat Pairing Code: ${msg}`
          });
          console.error(`[WABot 24/7] Gagal membuat Pairing Code: ${msg}`);
        }
      };
      sock.ev.on("connection.update", async (update) => {
        if (currentGen !== this.sessionGeneration || this.manualDisconnect) {
          return;
        }
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        if (isNewLogin) {
          this.sawNewLogin = true;
          await queueSaveCreds();
          botStore.updateWAState({
            status: "connecting",
            qrDataUrl: null,
            pairingCode: null,
            statusMessage: "Tautan diterima dari HP! Menyelesaikan sinkronisasi sesi WhatsApp...",
            lastError: null
          });
        }
        if (qr && !this.isDevicePaired(state)) {
          if (options.mode === "pairing") {
            await triggerPairingCode();
          } else if (options.mode === "qr") {
            try {
              const dataUrl = await QRCode2.toDataURL(qr, {
                width: 300,
                margin: 2,
                color: {
                  dark: "#18181B",
                  light: "#FFFFFF"
                }
              });
              botStore.updateWAState({
                status: "qr_ready",
                qrDataUrl: dataUrl,
                pairingCode: null,
                statusMessage: null,
                lastError: null
              });
            } catch {
            }
          }
        }
        if (connection === "open") {
          this.reconnectAttempts = 0;
          this.sawNewLogin = true;
          await queueSaveCreds();
          const rawId = sock.user?.id || state.creds.me?.id || "";
          const phone = rawId.split(":")[0]?.split("@")[0] || "Terhubung";
          const rawName = sock.user?.name || state.creds.me?.name;
          const name = rawName && rawName !== "~" ? rawName : botStore.config.botName;
          botStore.updateWAState({
            status: "connected",
            qrDataUrl: null,
            pairingCode: null,
            connectedUser: {
              id: rawId,
              name,
              phone
            },
            connectedAt: Date.now(),
            statusMessage: null,
            lastError: null
          });
          console.log(
            [
              "",
              "============================================================",
              `[WABot 24/7] BERHASIL TERHUBUNG KE WHATSAPP (+${phone} - ${name})!`,
              "Sesi tersimpan permanen di server. Kamu bisa tutup halaman ini,",
              "bot akan tetap menyala dan membalas otomatis 24/7!",
              "============================================================",
              ""
            ].join("\n")
          );
          void webhookDispatcher.dispatch("session.status", {
            status: "connected",
            user: { id: rawId, name, phone }
          });
        } else if (connection === "close") {
          await queueSaveCreds();
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const errMessage = lastDisconnect?.error?.message || "";
          if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.multideviceMismatch || statusCode === DisconnectReason.forbidden) {
            await this.disconnect(true);
            botStore.updateWAState({
              lastError: statusCode === DisconnectReason.forbidden ? 'Nomor WhatsApp dibatasi sementara oleh sistem keamanan Meta (kode 403 / "Akun tidak dapat menggunakan WhatsApp"). Sesi otomatis dihentikan agar aman \u2014 silakan ajukan "Minta Tinjauan" di aplikasi WhatsApp HP kamu, dan gunakan nomor khusus kedua untuk bot.' : statusCode === DisconnectReason.loggedOut ? "Sesi WhatsApp telah keluar dari perangkat. Silakan tautkan ulang." : `Sesi ditolak WhatsApp (kode ${statusCode}). Silakan buat tautan baru.`
            });
            return;
          }
          if (statusCode === DisconnectReason.connectionReplaced) {
            this.destroyActiveSocketOnly();
            botStore.updateWAState({
              status: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              statusMessage: null,
              lastError: "Koneksi digantikan oleh sesi lain (pastikan hanya 1 mesin/instance bot yang berjalan untuk nomor ini)."
            });
            return;
          }
          const paired = this.isDevicePaired(state);
          if (statusCode === DisconnectReason.badSession && paired) {
            this.authContext = null;
            if (this.reconnectAttempts >= 6) {
              this.destroyActiveSocketOnly();
              botStore.updateWAState({
                status: "disconnected",
                qrDataUrl: null,
                pairingCode: null,
                statusMessage: null,
                lastError: "Sesi mengalami gangguan sinkronisasi berulang (kode 500). Silakan hubungkan kembali."
              });
              return;
            }
          }
          if (statusCode === DisconnectReason.restartRequired || paired || botStore.waState.status === "connected") {
            this.reconnectAttempts += 1;
            const delayMs = statusCode === DisconnectReason.restartRequired ? 500 : Math.min(1500 * this.reconnectAttempts, 1e4);
            botStore.updateWAState({
              status: "connecting",
              qrDataUrl: null,
              pairingCode: null,
              statusMessage: statusCode === DisconnectReason.restartRequired ? "Tautan berhasil diverifikasi! Membuka koneksi utama WhatsApp..." : "Menyambungkan kembali ke WhatsApp...",
              lastError: null
            });
            this.clearReconnectTimer();
            this.reconnectTimer = setTimeout(() => {
              if (!this.manualDisconnect) {
                void this.launchSocket({ mode: "resume" });
              }
            }, delayMs);
            return;
          }
          if (statusCode === DisconnectReason.timedOut && errMessage.toLowerCase().includes("qr refs")) {
            await this.disconnect(true);
            botStore.updateWAState({
              lastError: "Batas waktu tunggu kode habis (belum dipindai/dimasukkan). Silakan klik tombol untuk membuat kode baru."
            });
            return;
          }
          if (this.reconnectAttempts < 3) {
            this.reconnectAttempts += 1;
            const retryMode = options.mode === "pairing" ? { mode: "pairing", phoneNumber: options.phoneNumber } : { mode: "qr" };
            if (options.mode === "pairing" && !paired) {
              this.authContext = null;
              await fs10.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {
              });
            }
            this.clearReconnectTimer();
            this.reconnectTimer = setTimeout(() => {
              if (!this.manualDisconnect) {
                void this.launchSocket(retryMode);
              }
            }, 1200);
            return;
          }
          await this.disconnect(true);
          botStore.updateWAState({
            lastError: "Koneksi ke server WhatsApp terputus sebelum penautan selesai. Silakan coba lagi."
          });
        }
      });
      sock.ev.on("groups.update", (updates) => {
        for (const upd of updates) {
          if (!upd.id) continue;
          const existing = this.getCachedGroupMetadata(upd.id);
          if (existing) {
            this.groupMetaCache.set(upd.id, {
              data: { ...existing, ...upd },
              expiresAt: Date.now() + 5 * 60 * 1e3
            });
          } else {
            this.groupMetaCache.delete(upd.id);
          }
        }
      });
      sock.ev.on("group-participants.update", async (event) => {
        this.groupMetaCache.delete(event.id);
        groupCache.updateParticipants(event.id, event.action, event.participants);
        void webhookDispatcher.dispatch("group.participant_update", event);
        if (event.action !== "add" && event.action !== "remove" || event.participants.length === 0) {
          return;
        }
        if (event.participants.length > 5) {
          return;
        }
        const effectiveSettings = botStore.getEffectiveGroupSettings(event.id);
        if (event.action === "add" && !effectiveSettings.welcome) return;
        if (event.action === "remove" && !effectiveSettings.goodbye) return;
        const now = Date.now();
        const lastGreet = this.groupGreetingLastSent.get(event.id) || 0;
        if (now - lastGreet < 15e3) {
          return;
        }
        this.groupGreetingLastSent.set(event.id, now);
        await this.sleepRandom(1400, 2600);
        let groupName = "Grup";
        try {
          const meta = await this.getOrFetchGroupMetadata(sock, event.id);
          if (meta.subject) groupName = meta.subject;
        } catch {
        }
        const templateKey = event.action === "add" ? "welcomeMsg" : "goodbyeMsg";
        const templateRaw = botStore.getEffectiveTemplate(
          templateKey,
          event.id
        );
        const mentionJids = [];
        const phoneLabels = [];
        for (const participant of event.participants) {
          const jid = typeof participant === "string" ? participant : participant.id;
          const phone = jid.split(":")[0]?.split("@")[0] || jid;
          mentionJids.push(jid);
          phoneLabels.push(phone);
        }
        const combinedTarget = phoneLabels.length === 1 ? phoneLabels[0] : phoneLabels.join(", @");
        const renderedText = renderBotTemplate(templateRaw, {
          target: combinedTarget,
          sender: phoneLabels[0] || "",
          groupName,
          prefix: botStore.config.prefix,
          botName: botStore.config.botName
        });
        try {
          await this.simulateHumanTyping(sock, event.id, true);
          await sock.sendMessage(event.id, {
            text: renderedText,
            mentions: mentionJids,
            linkPreview: null
          });
        } catch {
        }
      });
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        for (const msg of messages) {
          void this.cacheIncomingViewOnceIfAny(sock, msg);
        }
        if (type !== "notify") return;
        for (const msg of messages) {
          void this.handleIncomingMessage(sock, msg);
          if (!msg.key.fromMe) {
            void webhookDispatcher.dispatch("message.received", {
              id: msg.key.id,
              from: msg.key.remoteJid,
              participant: msg.key.participant,
              pushName: msg.pushName,
              timestamp: msg.messageTimestamp
            });
          }
        }
      });
    } catch (err) {
      this.isStarting = false;
      const errMsg = err instanceof Error ? err.message : "Gagal menginisialisasi koneksi WhatsApp.";
      botStore.updateWAState({
        status: "disconnected",
        statusMessage: null,
        lastError: errMsg
      });
    }
  }
  unwrapWaMessage(raw) {
    let current = raw;
    for (let depth = 0; depth < 8 && current; depth += 1) {
      if (current.deviceSentMessage?.message) {
        current = current.deviceSentMessage.message;
        continue;
      }
      if (current.ephemeralMessage?.message) {
        current = current.ephemeralMessage.message;
        continue;
      }
      if (current.viewOnceMessage?.message) {
        current = current.viewOnceMessage.message;
        continue;
      }
      if (current.viewOnceMessageV2?.message) {
        current = current.viewOnceMessageV2.message;
        continue;
      }
      if (current.viewOnceMessageV2Extension?.message) {
        current = current.viewOnceMessageV2Extension.message;
        continue;
      }
      if (current.documentWithCaptionMessage?.message) {
        current = current.documentWithCaptionMessage.message;
        continue;
      }
      if (current.editedMessage?.message?.protocolMessage?.editedMessage) {
        current = current.editedMessage.message.protocolMessage.editedMessage;
        continue;
      }
      break;
    }
    return current || null;
  }
  inspectViewOnceCandidate(raw) {
    let current = raw;
    let sawVoWrapper = false;
    for (let depth = 0; depth < 10 && current; depth += 1) {
      if (current.deviceSentMessage?.message) {
        current = current.deviceSentMessage.message;
        continue;
      }
      if (current.ephemeralMessage?.message) {
        current = current.ephemeralMessage.message;
        continue;
      }
      if (current.viewOnceMessage?.message) {
        sawVoWrapper = true;
        current = current.viewOnceMessage.message;
        continue;
      }
      if (current.viewOnceMessageV2?.message) {
        sawVoWrapper = true;
        current = current.viewOnceMessageV2.message;
        continue;
      }
      if (current.viewOnceMessageV2Extension?.message) {
        sawVoWrapper = true;
        current = current.viewOnceMessageV2Extension.message;
        continue;
      }
      if (current.documentWithCaptionMessage?.message) {
        current = current.documentWithCaptionMessage.message;
        continue;
      }
      if (current.templateMessage?.hydratedTemplate) {
        const ht = current.templateMessage.hydratedTemplate;
        if (ht.imageMessage) {
          current = { imageMessage: ht.imageMessage };
          continue;
        }
        if (ht.videoMessage) {
          current = { videoMessage: ht.videoMessage };
          continue;
        }
        if (ht.documentMessage) {
          current = { documentMessage: ht.documentMessage };
          continue;
        }
      }
      if (current.templateMessage?.hydratedFourRowTemplate) {
        const ht = current.templateMessage.hydratedFourRowTemplate;
        if (ht.imageMessage) {
          current = { imageMessage: ht.imageMessage };
          continue;
        }
        if (ht.videoMessage) {
          current = { videoMessage: ht.videoMessage };
          continue;
        }
        if (ht.documentMessage) {
          current = { documentMessage: ht.documentMessage };
          continue;
        }
      }
      if (current.interactiveMessage?.header) {
        const hdr = current.interactiveMessage.header;
        if (hdr.imageMessage) {
          current = { imageMessage: hdr.imageMessage };
          continue;
        }
        if (hdr.videoMessage) {
          current = { videoMessage: hdr.videoMessage };
          continue;
        }
        if (hdr.documentMessage) {
          current = { documentMessage: hdr.documentMessage };
          continue;
        }
      }
      break;
    }
    if (!current) return null;
    const checkHasKeys = (m) => Boolean(
      m?.mediaKey && m.mediaKey.length > 0 && (Boolean(m.directPath) || Boolean(m.url))
    );
    if (current.imageMessage) {
      const m = current.imageMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: "image",
        hkdfType: "image",
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || "image/jpeg",
        caption: m.caption || void 0
      };
    }
    if (current.videoMessage) {
      const m = current.videoMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: "video",
        hkdfType: "video",
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || "video/mp4",
        caption: m.caption || void 0
      };
    }
    if (current.ptvMessage) {
      const m = current.ptvMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: "video",
        hkdfType: "ptv",
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || "video/mp4",
        caption: m.caption || void 0
      };
    }
    if (current.audioMessage) {
      const m = current.audioMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: "audio",
        hkdfType: "audio",
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || "audio/ogg; codecs=opus",
        isVoiceNote: Boolean(m.ptt)
      };
    }
    if (current.documentMessage && (sawVoWrapper || current.documentMessage.viewOnce)) {
      const m = current.documentMessage;
      const mime = (m.mimetype || "").toLowerCase();
      const isVid = mime.startsWith("video/");
      const isAud = mime.startsWith("audio/");
      return {
        isViewOnce: true,
        kind: isVid ? "video" : isAud ? "audio" : "image",
        hkdfType: isVid ? "video" : isAud ? "audio" : "image",
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || (isVid ? "video/mp4" : "image/jpeg"),
        caption: m.caption || void 0
      };
    }
    return null;
  }
  async ensureViewOnceDir() {
    try {
      await fs10.mkdir(VIEWONCE_DIR, { recursive: true });
    } catch {
    }
  }
  async persistViewOnceToDisk(item) {
    if (!item.buffer || item.buffer.length === 0) return;
    try {
      await this.ensureViewOnceDir();
      const metaPath = path8.join(VIEWONCE_DIR, `${item.id}.json`);
      const binPath = path8.join(VIEWONCE_DIR, `${item.id}.bin`);
      const meta = {
        id: item.id,
        remoteJid: item.remoteJid,
        kind: item.kind,
        mimeType: item.mimeType,
        caption: item.caption,
        isVoiceNote: item.isVoiceNote,
        savedAt: item.savedAt
      };
      await fs10.writeFile(metaPath, JSON.stringify(meta), "utf-8");
      await fs10.writeFile(binPath, item.buffer);
      const files = await fs10.readdir(VIEWONCE_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      if (jsonFiles.length > 25) {
        const parsed = await Promise.all(
          jsonFiles.map(async (jf) => {
            try {
              const raw = await fs10.readFile(path8.join(VIEWONCE_DIR, jf), "utf-8");
              const data = JSON.parse(raw);
              return { file: jf, id: data.id || jf.replace(".json", ""), savedAt: data.savedAt || 0 };
            } catch {
              return { file: jf, id: jf.replace(".json", ""), savedAt: 0 };
            }
          })
        );
        parsed.sort((a, b) => a.savedAt - b.savedAt);
        const toDelete = parsed.slice(0, parsed.length - 20);
        for (const d of toDelete) {
          await fs10.unlink(path8.join(VIEWONCE_DIR, `${d.id}.json`)).catch(() => {
          });
          await fs10.unlink(path8.join(VIEWONCE_DIR, `${d.id}.bin`)).catch(() => {
          });
        }
      }
    } catch {
    }
  }
  async loadRecentViewOnceFromDisk() {
    try {
      await this.ensureViewOnceDir();
      const files = await fs10.readdir(VIEWONCE_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      const now = Date.now();
      for (const jf of jsonFiles) {
        try {
          const metaPath = path8.join(VIEWONCE_DIR, jf);
          const raw = await fs10.readFile(metaPath, "utf-8");
          const data = JSON.parse(raw);
          if (now - data.savedAt > 24 * 60 * 60 * 1e3) {
            await fs10.unlink(metaPath).catch(() => {
            });
            await fs10.unlink(path8.join(VIEWONCE_DIR, `${data.id}.bin`)).catch(() => {
            });
            continue;
          }
          const binPath = path8.join(VIEWONCE_DIR, `${data.id}.bin`);
          const buf = await fs10.readFile(binPath).catch(() => null);
          if (buf && buf.length > 0) {
            const item = {
              id: data.id,
              remoteJid: data.remoteJid,
              kind: data.kind,
              buffer: buf,
              mimeType: data.mimeType,
              caption: data.caption,
              isVoiceNote: data.isVoiceNote,
              savedAt: data.savedAt
            };
            this.recentViewOnceCache.set(data.id, item);
            if (data.remoteJid) {
              this.lastViewOnceByChat.set(data.remoteJid, data.id);
            }
          }
        } catch {
        }
      }
    } catch {
    }
  }
  async cacheIncomingViewOnceIfAny(sock, msg) {
    const id = msg.key?.id;
    const remoteJid = msg.key?.remoteJid;
    if (!id || !remoteJid || !msg.message) return;
    const inspected = this.inspectViewOnceCandidate(msg.message);
    if (!inspected || !inspected.isViewOnce) {
      return;
    }
    this.lastViewOnceByChat.set(remoteJid, id);
    const now = Date.now();
    for (const [k, v] of this.recentViewOnceCache.entries()) {
      if (now - v.savedAt > 60 * 60 * 1e3) {
        this.recentViewOnceCache.delete(k);
      }
    }
    while (this.recentViewOnceCache.size >= 50) {
      const oldestKey = this.recentViewOnceCache.keys().next().value;
      if (!oldestKey) break;
      this.recentViewOnceCache.delete(oldestKey);
    }
    const cachedItem = {
      id,
      remoteJid,
      kind: inspected.kind,
      hkdfType: inspected.hkdfType,
      mediaObj: inspected.mediaObj,
      mimeType: inspected.mimeType,
      caption: inspected.caption,
      isVoiceNote: inspected.isVoiceNote,
      fullMsg: msg,
      savedAt: now
    };
    this.recentViewOnceCache.set(id, cachedItem);
    try {
      let buffer = null;
      try {
        const direct = await downloadMediaMessage(
          msg,
          "buffer",
          {},
          {
            logger: silentLogger,
            reuploadRequest: sock.updateMediaMessage
          }
        );
        if (direct && direct.length > 0) {
          buffer = Buffer.from(direct);
        }
      } catch {
      }
      if (!buffer && inspected.hasDownloadKeys) {
        try {
          buffer = await this.downloadStreamToBuffer(
            inspected.mediaObj,
            inspected.hkdfType
          );
        } catch {
          try {
            const refreshed = await sock.updateMediaMessage(msg);
            const refInspected = this.inspectViewOnceCandidate(refreshed.message);
            if (refInspected?.hasDownloadKeys) {
              buffer = await this.downloadStreamToBuffer(
                refInspected.mediaObj,
                refInspected.hkdfType
              );
            }
          } catch {
          }
        }
      }
      if (buffer && buffer.length > 0) {
        cachedItem.buffer = buffer;
        this.recentViewOnceCache.set(id, cachedItem);
        void this.persistViewOnceToDisk(cachedItem);
      }
    } catch {
    }
  }
  extractMessageText(msg) {
    const m = this.unwrapWaMessage(msg.message);
    if (!m) return "";
    return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || "";
  }
  extractContextInfo(msg) {
    const m = this.unwrapWaMessage(msg.message);
    return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo || m?.documentMessage?.contextInfo || m?.audioMessage?.contextInfo || m?.stickerMessage?.contextInfo || void 0;
  }
  async sendReaction(sock, msg, emoji) {
    if (!msg.key.remoteJid || !msg.key.id) return;
    try {
      await sock.sendMessage(msg.key.remoteJid, {
        react: {
          text: emoji,
          key: msg.key
        }
      });
    } catch {
    }
  }
  async extractAttachedOrQuotedMediaByKind(sock, msg, kind) {
    const pickField = (m) => {
      if (!m) return null;
      if (kind === "image") return m.imageMessage || null;
      if (kind === "video") return m.videoMessage || m.ptvMessage || null;
      if (kind === "audio") return m.audioMessage || null;
      return m.stickerMessage || null;
    };
    try {
      const m = this.unwrapWaMessage(msg.message);
      if (pickField(m)) {
        const buf = await downloadMediaMessage(
          { key: msg.key, message: m },
          "buffer",
          {},
          {
            logger: silentLogger,
            reuploadRequest: sock.updateMediaMessage
          }
        );
        return Buffer.from(buf);
      }
      const contextInfo = this.extractContextInfo(msg);
      const quoted = this.unwrapWaMessage(contextInfo?.quotedMessage);
      if (pickField(quoted) && contextInfo?.stanzaId) {
        const quotedMsg = {
          key: {
            remoteJid: msg.key.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
          },
          message: quoted
        };
        const buf = await downloadMediaMessage(
          quotedMsg,
          "buffer",
          {},
          {
            logger: silentLogger,
            reuploadRequest: sock.updateMediaMessage
          }
        );
        return Buffer.from(buf);
      }
    } catch {
      return null;
    }
    return null;
  }
  async downloadStreamToBuffer(mediaObj, hkdfType) {
    const candidateHosts = [
      "mmg.whatsapp.net",
      "media-sin1-1.cdn.whatsapp.net",
      "media-cgk1-1.cdn.whatsapp.net",
      "media-cgk1-2.cdn.whatsapp.net",
      "media.fsub3-2.fna.whatsapp.net"
    ];
    let lastErr;
    for (const host of candidateHosts) {
      try {
        const stream = await downloadContentFromMessage(mediaObj, hkdfType, {
          host
        });
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buf = Buffer.concat(chunks);
        if (buf.length > 0) {
          return buf;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Hasil dekripsi media View Once kosong.");
  }
  async extractViewOnceForRvo(sock, msg) {
    const remoteJid = msg.key.remoteJid || "";
    const contextInfo = this.extractContextInfo(msg);
    const stanzaId = contextInfo?.stanzaId || "";
    const rawQuoted = contextInfo?.quotedMessage;
    const selfInspected = this.inspectViewOnceCandidate(msg.message);
    if (selfInspected && selfInspected.isViewOnce) {
      if (msg.key.id && this.recentViewOnceCache.has(msg.key.id)) {
        const c = this.recentViewOnceCache.get(msg.key.id);
        if (c.buffer) {
          return {
            payload: {
              kind: c.kind,
              buffer: c.buffer,
              mimeType: c.mimeType,
              caption: c.caption,
              isVoiceNote: c.isVoiceNote
            }
          };
        }
      }
      try {
        const direct = await downloadMediaMessage(
          msg,
          "buffer",
          {},
          {
            logger: silentLogger,
            reuploadRequest: sock.updateMediaMessage
          }
        );
        if (direct && direct.length > 0) {
          return {
            payload: {
              kind: selfInspected.kind,
              buffer: Buffer.from(direct),
              mimeType: selfInspected.mimeType,
              caption: selfInspected.caption,
              isVoiceNote: selfInspected.isVoiceNote
            }
          };
        }
      } catch {
      }
    }
    if (stanzaId) {
      const cached = this.recentViewOnceCache.get(stanzaId);
      if (cached && cached.buffer) {
        return {
          payload: {
            kind: cached.kind,
            buffer: cached.buffer,
            mimeType: cached.mimeType,
            caption: cached.caption,
            isVoiceNote: cached.isVoiceNote
          }
        };
      }
      if (cached && cached.mediaObj && cached.hkdfType) {
        try {
          const buf = await this.downloadStreamToBuffer(
            cached.mediaObj,
            cached.hkdfType
          );
          cached.buffer = buf;
          void this.persistViewOnceToDisk(cached);
          return {
            payload: {
              kind: cached.kind,
              buffer: buf,
              mimeType: cached.mimeType,
              caption: cached.caption,
              isVoiceNote: cached.isVoiceNote
            }
          };
        } catch {
        }
      }
      if (rawQuoted) {
        const quotedInspected = this.inspectViewOnceCandidate(rawQuoted);
        if (quotedInspected && quotedInspected.hasDownloadKeys) {
          try {
            const buf = await this.downloadStreamToBuffer(
              quotedInspected.mediaObj,
              quotedInspected.hkdfType
            );
            return {
              payload: {
                kind: quotedInspected.kind,
                buffer: buf,
                mimeType: quotedInspected.mimeType,
                caption: quotedInspected.caption,
                isVoiceNote: quotedInspected.isVoiceNote
              }
            };
          } catch {
          }
        }
      }
    }
    const lastChatId = this.lastViewOnceByChat.get(remoteJid);
    if (lastChatId) {
      const lastVo = this.recentViewOnceCache.get(lastChatId);
      if (lastVo && lastVo.buffer) {
        return {
          payload: {
            kind: lastVo.kind,
            buffer: lastVo.buffer,
            mimeType: lastVo.mimeType,
            caption: lastVo.caption,
            isVoiceNote: lastVo.isVoiceNote
          }
        };
      }
      if (lastVo && lastVo.mediaObj && lastVo.hkdfType) {
        try {
          const buf = await this.downloadStreamToBuffer(
            lastVo.mediaObj,
            lastVo.hkdfType
          );
          lastVo.buffer = buf;
          void this.persistViewOnceToDisk(lastVo);
          return {
            payload: {
              kind: lastVo.kind,
              buffer: buf,
              mimeType: lastVo.mimeType,
              caption: lastVo.caption,
              isVoiceNote: lastVo.isVoiceNote
            }
          };
        } catch {
        }
      }
    }
    let newestItem = null;
    for (const item of this.recentViewOnceCache.values()) {
      if (item.buffer && (!newestItem || item.savedAt > newestItem.savedAt)) {
        newestItem = item;
      }
    }
    if (newestItem && Date.now() - newestItem.savedAt < 60 * 60 * 1e3) {
      return {
        payload: {
          kind: newestItem.kind,
          buffer: newestItem.buffer,
          mimeType: newestItem.mimeType,
          caption: newestItem.caption,
          isVoiceNote: newestItem.isVoiceNote
        }
      };
    }
    return {
      payload: null,
      errorHint: "Belum ada pesan *View Once* (sekali lihat) yang tersimpan di chat ini. Kirim foto/video sekali lihat baru, lalu ketik *.rvo* (bisa tanpa reply) untuk membukanya kembali."
    };
  }
  classifyDocKind(mimeType, fileName) {
    const lowerMime = mimeType.toLowerCase();
    const lowerName = fileName.toLowerCase();
    if (lowerMime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(lowerName)) {
      return "image";
    }
    if (lowerMime.startsWith("video/") || /\.(mp4|mov|m4v|mkv|webm|3gp)$/i.test(lowerName)) {
      return "video";
    }
    return "unsupported";
  }
  async extractDocumentForHdsw(sock, msg) {
    const m = this.unwrapWaMessage(msg.message);
    const contextInfo = this.extractContextInfo(msg);
    const quoted = this.unwrapWaMessage(contextInfo?.quotedMessage);
    let targetDoc = m?.documentMessage || null;
    let targetWaMsg = targetDoc ? { key: msg.key, message: m } : null;
    if (!targetDoc && quoted?.documentMessage && contextInfo?.stanzaId) {
      targetDoc = quoted.documentMessage;
      targetWaMsg = {
        key: {
          remoteJid: msg.key.remoteJid,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        },
        message: quoted
      };
    }
    if (!targetDoc || !targetWaMsg) {
      const hasRegularMedia = Boolean(
        m?.imageMessage || m?.videoMessage || quoted?.imageMessage || quoted?.videoMessage
      );
      return {
        documentMedia: null,
        attachedNonDocumentMedia: hasRegularMedia
      };
    }
    const mimeType = targetDoc.mimetype || "application/octet-stream";
    const fileName = targetDoc.fileName || "";
    const fileSize = Number(targetDoc.fileLength || 0);
    const kind = this.classifyDocKind(mimeType, fileName);
    if (kind === "unsupported") {
      return {
        documentMedia: {
          kind: "unsupported",
          mimeType,
          fileName,
          fileSize
        },
        attachedNonDocumentMedia: false
      };
    }
    const maxBytes = 65 * 1024 * 1024;
    if (fileSize > maxBytes) {
      throw new Error(
        "Ukuran dokumen melebihi batas aman 65 MB untuk pengiriman Status WhatsApp."
      );
    }
    const downloaded = await downloadMediaMessage(
      targetWaMsg,
      "buffer",
      {},
      {
        logger: silentLogger,
        reuploadRequest: sock.updateMediaMessage
      }
    );
    const rawBuffer = Buffer.from(downloaded);
    const jpegThumbnail = targetDoc.jpegThumbnail ? Buffer.from(targetDoc.jpegThumbnail) : void 0;
    return {
      documentMedia: {
        kind,
        buffer: rawBuffer,
        mimeType,
        fileName,
        fileSize: rawBuffer.length,
        jpegThumbnail
      },
      attachedNonDocumentMedia: false
    };
  }
  async handleIncomingMessage(sock, msg) {
    if (!msg.message || !msg.key.remoteJid) return;
    if (msg.key.remoteJid === "status@broadcast") return;
    void this.cacheIncomingViewOnceIfAny(sock, msg);
    const text = this.extractMessageText(msg).trim();
    if (!text) return;
    if (msg.key.fromMe && !botStore.config.selfMode) {
      return;
    }
    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith("@g.us");
    const senderJid = isGroup ? msg.key.participant || remoteJid : remoteJid;
    const keyAlt = msg.key;
    const senderAltJid = (isGroup ? keyAlt.participantAlt : keyAlt.remoteJidAlt) || "";
    const preferredPhoneSource = senderAltJid.endsWith("@s.whatsapp.net") ? senderAltJid : senderJid;
    let senderPhone = preferredPhoneSource.split(":")[0]?.split("@")[0] || "user";
    const senderName = msg.pushName || `+${senderPhone}`;
    const isPrefixCommand = text.toLowerCase().startsWith(botStore.config.prefix.toLowerCase());
    const normalizeWaPhone = (raw) => {
      let d = raw.replace(/[^0-9]/g, "");
      if (d.startsWith("08")) d = "62" + d.slice(1);
      else if (d.startsWith("8") && d.length >= 9) d = "62" + d;
      return d;
    };
    const ownerNumberDigits = normalizeWaPhone(
      botStore.config.antiBan?.ownerNumber || "6289673533963"
    );
    const normalizedSenderPhone = normalizeWaPhone(senderPhone);
    const isOwner = Boolean(msg.key.fromMe) || Boolean(
      ownerNumberDigits && normalizedSenderPhone && normalizedSenderPhone === ownerNumberDigits
    );
    if (botStore.config.antiBan?.enabled && botStore.config.antiBan?.ownerOnlyMode) {
      if (!isOwner) {
        return;
      }
    }
    if (botStore.config.antiBan?.enabled && isPrefixCommand && !isOwner) {
      const now = Date.now();
      const userKey = senderPhone || senderJid;
      const history = this.userCommandTimestamps.get(userKey) || [];
      const windowStart = now - 6e4;
      const recent = history.filter((ts) => ts > windowStart);
      const maxPerMin = botStore.config.antiBan.warmUpMode ? Math.min(botStore.config.antiBan.maxCommandsPerMinutePerUser || 3, 3) : botStore.config.antiBan.maxCommandsPerMinutePerUser || 5;
      const cooldownSec = botStore.config.antiBan.warmUpMode ? Math.max(botStore.config.antiBan.userCooldownSeconds || 8, 8) : botStore.config.antiBan.userCooldownSeconds || 5;
      const lastTs = recent.length > 0 ? recent[recent.length - 1] : 0;
      const elapsedSec = (now - lastTs) / 1e3;
      if (elapsedSec < cooldownSec || recent.length >= maxPerMin) {
        botStore.incrementAntiBanStat("throttledSpams");
        recent.push(now);
        this.userCommandTimestamps.set(userKey, recent);
        if (recent.length === maxPerMin + 1) {
          const waitTime = Math.ceil(Math.max(cooldownSec - elapsedSec, 5));
          try {
            await sock.sendMessage(
              remoteJid,
              {
                text: `\u{1F6E1}\uFE0F *Anti-Ban Guard*: Mohon santai sejenak (*${waitTime} detik*).
Batas perintah diterapkan untuk melindungi nomor bot dari pemblokiran spam WhatsApp.`
              },
              { quoted: msg }
            );
          } catch {
          }
        }
        return;
      }
      recent.push(now);
      this.userCommandTimestamps.set(userKey, recent);
    }
    if (isPrefixCommand && botStore.config.autoRead && msg.key.id && !msg.key.fromMe) {
      try {
        await this.sleepRandom(250, 550);
        await sock.readMessages([msg.key]);
      } catch {
      }
    }
    const pendingSent = shouldSendPendingReaction(text);
    if (pendingSent) {
      await this.sendReaction(sock, msg, botStore.config.reactions.pending);
    }
    let isAdmin = !isGroup || isOwner;
    let isBotGroupAdmin;
    let groupName;
    let groupMembers;
    let waGroupOps;
    if (isGroup) {
      waGroupOps = {
        removeParticipant: async (targetJid) => {
          await this.sleepRandom(1100, 2200);
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], "remove");
          this.groupMetaCache.delete(remoteJid);
        },
        addParticipant: async () => {
          throw new Error(SUSPENSION_RISK_DISABLED_REPLY);
        },
        promoteParticipant: async (targetJid) => {
          await this.sleepRandom(1100, 2200);
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], "promote");
          this.groupMetaCache.delete(remoteJid);
        },
        demoteParticipant: async (targetJid) => {
          await this.sleepRandom(1100, 2200);
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], "demote");
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupAnnouncement: async (announcementOnly) => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error(
              "Pengubahan setelan grup dikunci manual oleh Owner."
            );
          }
          await this.sleepRandom(1e3, 1900);
          await sock.groupSettingUpdate(
            remoteJid,
            announcementOnly ? "announcement" : "not_announcement"
          );
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupSubject: async (subject) => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error("Pengubahan nama grup dikunci manual oleh Owner.");
          }
          await this.sleepRandom(1100, 2e3);
          await sock.groupUpdateSubject(remoteJid, subject);
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupDescription: async (description) => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error(
              "Pengubahan deskripsi grup dikunci manual oleh Owner."
            );
          }
          await this.sleepRandom(1100, 2e3);
          await sock.groupUpdateDescription(remoteJid, description);
          this.groupMetaCache.delete(remoteJid);
        },
        getGroupInviteCode: async () => {
          await this.sleepRandom(800, 1500);
          return await sock.groupInviteCode(remoteJid);
        },
        revokeGroupInviteCode: async () => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error(
              "Reset tautan undangan grup dikunci manual oleh Owner."
            );
          }
          await this.sleepRandom(1300, 2400);
          return await sock.groupRevokeInvite(remoteJid);
        }
      };
      try {
        const meta = await this.getOrFetchGroupMetadata(sock, remoteJid);
        groupName = meta.subject;
        const botRawId = sock.user?.id || "";
        const botPhoneBase = botRawId.split(":")[0]?.split("@")[0] || "";
        const botLidRaw = sock.user?.lid || "";
        const botLidBase = botLidRaw.split(":")[0]?.split("@")[0] || "";
        let detectedBotAdmin = false;
        groupMembers = meta.participants.map((p) => {
          const rawP = p;
          const phoneSource = rawP.phoneNumber || (rawP.id.endsWith("@s.whatsapp.net") ? rawP.id : rawP.id);
          const phone = phoneSource.split(":")[0]?.split("@")[0] || rawP.id;
          const lid = rawP.lid || (rawP.id.endsWith("@lid") ? rawP.id : void 0);
          const participantIsAdmin = Boolean(rawP.admin);
          const pIdBase = rawP.id.split(":")[0]?.split("@")[0] || "";
          const pLidBase = lid ? lid.split(":")[0]?.split("@")[0] || "" : "";
          if (botPhoneBase && (phone === botPhoneBase || pIdBase === botPhoneBase) || botLidBase && (pIdBase === botLidBase || pLidBase === botLidBase)) {
            detectedBotAdmin = participantIsAdmin;
          }
          return {
            jid: rawP.id,
            lid,
            name: phone,
            phone,
            isAdmin: participantIsAdmin
          };
        });
        isBotGroupAdmin = detectedBotAdmin;
        const cleanSenderDigits = normalizeWaPhone(senderPhone);
        const baseSenderJid = senderJid.split(":")[0]?.split("@")[0] || "";
        const foundSender = groupMembers.find(
          (p) => p.jid === senderJid || p.jid.split(":")[0]?.split("@")[0] === baseSenderJid || p.lid && (p.lid === senderJid || p.lid.split(":")[0]?.split("@")[0] === baseSenderJid) || senderAltJid && (p.jid === senderAltJid || p.lid === senderAltJid) || p.phone === senderPhone || cleanSenderDigits && normalizeWaPhone(p.phone) === cleanSenderDigits
        );
        if (foundSender) {
          if (/^[0-9]{8,16}$/.test(foundSender.phone)) {
            senderPhone = foundSender.phone;
          }
          const resolvedIsOwner = isOwner || Boolean(ownerNumberDigits) && normalizeWaPhone(senderPhone) === ownerNumberDigits;
          isAdmin = foundSender.isAdmin || resolvedIsOwner;
        }
      } catch {
      }
    }
    const contextInfo = this.extractContextInfo(msg);
    const mentionedJids = contextInfo?.mentionedJid || [];
    const quotedParticipantJid = contextInfo?.participant || void 0;
    const unwrappedQuoted = this.unwrapWaMessage(contextInfo?.quotedMessage);
    const quotedText = unwrappedQuoted?.conversation || unwrappedQuoted?.extendedTextMessage?.text || unwrappedQuoted?.imageMessage?.caption || unwrappedQuoted?.videoMessage?.caption || unwrappedQuoted?.documentMessage?.caption || void 0;
    const quotedBaseId = quotedParticipantJid ? quotedParticipantJid.split(":")[0]?.split("@")[0] || "" : "";
    const foundQuotedMember = quotedBaseId && groupMembers ? groupMembers.find(
      (m) => m.jid === quotedParticipantJid || m.jid.split(":")[0]?.split("@")[0] === quotedBaseId || m.lid && (m.lid === quotedParticipantJid || m.lid.split(":")[0]?.split("@")[0] === quotedBaseId)
    ) : void 0;
    const quotedSenderPhone = foundQuotedMember?.phone || (quotedParticipantJid ? quotedParticipantJid.split(":")[0]?.split("@")[0] : void 0);
    const isSelfQuoted = Boolean(quotedParticipantJid) && (quotedParticipantJid === senderJid || senderAltJid && quotedParticipantJid === senderAltJid || quotedSenderPhone && quotedSenderPhone === senderPhone);
    const quotedSenderName = isSelfQuoted ? senderName : quotedSenderPhone ? `+${quotedSenderPhone}` : void 0;
    const pfx = botStore.config.prefix;
    const lowerText = text.toLowerCase();
    const firstToken = lowerText.startsWith(pfx.toLowerCase()) ? lowerText.slice(pfx.length).trim().split(/\s+/)[0] || "" : "";
    const needsQcAvatar = [
      "qc",
      "quotely",
      "quotechat",
      "bubble",
      "iqc",
      "iphoneqc",
      "ioschat"
    ].includes(firstToken);
    const needsImage = [
      "s",
      "stiker",
      "sticker",
      "sgif",
      "smeme",
      "memesticker",
      "stikermeme",
      "wm",
      "take",
      "colong",
      "swm",
      "hd",
      "enhance",
      "jernih",
      "hdr",
      "remini",
      "facehd",
      "restoreface",
      "upscale",
      "sr",
      "superres",
      "hd2",
      "upscale2x",
      "2x",
      "hd4",
      "upscale4x",
      "4x",
      "hitamkan",
      "grayscale",
      "bw",
      "hitamputih",
      "imgedit",
      "blur",
      "invert",
      "negatif",
      "mirror",
      "flip",
      "sepia",
      "tourl",
      "upload",
      "catbox",
      "linkmedia"
    ].includes(firstToken);
    const needsVideo = [
      "s",
      "stiker",
      "sticker",
      "sgif",
      "toptv",
      "ptv",
      "videobulat",
      "tomp3",
      "toaudio",
      "vn2mp3",
      "tovn",
      "toptt",
      "vn",
      "bass",
      "bassboost",
      "jedagjedug",
      "nightcore",
      "nc",
      "tupai",
      "slow",
      "slowed",
      "reverb",
      "fast",
      "speedup",
      "cepat",
      "robot",
      "robo",
      "cyborg",
      "reverse",
      "baliksuara",
      "tourl",
      "upload",
      "catbox",
      "linkmedia"
    ].includes(firstToken);
    const needsAudio = [
      "tomp3",
      "toaudio",
      "vn2mp3",
      "tovn",
      "toptt",
      "vn",
      "bass",
      "bassboost",
      "jedagjedug",
      "nightcore",
      "nc",
      "tupai",
      "slow",
      "slowed",
      "reverb",
      "fast",
      "speedup",
      "cepat",
      "robot",
      "robo",
      "cyborg",
      "reverse",
      "baliksuara",
      "tourl",
      "upload",
      "catbox",
      "linkmedia"
    ].includes(firstToken);
    const needsSticker = [
      "wm",
      "take",
      "colong",
      "swm",
      "exif",
      "toimg",
      "topng",
      "toimage",
      "tovid",
      "tomp4",
      "togif",
      "tourl",
      "upload",
      "catbox",
      "linkmedia",
      "smeme",
      "memesticker",
      "stikermeme"
    ].includes(firstToken);
    const needsViewOnce = [
      "rvo",
      "readviewonce",
      "bukavo",
      "lihatsekali"
    ].includes(firstToken);
    const needsHdswDoc = [
      "hdsw",
      "sw",
      "tosw",
      "hdstatus",
      "swori",
      "s",
      "stiker",
      "sticker",
      "sgif",
      "hd",
      "enhance",
      "jernih",
      "hdr",
      "remini",
      "facehd",
      "restoreface",
      "upscale",
      "sr",
      "superres",
      "hd2",
      "upscale2x",
      "2x",
      "hd4",
      "upscale4x",
      "4x",
      "toptv",
      "ptv",
      "tourl"
    ].includes(firstToken);
    const senderAvatarJids = [
      /^[0-9]{8,16}$/.test(senderPhone) ? `${senderPhone}@s.whatsapp.net` : void 0,
      senderAltJid,
      senderJid,
      ...groupMembers ? groupMembers.filter((m) => m.phone === senderPhone || m.jid === senderJid).flatMap((m) => [m.jid, m.lid]) : [],
      ...msg.key.fromMe ? [
        sock.user?.id,
        sock.user?.lid
      ] : []
    ];
    const quotedAvatarJids = [
      quotedSenderPhone && /^[0-9]{8,16}$/.test(quotedSenderPhone) ? `${quotedSenderPhone}@s.whatsapp.net` : void 0,
      quotedParticipantJid,
      foundQuotedMember?.jid,
      foundQuotedMember?.lid
    ];
    const [
      imageBuffer,
      videoBuffer,
      audioBuffer,
      stickerBuffer,
      voResult,
      senderAvatarBuffer,
      quotedAvatarBuffer
    ] = await Promise.all([
      needsImage ? this.extractAttachedOrQuotedMediaByKind(sock, msg, "image") : Promise.resolve(null),
      needsVideo ? this.extractAttachedOrQuotedMediaByKind(sock, msg, "video") : Promise.resolve(null),
      needsAudio ? this.extractAttachedOrQuotedMediaByKind(sock, msg, "audio") : Promise.resolve(null),
      needsSticker ? this.extractAttachedOrQuotedMediaByKind(sock, msg, "sticker") : Promise.resolve(null),
      needsViewOnce ? this.extractViewOnceForRvo(sock, msg) : Promise.resolve(null),
      needsQcAvatar ? this.fetchUserProfilePicBuffer(sock, senderAvatarJids) : Promise.resolve(null),
      needsQcAvatar && quotedParticipantJid && !isSelfQuoted ? this.fetchUserProfilePicBuffer(sock, quotedAvatarJids) : Promise.resolve(null)
    ]);
    const viewOnceMedia = voResult?.payload ?? null;
    const viewOnceError = voResult?.errorHint ?? null;
    let documentMedia = null;
    let attachedNonDocumentMedia = false;
    if (needsHdswDoc) {
      try {
        const extracted = await this.extractDocumentForHdsw(sock, msg);
        documentMedia = extracted.documentMedia;
        attachedNonDocumentMedia = extracted.attachedNonDocumentMedia;
      } catch (docErr) {
        if (botStore.config.reactions.enabled) {
          await this.sendReaction(sock, msg, botStore.config.reactions.error);
        }
        const errMsg = docErr instanceof Error ? docErr.message : "Gagal mengunduh file dokumen.";
        await sock.sendMessage(
          remoteJid,
          { text: errMsg },
          { quoted: msg }
        );
        return;
      }
    }
    const unwrappedIncoming = this.unwrapWaMessage(msg.message);
    const detectedImageMime = unwrappedIncoming?.imageMessage?.mimetype || unwrappedQuoted?.imageMessage?.mimetype || null;
    const result = await processBotMessage({
      source: "whatsapp",
      isGroup,
      groupId: isGroup ? remoteJid : void 0,
      groupName,
      senderName,
      senderPhone,
      senderJid,
      isAdmin,
      isBotGroupAdmin,
      text,
      imageBuffer,
      imageMimeType: detectedImageMime,
      videoBuffer,
      audioBuffer,
      stickerBuffer,
      senderAvatarBuffer,
      quotedAvatarBuffer,
      viewOnceMedia,
      viewOnceError,
      quotedText,
      quotedSenderName,
      documentMedia,
      attachedNonDocumentMedia,
      mentionedJids,
      quotedParticipantJid,
      groupMembers,
      waGroupOps,
      onProgressStatus: async (statusText) => {
        await this.enqueueOutboundSend(async () => {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              text: statusText,
              linkPreview: null
            },
            { quoted: msg }
          );
        }).catch(() => {
        });
      }
    });
    if (!result.handled) {
      if (pendingSent) {
        await this.sendReaction(sock, msg, "");
      }
      return;
    }
    try {
      await this.enqueueOutboundSend(async () => {
        if (result.moderatedLink) {
          try {
            await this.sleepRandom(450, 950);
            await sock.sendMessage(remoteJid, { delete: msg.key });
          } catch {
          }
          if (result.replyText) {
            await this.simulateHumanTyping(sock, remoteJid, isGroup);
            await sock.sendMessage(remoteJid, {
              text: result.replyText,
              mentions: result.mentions,
              linkPreview: null
            });
          }
          return;
        }
        if (result.hdswMedia) {
          const hd = result.hdswMedia;
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          if (hd.kind === "image") {
            await sock.sendMessage(
              remoteJid,
              {
                image: hd.buffer,
                mimetype: hd.mimeType,
                caption: hd.caption,
                mentions: result.mentions,
                ...hd.width ? { width: hd.width } : {},
                ...hd.height ? { height: hd.height } : {},
                ...hd.jpegThumbnail ? { jpegThumbnail: hd.jpegThumbnail } : {}
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(
              remoteJid,
              {
                video: hd.buffer,
                mimetype: hd.mimeType,
                caption: hd.caption,
                mentions: result.mentions,
                ...hd.jpegThumbnail ? { jpegThumbnail: hd.jpegThumbnail } : {}
              },
              { quoted: msg }
            );
          }
        } else if (result.stickerBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            { sticker: result.stickerBuffer },
            { quoted: msg }
          );
        } else if (result.imageBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              image: result.imageBuffer,
              mimetype: result.imageMimeType || "image/jpeg",
              caption: result.replyText || ""
            },
            { quoted: msg }
          );
        } else if (result.videoBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          if (result.asPtv) {
            await sock.sendMessage(
              remoteJid,
              {
                video: result.videoBuffer,
                mimetype: "video/mp4",
                ptv: true
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(
              remoteJid,
              {
                video: result.videoBuffer,
                mimetype: result.videoMimeType || "video/mp4",
                caption: result.replyText || ""
              },
              { quoted: msg }
            );
          }
        } else if (result.audioBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup, "audio");
          await sock.sendMessage(
            remoteJid,
            {
              audio: result.audioBuffer,
              mimetype: result.audioMimeType || "audio/mpeg",
              ptt: Boolean(result.asVoiceNote)
            },
            { quoted: msg }
          );
        } else if (result.documentBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              document: result.documentBuffer,
              mimetype: result.documentMimeType || "application/octet-stream",
              fileName: result.documentFileName || "berkas-unduhan",
              caption: result.replyText || ""
            },
            { quoted: msg }
          );
        } else if (result.slideImageUrls && result.slideImageUrls.length > 0) {
          const slides = result.slideImageUrls.slice(0, 35);
          const slideFallbacks = result.slideFallbackImageUrls || [];
          const total = slides.length;
          const CHUNK_SIZE = 4;
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
            const chunkUrls = slides.slice(chunkStart, chunkStart + CHUNK_SIZE);
            const preparedChunk = await Promise.all(
              chunkUrls.map(async (slideUrl, offset) => {
                const absoluteIdx = chunkStart + offset;
                const fallbacks = slideFallbacks[absoluteIdx] || [];
                const { buffer: rawBuf, contentType } = await fetchRemoteBuffer(
                  slideUrl,
                  25 * 1024 * 1024,
                  fallbacks
                );
                const normalized = await ensureWhatsappImageBuffer(
                  rawBuf,
                  contentType
                );
                return {
                  index: absoluteIdx,
                  buffer: normalized.buffer,
                  mimeType: normalized.mimeType
                };
              })
            );
            for (const item of preparedChunk) {
              const stepLabel = `\u{1F4F8} *Foto ${item.index + 1}/${total}*`;
              const photoCaption = item.index === 0 ? result.replyText ? `${result.replyText}
${stepLabel}` : stepLabel : stepLabel;
              await sock.sendMessage(
                remoteJid,
                {
                  image: item.buffer,
                  mimetype: item.mimeType,
                  caption: photoCaption
                },
                item.index === 0 ? { quoted: msg } : void 0
              );
              if (item.index < total - 1) {
                await new Promise((r) => setTimeout(r, 260));
              }
            }
          }
        } else if (result.videoRemoteUrl) {
          const { buffer } = await fetchRemoteBuffer(result.videoRemoteUrl);
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              video: buffer,
              caption: result.replyText || "",
              mimetype: "video/mp4"
            },
            { quoted: msg }
          );
        } else if (result.audioRemoteUrl) {
          const { buffer } = await fetchRemoteBuffer(result.audioRemoteUrl);
          await this.simulateHumanTyping(sock, remoteJid, isGroup, "audio");
          await sock.sendMessage(
            remoteJid,
            {
              audio: buffer,
              mimetype: "audio/mpeg",
              ptt: false
            },
            { quoted: msg }
          );
        } else if (result.replyText) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              text: result.replyText,
              mentions: result.hiddenMentions || result.mentions,
              linkPreview: null
            },
            { quoted: msg }
          );
        }
      });
      if (botStore.config.reactions.enabled && result.reactionStatus) {
        const finalEmoji = result.reactionStatus === "success" ? botStore.config.reactions.success : botStore.config.reactions.error;
        await this.sendReaction(sock, msg, finalEmoji);
      }
    } catch (sendErr) {
      if (botStore.config.reactions.enabled) {
        await this.sendReaction(sock, msg, botStore.config.reactions.error);
      }
      const fallbackErr = sendErr instanceof Error ? sendErr.message : "Gagal mengirim media ke WhatsApp.";
      try {
        await sock.sendMessage(
          remoteJid,
          { text: `Kendala pengiriman media: ${fallbackErr}` },
          { quoted: msg }
        );
      } catch {
      }
    }
  }
};
var waManager = new WhatsAppSessionManager();

// server.ts
function resolveListenConfig() {
  const args = process.argv.slice(2);
  let cliPort;
  let host = "0.0.0.0";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--port" || arg === "-p") && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        cliPort = parsed;
      }
      i++;
    } else if (arg.startsWith("--port=")) {
      const parsed = Number(arg.slice("--port=".length));
      if (Number.isFinite(parsed) && parsed > 0) {
        cliPort = parsed;
      }
    } else if (arg === "--host" && args[i + 1] && !args[i + 1].startsWith("-")) {
      host = args[i + 1];
      i++;
    } else if (arg.startsWith("--host=")) {
      const val = arg.slice("--host=".length).trim();
      if (val) host = val;
    }
  }
  if (cliPort !== void 0) {
    return { port: cliPort, host, explicitCliPort: true };
  }
  const pterodactylPort = Number(process.env.SERVER_PORT || 0);
  if (Number.isFinite(pterodactylPort) && pterodactylPort > 0) {
    return {
      port: pterodactylPort,
      host,
      explicitCliPort: false
    };
  }
  return {
    port: Number(process.env.APP_PORT || 3e3),
    host,
    explicitCliPort: false
  };
}
var LISTEN_CONFIG = resolveListenConfig();
function getLocalLanUrls2(port) {
  const urls = [];
  try {
    const nets = os6.networkInterfaces();
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const net of entries) {
        const fam = String(net.family);
        if ((fam === "IPv4" || fam === "4") && !net.internal && net.address) {
          const url = `http://${net.address}:${port}`;
          if (!urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }
  } catch {
  }
  return urls;
}
function classifySimulatorDocKind(mimeType, fileName) {
  const m = (mimeType || "").toLowerCase();
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
    return "image";
  }
  if (m.startsWith("video/") || ["mp4", "mov", "mkv", "webm", "m4v", "3gp"].includes(ext)) {
    return "video";
  }
  return "unsupported";
}
function formatByteLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
async function loadSampleCatBuffer() {
  try {
    const samplePath = path9.join(
      process.cwd(),
      "src",
      "assets",
      "images",
      "sample_sticker_cat_1793095457845.jpg"
    );
    return await fs11.readFile(samplePath);
  } catch {
    return null;
  }
}
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Api-Key, X-Owner-Key"
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(remoteTunnel.expressMiddleware);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const reqUrl = request.url || "";
    if (reqUrl.startsWith("/ws")) {
      if (!remoteTunnel.isAuthorizedWsUpgrade(request)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
  wss.on("connection", (ws) => {
    botStore.attachClient(ws);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === "ping" && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch {
      }
    });
  });
  const wsHeartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        try {
          client.ping();
        } catch {
        }
      }
    }
  }, 25e3);
  wsHeartbeatInterval.unref();
  const externalSelfUrl = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_SERVER_URL || "").trim().replace(/\/+$/, "");
  app.get("/ping", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send("pong");
  });
  app.get("/api/health", (_req, res) => {
    const activeDataDir = resolveDataDir();
    const cloudDbSync = cloudSync.isEnabled();
    res.json({
      ok: true,
      engine: "WABot Stateful Engine",
      waStatus: botStore.waState.status,
      uptimeSeconds: Math.floor(process.uptime()),
      dataDir: activeDataDir,
      cloudDbSync,
      keepAliveActive: Boolean(externalSelfUrl),
      persistentMount: activeDataDir === "/data" || Boolean(process.env.DATA_DIR) || cloudDbSync,
      timestamp: Date.now()
    });
  });
  app.get("/api/network-info", (_req, res) => {
    const port = activePort || LISTEN_CONFIG.port;
    res.json({
      ok: true,
      port,
      localhostUrl: `http://localhost:${port}`,
      loopbackUrl: `http://127.0.0.1:${port}`,
      lanUrls: getLocalLanUrls2(port),
      arch: process.arch,
      platform: process.platform,
      nodeVersion: process.version,
      imageBackend: getActiveImageBackend(),
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
    });
  });
  app.get("/api/remote-tunnel", (_req, res) => {
    const port = activePort || LISTEN_CONFIG.port;
    res.json(remoteTunnel.getSnapshot(port));
  });
  app.post("/api/remote-tunnel/start", async (_req, res) => {
    try {
      const port = activePort || LISTEN_CONFIG.port;
      const snap = await remoteTunnel.startTunnel(port);
      res.json(snap);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Gagal menyalakan tunnel jarak jauh."
      });
    }
  });
  app.post("/api/remote-tunnel/stop", (_req, res) => {
    res.json(remoteTunnel.stopTunnel());
  });
  app.post("/api/remote-tunnel/rotate-key", (_req, res) => {
    const port = activePort || LISTEN_CONFIG.port;
    remoteTunnel.rotateAccessKey();
    res.json(remoteTunnel.getSnapshot(port));
  });
  app.use("/api/gateway", gatewayRouter);
  app.get("/api/state", (_req, res) => {
    res.json(botStore.getSnapshot());
  });
  app.post("/api/wa/connect-qr", async (_req, res) => {
    try {
      await waManager.connectWithQR();
      res.json({ ok: true, waState: botStore.waState });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Gagal memulai sesi QR."
      });
    }
  });
  app.post("/api/wa/connect-pairing", async (req, res) => {
    try {
      const phoneNumber = String(req.body?.phoneNumber || "");
      await waManager.connectWithPairingCode(phoneNumber);
      res.json({ ok: true, waState: botStore.waState });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Gagal meminta Pairing Code."
      });
    }
  });
  app.post("/api/wa/disconnect", async (_req, res) => {
    await waManager.disconnect(true);
    res.json({ ok: true, waState: botStore.waState });
  });
  app.patch("/api/config", (req, res) => {
    const patch = req.body || {};
    const updated = botStore.updateConfig(patch);
    if (patch.aiEnhance) {
      void pushRuntimeConfigToAiService(updated.aiEnhance);
    }
    res.json({ ok: true, config: updated });
  });
  app.get("/api/ai-enhance/status", async (_req, res) => {
    const status = await checkAiServiceHealth(botStore.config.aiEnhance);
    res.json(status);
  });
  app.get("/api/sample-cat.jpg", async (_req, res) => {
    const buf = await loadSampleCatBuffer();
    if (!buf) {
      res.status(404).send("Gambar contoh tidak ditemukan.");
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  });
  app.get("/api/sample-video.mp4", async (_req, res) => {
    try {
      const buf = await getOrCreateSampleVideoBuffer();
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch {
      res.status(500).send("Gagal menyiapkan video contoh.");
    }
  });
  app.get("/api/sample-audio.mp3", async (_req, res) => {
    try {
      const buf = await getOrCreateSampleAudioBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch {
      res.status(500).send("Gagal menyiapkan audio contoh.");
    }
  });
  app.get("/api/stickers/:stickerFile", (req, res) => {
    const rawParam = String(req.params.stickerFile || "");
    const id = rawParam.replace(/\.webp$/i, "");
    const buffer = botStore.stickerCache.get(id);
    if (!buffer) {
      res.status(404).send("Stiker tidak ditemukan.");
      return;
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  });
  app.get("/api/hd-media/:mediaId", (req, res) => {
    const mediaId = String(req.params.mediaId || "");
    const item = botStore.hdMediaCache.get(mediaId);
    if (!item) {
      res.status(404).send("Media HD tidak ditemukan atau sudah kedaluwarsa.");
      return;
    }
    const forceDownload = req.query.download === "1";
    res.setHeader("Content-Type", item.mimeType);
    res.setHeader("Content-Length", String(item.buffer.length));
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (forceDownload) {
      const safeName = (item.fileName || "hd-status").replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}"`
      );
    }
    res.send(item.buffer);
  });
  app.get("/api/proxy-media", async (req, res) => {
    const rawUrl = String(req.query.url || "");
    const mediaType = String(req.query.type || "video");
    const forceDownload = req.query.download === "1";
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      res.status(400).send("URL media tidak valid.");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25e3);
    try {
      const upstream = await fetch(rawUrl, {
        headers: buildCdnRequestHeaders(rawUrl),
        redirect: "follow",
        signal: controller.signal
      });
      if (!upstream.ok || !upstream.body) {
        res.status(upstream.status || 502).send("Gagal memuat aliran media.");
        return;
      }
      const contentType = mediaType === "audio" ? "audio/mpeg" : mediaType === "image" ? upstream.headers.get("content-type") || "image/jpeg" : upstream.headers.get("content-type") || "video/mp4";
      res.setHeader("Content-Type", contentType);
      const len = upstream.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      if (forceDownload) {
        const ext = mediaType === "audio" ? "mp3" : mediaType === "image" ? "jpg" : "mp4";
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="wabot-${Date.now()}.${ext}"`
        );
      }
      const arrayBuf = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch {
      if (!res.headersSent) {
        res.status(502).send("Waktu habis saat mengambil media dari sumber.");
      }
    } finally {
      clearTimeout(timeout);
    }
  });
  app.post("/api/simulator/clear", (req, res) => {
    const chatMode = req.body?.chatMode === "group" ? "group" : req.body?.chatMode === "private" ? "private" : void 0;
    botStore.clearSimulatorMessages(chatMode);
    res.json({ ok: true, messages: botStore.simulatorMessages });
  });
  app.post("/api/simulator/group-event", (req, res) => {
    const action = req.body?.action === "goodbye" ? "goodbye" : "welcome";
    const gid = "simulator-group";
    const settings = botStore.getEffectiveGroupSettings(gid);
    if (action === "welcome" && !settings.welcome) {
      res.status(400).json({
        ok: false,
        error: `Fitur welcome sedang nonaktif di grup ini. Ketik ${botStore.config.prefix}welcome on terlebih dahulu.`
      });
      return;
    }
    if (action === "goodbye" && !settings.goodbye) {
      res.status(400).json({
        ok: false,
        error: `Fitur pesan keluar (out) sedang nonaktif di grup ini. Ketik ${botStore.config.prefix}out on terlebih dahulu.`
      });
      return;
    }
    const samplePhone = "628577000333";
    const tpl = botStore.getEffectiveTemplate(
      action === "welcome" ? "welcomeMsg" : "goodbyeMsg",
      gid
    );
    const rendered = renderBotTemplate(tpl, {
      target: samplePhone,
      sender: samplePhone,
      groupName: botStore.groupState.subject,
      prefix: botStore.config.prefix,
      botName: botStore.config.botName
    });
    const botMsg = {
      id: `sim-ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatMode: "group",
      sender: "bot",
      senderName: botStore.config.botName,
      senderPhone: "Bot Engine",
      text: rendered,
      timestamp: Date.now(),
      mentions: [`${samplePhone}@s.whatsapp.net`]
    };
    botStore.addSimulatorMessage(botMsg);
    res.json({ ok: true });
  });
  app.post("/api/simulator/inject-viewonce", async (req, res) => {
    const chatMode = req.body?.chatMode === "group" ? "group" : "private";
    const catBuf = await loadSampleCatBuffer();
    if (!catBuf) {
      res.status(500).json({ ok: false, error: "Media contoh tidak ditemukan." });
      return;
    }
    const voUrl = botStore.storeHdMedia(catBuf, "image/jpeg", "viewonce-secret.jpg");
    const voMsg = {
      id: `sim-vo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatMode,
      sender: "member",
      senderName: "Raka Pratama",
      senderPhone: "628138000222",
      isAdmin: true,
      text: "Foto rahasia sekali lihat (coba klik Balas lalu ketik .rvo)",
      timestamp: Date.now(),
      media: {
        type: "image",
        url: voUrl,
        mimeType: "image/jpeg",
        isViewOnce: true,
        title: "Foto Sekali Lihat (View Once)"
      }
    };
    botStore.addSimulatorMessage(voMsg);
    res.json({ ok: true, message: voMsg });
  });
  app.post("/api/simulator/send", async (req, res) => {
    try {
      const chatMode = req.body?.chatMode === "group" ? "group" : "private";
      const senderRole = req.body?.senderRole === "member" ? "member" : "admin";
      const text = String(req.body?.text || "").trim();
      const imageBase64 = req.body?.imageBase64 ? String(req.body.imageBase64) : null;
      const useSampleCat = Boolean(req.body?.useSampleCat);
      const useSampleVideo = Boolean(req.body?.useSampleVideo);
      const useSampleAudio = Boolean(req.body?.useSampleAudio);
      const documentBase64 = req.body?.documentBase64 ? String(req.body.documentBase64) : null;
      const documentMimeType = req.body?.documentMimeType ? String(req.body.documentMimeType) : "";
      const documentFileName = req.body?.documentFileName ? String(req.body.documentFileName) : "";
      const useSampleHdDoc = Boolean(req.body?.useSampleHdDoc);
      const replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;
      if (!text && !imageBase64 && !useSampleCat && !useSampleVideo && !useSampleAudio && !documentBase64 && !useSampleHdDoc) {
        res.status(400).json({ ok: false, error: "Pesan tidak boleh kosong." });
        return;
      }
      let imageBuffer = null;
      let videoBuffer = null;
      let audioBuffer = null;
      let stickerBuffer = null;
      let viewOnceMedia = null;
      let attachedPreviewMedia;
      if (imageBase64) {
        const base64Clean = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
        imageBuffer = Buffer.from(base64Clean, "base64");
        attachedPreviewMedia = {
          type: "image",
          url: imageBase64,
          mimeType: "image/jpeg"
        };
      } else if (useSampleCat) {
        imageBuffer = await loadSampleCatBuffer();
        attachedPreviewMedia = {
          type: "image",
          url: "/api/sample-cat.jpg",
          mimeType: "image/jpeg"
        };
      } else if (useSampleVideo) {
        videoBuffer = await getOrCreateSampleVideoBuffer();
        attachedPreviewMedia = {
          type: "video",
          url: "/api/sample-video.mp4",
          mimeType: "video/mp4",
          fileName: "sample-clip.mp4",
          title: "Video Pendek Uji Coba"
        };
      } else if (useSampleAudio) {
        audioBuffer = await getOrCreateSampleAudioBuffer();
        attachedPreviewMedia = {
          type: "audio",
          url: "/api/sample-audio.mp3",
          mimeType: "audio/mpeg",
          fileName: "sample-audio.mp3",
          title: "Audio / Voice Note Uji Coba"
        };
      }
      let documentMedia = null;
      if (documentBase64) {
        const base64Clean = documentBase64.includes(",") ? documentBase64.split(",")[1] : documentBase64;
        const docBuf = Buffer.from(base64Clean, "base64");
        const resolvedMime = documentMimeType || "application/octet-stream";
        const resolvedName = documentFileName || "dokumen-asli";
        const kind = classifySimulatorDocKind(resolvedMime, resolvedName);
        const storedDocUrl = botStore.storeHdMedia(
          docBuf,
          resolvedMime,
          resolvedName
        );
        const sizeLabel = formatByteLabel(docBuf.length);
        documentMedia = {
          kind,
          buffer: kind !== "unsupported" ? docBuf : void 0,
          mimeType: resolvedMime,
          fileName: resolvedName,
          fileSize: docBuf.length
        };
        attachedPreviewMedia = {
          type: "document",
          url: storedDocUrl,
          mimeType: resolvedMime,
          fileName: resolvedName,
          fileSizeLabel: sizeLabel,
          docMediaKind: kind === "unsupported" ? "other" : kind
        };
      } else if (useSampleHdDoc) {
        const catBuf = await loadSampleCatBuffer();
        if (catBuf) {
          const resolvedName = "Portrait-RAW-Original.jpg";
          const resolvedMime = "image/jpeg";
          const storedDocUrl = botStore.storeHdMedia(
            catBuf,
            resolvedMime,
            resolvedName
          );
          const sizeLabel = formatByteLabel(catBuf.length);
          documentMedia = {
            kind: "image",
            buffer: catBuf,
            mimeType: resolvedMime,
            fileName: resolvedName,
            fileSize: catBuf.length
          };
          attachedPreviewMedia = {
            type: "document",
            url: storedDocUrl,
            mimeType: resolvedMime,
            fileName: resolvedName,
            fileSizeLabel: sizeLabel,
            docMediaKind: "image"
          };
        }
      }
      let replySnapshot;
      let quotedParticipantPhone;
      let quotedParticipantJid;
      let quotedText;
      let quotedSenderName;
      let quotedRegularMedia = false;
      const resolveCachedBufferFromUrl = async (mediaUrl) => {
        if (!mediaUrl) return null;
        if (mediaUrl.startsWith("data:")) {
          const rawB64 = mediaUrl.split(",")[1];
          return rawB64 ? Buffer.from(rawB64, "base64") : null;
        }
        if (mediaUrl.includes("sample_sticker_cat") || mediaUrl.includes("sample-cat.jpg")) {
          return loadSampleCatBuffer();
        }
        if (mediaUrl.includes("sample-video.mp4")) {
          return getOrCreateSampleVideoBuffer();
        }
        if (mediaUrl.includes("sample-audio.mp3")) {
          return getOrCreateSampleAudioBuffer();
        }
        if (mediaUrl.startsWith("/api/hd-media/")) {
          const id = mediaUrl.replace("/api/hd-media/", "").split("?")[0];
          return botStore.hdMediaCache.get(id)?.buffer || null;
        }
        if (mediaUrl.startsWith("/api/stickers/")) {
          const id = mediaUrl.replace("/api/stickers/", "").replace(/\.webp.*$/i, "");
          return botStore.stickerCache.get(id) || null;
        }
        return null;
      };
      if (replyToId) {
        const targetMsg = botStore.simulatorMessages.find(
          (m) => m.id === replyToId
        );
        if (targetMsg) {
          quotedText = targetMsg.text || void 0;
          quotedSenderName = targetMsg.senderName;
          if (targetMsg.sender !== "bot" && targetMsg.sender !== "system") {
            quotedParticipantPhone = targetMsg.senderPhone;
            quotedParticipantJid = `${targetMsg.senderPhone}@s.whatsapp.net`;
          }
          replySnapshot = {
            id: targetMsg.id,
            senderName: targetMsg.senderName,
            senderPhone: targetMsg.senderPhone,
            text: targetMsg.text || (targetMsg.media ? `[${targetMsg.media.isViewOnce ? "View Once" : targetMsg.media.type === "document" ? `Dokumen: ${targetMsg.media.fileName || "File"}` : targetMsg.media.type}]` : ""),
            mediaType: targetMsg.media?.type,
            mediaUrl: targetMsg.media?.url,
            isViewOnce: targetMsg.media?.isViewOnce,
            hasImage: targetMsg.media?.type === "image",
            imageUrl: targetMsg.media?.url,
            hasDocument: targetMsg.media?.type === "document",
            documentUrl: targetMsg.media?.type === "document" ? targetMsg.media.url : void 0,
            documentMimeType: targetMsg.media?.type === "document" ? targetMsg.media.mimeType : void 0,
            documentFileName: targetMsg.media?.type === "document" ? targetMsg.media.fileName : void 0
          };
          const mType = targetMsg.media?.type;
          const mUrl = targetMsg.media?.url;
          let resolvedBuf = await resolveCachedBufferFromUrl(mUrl);
          if (targetMsg.media?.isViewOnce && !resolvedBuf) {
            resolvedBuf = mType === "video" ? await getOrCreateSampleVideoBuffer() : mType === "audio" || mType === "vn" ? await getOrCreateSampleAudioBuffer() : await loadSampleCatBuffer();
          }
          if (targetMsg.media?.isViewOnce && resolvedBuf) {
            viewOnceMedia = {
              kind: mType === "video" ? "video" : mType === "audio" || mType === "vn" ? "audio" : "image",
              buffer: resolvedBuf,
              mimeType: targetMsg.media.mimeType || "image/jpeg",
              caption: targetMsg.text
            };
          } else if (mType === "image" && resolvedBuf && !imageBuffer) {
            quotedRegularMedia = true;
            imageBuffer = resolvedBuf;
          } else if ((mType === "video" || mType === "ptv") && resolvedBuf && !videoBuffer) {
            quotedRegularMedia = true;
            videoBuffer = resolvedBuf;
          } else if ((mType === "audio" || mType === "vn") && resolvedBuf && !audioBuffer) {
            audioBuffer = resolvedBuf;
          } else if (mType === "sticker" && resolvedBuf && !stickerBuffer) {
            stickerBuffer = resolvedBuf;
          } else if (!documentMedia && mType === "document" && mUrl?.startsWith("/api/hd-media/")) {
            const id = mUrl.replace("/api/hd-media/", "").split("?")[0];
            const cached = botStore.hdMediaCache.get(id);
            if (cached) {
              const kind = classifySimulatorDocKind(
                cached.mimeType,
                cached.fileName
              );
              documentMedia = {
                kind,
                buffer: kind !== "unsupported" ? cached.buffer : void 0,
                mimeType: cached.mimeType,
                fileName: cached.fileName,
                fileSize: cached.buffer.length
              };
            }
          }
        }
      }
      if (!viewOnceMedia && (text.toLowerCase().trim().startsWith(`${botStore.config.prefix}rvo`) || ["rvo", "readviewonce", "bukavo", "lihatsekali"].includes(
        text.toLowerCase().replace(/^[^\w\s]+/, "").trim()
      ))) {
        const lastVo = [...botStore.simulatorMessages].reverse().find((m) => m.media?.isViewOnce);
        if (lastVo) {
          const mType = lastVo.media?.type || "image";
          const mUrl = lastVo.media?.url;
          let resolvedBuf = await resolveCachedBufferFromUrl(mUrl);
          if (!resolvedBuf) {
            resolvedBuf = mType === "video" ? await getOrCreateSampleVideoBuffer() : mType === "audio" || mType === "vn" ? await getOrCreateSampleAudioBuffer() : await loadSampleCatBuffer();
          }
          if (resolvedBuf) {
            viewOnceMedia = {
              kind: mType === "video" ? "video" : mType === "audio" || mType === "vn" ? "audio" : "image",
              buffer: resolvedBuf,
              mimeType: lastVo.media?.mimeType || (mType === "video" ? "video/mp4" : "image/jpeg"),
              caption: lastVo.text || void 0
            };
          }
        }
      }
      const isMemberSimulation = chatMode === "group" && senderRole === "member";
      if (isMemberSimulation && botStore.groupState.isAnnouncementOnly) {
        res.status(403).json({
          ok: false,
          error: `Ruang chat grup sedang dikunci khusus Admin (${botStore.config.prefix}group close). Buka kembali dengan ${botStore.config.prefix}group open.`
        });
        return;
      }
      const configuredOwner = (botStore.config.antiBan?.ownerNumber || "6289673533963").replace(
        /[^0-9]/g,
        ""
      ) || "6289673533963";
      const senderName = isMemberSimulation ? "Nadia Putri (Member)" : "Kamu (Owner)";
      const senderPhone = isMemberSimulation ? "628577000333" : configuredOwner;
      const isAdmin = !isMemberSimulation;
      const pendingReaction = shouldSendPendingReaction(text) ? botStore.config.reactions.pending : null;
      const userMsgId = `sim-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const userMsg = {
        id: userMsgId,
        chatMode,
        sender: isMemberSimulation ? "member" : "user",
        senderName,
        senderPhone,
        isAdmin,
        text,
        timestamp: Date.now(),
        reaction: pendingReaction,
        replyTo: replySnapshot,
        media: attachedPreviewMedia
      };
      botStore.addSimulatorMessage(userMsg);
      const simPfx = botStore.config.prefix.toLowerCase();
      const simFirstToken = text.toLowerCase().startsWith(simPfx) ? text.toLowerCase().slice(simPfx.length).trim().split(/\s+/)[0] || "" : "";
      const isSimQc = [
        "qc",
        "quotely",
        "quotechat",
        "bubble",
        "iqc",
        "iphoneqc",
        "ioschat"
      ].includes(simFirstToken);
      const simSenderAvatar = isSimQc ? await waManager.getProfilePictureForUser(senderPhone) : null;
      const execStartedAt = Date.now();
      const botResult = await processBotMessage({
        source: "simulator",
        isGroup: chatMode === "group",
        groupId: chatMode === "group" ? "simulator-group" : void 0,
        groupName: botStore.groupState.subject,
        senderName,
        senderPhone,
        senderJid: `${senderPhone}@s.whatsapp.net`,
        isAdmin,
        isBotGroupAdmin: true,
        text,
        imageBuffer,
        imageMimeType: attachedPreviewMedia?.type === "image" ? attachedPreviewMedia.mimeType : replySnapshot?.hasImage ? "image/jpeg" : void 0,
        videoBuffer,
        audioBuffer,
        stickerBuffer,
        senderAvatarBuffer: simSenderAvatar,
        viewOnceMedia,
        quotedText,
        quotedSenderName,
        documentMedia,
        attachedNonDocumentMedia: !documentMedia && Boolean(imageBuffer || videoBuffer || quotedRegularMedia),
        quotedParticipantPhone,
        quotedParticipantJid,
        groupMembers: botStore.groupMembers,
        onProgressStatus: async (statusText) => {
          const progressMsg = {
            id: `sim-prog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            chatMode,
            sender: "bot",
            senderName: botStore.config.botName,
            senderPhone: "Bot Engine",
            text: statusText,
            timestamp: Date.now(),
            replyTo: {
              id: userMsg.id,
              senderName: userMsg.senderName,
              senderPhone: userMsg.senderPhone,
              text: userMsg.text || "[Lampiran Foto]"
            }
          };
          botStore.addSimulatorMessage(progressMsg);
        }
      });
      if (pendingReaction) {
        const elapsed = Date.now() - execStartedAt;
        if (elapsed < 180) {
          await new Promise((resolve) => setTimeout(resolve, 180 - elapsed));
        }
      }
      if (botResult.moderatedLink) {
        botStore.updateSimulatorMessage(userMsgId, {
          deletedByAntilink: true
        });
      }
      if (botStore.config.reactions.enabled && botResult.reactionStatus) {
        const finalEmoji = botResult.reactionStatus === "success" ? botStore.config.reactions.success : botStore.config.reactions.error;
        botStore.updateSimulatorMessage(userMsgId, {
          reaction: finalEmoji
        });
      } else if (pendingReaction && !botResult.handled) {
        botStore.updateSimulatorMessage(userMsgId, {
          reaction: null
        });
      }
      if (botResult.handled) {
        if (botResult.hdswMedia) {
          const hd = botResult.hdswMedia;
          const hdReplyMsg = {
            id: `sim-hd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            chatMode,
            sender: "bot",
            senderName: botStore.config.botName,
            senderPhone: "Bot Engine",
            text: hd.caption,
            timestamp: Date.now(),
            mentions: botResult.mentions,
            replyTo: {
              id: userMsg.id,
              senderName: userMsg.senderName,
              senderPhone: userMsg.senderPhone,
              text: `[Dokumen Asli: ${hd.fileName} \xB7 ${hd.fileSizeLabel}]`
            },
            media: {
              type: hd.kind === "video" ? "video" : "image",
              url: hd.webUrl,
              mimeType: hd.mimeType,
              fileName: hd.fileName,
              fileSizeLabel: hd.fileSizeLabel,
              title: `${hd.fileName} (${hd.fileSizeLabel})`
            }
          };
          botStore.addSimulatorMessage(hdReplyMsg);
        } else if (botResult.slideProxyUrls?.length) {
          const slides = botResult.slideProxyUrls.slice(0, 35);
          const total = slides.length;
          const baseTs = Date.now();
          for (let i = 0; i < total; i += 1) {
            const stepLabel = `\u{1F4F8} *Foto ${i + 1}/${total}*`;
            const captionText = i === 0 ? botResult.replyText ? `${botResult.replyText}
${stepLabel}` : stepLabel : stepLabel;
            const slideMsg = {
              id: `sim-slide-${baseTs}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              chatMode,
              sender: "bot",
              senderName: botStore.config.botName,
              senderPhone: "Bot Engine",
              text: captionText,
              timestamp: baseTs + i,
              replyTo: i === 0 ? {
                id: userMsg.id,
                senderName: userMsg.senderName,
                senderPhone: userMsg.senderPhone,
                text: userMsg.text || "[Tautan Slide TikTok]"
              } : void 0,
              media: {
                type: "image",
                url: slides[i],
                mimeType: "image/jpeg",
                fileName: `tiktok-slide-${i + 1}.jpg`,
                title: botResult.mediaTitle ? `${botResult.mediaTitle} (${i + 1}/${total})` : `Foto ${i + 1}/${total}`,
                author: botResult.mediaAuthor
              }
            };
            botStore.addSimulatorMessage(slideMsg);
          }
        } else {
          let resolvedMedia;
          if (botResult.stickerWebUrl) {
            resolvedMedia = {
              type: "sticker",
              url: botResult.stickerWebUrl,
              mimeType: "image/webp",
              fileName: "wabot-sticker.webp",
              packInfo: botResult.stickerPackOverride || {
                pack: botStore.config.stickerPackName,
                author: botStore.config.stickerAuthor
              }
            };
          } else if (botResult.imageWebUrl) {
            resolvedMedia = {
              type: "image",
              url: botResult.imageWebUrl,
              mimeType: botResult.imageMimeType || "image/jpeg",
              fileName: "wabot-image.jpg"
            };
          } else if (botResult.videoWebUrl) {
            resolvedMedia = {
              type: botResult.asPtv ? "ptv" : "video",
              url: botResult.videoWebUrl,
              mimeType: botResult.videoMimeType || "video/mp4",
              fileName: botResult.asPtv ? "video-note.mp4" : "wabot-video.mp4",
              title: botResult.mediaTitle
            };
          } else if (botResult.audioWebUrl) {
            resolvedMedia = {
              type: botResult.asVoiceNote ? "vn" : "audio",
              url: botResult.audioWebUrl,
              mimeType: botResult.audioMimeType || "audio/mpeg",
              fileName: botResult.asVoiceNote ? "voice-note.ogg" : "wabot-audio.mp3",
              title: botResult.mediaTitle
            };
          } else if (botResult.documentWebUrl) {
            resolvedMedia = {
              type: "document",
              url: botResult.documentWebUrl,
              mimeType: botResult.documentMimeType || "application/octet-stream",
              fileName: botResult.documentFileName || "berkas-unduhan"
            };
          } else if (botResult.videoProxyUrl) {
            resolvedMedia = {
              type: "video",
              url: botResult.videoProxyUrl,
              mimeType: "video/mp4",
              fileName: "wabot-video.mp4",
              title: botResult.mediaTitle,
              author: botResult.mediaAuthor,
              duration: botResult.mediaDuration
            };
          } else if (botResult.audioProxyUrl) {
            resolvedMedia = {
              type: "audio",
              url: botResult.audioProxyUrl,
              mimeType: "audio/mpeg",
              fileName: "wabot-audio.mp3",
              title: botResult.mediaTitle,
              author: botResult.mediaAuthor,
              duration: botResult.mediaDuration
            };
          }
          const botMsg = {
            id: `sim-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            chatMode,
            sender: "bot",
            senderName: botStore.config.botName,
            senderPhone: "Bot Engine",
            text: botResult.replyText || "",
            timestamp: Date.now(),
            mentions: botResult.mentions,
            hiddenMentions: botResult.hiddenMentions,
            replyTo: !botResult.moderatedLink ? {
              id: userMsg.id,
              senderName: userMsg.senderName,
              senderPhone: userMsg.senderPhone,
              text: userMsg.text || "[Lampiran Media]"
            } : void 0,
            media: resolvedMedia
          };
          botStore.addSimulatorMessage(botMsg);
        }
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Gagal menjalankan simulasi pesan."
      });
    }
  });
  let prepareBundlePromise = null;
  async function isFrontendSourceNewerThanDist(root, distHtmlPath) {
    try {
      const distStat = await fs11.stat(distHtmlPath);
      const distMtime = distStat.mtimeMs;
      const checkTargets = [
        path9.join(root, "index.html"),
        path9.join(root, "src")
      ];
      const stack = [...checkTargets];
      while (stack.length > 0) {
        const current = stack.pop();
        try {
          const st = await fs11.stat(current);
          if (st.isDirectory()) {
            const entries = await fs11.readdir(current);
            for (const entry of entries) {
              stack.push(path9.join(current, entry));
            }
          } else if (st.mtimeMs > distMtime + 1e3) {
            return true;
          }
        } catch {
        }
      }
      return false;
    } catch {
      return true;
    }
  }
  async function ensureTermuxArtifactsBuilt() {
    if (!prepareBundlePromise) {
      prepareBundlePromise = (async () => {
        const root = process.cwd();
        const distHtmlPath = path9.join(root, "dist", "index.html");
        const needsViteBuild = await isFrontendSourceNewerThanDist(
          root,
          distHtmlPath
        );
        if (needsViteBuild) {
          try {
            const { build: viteBuild } = await import("vite");
            await viteBuild({ logLevel: "warn" });
          } catch (err) {
            console.warn(
              "[Bundle Builder] Vite build skipped:",
              err instanceof Error ? err.message : err
            );
          }
        }
        try {
          const { build: esbuildBundle } = await import("esbuild");
          await esbuildBundle({
            entryPoints: [path9.join(root, "server.ts")],
            bundle: true,
            platform: "node",
            format: "esm",
            packages: "external",
            outfile: path9.join(root, "server.bundle.mjs"),
            logLevel: "warning"
          });
        } catch (err) {
          console.warn(
            "[Bundle Builder] esbuild bundle skipped:",
            err instanceof Error ? err.message : err
          );
        }
      })().finally(() => {
        prepareBundlePromise = null;
      });
    }
    return prepareBundlePromise;
  }
  app.get(
    ["/api/termux-bundle.tar.gz", "/api/project-bundle.tar.gz"],
    async (req, res) => {
      try {
        await ensureTermuxArtifactsBuilt();
      } catch {
      }
      const fileName = req.path.includes("termux-bundle") ? "wabot-redmi9c-ready.tar.gz" : "wabot-project.tar.gz";
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      const tar = spawn2("tar", [
        "--exclude=node_modules",
        "--exclude=.git",
        "--exclude=.aistudio",
        "--exclude=.baileys_auth",
        "--exclude=.bot-state.json",
        "--exclude=.wabot-state.json",
        "--exclude=.remote-access.json",
        "--exclude=data",
        "--exclude=.env",
        "--exclude=server.mjs",
        "--exclude=public/assets/aistudio",
        "--exclude=ai_service/weights",
        "--exclude=ai_service/__pycache__",
        "--exclude=ai_service/.venv",
        "-czf",
        "-",
        "."
      ]);
      tar.stdout.pipe(res);
      tar.stderr.on("data", (d) => console.error("[TAR]", d.toString()));
    }
  );
  app.get(
    ["/termux.sh", "/api/termux-install", "/termux-install"],
    async (_req, res) => {
      try {
        const termuxShPath = path9.join(process.cwd(), "termux.sh");
        const content = await fs11.readFile(termuxShPath, "utf-8");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(content);
      } catch {
        res.status(404).send("# termux.sh not found");
      }
    }
  );
  app.get("/setup-reno5.sh", async (_req, res) => {
    try {
      const scriptPath = path9.join(process.cwd(), "ai_service", "setup_reno5.sh");
      const content = await fs11.readFile(scriptPath, "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(content);
    } catch {
      res.status(404).send("# setup_reno5.sh not found");
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server },
        watch: process.env.DISABLE_HMR === "true" ? null : void 0
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path9.join(process.cwd(), "dist");
    const distHtml = path9.join(distPath, "index.html");
    app.use(express.static(distPath));
    app.get("*", async (_req, res) => {
      try {
        await fs11.access(distHtml);
        res.sendFile(distHtml);
      } catch {
        const catalogJson = JSON.stringify(
          COMMAND_CATALOG.filter((c) => !c.suspensionRisk).map((c) => ({
            id: c.id,
            category: c.category,
            usage: c.usage,
            desc: c.description
          }))
        );
        const totalCatalogCount = COMMAND_CATALOG.length;
        const lockedCatalogCount = COMMAND_CATALOG.filter(
          (c) => c.suspensionRisk
        ).length;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WABot \u2014 WhatsApp Multi-Feature Bot &amp; Control Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <script>
    (function() {
      try {
        if (localStorage.getItem('wabot_theme') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    })();
  </script>
  <style>
    :root {
      --bg: #FAF9F6;
      --surface: #FFFFFF;
      --surface-nav: rgba(255, 255, 255, 0.95);
      --surface-sub: #F4F4F5;
      --surface-input: #FAF9F6;
      --border: rgba(228, 228, 231, 0.85);
      --text: #18181B;
      --muted: #52525B;
      --subtle: #71717A;
      --primary-bg: #18181B;
      --primary-fg: #FFFFFF;
      --active-line: #18181B;
      --emerald: #047857;
      --emerald-btn: #059669;
      --amber: #B45309;
      --danger: #BE123C;
      --bubble-user: #D9FDD3;
      --bubble-user-fg: #111B21;
      --bubble-bot: #FFFFFF;
    }
    html.dark {
      --bg: #0C0C0E;
      --surface: #141417;
      --surface-nav: rgba(20, 20, 23, 0.95);
      --surface-sub: #18181B;
      --surface-input: #09090B;
      --border: #27272A;
      --text: #F4F4F5;
      --muted: #A1A1AA;
      --subtle: #71717A;
      --primary-bg: #F4F4F5;
      --primary-fg: #18181B;
      --active-line: #10B981;
      --emerald: #34D399;
      --emerald-btn: #059669;
      --amber: #FBBF24;
      --danger: #FB7185;
      --bubble-user: #005C4B;
      --bubble-user-fg: #E9EDEF;
      --bubble-bot: #1F2C34;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .font-display { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
    .topbar {
      border-bottom: 1px solid var(--border);
      background: var(--surface-nav);
      backdrop-filter: blur(8px);
    }
    .topbar-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .brand {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.02em;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
    }
    .desktop-nav {
      display: flex;
      align-items: center;
      gap: 28px;
    }
    .nav-link {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 4px 0;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      white-space: nowrap;
    }
    .nav-link:hover { color: var(--text); }
    .nav-link.active {
      color: var(--text);
      border-bottom-color: var(--active-line);
    }
    .cta-btn {
      padding: 8px 16px;
      border-radius: 12px;
      border: none;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      background: var(--primary-bg);
      color: var(--primary-fg);
    }
    .cta-btn.connected {
      background: var(--emerald-btn);
      color: #FFFFFF;
    }
    .container {
      max-width: 1240px;
      margin: 0 auto;
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .mobile-nav {
      display: none;
      gap: 4px;
      padding: 4px;
      background: var(--surface-sub);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow-x: auto;
    }
    .m-nav-btn {
      flex: 1;
      padding: 8px 12px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--muted);
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
    }
    .m-nav-btn.active {
      background: var(--surface);
      color: var(--text);
    }
    @media (max-width: 768px) {
      .desktop-nav { display: none; }
      .mobile-nav { display: flex; }
      .topbar-inner { padding: 0 16px; }
      .container { padding: 20px 16px; }
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 22px 24px;
    }
    .overview {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--subtle);
      margin-bottom: 6px;
    }
    .hero-title {
      margin: 0 0 6px;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .hero-desc {
      margin: 0;
      font-size: 14px;
      color: var(--muted);
      max-width: 640px;
    }
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(76px, auto));
      gap: 12px 28px;
      padding-left: 28px;
      border-left: 1px solid var(--border);
    }
    @media (max-width: 960px) {
      .kpi-strip {
        width: 100%;
        padding-left: 0;
        padding-top: 16px;
        border-left: none;
        border-top: 1px solid var(--border);
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .kpi-label { font-size: 12px; color: var(--subtle); }
    .kpi-val {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
    }
    .pane { display: none; flex-direction: column; gap: 20px; }
    .pane.active { display: flex; }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    h2 {
      margin: 0 0 6px;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 16px;
      font-weight: 700;
    }
    .subtext { font-size: 13px; color: var(--muted); margin: 0 0 16px; }
    label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      margin-bottom: 6px;
    }
    input[type="text"], input[type="tel"], input[type="search"], textarea {
      width: 100%;
      background: var(--surface-input);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 13px;
      border-radius: 12px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    input:focus, textarea:focus { border-color: #10B981; }
    textarea { min-height: 76px; resize: vertical; }
    .btn {
      padding: 9px 16px;
      border-radius: 12px;
      border: 1px solid transparent;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      background: var(--primary-bg);
      color: var(--primary-fg);
      white-space: nowrap;
    }
    .btn-emerald { background: var(--emerald-btn); color: #FFFFFF; }
    .btn-outline {
      background: var(--surface-input);
      border-color: var(--border);
      color: var(--text);
    }
    .btn-danger { background: var(--danger); color: #FFFFFF; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
    .chat-box {
      height: 360px;
      overflow-y: auto;
      background: var(--surface-input);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .msg {
      max-width: 82%;
      padding: 9px 13px;
      border-radius: 14px;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--border);
    }
    .msg.user {
      align-self: flex-end;
      background: var(--bubble-user);
      color: var(--bubble-user-fg);
    }
    .msg.bot {
      align-self: flex-start;
      background: var(--bubble-bot);
      color: var(--text);
    }
    .msg img {
      max-width: 180px;
      border-radius: 12px;
      display: block;
      margin-bottom: 6px;
    }
    .cmd-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .cmd-card {
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--surface-input);
      border: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .codebox {
      background: var(--surface-input);
      border: 1px solid #10B981;
      padding: 16px;
      border-radius: 14px;
      margin-top: 14px;
      text-align: center;
    }
    .pair-digits {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      letter-spacing: 5px;
      font-weight: 700;
      color: var(--emerald);
      margin: 6px 0;
    }
    .toast { font-size: 12px; color: var(--emerald); min-height: 18px; margin-top: 8px; }
    footer {
      max-width: 1240px;
      margin: 0 auto;
      padding: 24px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: var(--subtle);
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a href="#simulator" class="brand" id="hdr-brand" onclick="switchTab('simulator');return false;">WABot</a>
      <nav class="desktop-nav" aria-label="Navigasi Utama">
        <button type="button" class="nav-link active" data-tab="simulator" onclick="switchTab('simulator')">Simulator</button>
        <button type="button" class="nav-link" data-tab="catalog" onclick="switchTab('catalog')">Menu &amp; Fitur</button>
        <button type="button" class="nav-link" data-tab="connection" onclick="switchTab('connection')">Koneksi &amp; Server</button>
        <button type="button" class="nav-link" data-tab="security" onclick="switchTab('security')">Keamanan &amp; API</button>
        <button type="button" class="nav-link" data-tab="settings" onclick="switchTab('settings')">Pengaturan</button>
      </nav>
      <button type="button" class="cta-btn" id="hdr-cta" onclick="switchTab('connection')">Hubungkan WA</button>
    </div>
  </header>

  <main class="container">
    <section class="card overview">
      <div style="min-width:0;flex:1;">
        <div class="meta-row">
          <span id="ov-prefix">Prefix .</span>
          <span aria-hidden="true">\xB7</span>
          <span id="ov-owner">Owner +${OFFICIAL_OWNER_NUMBER}</span>
          <span aria-hidden="true">\xB7</span>
          <span id="ov-rt" style="color:var(--emerald);font-weight:500;">Mesin Real-Time Aktif (Port ${activePort})</span>
        </div>
        <h1 class="hero-title">Panel Kontrol Multi-Fitur WhatsApp</h1>
        <p class="hero-desc">Multi-downloader sosmed, studio stiker teks &amp; animasi (.qc / .s), Status WA HD tanpa kompresi (.hdsw), efek audio studio, serta proteksi anti-ban otomatis.</p>
      </div>
      <div class="kpi-strip">
        <div>
          <div class="kpi-label">Fitur Aktif</div>
          <div class="kpi-val" id="kpi-active">0/${totalCatalogCount}</div>
        </div>
        <div>
          <div class="kpi-label">Eksekusi</div>
          <div class="kpi-val" id="kpi-exec">0</div>
        </div>
        <div>
          <div class="kpi-label">Stiker</div>
          <div class="kpi-val" id="kpi-sticker">0</div>
        </div>
        <div>
          <div class="kpi-label">Media</div>
          <div class="kpi-val" id="kpi-media">0</div>
        </div>
      </div>
    </section>

    <div class="mobile-nav">
      <button type="button" class="m-nav-btn active" data-tab="simulator" onclick="switchTab('simulator')">Simulator</button>
      <button type="button" class="m-nav-btn" data-tab="catalog" onclick="switchTab('catalog')">Menu &amp; Fitur</button>
      <button type="button" class="m-nav-btn" data-tab="connection" onclick="switchTab('connection')">Koneksi &amp; Server</button>
      <button type="button" class="m-nav-btn" data-tab="security" onclick="switchTab('security')">Keamanan &amp; API</button>
      <button type="button" class="m-nav-btn" data-tab="settings" onclick="switchTab('settings')">Pengaturan</button>
    </div>

    <!-- TAB 1: SIMULATOR -->
    <section class="pane active" id="pane-simulator">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <h2>Simulator Chat &amp; Pengujian Perintah</h2>
            <p class="subtext" style="margin:0;">Uji langsung perintah seperti <code class="font-mono">.menu</code>, <code class="font-mono">.ping</code>, <code class="font-mono">.qc halo</code>, atau <code class="font-mono">.brat santai</code>.</p>
          </div>
          <button type="button" class="btn btn-outline" onclick="clearSim()">Bersihkan Chat</button>
        </div>
        <div class="chat-box" id="sim-messages"></div>
        <form onsubmit="sendSim(event)" style="display:flex;gap:8px;margin-top:12px;">
          <input type="text" id="sim-input" placeholder="Ketik perintah (mis. .menu atau .qc halo bro)..." />
          <button type="submit" class="btn btn-emerald">Kirim</button>
        </form>
      </div>
    </section>

    <!-- TAB 2: CATALOG -->
    <section class="pane" id="pane-catalog">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2>Katalog Menu &amp; Kontrol Fitur Bot</h2>
            <p class="subtext" style="margin:0;">Aktifkan atau matikan perintah WhatsApp kapan saja secara instan.</p>
          </div>
          <input type="search" id="cmd-search" placeholder="Cari perintah (.qc, .tt, .s)..." style="max-width:260px;" oninput="renderCommands()" />
        </div>
        <div class="cmd-grid" id="cmd-grid"></div>
      </div>
    </section>

    <!-- TAB 3: CONNECTION & TERMUX -->
    <section class="pane" id="pane-connection">
      <div class="grid-2">
        <div class="card">
          <h2>Tautkan Perangkat WhatsApp</h2>
          <p class="subtext">Hubungkan nomor WhatsApp bot menggunakan 8-digit Pairing Code atau QR Code.</p>
          <label>Nomor WhatsApp Bot (awalan 628...)</label>
          <input type="tel" id="phone-input" placeholder="6281234567890" />
          <div class="row">
            <button type="button" class="btn btn-emerald" onclick="requestPairing()">Minta Pairing Code</button>
            <button type="button" class="btn btn-outline" onclick="requestQr()">Tampilkan QR</button>
            <button type="button" class="btn btn-danger" onclick="disconnectWa()">Putuskan Sesi</button>
          </div>
          <div id="pair-box"></div>
        </div>

        <div class="card">
          <h2>Akses Panel HP Kedua &amp; Server Termux 24/7</h2>
          <p class="subtext">Buka dashboard ini dari HP utamamu lewat Wi-Fi rumah atau jaringan 4G/5G luar rumah.</p>
          <div id="remote-box" style="font-size:13px;color:var(--muted);line-height:1.6;">Memuat info jaringan...</div>
          <div class="row">
            <button type="button" class="btn btn-emerald" onclick="startRemote()">Aktifkan Link Luar Rumah (4G/5G)</button>
            <button type="button" class="btn btn-outline" onclick="stopRemote()">Matikan Link Luar</button>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 4: SECURITY & API -->
    <section class="pane" id="pane-security">
      <div class="grid-2">
        <div class="card">
          <h2>Perisai Anti-Ban &amp; Paced Queue</h2>
          <p class="subtext">Jeda mengetik natural dan cooldown otomatis menjaga nomor bot tetap aman 24/7.</p>
          <div class="grid-2">
            <div>
              <label>Jeda Minimum Balasan (ms)</label>
              <input type="text" id="ab-min" class="font-mono" />
            </div>
            <div>
              <label>Jeda Maksimum Balasan (ms)</label>
              <input type="text" id="ab-max" class="font-mono" />
            </div>
            <div>
              <label>Cooldown Per User (detik)</label>
              <input type="text" id="ab-cool" class="font-mono" />
            </div>
            <div>
              <label>Batas Pesan / Menit</label>
              <input type="text" id="ab-burst" class="font-mono" />
            </div>
          </div>
          <div class="row">
            <button type="button" class="btn" onclick="saveAntiBan()">Simpan Proteksi Anti-Ban</button>
          </div>
          <div class="toast" id="toast-ab"></div>
        </div>

        <div class="card">
          <h2>REST API Gateway &amp; Webhook</h2>
          <p class="subtext">Endpoint integrasi eksternal siap digunakan pada <code class="font-mono">/api/gateway/*</code>.</p>
          <div style="font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:8px;">
            <div>Antrean Terkirim: <strong class="font-mono" style="color:var(--text);" id="gw-sent">0</strong></div>
            <div>Pesan Diblokir Anti-Spam: <strong class="font-mono" style="color:var(--text);" id="gw-blocked">0</strong></div>
            <div>Endpoint Kirim Teks: <code class="font-mono">POST /api/gateway/send-text</code></div>
            <div>Endpoint Cek Nomor: <code class="font-mono">POST /api/gateway/check-number</code></div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 5: SETTINGS & TEMPLATES -->
    <section class="pane" id="pane-settings">
      <div class="grid-2">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
            <h2 style="margin:0;">Identitas, Owner &amp; Tampilan</h2>
            <button type="button" class="btn btn-outline" onclick="toggleTheme()">Mode Terang / Gelap</button>
          </div>
          <p class="subtext">Atur nama bot, prefix perintah, nomor Owner, serta paket stiker.</p>
          <div class="grid-2">
            <div>
              <label>Nama Bot</label>
              <input type="text" id="cfg-botname" />
            </div>
            <div>
              <label>Prefix Perintah (. / ! / #)</label>
              <input type="text" id="cfg-prefix" maxlength="3" class="font-mono" />
            </div>
            <div>
              <label>Nomor Owner (Tanpa +)</label>
              <input type="text" id="cfg-owner" class="font-mono" placeholder="${OFFICIAL_OWNER_NUMBER}" />
            </div>
            <div>
              <label>Nama Pack Stiker</label>
              <input type="text" id="cfg-pack" />
            </div>
          </div>
          <div class="row">
            <label style="display:flex;align-items:center;gap:8px;margin:0;color:var(--text);cursor:pointer;">
              <input type="checkbox" id="cfg-selfmode" style="width:auto;" />
              Aktifkan Self-Mode (Uji perintah dari nomor bot sendiri)
            </label>
          </div>
          <div class="row">
            <button type="button" class="btn" onclick="saveIdentity()">Simpan Pengaturan Utama</button>
          </div>
          <div class="toast" id="toast-identity"></div>
        </div>

        <div class="card">
          <h2>Server AI Photo Enhancement (Oppo Reno 5 / Colab)</h2>
          <p class="subtext">Hubungkan ke IP server GPU untuk memproses perintah <code class="font-mono">.hd</code>, <code class="font-mono">.remini</code>, <code class="font-mono">.upscale</code>.</p>
          <div>
            <label>Endpoint HTTP Layanan AI GPU (Contoh: http://192.168.1.15:8001)</label>
            <input type="text" id="cfg-ai-url" placeholder="http://192.168.1.15:8001" class="font-mono" />
          </div>
          <div class="row" style="margin-top:10px;">
            <div style="flex:1;">
              <label>Model Wajah</label>
              <select id="cfg-ai-face" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--surface-input);color:var(--text);">
                <option value="codeformer">CodeFormer (Natural &amp; Detail)</option>
                <option value="gfpgan">GFPGAN v1.4</option>
              </select>
            </div>
            <div style="width:110px;">
              <label>Skala</label>
              <select id="cfg-ai-scale" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--surface-input);color:var(--text);">
                <option value="2">2x</option>
                <option value="4">4x</option>
              </select>
            </div>
          </div>
          <div class="row">
            <button type="button" class="btn btn-emerald" onclick="saveAiConfig()">Simpan Alamat AI</button>
            <button type="button" class="btn btn-outline" onclick="probeAiGpu()">Cek Status GPU</button>
          </div>
          <div class="toast" id="toast-ai"></div>
        </div>

        <div class="card">
          <h2>Template Balasan Chat &amp; Grup</h2>
          <p class="subtext">Kustomisasi header <code class="font-mono">.menu</code> dan sambutan member grup.</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <label>Header Menu ({botName}, {senderName}, {prefix})</label>
              <textarea id="tpl-menuheader"></textarea>
            </div>
            <div>
              <label>Sambutan Member Masuk (@user, @group)</label>
              <textarea id="tpl-welcome"></textarea>
            </div>
            <div>
              <label>Pesan Member Keluar (@user, @group)</label>
              <textarea id="tpl-goodbye"></textarea>
            </div>
          </div>
          <div class="row">
            <button type="button" class="btn" onclick="saveTemplates()">Simpan Template Balasan</button>
          </div>
          <div class="toast" id="toast-tpl"></div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div id="ftr-left">WABot \xB7 Owner +${OFFICIAL_OWNER_NUMBER}</div>
    <div>Dashboard Web Panel Sinkron Real-Time</div>
  </footer>

  <script>
    const CATALOG = ${catalogJson};
    const TOTAL_COMMANDS = ${totalCatalogCount};
    const LOCKED_COMMANDS = ${lockedCatalogCount};
    let currentCfg = null;
    let initializedForm = false;

    function esc(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function switchTab(tabId) {
      document.querySelectorAll('.pane').forEach((el) => {
        el.classList.toggle('active', el.id === 'pane-' + tabId);
      });
      document.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('wabot_theme', isDark ? 'dark' : 'light'); } catch (e) {}
    }

    async function loadState() {
      try {
        const res = await fetch('/api/state');
        const snap = await res.json();
        const wa = snap.waState || {};
        const cfg = snap.config || {};
        const stats = snap.stats || {};
        const gwStats = snap.gatewayStats || {};
        currentCfg = cfg;

        const botName = cfg.botName || 'WABot';
        const ownerNum = (cfg.antiBan && cfg.antiBan.ownerNumber) ? cfg.antiBan.ownerNumber : '${OFFICIAL_OWNER_NUMBER}';
        document.getElementById('hdr-brand').innerText = botName;
        document.title = botName + ' \u2014 WhatsApp Multi-Feature Bot & Control Panel';
        document.getElementById('ov-prefix').innerText = 'Prefix ' + (cfg.prefix || '.');
        document.getElementById('ov-owner').innerText = 'Owner +' + ownerNum;
        document.getElementById('ftr-left').innerText = botName + ' \xB7 Owner: +' + ownerNum;

        const cta = document.getElementById('hdr-cta');
        if (wa.status === 'connected') {
          cta.className = 'cta-btn connected';
          cta.innerText = 'Terhubung (+' + ((wa.connectedUser && wa.connectedUser.phone) || 'WA') + ')';
        } else {
          cta.className = 'cta-btn';
          cta.innerText = 'Hubungkan WA';
        }

        const disabledList = cfg.disabledCommands || [];
        const activeCount = Math.max(0, TOTAL_COMMANDS - LOCKED_COMMANDS - disabledList.length);
        document.getElementById('kpi-active').innerText = activeCount + '/' + TOTAL_COMMANDS;
        document.getElementById('kpi-exec').innerText = String(stats.totalCommands || 0);
        document.getElementById('kpi-sticker').innerText = String(stats.stickersCreated || 0);
        document.getElementById('kpi-media').innerText = String(stats.mediaDownloaded || 0);

        document.getElementById('gw-sent').innerText = String(gwStats.totalSent || 0);
        document.getElementById('gw-blocked').innerText = String(stats.antiBanBlocked || 0);

        const pairBox = document.getElementById('pair-box');
        if (wa.pairingCode) {
          pairBox.innerHTML =
            '<div class="codebox"><div style="font-size:12px;color:var(--muted);">KODE PAIRING WHATSAPP (+' + esc(wa.pairingPhone || '') + ')</div>' +
            '<div class="pair-digits">' + esc(wa.pairingCode) + '</div>' +
            '<div style="font-size:12px;color:var(--muted);">Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan dengan nomor telepon saja</div></div>';
        } else if (wa.qrDataUrl) {
          pairBox.innerHTML =
            '<div class="codebox"><img src="' + wa.qrDataUrl + '" alt="QR WhatsApp" style="width:210px;height:210px;margin:0 auto 8px;border-radius:12px;display:block;" />' +
            '<div style="font-size:12px;color:var(--muted);">Scan QR ini dari menu Perangkat Tertaut di WhatsApp</div></div>';
        } else if (wa.status === 'connected') {
          pairBox.innerHTML =
            '<div class="toast">Terhubung aktif dengan nomor +' + esc((wa.connectedUser && wa.connectedUser.phone) || '') + '</div>';
        }

        renderSimulator(snap.messages || []);

        if (!initializedForm && cfg.prefix) {
          initializedForm = true;
          document.getElementById('cfg-botname').value = cfg.botName || 'WABot';
          document.getElementById('cfg-prefix').value = cfg.prefix || '.';
          document.getElementById('cfg-owner').value = ownerNum;
          document.getElementById('cfg-pack').value = cfg.stickerPackName || 'WABot Sticker';
          document.getElementById('cfg-selfmode').checked = Boolean(cfg.selfMode);
          document.getElementById('tpl-menuheader').value = (cfg.templates && cfg.templates.menuHeader) || '';
          document.getElementById('tpl-welcome').value = (cfg.templates && cfg.templates.welcomeMsg) || '';
          document.getElementById('tpl-goodbye').value = (cfg.templates && cfg.templates.goodbyeMsg) || '';
          document.getElementById('cfg-ai-url').value = (cfg.aiEnhance && cfg.aiEnhance.serviceUrl) || 'http://127.0.0.1:8001';
          document.getElementById('cfg-ai-face').value = (cfg.aiEnhance && cfg.aiEnhance.preferredFaceModel) || 'codeformer';
          document.getElementById('cfg-ai-scale').value = String((cfg.aiEnhance && cfg.aiEnhance.defaultScale) || 2);
          document.getElementById('ab-min').value = String((cfg.antiBan && cfg.antiBan.minDelayMs) || 1200);
          document.getElementById('ab-max').value = String((cfg.antiBan && cfg.antiBan.maxDelayMs) || 2800);
          document.getElementById('ab-cool').value = String(Math.round(((cfg.antiBan && cfg.antiBan.userCooldownMs) || 3000) / 1000));
          document.getElementById('ab-burst').value = String((cfg.antiBan && cfg.antiBan.maxMsgsPerMinute) || 18);
        }
        renderCommands();
      } catch (err) {
        document.getElementById('ov-rt').innerText = 'Menyambungkan ulang...';
      }
    }

    function renderSimulator(msgs) {
      const box = document.getElementById('sim-messages');
      if (!msgs.length) {
        box.innerHTML = '<div style="margin:auto;text-align:center;font-size:13px;color:var(--subtle);">Belum ada pesan simulasi. Ketik <b>.menu</b> atau <b>.qc halo</b> di bawah.</div>';
        return;
      }
      box.innerHTML = msgs.slice(-30).map((m) => {
        const role = m.sender === 'user' ? 'user' : 'bot';
        const mediaHtml = (m.mediaUrl && (m.mediaType === 'sticker' || m.mediaType === 'image'))
          ? '<img src="' + m.mediaUrl + '" alt="media" />'
          : '';
        return '<div class="msg ' + role + '">' + mediaHtml + esc(m.text || '') + '</div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
    }

    async function sendSim(e) {
      e.preventDefault();
      const input = document.getElementById('sim-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      await fetch('/api/simulator/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      await loadState();
    }

    async function clearSim() {
      await fetch('/api/simulator/clear', { method: 'POST' });
      await loadState();
    }

    function renderCommands() {
      if (!currentCfg) return;
      const disabledList = currentCfg.disabledCommands || [];
      const prefix = currentCfg.prefix || '.';
      const q = (document.getElementById('cmd-search').value || '').trim().toLowerCase();
      const filtered = CATALOG.filter((c) => !q || c.id.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
      const grid = document.getElementById('cmd-grid');
      grid.innerHTML = filtered.map((c) => {
        const enabled = !disabledList.includes(c.id);
        return '<div class="cmd-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<span class="font-mono" style="font-size:13px;font-weight:600;color:var(--text);">' + esc(prefix + c.id) + '</span>' +
            '<input type="checkbox" style="width:auto;cursor:pointer;" ' + (enabled ? 'checked' : '') +
            ' onchange="toggleCmd(\\'' + c.id + '\\', this.checked)" />' +
          '</div>' +
          '<div style="font-size:12px;color:var(--muted);">' + esc(c.desc) + '</div>' +
        '</div>';
      }).join('');
    }

    async function toggleCmd(cmdId, enabled) {
      if (!currentCfg) return;
      const prev = currentCfg.disabledCommands || [];
      const next = enabled ? prev.filter((x) => x !== cmdId) : Array.from(new Set([...prev, cmdId]));
      await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabledCommands: next })
      });
      await loadState();
    }

    async function requestPairing() {
      const phoneNumber = document.getElementById('phone-input').value.trim();
      if (!phoneNumber) return;
      document.getElementById('pair-box').innerHTML = '<div class="toast" style="color:var(--amber);">Meminta 8-digit Pairing Code ke server WhatsApp...</div>';
      try {
        const res = await fetch('/api/wa/connect-pairing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber })
        });
        const data = await res.json();
        if (!data.ok) {
          document.getElementById('pair-box').innerHTML = '<div class="toast" style="color:var(--danger);">' + esc(data.error || 'Gagal meminta kode') + '</div>';
          return;
        }
        await loadState();
      } catch (e) {
        document.getElementById('pair-box').innerHTML = '<div class="toast" style="color:var(--danger);">Gagal menghubungi server lokal.</div>';
      }
    }

    async function requestQr() {
      document.getElementById('pair-box').innerHTML = '<div class="toast" style="color:var(--amber);">Menyiapkan QR Code WhatsApp...</div>';
      await fetch('/api/wa/connect-qr', { method: 'POST' });
      await loadState();
    }

    async function disconnectWa() {
      await fetch('/api/wa/disconnect', { method: 'POST' });
      document.getElementById('pair-box').innerHTML = '';
      await loadState();
    }

    async function saveAntiBan() {
      const minDelayMs = Number(document.getElementById('ab-min').value) || 1200;
      const maxDelayMs = Number(document.getElementById('ab-max').value) || 2800;
      const userCooldownMs = (Number(document.getElementById('ab-cool').value) || 3) * 1000;
      const maxMsgsPerMinute = Number(document.getElementById('ab-burst').value) || 18;
      await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          antiBan: {
            ...(currentCfg && currentCfg.antiBan ? currentCfg.antiBan : {}),
            minDelayMs,
            maxDelayMs,
            userCooldownMs,
            maxMsgsPerMinute
          }
        })
      });
      document.getElementById('toast-ab').innerText = 'Pengaturan Anti-Ban berhasil disimpan.';
      setTimeout(() => { document.getElementById('toast-ab').innerText = ''; }, 2500);
      await loadState();
    }

    async function saveIdentity() {
      const botName = document.getElementById('cfg-botname').value.trim() || 'WABot';
      const prefix = document.getElementById('cfg-prefix').value.trim() || '.';
      const ownerNumber = document.getElementById('cfg-owner').value.trim() || '${OFFICIAL_OWNER_NUMBER}';
      const stickerPackName = document.getElementById('cfg-pack').value.trim() || 'WABot Sticker';
      const selfMode = document.getElementById('cfg-selfmode').checked;

      await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName,
          prefix,
          stickerPackName,
          selfMode,
          antiBan: { ...(currentCfg && currentCfg.antiBan ? currentCfg.antiBan : {}), ownerNumber }
        })
      });
      document.getElementById('toast-identity').innerText = 'Pengaturan utama tersimpan.';
      setTimeout(() => { document.getElementById('toast-identity').innerText = ''; }, 2500);
      await loadState();
    }

    async function saveTemplates() {
      const menuHeader = document.getElementById('tpl-menuheader').value;
      const welcomeMsg = document.getElementById('tpl-welcome').value;
      const goodbyeMsg = document.getElementById('tpl-goodbye').value;
      await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: {
            ...(currentCfg && currentCfg.templates ? currentCfg.templates : {}),
            menuHeader,
            welcomeMsg,
            goodbyeMsg
          }
        })
      });
      document.getElementById('toast-tpl').innerText = 'Template balasan berhasil diperbarui.';
      setTimeout(() => { document.getElementById('toast-tpl').innerText = ''; }, 2500);
      await loadState();
    }

    async function saveAiConfig() {
      const serviceUrl = (document.getElementById('cfg-ai-url').value || '').trim();
      const preferredFaceModel = document.getElementById('cfg-ai-face').value || 'codeformer';
      const defaultScale = Number(document.getElementById('cfg-ai-scale').value) || 2;
      await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiEnhance: {
            ...(currentCfg && currentCfg.aiEnhance ? currentCfg.aiEnhance : {}),
            serviceUrl,
            preferredFaceModel,
            defaultScale
          }
        })
      });
      document.getElementById('toast-ai').innerText = 'Alamat IP server AI berhasil disimpan.';
      setTimeout(() => { document.getElementById('toast-ai').innerText = ''; }, 2500);
      await loadState();
    }

    async function probeAiGpu() {
      const toast = document.getElementById('toast-ai');
      toast.style.color = 'var(--amber)';
      toast.innerText = 'Menghubungi server AI GPU...';
      try {
        const res = await fetch('/api/ai-enhance/status');
        const st = await res.json();
        if (st.ok) {
          toast.style.color = 'var(--emerald)';
          toast.innerText = 'Terhubung ke AI GPU (' + (st.gpuName || st.device || 'Online') + ' \xB7 ' + (st.latencyMs || 0) + 'ms)';
        } else {
          toast.style.color = 'var(--danger)';
          toast.innerText = 'Gagal terhubung: ' + (st.error || 'Server tidak merespons');
        }
      } catch (e) {
        toast.style.color = 'var(--danger)';
        toast.innerText = 'Tidak dapat menghubungi server lokal.';
      }
    }

    async function loadRemote() {
      try {
        const res = await fetch('/api/remote-tunnel');
        const rt = await res.json();
        const lan = (rt.lanUrls && rt.lanUrls.length) ? rt.lanUrls.join(' , ') : 'Hubungkan Wi-Fi lokal';
        const pub = rt.magicUrl
          ? ('<div style="margin-top:8px;color:var(--emerald);word-break:break-all;">Link Luar Rumah (4G/5G):<br><strong class="font-mono">' + esc(rt.magicUrl) + '</strong></div>')
          : ('<div style="margin-top:8px;color:var(--muted);">Status Luar Rumah: ' + esc(rt.lastError || rt.status || 'nonaktif') + ' (Kirim <code class="font-mono">.panel</code> dari WA Owner ke bot)</div>');
        document.getElementById('remote-box').innerHTML =
          '<div>Satu Wi-Fi di Rumah: <strong class="font-mono" style="color:var(--text);">' + esc(lan) + '</strong></div>' + pub;
      } catch (e) {}
    }

    async function startRemote() {
      document.getElementById('remote-box').innerHTML = '<div style="color:var(--amber);">Menghubungkan Cloudflare Tunnel...</div>';
      await fetch('/api/remote-tunnel/start', { method: 'POST' });
      await loadRemote();
    }

    async function stopRemote() {
      await fetch('/api/remote-tunnel/stop', { method: 'POST' });
      await loadRemote();
    }

    loadState();
    loadRemote();
    setInterval(loadState, 3000);
    setInterval(loadRemote, 8000);
  </script>
</body>
</html>`);
      }
    });
  }
  let activePort = LISTEN_CONFIG.port;
  let retriedFallbackPort = false;
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && !LISTEN_CONFIG.explicitCliPort && activePort !== 3e3 && !retriedFallbackPort) {
      retriedFallbackPort = true;
      activePort = 3e3;
      console.warn(
        `Port ${LISTEN_CONFIG.port} is already in use, falling back to port 3000...`
      );
      server.listen(activePort, LISTEN_CONFIG.host);
      return;
    }
    console.error("Fatal HTTP server error:", err);
    process.exit(1);
  });
  let selfKeepAliveInterval = null;
  if (externalSelfUrl && /^https?:\/\//i.test(externalSelfUrl)) {
    const pingEndpoint = externalSelfUrl.endsWith("/ping") ? externalSelfUrl : `${externalSelfUrl}/ping`;
    selfKeepAliveInterval = setInterval(() => {
      fetch(pingEndpoint, {
        headers: { "User-Agent": "WABot-SelfKeepAlive/1.0" },
        signal: AbortSignal.timeout(15e3)
      }).catch(() => {
      });
    }, 9 * 60 * 1e3);
    selfKeepAliveInterval.unref();
  }
  server.listen(activePort, LISTEN_CONFIG.host, () => {
    remoteTunnel.setPort(activePort);
    console.log(`WABot server running on http://${LISTEN_CONFIG.host}:${activePort}`);
    console.log(`\u{1F310} Web Control Panel: http://localhost:${activePort} (atau http://127.0.0.1:${activePort})`);
    void (async () => {
      try {
        await remoteTunnel.autoResumeIfEnabled(activePort);
        await cloudSync.initAndRestore(resolveDataDir());
        if (cloudSync.isEnabled()) {
          botStore.reloadFromDisk();
        }
        const resumed = await waManager.initAutoResume();
        if (!resumed) {
          const envPhone = (process.env.PAIRING_PHONE || "").trim();
          if (envPhone) {
            console.log(
              `[WABot 24/7] Meminta Pairing Code otomatis untuk nomor ${envPhone}...`
            );
            await waManager.connectWithPairingCode(envPhone);
          } else {
            console.log(
              [
                "",
                "============================================================",
                "[WABot 24/7] Mesin Aktif! Belum ada nomor WhatsApp tertaut.",
                "-> CARA CEPAT (TANPA BUKA WEB): Ketik nomor WA bot kamu",
                "   langsung di kolom Console bawah (contoh: 6281234567890)",
                "   lalu tekan Enter untuk mendapat 8-digit Pairing Code!",
                '-> Perintah Console lain: "status" | "logout"',
                "============================================================",
                ""
              ].join("\n")
            );
          }
        }
      } catch (err) {
        console.error("Auto-resume initialization error:", err);
      }
    })();
  });
  if (process.stdin && !process.stdin.destroyed) {
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false
    });
    rl.on("line", (rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const lower = line.toLowerCase();
      if (lower === "status") {
        const st = botStore.waState;
        console.log(
          `[WABot Status] WA=${st.status} | User=${st.connectedUser?.phone ? "+" + st.connectedUser.phone : "-"} | Prefix=${botStore.config.prefix} | Uptime=${Math.floor(
            process.uptime()
          )}s`
        );
        return;
      }
      if (lower === "logout" || lower === "disconnect" || lower === "reset") {
        console.log("[WABot 24/7] Memutuskan & mereset sesi WhatsApp...");
        void waManager.disconnect(true).then(() => {
          console.log(
            "[WABot 24/7] Sesi direset. Ketik nomor WA baru (contoh: 6281234567890) untuk menautkan ulang."
          );
        });
        return;
      }
      const phoneCandidate = lower.startsWith("pair ") ? line.slice(5).trim() : line;
      const digitsOnly = phoneCandidate.replace(/[^0-9]/g, "");
      if (digitsOnly.length >= 9 && digitsOnly.length <= 16 && /^[+\d\s()-]+$/.test(phoneCandidate)) {
        console.log(
          `[WABot 24/7] Meminta 8-digit Pairing Code ke server WhatsApp untuk ${digitsOnly}...`
        );
        void waManager.connectWithPairingCode(digitsOnly).catch((err) => {
          console.error(
            "[WABot 24/7] Gagal meminta Pairing Code:",
            err instanceof Error ? err.message : err
          );
        });
      }
    });
  }
  const handleShutdown = async (signal) => {
    console.log(`Received ${signal}, flushing bot state & closing WA socket...`);
    clearInterval(wsHeartbeatInterval);
    if (selfKeepAliveInterval) {
      clearInterval(selfKeepAliveInterval);
    }
    botStore.saveToDisk();
    await waManager.shutdownGracefully();
    await cloudSync.flushAllNow(path9.join(resolveDataDir(), ".baileys_auth"));
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3e3).unref();
  };
  process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
  process.on("SIGINT", () => void handleShutdown("SIGINT"));
}
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection in WABot server:", reason);
});
void startServer();
