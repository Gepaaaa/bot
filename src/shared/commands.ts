import type {
  AiEnhanceConfig,
  AutoResponderRule,
  BotConfig,
  BotReactionConfig,
  BotReplyTemplates,
  CommandDefinition,
  CommandExecutionLog,
  GroupCustomConfig,
  GroupEditableTemplateKey,
  GroupSimulatorState,
  ServerStateSnapshot,
  SimulatorMember,
  SimulatorMessage,
} from './types.ts';

export const OFFICIAL_OWNER_NUMBER = '6289673533963';
export const OFFICIAL_OWNER_DISPLAY = '+62 896-7353-3963';

export function formatPhoneDisplay(rawPhone?: string): string {
  const digits = (rawPhone || OFFICIAL_OWNER_NUMBER).replace(/[^0-9]/g, '');
  if (!digits) return OFFICIAL_OWNER_DISPLAY;
  if (digits.startsWith('62') && digits.length >= 11) {
    const rest = digits.slice(2);
    const p1 = rest.slice(0, 3);
    const p2 = rest.slice(3, 7);
    const p3 = rest.slice(7);
    return `+62 ${[p1, p2, p3].filter(Boolean).join('-')}`;
  }
  return `+${digits}`;
}

export const DEFAULT_REACTIONS: BotReactionConfig = {
  enabled: true,
  pending: '⏳',
  success: '✔️',
  error: '❌',
};

export const DEFAULT_AI_ENHANCE_CONFIG: AiEnhanceConfig = {
  serviceUrl: 'http://127.0.0.1:8001',
  preferredFaceModel: 'codeformer',
  faceFidelity: 0.72,
  defaultScale: 2,
  autoDenoise: true,
  autoDeblur: true,
  sendProgressNotice: true,
  maxConcurrentJobs: 2,
  maxQueueSize: 15,
  timeoutMs: 90000,
  maxFileSizeMb: 15,
};

export const SUSPENSION_RISK_DISABLED_REPLY =
  'fitur dinonaktifkan karena berpotensi grup ditangguhkan';

export const DEFAULT_TEMPLATES: BotReplyTemplates = {
  menuHeader:
    '*{botName}*\nPrefix: *{prefix}*  ·  Fitur Aktif: *{totalCommands}*\nOwner: *wa.me/{ownerNumber}*',
  menuFooter:
    '_Ketik *{prefix}menu <1-7>* untuk melihat detail kategori._\n_Ketik *{prefix}owner* untuk menghubungi pengembang._',
  downloaderCaption:
    '*Unduhan Selesai ({platform})*\nJudul: {title}\nKreator: {author}\nDurasi: {duration}',
  audioCaption:
    '*Audio MP3 Berhasil Diekstrak*\nJudul: {title}\nSumber: {author}',
  stickerReply: 'Stiker berhasil dibuat ({packName} · {authorName})',
  stickerMissingMedia:
    'Kirim foto/video pendek dengan caption *{prefix}s* atau balas (reply) foto/video dengan *{prefix}s* untuk dijadikan stiker.',
  hdswCaption:
    '*Media HD Siap Status WA*\nFormat asli tanpa kompresi ({mediaKind} · {fileSize}) — tinggal tekan *Teruskan (Forward)* ke *Status Saya*.',
  hdswGroupConfirm:
    '*Media HD Siap Status WA ({mediaKind} · {fileSize})*\nSilakan langsung tekan *Teruskan (Forward)* pesan media ini ke *Status Saya*, *@{sender}*!',
  pingReply:
    '*{botName} Aktif*\n• Respons: *{latency} ms*\n• Uptime: *{uptime}*\n• Prefix: *{prefix}*\n• Owner: *{ownerDisplay}*',
  kickSuccess:
    '*Moderasi Grup*\nAnggota *@{target}* berhasil dikeluarkan dari grup oleh admin.',
  addSuccess:
    '*Anggota Ditambahkan*\nNomor *@{target}* berhasil dimasukkan ke dalam grup.',
  promoteSuccess:
    '*Pembaruan Admin*\nSelamat! *@{target}* kini telah diangkat menjadi *Admin Grup*.',
  demoteSuccess:
    '*Pembaruan Admin*\nStatus admin untuk *@{target}* telah dicabut menjadi anggota biasa.',
  groupOpenSuccess:
    '*Pengaturan Grup Diperbarui*\nRuang chat grup telah *DIBUKA* — seluruh anggota kini dapat mengirim pesan.',
  groupCloseSuccess:
    '*Pengaturan Grup Diperbarui*\nRuang chat grup telah *DIKUNCI* — hanya Admin Grup yang dapat mengirim pesan.',
  antilinkWarn:
    'Peringatan Moderasi Grup: Tautan dari *@{sender}* otomatis dihapus karena fitur *{prefix}antilink* sedang aktif.',
  welcomeMsg:
    'Selamat datang *@{target}* di *{groupName}*! Ketik *{prefix}menu* untuk melihat daftar perintah *{botName}*.',
  goodbyeMsg:
    'Sampai jumpa *@{target}*, terima kasih sudah pernah bergabung di *{groupName}*.',
  unknownCommand:
    'Perintah *{prefix}{command}* tidak dikenali. Ketik *{prefix}menu* untuk melihat daftar perintah yang tersedia.',
  errorReply: 'Gagal memproses *{prefix}{command}*: {error}',
};

export function renderBotTemplate(
  template: string,
  variables: Record<string, string | number | undefined>
): string {
  let rendered = template.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (match, key: string) => {
      const val = variables[key];
      return val !== undefined ? String(val) : match;
    }
  );

  const userTarget = variables.target ?? variables.sender;
  if (userTarget !== undefined) {
    rendered = rendered.replace(/@user\b/gi, `@${userTarget}`);
  }
  if (variables.sender !== undefined) {
    rendered = rendered.replace(/@sender\b/gi, `@${variables.sender}`);
  }
  if (variables.groupName !== undefined) {
    rendered = rendered.replace(
      /@(group|grup|subject)\b/gi,
      String(variables.groupName)
    );
  }

  return rendered;
}

export const COMMAND_CATALOG: CommandDefinition[] = [
  // ================= DOWNLOADER MULTI-PLATFORM =================
  {
    id: 'aio',
    aliases: ['dl', 'autodl', 'unduh'],
    category: 'downloader',
    usage: 'aio <link sosmed>',
    description:
      'All-in-One Downloader pintar: deteksi otomatis link TikTok, IG, X/Twitter, FB, Pinterest, CapCut, YouTube, atau MediaFire.',
    example: 'aio https://www.tiktok.com/@tiktok/video/7106594312292453675',
  },
  {
    id: 'tt',
    aliases: ['tiktok', 'ttdl', 'vt'],
    category: 'downloader',
    usage: 'tt <link tiktok>',
    description:
      'Download video TikTok kualitas HD tanpa watermark (otomatis mendukung kiriman Slide Foto).',
    example: 'tt https://www.tiktok.com/@tiktok/video/7106594312292453675',
  },
  {
    id: 'ttslide',
    aliases: ['ttimg', 'ttfoto', 'tiktokslide'],
    category: 'downloader',
    usage: 'ttslide <link slide tiktok>',
    description:
      'Download seluruh foto dari postingan Slide TikTok tanpa watermark dan kirim satu per satu sekaligus sesuai urutan aslinya (Foto 1/N s.d. N/N).',
    example: 'ttslide https://www.tiktok.com/@user5449227735440/photo/7703619176962870558',
  },
  {
    id: 'ig',
    aliases: ['instagram', 'igdl', 'reels'],
    category: 'downloader',
    usage: 'ig <link instagram>',
    description:
      'Download video Instagram Reels, Story publik, atau postingan foto/video dari tautan.',
    example: 'ig https://www.instagram.com/reel/C8xYzExample/',
  },
  {
    id: 'fb',
    aliases: ['facebook', 'fbdl', 'fbwatch'],
    category: 'downloader',
    usage: 'fb <link facebook>',
    description:
      'Download video Facebook Reels & Watch publik dalam kualitas terbaik yang tersedia.',
    example: 'fb https://www.facebook.com/watch/?v=10153231379946729',
  },
  {
    id: 'tw',
    aliases: ['twitter', 'x', 'xdl'],
    category: 'downloader',
    usage: 'tw <link x/twitter>',
    description:
      'Download video MP4 atau foto resolusi asli langsung dari cuitan X (Twitter).',
    example: 'tw https://x.com/NASA/status/1800000000000000000',
  },
  {
    id: 'pin',
    aliases: ['pinterest', 'pindl'],
    category: 'downloader',
    usage: 'pin <link pinterest>',
    description:
      'Download video pendek atau gambar kualitas asli dari tautan Pinterest / pin.it.',
    example: 'pin https://www.pinterest.com/pin/1234567890/',
  },
  {
    id: 'capcut',
    aliases: ['cc', 'ccdl'],
    category: 'downloader',
    usage: 'capcut <link template>',
    description: 'Download video pratinjau template CapCut tanpa watermark.',
    example: 'capcut https://www.capcut.com/t/Zs8Example/',
  },
  {
    id: 'mf',
    aliases: ['mediafire', 'mfdl'],
    category: 'downloader',
    usage: 'mf <link mediafire>',
    description:
      'Ambil dan kirim berkas langsung dari tautan publik MediaFire (batas aman 35 MB).',
    example: 'mf https://www.mediafire.com/file/example/berkas.zip/file',
  },
  {
    id: 'yt',
    aliases: ['youtube', 'ytmp4', 'shorts'],
    category: 'downloader',
    usage: 'yt <link youtube>',
    description:
      'Download video YouTube Shorts & video reguler dalam format MP4 siap tonton.',
    example: 'yt https://www.youtube.com/watch?v=jNQXAC9IVRw',
  },

  // ================= STUDIO STIKER & MAKER =================
  {
    id: 's',
    aliases: ['stiker', 'sticker', 'sgif'],
    category: 'sticker',
    usage: 's (kirim/reply foto atau video)',
    description:
      'Ubah foto maupun video/GIF pendek (maks 7 detik) menjadi stiker WebP 512×512 statis atau bergerak lengkap EXIF.',
    example: 's',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'qc',
    aliases: ['quotely', 'quotechat', 'bubble'],
    category: 'sticker',
    usage: 'qc <teks> (atau reply pesan)',
    description:
      'Buat stiker gelembung chat WhatsApp (Quote Chat) lengkap nama, warna pengirim, avatar, dan jam pesan.',
    example: 'qc ngopi santai dulu malam ini',
  },
  {
    id: 'iqc',
    aliases: ['iphoneqc', 'ioschat'],
    category: 'sticker',
    usage: 'iqc <teks> (atau reply pesan)',
    description:
      'Buat stiker gelembung percakapan bergaya iPhone iMessage bersih.',
    example: 'iqc otw lima menit lagi sampai',
  },
  {
    id: 'brat',
    aliases: ['bratgreen'],
    category: 'sticker',
    usage: 'brat <teks>',
    description:
      'Buat stiker teks otomatis gaya sampul Brat warna hijau limau khas.',
    example: 'brat santai dulu ga sih',
  },
  {
    id: 'bratwhite',
    aliases: ['bratw', 'bratputih'],
    category: 'sticker',
    usage: 'bratwhite <teks>',
    description:
      'Buat stiker teks otomatis gaya Brat versi latar putih bersih.',
    example: 'bratwhite tetap tenang walau sibuk',
  },
  {
    id: 'bratcolor',
    aliases: ['bratwarna', 'bratc'],
    category: 'sticker',
    usage: 'bratcolor <warna> | <teks>',
    description:
      'Buat stiker Brat dengan pilihan warna latar (pink, biru, merah, ungu, kuning, hitam, oranye, cyan).',
    example: 'bratcolor pink | tetap tenang walau revisi datang',
  },
  {
    id: 'bratvid',
    aliases: ['bratvideo', 'bratanim', 'bratgif'],
    category: 'sticker',
    usage: 'bratvid <teks>',
    description:
      'Buat stiker animasi bergerak gaya Brat yang memunculkan teks kata demi kata.',
    example: 'bratvid santai dulu ngopi sebentar',
  },
  {
    id: 'ttp',
    aliases: ['text2pic', 'stikerteks'],
    category: 'sticker',
    usage: 'ttp <teks>',
    description: 'Buat stiker tipografi teks tebal berlatar transparan tajam.',
    example: 'ttp GAS MABAR MALAM INI',
  },
  {
    id: 'attp',
    aliases: ['animttp', 'pelangi'],
    category: 'sticker',
    usage: 'attp <teks>',
    description: 'Buat stiker teks animasi berkedip warna-warni RGB transparan.',
    example: 'attp MANTAP JIWA',
  },
  {
    id: 'smeme',
    aliases: ['memesticker', 'stikermeme', 'smemer'],
    category: 'sticker',
    usage: 'smeme <teks atas> | <teks bawah> (reply foto/stiker)',
    description:
      'Tambahkan teks meme tebal besar atas & bawah pada foto maupun stiker yang di-reply.',
    example: 'smeme niatnya tidur cepat | malah scroll tiktok jam 3 pagi',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'meme',
    aliases: ['memeindo', 'memereceh', 'candaan', 'jokes'],
    category: 'media',
    usage: 'meme [kategori/topik opsional]',
    description:
      'Ambil dan kirim gambar meme lucu acak dari berbagai referensi web & komunitas humor (cak.one/candaan/meme-api).',
    example: 'meme',
  },
  {
    id: 'emojimix',
    aliases: ['emix', 'mixemoji'],
    category: 'sticker',
    usage: 'emojimix <emoji1>+<emoji2>',
    description:
      'Gabungkan 2 emoji menjadi 1 stiker kombinasi unik ala Google Emoji Kitchen.',
    example: 'emojimix 😀+😎',
  },
  {
    id: 'wm',
    aliases: ['take', 'colong', 'swm', 'exif'],
    category: 'sticker',
    usage: 'wm <nama> atau <pack|author> (reply stiker)',
    description:
      'Ganti watermark stiker. Bisa hanya nama saja (contoh: .wm yodi) tanpa embel-embel, maupun format pack|author.',
    example: 'wm yodi',
    requiresMedia: true,
    mediaKindHint: 'sticker',
  },
  {
    id: 'toimg',
    aliases: ['topng', 'toimage'],
    category: 'sticker',
    usage: 'toimg (reply stiker)',
    description:
      'Ubah stiker WebP yang di-reply kembali menjadi gambar PNG jernih.',
    example: 'toimg',
    requiresMedia: true,
    mediaKindHint: 'sticker',
  },
  {
    id: 'tovid',
    aliases: ['tomp4', 'togif'],
    category: 'sticker',
    usage: 'tovid (reply stiker gerak)',
    description:
      'Ubah stiker animasi bergerak WebP menjadi video MP4 siap putar & simpan.',
    example: 'tovid',
    requiresMedia: true,
    mediaKindHint: 'sticker',
  },

  // ================= PERKAKAS MEDIA & STATUS HD =================
  {
    id: 'hdsw',
    aliases: ['sw', 'tosw', 'hdstatus', 'swori'],
    category: 'media',
    usage: 'hdsw (kirim/reply dokumen foto/video)',
    description:
      'Bisa di Grup & Chat Pribadi! Ubah file Dokumen foto/video ukuran asli menjadi balasan media WA Web jernih tanpa kompresi siap diteruskan ke Status WA.',
    example: 'hdsw',
    requiresMedia: true,
    mediaKindHint: 'document',
  },
  {
    id: 'hd',
    aliases: ['enhance', 'jernih', 'hdr'],
    category: 'media',
    usage: 'hd [fidelity 0.1-0.95] (kirim/reply foto)',
    description:
      'Peningkatan kualitas foto otomatis adaptif berbasis AI (Real-ESRGAN + CodeFormer/GFPGAN + SCUNet/NAFNet sesuai kondisi noise, blur, dan wajah).',
    example: 'hd',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'remini',
    aliases: ['facehd', 'restoreface'],
    category: 'media',
    usage: 'remini [fidelity 0.1-0.95] (kirim/reply foto)',
    description:
      'Fokus restorasi detail wajah natural menggunakan CodeFormer / GFPGAN dengan kontrol fidelity agar identitas wajah asli tetap terjaga dan tidak tampak plastik.',
    example: 'remini',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'upscale',
    aliases: ['sr', 'superres'],
    category: 'media',
    usage: 'upscale (kirim/reply foto)',
    description:
      'Tingkatkan resolusi dan ketajaman tekstur umum foto menggunakan pretrained super-resolution Real-ESRGAN.',
    example: 'upscale',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'hd2',
    aliases: ['upscale2x', '2x'],
    category: 'media',
    usage: 'hd2 (kirim/reply foto)',
    description:
      'Super-resolution AI 2× lipat dengan Real-ESRGAN x2plus serta penjagaan warna natural.',
    example: 'hd2',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'hd4',
    aliases: ['upscale4x', '4x'],
    category: 'media',
    usage: 'hd4 (kirim/reply foto)',
    description:
      'Super-resolution AI 4× lipat resolusi tinggi dengan Real-ESRGAN x4plus dan pipeline restorasi adaptif.',
    example: 'hd4',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'rvo',
    aliases: ['readviewonce', 'bukavo', 'lihatsekali'],
    category: 'media',
    usage: 'rvo (reply pesan sekali lihat)',
    description:
      'Buka dan tampilkan kembali foto, video, atau suara View Once (sekali lihat) yang di-reply di ruang chat.',
    example: 'rvo',
    requiresMedia: true,
    mediaKindHint: 'viewonce',
  },
  {
    id: 'toptv',
    aliases: ['ptv', 'videobulat'],
    category: 'media',
    usage: 'toptv (kirim/reply video)',
    description:
      'Ubah video biasa menjadi pesan Video Note bulat (PTV) khas WhatsApp.',
    example: 'toptv',
    requiresMedia: true,
    mediaKindHint: 'video',
  },
  {
    id: 'hitamkan',
    aliases: ['grayscale', 'bw', 'hitamputih'],
    category: 'media',
    usage: 'hitamkan (kirim/reply foto)',
    description: 'Ubah foto menjadi nuansa monokrom hitam-putih kontras tinggi.',
    example: 'hitamkan',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'imgedit',
    aliases: ['blur', 'invert', 'negatif', 'mirror', 'flip', 'sepia'],
    category: 'media',
    usage: 'imgedit <blur|invert|mirror|flip|sepia>',
    description:
      'Terapkan efek manipulasi gambar instan (bisa langsung ketik .blur, .invert, .mirror, .flip, atau .sepia pada foto).',
    example: 'imgedit blur',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'tourl',
    aliases: ['upload', 'catbox', 'linkmedia'],
    category: 'media',
    usage: 'tourl (kirim/reply media)',
    description:
      'Unggah foto, video, audio, atau stiker menjadi tautan URL publik siap bagikan.',
    example: 'tourl',
    requiresMedia: true,
    mediaKindHint: 'image',
  },
  {
    id: 'qrcode',
    aliases: ['qr', 'buatqr'],
    category: 'media',
    usage: 'qrcode <teks atau link>',
    description:
      'Buat gambar kode QR tajam siap pindai dari teks atau tautan apa pun.',
    example: 'qrcode https://wa.me/6289673533963',
  },

  // ================= AUDIO & EFEK SUARA =================
  {
    id: 'mp3',
    aliases: ['ttmp3', 'ytmp3', 'musik'],
    category: 'audio',
    usage: 'mp3 <link video sosmed>',
    description:
      'Ekstrak audio MP3 jernih langsung dari tautan TikTok, YouTube, atau sosial media lainnya.',
    example: 'mp3 https://www.tiktok.com/@tiktok/video/7106594312292453675',
  },
  {
    id: 'play',
    aliases: ['song', 'lagu', 'cari', 'spotify'],
    category: 'audio',
    usage: 'play <judul lagu / penyanyi>',
    description:
      'Cari lagu berdasarkan kata kunci judul/artis dan kirimkan audio MP3 langsung ke ruang chat.',
    example: 'play Hindia Evaluasi',
  },
  {
    id: 'tomp3',
    aliases: ['toaudio', 'vn2mp3'],
    category: 'audio',
    usage: 'tomp3 (reply video / VN)',
    description:
      'Ekstrak jalur suara dari video atau ubah Voice Note menjadi berkas musik MP3.',
    example: 'tomp3',
    requiresMedia: true,
    mediaKindHint: 'video',
  },
  {
    id: 'tovn',
    aliases: ['toptt', 'vn'],
    category: 'audio',
    usage: 'tovn (reply video / MP3)',
    description:
      'Ubah musik MP3 atau video menjadi pesan suara Voice Note (PTT gelombang suara WhatsApp).',
    example: 'tovn',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },
  {
    id: 'bass',
    aliases: ['bassboost', 'jedagjedug'],
    category: 'audio',
    usage: 'bass (reply audio / VN)',
    description:
      'Terapkan efek dentuman Bass Boost mantap pada lagu atau Voice Note yang di-reply.',
    example: 'bass',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },
  {
    id: 'nightcore',
    aliases: ['nc', 'tupai'],
    category: 'audio',
    usage: 'nightcore (reply audio / VN)',
    description:
      'Ubah lagu atau Voice Note menjadi gaya Nightcore dengan nada dan tempo energetik.',
    example: 'nightcore',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },
  {
    id: 'slow',
    aliases: ['slowed', 'reverb'],
    category: 'audio',
    usage: 'slow (reply audio / VN)',
    description: 'Ubah lagu atau Voice Note menjadi nuansa Slowed + Reverb kalem.',
    example: 'slow',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },
  {
    id: 'fast',
    aliases: ['speedup', 'cepat'],
    category: 'audio',
    usage: 'fast (reply audio / VN)',
    description:
      'Percepat tempo pemutaran audio atau Voice Note tanpa merusak kejernihan.',
    example: 'fast',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },
  {
    id: 'robot',
    aliases: ['robo', 'cyborg'],
    category: 'audio',
    usage: 'robot (reply audio / VN)',
    description:
      'Ubah suara pada Voice Note atau audio menjadi efek modulasi suara Robot.',
    example: 'robot',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },
  {
    id: 'reverse',
    aliases: ['baliksuara'],
    category: 'audio',
    usage: 'reverse (reply audio / VN)',
    description: 'Putar balik gelombang audio/Voice Note dari akhir ke awal.',
    example: 'reverse',
    requiresMedia: true,
    mediaKindHint: 'audio',
  },

  // ================= ADMIN & OTOMASI GRUP =================
  {
    id: 'kick',
    aliases: ['tendang', 'remove', 'dor'],
    category: 'group',
    usage: 'kick <@tag / nomor / reply>',
    description:
      'Keluarkan anggota dari grup melalui mention, nomor telepon, atau reply pesan.',
    example: 'kick @628577000333',
    groupOnly: true,
  },
  {
    id: 'add',
    aliases: ['tambah', 'invite'],
    category: 'group',
    usage: 'add <nomor>',
    description:
      'Dinonaktifkan otomatis karena penambahan paksa nomor via bot berisiko tinggi memicu penangguhan grup oleh WhatsApp (gunakan .linkgc).',
    example: 'add 628199000777',
    groupOnly: true,
    suspensionRisk: true,
  },
  {
    id: 'promote',
    aliases: ['jadiadmin', 'admin'],
    category: 'group',
    usage: 'promote <@tag / nomor / reply>',
    description: 'Angkat anggota biasa menjadi Admin Grup.',
    example: 'promote @628577000333',
    groupOnly: true,
  },
  {
    id: 'demote',
    aliases: ['unadmin', 'turunkan'],
    category: 'group',
    usage: 'demote <@tag / nomor / reply>',
    description: 'Turunkan status Admin Grup kembali menjadi anggota biasa.',
    example: 'demote @628138000222',
    groupOnly: true,
  },
  {
    id: 'group',
    aliases: ['gc', 'grup'],
    category: 'group',
    usage: 'group <open|close>',
    description:
      'Buka grup agar semua anggota bisa chat atau kunci khusus Admin.',
    example: 'group close',
    groupOnly: true,
  },
  {
    id: 'setname',
    aliases: ['setsubject', 'namagrup'],
    category: 'group',
    usage: 'setname <nama baru>',
    description: 'Ganti nama/judul grup WhatsApp secara langsung.',
    example: 'setname Ruang Diskusi Komunitas',
    groupOnly: true,
  },
  {
    id: 'setdesc',
    aliases: ['deskripsi', 'setdeskripsi'],
    category: 'group',
    usage: 'setdesc <teks deskripsi>',
    description: 'Perbarui teks deskripsi aturan atau informasi grup.',
    example:
      'setdesc Ruang diskusi santai anggota komunitas. Dilarang spam link.',
    groupOnly: true,
  },
  {
    id: 'linkgc',
    aliases: ['linkgrup', 'gclink'],
    category: 'group',
    usage: 'linkgc',
    description: 'Ambil tautan undangan (invite link) grup WhatsApp saat ini.',
    example: 'linkgc',
    groupOnly: true,
  },
  {
    id: 'revoke',
    aliases: ['resetlink', 'revokelink'],
    category: 'group',
    usage: 'revoke',
    description: 'Hanguskan link undangan grup lama dan buat kode tautan baru.',
    example: 'revoke',
    groupOnly: true,
  },
  {
    id: 'hidetag',
    aliases: ['ht', 'pengumuman'],
    category: 'group',
    usage: 'hidetag <pesan>',
    description:
      'Kirim pengumuman penting dengan mention tersembunyi ke seluruh anggota grup (Khusus Admin/Owner).',
    example: 'hidetag Jangan lupa kumpul komunitas malam ini jam 20.00 WIB!',
    groupOnly: true,
  },
  {
    id: 'tagall',
    aliases: ['everyone', 'mentionall'],
    category: 'group',
    usage: 'tagall <pesan>',
    description:
      'Sebutkan dan tag seluruh daftar anggota grup beserta pesan pengumuman (Khusus Admin/Owner).',
    example: 'tagall Absen hadir anggota komunitas',
    groupOnly: true,
  },
  {
    id: 'antilink',
    aliases: ['antigclink'],
    category: 'group',
    usage: 'antilink <on|off>',
    description:
      'Otomatis mendeteksi dan menghapus tautan yang dikirim oleh non-admin di grup.',
    example: 'antilink on',
    groupOnly: true,
  },
  {
    id: 'welcome',
    aliases: ['sambutan'],
    category: 'group',
    usage: 'welcome <on|off>',
    description:
      'Aktifkan atau matikan pesan sambutan otomatis saat anggota baru masuk grup.',
    example: 'welcome on',
    groupOnly: true,
  },
  {
    id: 'out',
    aliases: ['leave', 'bye', 'goodbye'],
    category: 'group',
    usage: 'out <on|off>',
    description:
      'Aktifkan atau matikan pesan perpisahan otomatis saat anggota keluar dari grup.',
    example: 'out on',
    groupOnly: true,
  },
  {
    id: 'setwelcome',
    aliases: ['setwel', 'ubahwelcome'],
    category: 'group',
    usage: 'setwelcome <teks>',
    description:
      'Ubah teks sambutan member baru khusus grup ini oleh Admin (mendukung @user & @group).',
    example:
      'setwelcome Halo *@user*, selamat bergabung di *@group*! Jangan lupa baca deskripsi ya.',
    groupOnly: true,
  },
  {
    id: 'setout',
    aliases: ['setleave', 'setbye', 'setgoodbye'],
    category: 'group',
    usage: 'setout <teks>',
    description:
      'Ubah teks saat anggota keluar dari grup ini oleh Admin (mendukung @user & @group).',
    example:
      'setout Sampai jumpa *@user*, semoga sukses selalu di luar *@group*!',
    groupOnly: true,
  },
  {
    id: 'setpromote',
    aliases: ['ubahpromote'],
    category: 'group',
    usage: 'setpromote <teks>',
    description:
      'Ubah teks pengumuman saat anggota diangkat jadi Admin di grup ini.',
    example:
      'setpromote Mantap *@user* sekarang resmi jadi Admin di *@group*!',
    groupOnly: true,
  },
  {
    id: 'setdemote',
    aliases: ['ubahdemote'],
    category: 'group',
    usage: 'setdemote <teks>',
    description:
      'Ubah teks pengumuman saat jabatan Admin dicabut di grup ini.',
    example:
      'setdemote Terima kasih *@user*, kini kembali jadi anggota biasa di *@group*.',
    groupOnly: true,
  },
  {
    id: 'setantilink',
    aliases: ['setwarn', 'ubahantilink'],
    category: 'group',
    usage: 'setantilink <teks>',
    description:
      'Ubah teks peringatan otomatis saat bot menghapus link dari non-admin di grup ini.',
    example:
      'setantilink Ups *@sender*, dilarang sebar link promosi di *@group* ya!',
    groupOnly: true,
  },
  {
    id: 'setopen',
    aliases: ['ubahopen'],
    category: 'group',
    usage: 'setopen <teks>',
    description:
      'Ubah teks pengumuman saat Admin membuka chat grup (.group open).',
    example:
      'setopen Grup *@group* sudah dibuka! Silakan berdiskusi dengan sopan.',
    groupOnly: true,
  },
  {
    id: 'setclose',
    aliases: ['ubahclose'],
    category: 'group',
    usage: 'setclose <teks>',
    description:
      'Ubah teks pengumuman saat Admin mengunci chat grup (.group close).',
    example:
      'setclose Grup *@group* dikunci sementara khusus pengumuman Admin.',
    groupOnly: true,
  },
  {
    id: 'cekset',
    aliases: ['setinfo', 'listset', 'infogc'],
    category: 'group',
    usage: 'cekset',
    description:
      'Lihat status fitur grup (welcome, out, antilink) beserta seluruh teks custom grup ini.',
    example: 'cekset',
    groupOnly: true,
  },
  {
    id: 'resetset',
    aliases: ['resetchat', 'resetgc'],
    category: 'group',
    usage: 'resetset',
    description:
      'Kembalikan seluruh teks custom grup (welcome, out, dll.) ke pengaturan bawaan bot.',
    example: 'resetset',
    groupOnly: true,
  },

  // ================= UTILITAS & INFO =================
  {
    id: 'menu',
    aliases: ['help', 'fitur'],
    category: 'utility',
    usage: 'menu [1-7 / fitur]',
    description:
      'Tampilkan daftar kategori menu (1–7) atau panduan detail fitur bot.',
    example: 'menu',
  },
  {
    id: 'allmenu',
    aliases: ['semuamenu', 'menulengkap', 'fullmenu'],
    category: 'utility',
    usage: 'allmenu',
    description:
      'Tampilkan seluruh daftar perintah bot lengkap dari semua kategori dalam satu pesan rapi.',
    example: 'allmenu',
  },
  {
    id: 'menudownload',
    aliases: ['menudl', 'menudownloader', 'menuunduh'],
    category: 'utility',
    usage: 'menudownload',
    description:
      'Tampilkan apa saja perintah unduh sosial media (TikTok, IG, YT, FB, dll.).',
    example: 'menudownload',
  },
  {
    id: 'menustiker',
    aliases: ['menusticker', 'menustik'],
    category: 'utility',
    usage: 'menustiker',
    description:
      'Tampilkan apa saja perintah studio stiker WhatsApp (Brat, QC, Smeme, dll.).',
    example: 'menustiker',
  },
  {
    id: 'menumedia',
    aliases: ['menutools'],
    category: 'utility',
    usage: 'menumedia',
    description:
      'Tampilkan apa saja perintah perkakas media, HD foto, Status HD, dan kode QR.',
    example: 'menumedia',
  },
  {
    id: 'menuaudio',
    aliases: ['menumusik', 'menumusic'],
    category: 'utility',
    usage: 'menuaudio',
    description:
      'Tampilkan apa saja perintah audio, pemutar lagu MP3, dan efek suara.',
    example: 'menuaudio',
  },
  {
    id: 'menugrup',
    aliases: ['menugroup', 'menuadmin'],
    category: 'utility',
    usage: 'menugrup',
    description:
      'Tampilkan apa saja perintah administrasi dan moderasi grup WhatsApp.',
    example: 'menugrup',
  },
  {
    id: 'menuotomasi',
    aliases: ['menuset', 'menuauto'],
    category: 'utility',
    usage: 'menuotomasi',
    description:
      'Tampilkan apa saja perintah otomasi grup (sambutan welcome, out, antilink).',
    example: 'menuotomasi',
  },
  {
    id: 'menuinfo',
    aliases: ['menubantuan', 'menuhelp'],
    category: 'utility',
    usage: 'menuinfo',
    description:
      'Tampilkan apa saja informasi & bantuan, kontak resmi owner, dan panel.',
    example: 'menuinfo',
  },
  {
    id: 'owner',
    aliases: ['creator', 'pemilik'],
    category: 'utility',
    usage: 'owner',
    description:
      'Tampilkan informasi dan kontak WhatsApp resmi Owner Bot (+62 896-7353-3963).',
    example: 'owner',
  },
  {
    id: 'ping',
    aliases: ['info', 'status', 'speed'],
    category: 'utility',
    usage: 'ping',
    description:
      'Cek kecepatan respons bot, masa aktif sesi server, dan informasi owner.',
    example: 'ping',
  },
  {
    id: 'panel',
    aliases: ['webpanel', 'remotepanel', 'linkpanel'],
    category: 'utility',
    usage: 'panel [on|off|resetkey]',
    description:
      'Khusus Owner (via Chat Pribadi): buka/ambil tautan Web Control Panel jarak jauh untuk diakses dari HP kedua di mana saja.',
    example: 'panel',
  },
];

interface CompactCommandMeta {
  shortUsage: string;
  shortDesc: string;
  compactExample?: string;
}

const COMPACT_COMMAND_META: Record<string, CompactCommandMeta> = {
  aio: { shortUsage: 'aio <link>', shortDesc: 'Auto-unduh link sosmed apa saja' },
  tt: { shortUsage: 'tt <link>', shortDesc: 'Video/slide TikTok tanpa WM' },
  ttslide: { shortUsage: 'ttslide <link>', shortDesc: 'Album slide foto TikTok + MP3' },
  ig: { shortUsage: 'ig <link>', shortDesc: 'Reels & postingan Instagram' },
  fb: { shortUsage: 'fb <link>', shortDesc: 'Video Facebook Reels & Watch' },
  tw: { shortUsage: 'tw <link>', shortDesc: 'Video & gambar X / Twitter' },
  pin: { shortUsage: 'pin <link>', shortDesc: 'Video & foto asli Pinterest' },
  capcut: { shortUsage: 'capcut <link>', shortDesc: 'Template CapCut tanpa WM' },
  mf: { shortUsage: 'mf <link>', shortDesc: 'Unduh berkas langsung MediaFire' },
  yt: { shortUsage: 'yt <link>', shortDesc: 'Video YouTube & Shorts' },
  s: { shortUsage: 's', shortDesc: 'Foto/video pendek ke stiker WebP' },
  qc: { shortUsage: 'qc <teks/reply>', shortDesc: 'Stiker gelembung chat WA' },
  iqc: { shortUsage: 'iqc <teks/reply>', shortDesc: 'Stiker gelembung iMessage iOS' },
  brat: { shortUsage: 'brat <teks>', shortDesc: 'Stiker teks hijau Brat' },
  bratwhite: { shortUsage: 'bratwhite <teks>', shortDesc: 'Stiker teks putih Brat' },
  bratcolor: { shortUsage: 'bratcolor <warna|teks>', shortDesc: 'Stiker Brat pilih warna' },
  bratvid: { shortUsage: 'bratvid <teks>', shortDesc: 'Stiker Brat animasi bergerak' },
  ttp: { shortUsage: 'ttp <teks>', shortDesc: 'Stiker teks tebal transparan' },
  attp: { shortUsage: 'attp <teks>', shortDesc: 'Stiker animasi teks pelangi RGB' },
  smeme: { shortUsage: 'smeme <atas|bawah>', shortDesc: 'Stiker meme dari foto & stiker' },
  meme: { shortUsage: 'meme [topik]', shortDesc: 'Ambil foto meme lucu dari referensi web' },
  emojimix: { shortUsage: 'emojimix 😀+😎', shortDesc: 'Gabung 2 emoji jadi stiker' },
  wm: { shortUsage: 'wm <nama>', shortDesc: 'Ganti nama watermark stiker' },
  toimg: { shortUsage: 'toimg', shortDesc: 'Ubah stiker kembali jadi foto' },
  tovid: { shortUsage: 'tovid', shortDesc: 'Ubah stiker gerak jadi video MP4' },
  hdsw: { shortUsage: 'hdsw', shortDesc: 'Dokumen asli ke Status HD (Grup/PC)' },
  hd: { shortUsage: 'hd', shortDesc: 'AI Enhance foto adaptif otomatis' },
  remini: { shortUsage: 'remini', shortDesc: 'AI restorasi wajah natural' },
  upscale: { shortUsage: 'upscale', shortDesc: 'AI super-resolution Real-ESRGAN' },
  hd2: { shortUsage: 'hd2', shortDesc: 'AI upscale resolusi foto 2×' },
  hd4: { shortUsage: 'hd4', shortDesc: 'AI upscale resolusi foto 4×' },
  rvo: { shortUsage: 'rvo', shortDesc: 'Buka media View Once sekali lihat' },
  toptv: { shortUsage: 'toptv', shortDesc: 'Ubah video jadi Video Note bulat' },
  hitamkan: { shortUsage: 'hitamkan', shortDesc: 'Filter foto monokrom hitam-putih' },
  imgedit: { shortUsage: 'blur / invert / mirror', shortDesc: 'Efek instan foto' },
  tourl: { shortUsage: 'tourl', shortDesc: 'Ubah media jadi tautan publik' },
  qrcode: { shortUsage: 'qrcode <teks>', shortDesc: 'Buat gambar kode QR tajam' },
  mp3: { shortUsage: 'mp3 <link>', shortDesc: 'Ambil audio MP3 dari link sosmed' },
  play: { shortUsage: 'play <judul>', shortDesc: 'Cari & kirim lagu MP3' },
  tomp3: { shortUsage: 'tomp3', shortDesc: 'Ubah video/VN jadi musik MP3' },
  tovn: { shortUsage: 'tovn', shortDesc: 'Ubah audio/video jadi Voice Note' },
  bass: { shortUsage: 'bass', shortDesc: 'Efek suara Bass Boost' },
  nightcore: { shortUsage: 'nightcore', shortDesc: 'Efek suara Nightcore cepat' },
  slow: { shortUsage: 'slow', shortDesc: 'Efek suara Slowed + Reverb' },
  fast: { shortUsage: 'fast', shortDesc: 'Percepat tempo audio/VN' },
  robot: { shortUsage: 'robot', shortDesc: 'Efek modulasi suara Robot' },
  reverse: { shortUsage: 'reverse', shortDesc: 'Putar balik suara audio/VN' },
  kick: { shortUsage: 'kick <@tag/reply>', shortDesc: 'Keluarkan anggota dari grup' },
  add: { shortUsage: 'add <nomor>', shortDesc: 'Dikunci cegah suspend grup' },
  promote: { shortUsage: 'promote <@tag/reply>', shortDesc: 'Angkat jadi Admin Grup' },
  demote: { shortUsage: 'demote <@tag/reply>', shortDesc: 'Cabut jabatan Admin Grup' },
  group: { shortUsage: 'group <open|close>', shortDesc: 'Buka / kunci chat grup' },
  hidetag: { shortUsage: 'hidetag <pesan>', shortDesc: 'Pengumuman mention tersembunyi' },
  tagall: { shortUsage: 'tagall <pesan>', shortDesc: 'Tag daftar semua anggota grup' },
  setname: { shortUsage: 'setname <nama>', shortDesc: 'Ganti nama grup WA' },
  setdesc: { shortUsage: 'setdesc <teks>', shortDesc: 'Ganti deskripsi grup WA' },
  linkgc: { shortUsage: 'linkgc', shortDesc: 'Ambil link undangan grup' },
  revoke: { shortUsage: 'revoke', shortDesc: 'Reset link undangan grup' },
  welcome: { shortUsage: 'welcome <on|off>', shortDesc: 'Sambutan member masuk' },
  out: { shortUsage: 'out <on|off>', shortDesc: 'Pesan member keluar grup' },
  antilink: { shortUsage: 'antilink <on|off>', shortDesc: 'Hapus link non-admin' },
  setwelcome: { shortUsage: 'setwelcome <teks>', shortDesc: 'Edit teks sambutan' },
  setout: { shortUsage: 'setout <teks>', shortDesc: 'Edit teks keluar grup' },
  setpromote: { shortUsage: 'setpromote <teks>', shortDesc: 'Edit teks promote admin' },
  setdemote: { shortUsage: 'setdemote <teks>', shortDesc: 'Edit teks demote admin' },
  setopen: { shortUsage: 'setopen <teks>', shortDesc: 'Edit teks grup dibuka' },
  setclose: { shortUsage: 'setclose <teks>', shortDesc: 'Edit teks grup dikunci' },
  setantilink: { shortUsage: 'setantilink <teks>', shortDesc: 'Edit peringatan antilink' },
  cekset: { shortUsage: 'cekset', shortDesc: 'Lihat status & teks grup' },
  resetset: { shortUsage: 'resetset', shortDesc: 'Reset teks grup ke bawaan' },
  menu: { shortUsage: 'menu [1-7]', shortDesc: 'Daftar fitur & panduan kategori' },
  owner: { shortUsage: 'owner', shortDesc: 'Kontak resmi Owner Bot' },
  ping: { shortUsage: 'ping', shortDesc: 'Cek kecepatan & status bot' },
  panel: { shortUsage: 'panel', shortDesc: 'Link Web Panel jarak jauh (Owner)' },
};

interface CompactMenuRow {
  ids: string[];
  argHint?: string;
  summary: string;
}

export interface MenuSectionSpec {
  key: 'downloader' | 'stiker' | 'media' | 'audio' | 'grup' | 'set' | 'info';
  code: string;
  emoji: string;
  title: string;
  categoryCmd: string;
  categoryDesc: string;
  keywords: string[];
  ids: string[];
  compactRows: CompactMenuRow[];
}

export const MENU_SECTIONS: MenuSectionSpec[] = [
  {
    key: 'downloader',
    code: '01',
    emoji: '📂',
    title: 'DOWNLOADER',
    categoryCmd: 'menudownload',
    categoryDesc: '(untuk menampilkan apa saja perintah download)',
    keywords: [
      '1',
      '01',
      'dl',
      'download',
      'downloader',
      'unduh',
      'sosmed',
      'menudownload',
      'menudl',
      'menudownloader',
      'menuunduh',
    ],
    ids: ['aio', 'tt', 'ttslide', 'ig', 'fb', 'tw', 'pin', 'capcut', 'mf', 'yt'],
    compactRows: [
      { ids: ['aio'], argHint: '<link>', summary: 'Auto-unduh semua sosmed' },
      { ids: ['tt', 'ttslide'], summary: 'Video & slide foto TikTok HD' },
      { ids: ['ig', 'fb', 'tw'], summary: 'Reels IG, FB & X/Twitter' },
      { ids: ['pin', 'capcut', 'mf'], summary: 'Pinterest, CapCut & MediaFire' },
      { ids: ['yt'], argHint: '<link>', summary: 'Video YouTube & Shorts' },
    ],
  },
  {
    key: 'stiker',
    code: '02',
    emoji: '🎨',
    title: 'STUDIO STIKER',
    categoryCmd: 'menustiker',
    categoryDesc: '(untuk menampilkan apa saja perintah studio stiker)',
    keywords: [
      '2',
      '02',
      'stiker',
      'sticker',
      'maker',
      'brat',
      'qc',
      'menustiker',
      'menusticker',
      'menustik',
    ],
    ids: [
      's',
      'qc',
      'iqc',
      'brat',
      'bratwhite',
      'bratcolor',
      'bratvid',
      'ttp',
      'attp',
      'smeme',
      'emojimix',
      'wm',
      'toimg',
      'tovid',
    ],
    compactRows: [
      { ids: ['s'], summary: 'Foto / video ke stiker WebP' },
      { ids: ['qc', 'iqc'], summary: 'Stiker bubble chat WA & iPhone' },
      { ids: ['brat', 'bratwhite', 'bratcolor'], summary: 'Stiker teks gaya Brat' },
      { ids: ['bratvid', 'ttp', 'attp'], summary: 'Stiker teks & animasi RGB' },
      { ids: ['smeme', 'emojimix'], summary: 'Stiker meme teks besar & mix emoji' },
      { ids: ['wm', 'toimg', 'tovid'], summary: 'Ubah EXIF & konversi stiker' },
    ],
  },
  {
    key: 'media',
    code: '03',
    emoji: '🛠️',
    title: 'PERKAKAS MEDIA',
    categoryCmd: 'menumedia',
    categoryDesc: '(untuk menampilkan apa saja perintah perkakas media)',
    keywords: [
      '3',
      '03',
      'media',
      'tools',
      'hd',
      'remini',
      'upscale',
      'hd2',
      'hd4',
      'sw',
      'hdsw',
      'foto',
      'meme',
      'menumedia',
      'menutools',
    ],
    ids: [
      'hdsw',
      'hd',
      'remini',
      'upscale',
      'hd2',
      'hd4',
      'meme',
      'rvo',
      'toptv',
      'hitamkan',
      'imgedit',
      'tourl',
      'qrcode',
    ],
    compactRows: [
      { ids: ['hdsw'], summary: 'Dokumen ke Status HD (Grup & PC)' },
      { ids: ['hd', 'remini', 'upscale'], summary: 'AI Enhance adaptif, wajah & SR' },
      { ids: ['hd2', 'hd4'], summary: 'AI Super-Resolution 2× & 4×' },
      { ids: ['hitamkan', 'imgedit'], summary: 'Hitam-putih, blur, invert, mirror' },
      { ids: ['meme', 'rvo', 'toptv'], summary: 'Meme web lucu, ViewOnce & video PTV' },
      { ids: ['tourl', 'qrcode'], summary: 'Link media publik & kode QR' },
    ],
  },
  {
    key: 'audio',
    code: '04',
    emoji: '🎵',
    title: 'AUDIO & MUSIK',
    categoryCmd: 'menuaudio',
    categoryDesc: '(untuk menampilkan apa saja perintah audio & musik)',
    keywords: [
      '4',
      '04',
      'audio',
      'musik',
      'music',
      'vn',
      'sound',
      'efek',
      'menuaudio',
      'menumusik',
      'menumusic',
    ],
    ids: [
      'play',
      'mp3',
      'tomp3',
      'tovn',
      'bass',
      'nightcore',
      'slow',
      'fast',
      'robot',
      'reverse',
    ],
    compactRows: [
      { ids: ['play'], argHint: '<judul>', summary: 'Cari lagu & kirim MP3' },
      { ids: ['mp3', 'tomp3', 'tovn'], summary: 'Ekstrak MP3 & Voice Note' },
      { ids: ['bass', 'nightcore', 'slow'], summary: 'Efek Bass, Nightcore & Slowed' },
      { ids: ['fast', 'robot', 'reverse'], summary: 'Efek Speedup, Robot & Reverse' },
    ],
  },
  {
    key: 'grup',
    code: '05',
    emoji: '🛡️',
    title: 'ADMIN GRUP',
    categoryCmd: 'menugrup',
    categoryDesc: '(untuk menampilkan apa saja perintah admin grup)',
    keywords: [
      '5',
      '05',
      'grup',
      'group',
      'admin',
      'moderasi',
      'mod',
      'gc',
      'menugrup',
      'menugroup',
      'menuadmin',
    ],
    ids: [
      'kick',
      'promote',
      'demote',
      'hidetag',
      'tagall',
      'group',
      'setname',
      'setdesc',
      'linkgc',
      'revoke',
    ],
    compactRows: [
      { ids: ['kick', 'promote', 'demote'], summary: 'Kelola anggota & admin' },
      { ids: ['hidetag', 'tagall'], summary: 'Pengumuman & mention semua member' },
      { ids: ['group'], argHint: 'open|close', summary: 'Buka / kunci chat grup' },
      { ids: ['setname', 'setdesc'], summary: 'Ubah nama & deskripsi grup' },
      { ids: ['linkgc', 'revoke'], summary: 'Ambil / reset tautan grup' },
    ],
  },
  {
    key: 'set',
    code: '06',
    emoji: '⚙️',
    title: 'OTOMASI GRUP',
    categoryCmd: 'menuotomasi',
    categoryDesc: '(untuk menampilkan apa saja perintah otomasi grup)',
    keywords: [
      '6',
      '06',
      'set',
      'teks',
      'custom',
      'otomasi',
      'setting',
      'sambutan',
      'menuotomasi',
      'menuset',
      'menuauto',
    ],
    ids: [
      'welcome',
      'out',
      'antilink',
      'setwelcome',
      'setout',
      'setpromote',
      'setdemote',
      'cekset',
      'resetset',
    ],
    compactRows: [
      { ids: ['welcome', 'out', 'antilink'], summary: 'Sakelar sambutan & antilink' },
      { ids: ['setwelcome', 'setout'], summary: 'Atur teks masuk & keluar' },
      { ids: ['setpromote', 'setdemote'], summary: 'Atur teks jabatan admin' },
      { ids: ['cekset', 'resetset'], summary: 'Lihat / reset setelan grup' },
    ],
  },
  {
    key: 'info',
    code: '07',
    emoji: 'ℹ️',
    title: 'INFO & BANTUAN',
    categoryCmd: 'menuinfo',
    categoryDesc: '(untuk menampilkan apa saja informasi & bantuan)',
    keywords: [
      '7',
      '07',
      'info',
      'utilitas',
      'utility',
      'bot',
      'bantuan',
      'panel',
      'menuinfo',
      'menubantuan',
      'menuhelp',
    ],
    ids: ['menu', 'allmenu', 'owner', 'ping', 'panel'],
    compactRows: [
      { ids: ['menu'], argHint: '<1-7>', summary: 'Panduan detail per kategori' },
      { ids: ['allmenu'], summary: 'Daftar lengkap semua perintah' },
      { ids: ['owner', 'ping'], summary: 'Kontak owner & cek kecepatan' },
      { ids: ['panel'], summary: 'Link Web Panel jarak jauh (Owner)' },
    ],
  },
];

export interface BuildBotMenuOptions {
  prefix: string;
  botName: string;
  ownerName: string;
  ownerNumber?: string;
  ownerWebsite: string;
  stickerPackName: string;
  stickerAuthor: string;
  disabledCommands: string[];
  menuHeaderTemplate: string;
  menuFooterTemplate: string;
  query?: string;
  invokedAlias?: string;
  senderName?: string;
}

const MENU_DIVIDER = '─────────────────────────────';

export function buildBotMenuText(opts: BuildBotMenuOptions): string {
  const p = opts.prefix || '.';
  const cleanOwnerNumber =
    (opts.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(/[^0-9]/g, '') ||
    OFFICIAL_OWNER_NUMBER;
  const disabledSet = new Set(opts.disabledCommands || []);

  const isSuspensionLocked = (id: string) => {
    const canonical = id === 'allmenu' ? 'menu' : id;
    const found = COMMAND_CATALOG.find((c) => c.id === canonical);
    return Boolean(found?.suspensionRisk);
  };

  const isEnabled = (id: string) => {
    const canonical = id === 'allmenu' ? 'menu' : id;
    if (isSuspensionLocked(canonical)) return false;
    return !disabledSet.has(canonical);
  };

  const normalizedAlias = (opts.invokedAlias || '')
    .trim()
    .toLowerCase()
    .replace(new RegExp(`^\\${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');

  const normalizedQuery = (opts.query || '')
    .trim()
    .toLowerCase()
    .replace(new RegExp(`^\\${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');

  const wantsFullList =
    normalizedAlias === 'allmenu' ||
    ['all', 'semua', 'lengkap', 'full', 'allmenu'].includes(normalizedQuery);

  // 1. Full detailed catalog (.allmenu / .menu all)
  if (wantsFullList) {
    const lines: string[] = [];
    for (let i = 0; i < MENU_SECTIONS.length; i++) {
      const sec = MENU_SECTIONS[i];
      lines.push(MENU_DIVIDER);
      lines.push(`${sec.emoji} *${sec.code} · ${sec.title}*`);
      lines.push(MENU_DIVIDER);
      for (const row of sec.compactRows) {
        const cmdLabels = row.ids.map((id) => `*${p}${id}*`).join(' / ');
        const argPart = row.argHint ? ` ${row.argHint}` : '';
        lines.push(`• ${cmdLabels}${argPart} — ${row.summary}`);
      }
      if (i < MENU_SECTIONS.length - 1) {
        lines.push('');
      }
    }
    lines.push(MENU_DIVIDER);
    lines.push(`_Ketik *${p}menu <1-7>* untuk melihat detail kategori._`);
    lines.push(`_Ketik *${p}owner* untuk menghubungi pengembang._`);
    return lines.join('\n');
  }

  // 2. Specific category request (e.g. .menudownload, .menustiker, .menu 1, .menu download)
  const matchedSection = MENU_SECTIONS.find(
    (sec) =>
      sec.categoryCmd.toLowerCase() === normalizedAlias ||
      sec.keywords.includes(normalizedAlias) ||
      (normalizedQuery && sec.keywords.includes(normalizedQuery))
  );

  if (matchedSection && (normalizedQuery || normalizedAlias !== 'menu')) {
    const lines: string[] = [
      MENU_DIVIDER,
      `${matchedSection.emoji} *${matchedSection.code} · ${matchedSection.title}*`,
      MENU_DIVIDER,
    ];
    for (const row of matchedSection.compactRows) {
      const cmdLabels = row.ids.map((id) => `*${p}${id}*`).join(' / ');
      const argPart = row.argHint ? ` ${row.argHint}` : '';
      lines.push(`• ${cmdLabels}${argPart} — ${row.summary}`);
    }
    lines.push(MENU_DIVIDER);
    lines.push(`_Ketik *${p}menu* untuk kembali ke daftar kategori._`);
    lines.push(`_Ketik *${p}allmenu* untuk melihat seluruh perintah._`);
    return lines.join('\n');
  }

  // 3. Single-command detail card (e.g. .menu qc, .menu hdsw)
  if (normalizedQuery) {
    const matchedCmd = COMMAND_CATALOG.find(
      (c) => c.id === normalizedQuery || c.aliases.includes(normalizedQuery)
    );

    if (matchedCmd) {
      const meta = COMPACT_COMMAND_META[matchedCmd.id];
      const aliasList =
        matchedCmd.aliases.length > 0
          ? matchedCmd.aliases.map((a) => `${p}${a}`).join(', ')
          : '-';
      const scopeLabel = matchedCmd.groupOnly
        ? 'Khusus Grup WhatsApp'
        : 'Chat Pribadi & Grup';
      const statusLabel = matchedCmd.suspensionRisk
        ? 'Dikunci (Proteksi Anti-Suspend Grup)'
        : isEnabled(matchedCmd.id)
        ? 'Aktif'
        : 'Nonaktif';

      return [
        MENU_DIVIDER,
        `*Detail Perintah · ${p}${matchedCmd.id}*`,
        MENU_DIVIDER,
        `• *Fungsi:* ${matchedCmd.description}`,
        `• *Format:* *${p}${matchedCmd.usage}*`,
        `• *Contoh:* *${p}${meta?.compactExample || matchedCmd.example}*`,
        `• *Alias:* ${aliasList}`,
        `• *Ruang:* ${scopeLabel}`,
        `• *Status:* ${statusLabel}`,
        MENU_DIVIDER,
        `_Ketik *${p}menu* untuk kembali ke daftar kategori._`,
        `_Ketik *${p}allmenu* untuk melihat seluruh perintah._`,
      ].join('\n');
    }

    // Fallback if query not recognized
    return [
      MENU_DIVIDER,
      `Kategori atau fitur *${opts.query?.trim()}* tidak ditemukan.`,
      MENU_DIVIDER,
      `*Daftar Kategori:*`,
      ...MENU_SECTIONS.map(
        (sec, idx) => `${idx + 1}. *${p}${sec.categoryCmd}* ${sec.categoryDesc}`
      ),
      MENU_DIVIDER,
      `_Ketik *${p}allmenu* untuk melihat semua perintah._`,
    ].join('\n');
  }

  // 4. Default Clean & Tidy Category Overview (.menu)
  const botTitle = (opts.botName || 'WABOT').toUpperCase();
  const lines: string[] = [
    MENU_DIVIDER,
    `📂 *KATEGORI MENU ${botTitle}*`,
    MENU_DIVIDER,
    `Silakan pilih dan ketik perintah kategori di bawah:`,
    '',
  ];

  MENU_SECTIONS.forEach((sec, idx) => {
    lines.push(`${idx + 1}. *${p}${sec.categoryCmd}* ${sec.categoryDesc}`);
  });

  lines.push('');
  lines.push(MENU_DIVIDER);
  lines.push(`💡 *Pilihan Pintasan:*`);
  lines.push(`• Ketik *${p}allmenu* — Tampilkan seluruh perintah sekaligus`);
  lines.push(`• Ketik *${p}menu <1-7>* — Contoh: *${p}menu 1* atau *${p}menu 2*`);
  lines.push(MENU_DIVIDER);
  lines.push(`_Ketik *${p}menu <1-7>* untuk melihat detail kategori._`);
  lines.push(`_Ketik *${p}owner* untuk menghubungi pengembang._`);

  return lines.join('\n');
}

const LEGACY_BRAND_REGEX = new RegExp(
  `${['ge', 'pa'].join('')}|gpcrnr`,
  'i'
);

export function hasLegacyIdentity(value?: string | null): boolean {
  if (!value) return false;
  return LEGACY_BRAND_REGEX.test(value);
}

export const CLEAN_DEFAULT_RULES: AutoResponderRule[] = [
  {
    id: 'rule-halo',
    trigger: 'halo',
    matchType: 'contains',
    replyText:
      'Halo {sender}! Ada yang bisa {botName} bantu hari ini? Ketik *{prefix}menu* untuk melihat seluruh fitur.',
    scope: 'all',
    enabled: true,
    hitCount: 0,
    createdAt: 1714500000000,
  },
  {
    id: 'rule-owner',
    trigger: 'owner',
    matchType: 'exact',
    replyText: `Kontak resmi Owner {botName}: https://wa.me/${OFFICIAL_OWNER_NUMBER} (${OFFICIAL_OWNER_DISPLAY})`,
    scope: 'all',
    enabled: true,
    hitCount: 0,
    createdAt: 1714500000000,
  },
];

export function sanitizeBotConfig(raw: BotConfig): {
  config: BotConfig;
  changed: boolean;
} {
  let changed = false;
  const rawAi = raw.aiEnhance || DEFAULT_AI_ENHANCE_CONFIG;
  const clampedFidelity = Number.isFinite(Number(rawAi.faceFidelity))
    ? Math.min(0.98, Math.max(0.05, Number(rawAi.faceFidelity)))
    : DEFAULT_AI_ENHANCE_CONFIG.faceFidelity;
  const clampedConcurrency = Number.isFinite(Number(rawAi.maxConcurrentJobs))
    ? Math.min(8, Math.max(1, Math.round(Number(rawAi.maxConcurrentJobs))))
    : DEFAULT_AI_ENHANCE_CONFIG.maxConcurrentJobs;
  const clampedQueue = Number.isFinite(Number(rawAi.maxQueueSize))
    ? Math.min(60, Math.max(1, Math.round(Number(rawAi.maxQueueSize))))
    : DEFAULT_AI_ENHANCE_CONFIG.maxQueueSize;
  const clampedTimeout = Number.isFinite(Number(rawAi.timeoutMs))
    ? Math.min(300000, Math.max(10000, Math.round(Number(rawAi.timeoutMs))))
    : DEFAULT_AI_ENHANCE_CONFIG.timeoutMs;
  const clampedMaxMb = Number.isFinite(Number(rawAi.maxFileSizeMb))
    ? Math.min(30, Math.max(1, Math.round(Number(rawAi.maxFileSizeMb))))
    : DEFAULT_AI_ENHANCE_CONFIG.maxFileSizeMb;

  const next: BotConfig = {
    ...raw,
    reactions: { ...DEFAULT_REACTIONS, ...(raw.reactions || {}) },
    templates: { ...DEFAULT_TEMPLATES, ...(raw.templates || {}) },
    groupSettings: {
      antilink: raw.groupSettings?.antilink ?? true,
      welcome: raw.groupSettings?.welcome ?? true,
      goodbye: raw.groupSettings?.goodbye ?? true,
    },
    groupOverrides: raw.groupOverrides ? { ...raw.groupOverrides } : {},
    antiBan: { ...raw.antiBan },
    aiEnhance: {
      serviceUrl: String(
        rawAi.serviceUrl ?? DEFAULT_AI_ENHANCE_CONFIG.serviceUrl
      )
        .trim()
        .replace(/\/+$/, ''),
      preferredFaceModel:
        rawAi.preferredFaceModel === 'gfpgan' ? 'gfpgan' : 'codeformer',
      faceFidelity: Math.round(clampedFidelity * 100) / 100,
      defaultScale: rawAi.defaultScale === 4 ? 4 : 2,
      autoDenoise: rawAi.autoDenoise ?? true,
      autoDeblur: rawAi.autoDeblur ?? true,
      sendProgressNotice: rawAi.sendProgressNotice ?? true,
      maxConcurrentJobs: clampedConcurrency,
      maxQueueSize: clampedQueue,
      timeoutMs: clampedTimeout,
      maxFileSizeMb: clampedMaxMb,
    },
    autoResponder: Array.isArray(raw.autoResponder)
      ? [...raw.autoResponder]
      : [...CLEAN_DEFAULT_RULES],
  };

  if (!next.botName?.trim() || hasLegacyIdentity(next.botName)) {
    next.botName = 'WABot';
    changed = true;
  }
  if (!next.ownerName?.trim() || hasLegacyIdentity(next.ownerName)) {
    next.ownerName = 'Owner Bot';
    changed = true;
  }
  if (!next.ownerWebsite?.trim() || hasLegacyIdentity(next.ownerWebsite)) {
    next.ownerWebsite = `wa.me/${OFFICIAL_OWNER_NUMBER}`;
    changed = true;
  }
  if (!next.stickerPackName?.trim() || hasLegacyIdentity(next.stickerPackName)) {
    next.stickerPackName = 'WA Sticker';
    changed = true;
  }
  if (!next.stickerAuthor?.trim() || hasLegacyIdentity(next.stickerAuthor)) {
    next.stickerAuthor = OFFICIAL_OWNER_NUMBER;
    changed = true;
  }

  const cleanOwnerDigits = (next.antiBan?.ownerNumber || '').replace(
    /[^0-9]/g,
    ''
  );
  if (
    !cleanOwnerDigits ||
    cleanOwnerDigits === '628129000111' ||
    hasLegacyIdentity(next.antiBan?.ownerNumber)
  ) {
    next.antiBan = {
      ...next.antiBan,
      ownerNumber: OFFICIAL_OWNER_NUMBER,
    };
    changed = true;
  }

  if (hasLegacyIdentity(next.antiBan?.callRejectNotice)) {
    next.antiBan = {
      ...next.antiBan,
      callRejectNotice:
        'Maaf, bot ini berjalan secara otomatis dan tidak menerima panggilan telepon atau video WhatsApp.',
    };
    changed = true;
  }

  const templateKeys = Object.keys(DEFAULT_TEMPLATES) as Array<
    keyof BotReplyTemplates
  >;
  for (const key of templateKeys) {
    const val = next.templates[key];
    const isOldVerboseTemplate =
      (key === 'menuHeader' && val?.includes('Pack Stiker: *{packName}*')) ||
      (key === 'menuFooter' && val?.includes('Dibuat untuk ekosistem')) ||
      (key === 'pingReply' && val?.includes('Pack Stiker: *{packName}*'));
    if (!val || hasLegacyIdentity(val) || isOldVerboseTemplate) {
      next.templates[key] = DEFAULT_TEMPLATES[key];
      changed = true;
    }
  }

  if (next.groupOverrides) {
    const cleanedOverrides: Record<string, GroupCustomConfig> = {};
    for (const [gid, ov] of Object.entries(next.groupOverrides)) {
      if (!ov) continue;
      const ovTemplates = { ...(ov.templates || {}) };
      for (const [tKey, tVal] of Object.entries(ovTemplates)) {
        if (hasLegacyIdentity(tVal)) {
          delete ovTemplates[tKey as GroupEditableTemplateKey];
          changed = true;
        }
      }
      cleanedOverrides[gid] = {
        ...ov,
        templates: ovTemplates,
      };
    }
    next.groupOverrides = cleanedOverrides;
  }

  const filteredRules = (next.autoResponder || []).filter(
    (r) => !hasLegacyIdentity(r.trigger) && !hasLegacyIdentity(r.replyText)
  );
  if (filteredRules.length !== (next.autoResponder || []).length) {
    const hasOwnerRule = filteredRules.some((r) => r.trigger === 'owner');
    next.autoResponder = hasOwnerRule
      ? filteredRules
      : [...filteredRules, CLEAN_DEFAULT_RULES[1]];
    changed = true;
  }

  return { config: next, changed };
}

export function sanitizeGroupState(raw?: GroupSimulatorState): GroupSimulatorState {
  if (
    !raw ||
    hasLegacyIdentity(raw.subject) ||
    hasLegacyIdentity(raw.description) ||
    hasLegacyIdentity(raw.inviteCode)
  ) {
    return {
      subject: 'Ruang Diskusi Komunitas',
      description:
        'Ruang diskusi komunitas & berbagi media. Dilarang mengirim spam tautan.',
      isAnnouncementOnly: raw?.isAnnouncementOnly ?? false,
      inviteCode: 'Komunitas2026Official',
    };
  }
  return raw;
}

export function sanitizeGroupMembers(
  members?: SimulatorMember[]
): SimulatorMember[] {
  if (!Array.isArray(members)) return [];
  return members.map((m) => {
    if (m.phone === '628129000111' || hasLegacyIdentity(m.name)) {
      return {
        jid: `${OFFICIAL_OWNER_NUMBER}@s.whatsapp.net`,
        name: 'Owner Bot',
        phone: OFFICIAL_OWNER_NUMBER,
        isAdmin: true,
      };
    }
    return m;
  });
}

export function sanitizeSimulatorMessage(
  msg: SimulatorMessage
): SimulatorMessage {
  let next = msg;
  if (msg.id === 'msg-welcome-private' && hasLegacyIdentity(msg.text)) {
    next = {
      ...next,
      senderName: 'WABot',
      text: 'Halo! Selamat datang di ruang uji WABot.\n\nKetik *.menu* untuk melihat daftar perintah yang sudah dirapikan, *.owner* untuk info kontak owner, kirim dokumen foto/video dengan *.hdsw* agar jadi media ukuran asli siap diteruskan ke Status WA, atau uji *.tt <link tiktok>* dan *.qc*.',
    };
  } else if (msg.id === 'msg-welcome-group' && hasLegacyIdentity(msg.text)) {
    next = {
      ...next,
      senderName: 'WABot',
      text: 'Grup *Ruang Diskusi Komunitas* aktif.\nAdmin & Owner dapat mengelola grup serta menguji fitur stiker, perkakas media (*.hdsw*, *.rvo*, *.toptv*), maupun moderasi *.kick*, *.promote*, dan *.demote*.',
    };
  }

  if (hasLegacyIdentity(next.senderName)) {
    next = {
      ...next,
      senderName: next.sender === 'bot' ? 'WABot' : 'Kamu (Owner)',
    };
  }

  if (
    next.media?.packInfo &&
    (hasLegacyIdentity(next.media.packInfo.pack) ||
      hasLegacyIdentity(next.media.packInfo.author))
  ) {
    next = {
      ...next,
      media: {
        ...next.media,
        packInfo: {
          pack: 'WA Sticker',
          author: OFFICIAL_OWNER_NUMBER,
        },
      },
    };
  }

  return next;
}

export function sanitizeLogs(
  logs?: CommandExecutionLog[]
): CommandExecutionLog[] {
  if (!Array.isArray(logs)) return [];
  const cleaned: CommandExecutionLog[] = [];
  for (const entry of logs) {
    if (hasLegacyIdentity(entry.summary)) continue;
    if (hasLegacyIdentity(entry.sender)) {
      cleaned.push({ ...entry, sender: 'Kamu (Owner)' });
    } else {
      cleaned.push(entry);
    }
  }
  return cleaned;
}

export function sanitizeServerSnapshot(snap: ServerStateSnapshot): {
  snapshot: ServerStateSnapshot;
  configChanged: boolean;
} {
  const { config, changed: configChanged } = sanitizeBotConfig(snap.config);
  const waState =
    snap.waState?.connectedUser &&
    hasLegacyIdentity(snap.waState.connectedUser.name)
      ? {
          ...snap.waState,
          connectedUser: {
            ...snap.waState.connectedUser,
            name: config.botName,
          },
        }
      : snap.waState;

  return {
    configChanged,
    snapshot: {
      ...snap,
      waState,
      config,
      simulatorMessages: (snap.simulatorMessages || []).map(
        sanitizeSimulatorMessage
      ),
      logs: sanitizeLogs(snap.logs),
      groupMembers: sanitizeGroupMembers(snap.groupMembers),
      groupState: sanitizeGroupState(snap.groupState),
    },
  };
}

