import type {
  BotReactionConfig,
  BotReplyTemplates,
  CommandDefinition,
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

export const SUSPENSION_RISK_DISABLED_REPLY =
  'fitur dinonaktifkan karena berpotensi grup ditangguhkan';

export const DEFAULT_TEMPLATES: BotReplyTemplates = {
  menuHeader:
    '*{botName}*\nPrefix: *{prefix}*  ·  Fitur Aktif: *{totalCommands}*\nOwner: *wa.me/{ownerNumber}*',
  menuFooter:
    '_Ketik {prefix}menu <1-7> untuk detail kategori · {prefix}owner kontak owner_',
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
      'Download rangkaian album foto slide TikTok resolusi jernih beserta audio latarnya secara berjeda aman.',
    example: 'ttslide https://www.tiktok.com/@tiktok/video/7106594312292453675',
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
    id: 'meme',
    aliases: ['smeme', 'memesticker'],
    category: 'sticker',
    usage: 'meme <teks atas> | <teks bawah>',
    description:
      'Tambahkan teks meme tebal atas & bawah pada foto lalu jadikan stiker WebP.',
    example: 'meme niatnya tidur cepat | malah scroll tiktok jam 3 pagi',
    requiresMedia: true,
    mediaKindHint: 'image',
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
    usage: 'wm <pack> | <author> (reply stiker)',
    description:
      'Ganti nama Pack & Author (EXIF) pada stiker statis maupun stiker bergerak yang di-reply.',
    example: 'wm Koleksi Stiker | 6289673533963',
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
    aliases: ['remini', 'upscale', 'jernih', 'hdr'],
    category: 'media',
    usage: 'hd (kirim/reply foto)',
    description:
      'Pertajam detail dan tingkatkan resolusi foto 2× lipat dengan pemrosesan Lanczos3 + Unsharp Mask.',
    example: 'hd',
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
      'Dinonaktifkan otomatis karena mention massal tersembunyi ke seluruh member memicu deteksi spam & penangguhan grup WhatsApp.',
    example: 'hidetag Jangan lupa kumpul komunitas malam ini jam 20.00 WIB!',
    groupOnly: true,
    suspensionRisk: true,
  },
  {
    id: 'tagall',
    aliases: ['everyone', 'mentionall'],
    category: 'group',
    usage: 'tagall <pesan>',
    description:
      'Dinonaktifkan otomatis karena mention massal seluruh anggota berisiko tinggi menyebabkan grup ditangguhkan WhatsApp.',
    example: 'tagall Absen hadir anggota komunitas',
    groupOnly: true,
    suspensionRisk: true,
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
    aliases: ['help', 'allmenu', 'fitur'],
    category: 'utility',
    usage: 'menu [kategori / fitur]',
    description:
      'Tampilkan ringkasan menu rapi, sub-menu kategori (1–7), atau panduan detail suatu command.',
    example: 'menu',
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
  meme: { shortUsage: 'meme <atas|bawah>', shortDesc: 'Stiker foto teks meme tebal' },
  emojimix: { shortUsage: 'emojimix 😀+😎', shortDesc: 'Gabung 2 emoji jadi stiker' },
  wm: { shortUsage: 'wm <pack|author>', shortDesc: 'Ganti nama pack/author stiker' },
  toimg: { shortUsage: 'toimg', shortDesc: 'Ubah stiker kembali jadi foto' },
  tovid: { shortUsage: 'tovid', shortDesc: 'Ubah stiker gerak jadi video MP4' },
  hdsw: { shortUsage: 'hdsw', shortDesc: 'Dokumen asli ke Status HD (Grup/PC)' },
  hd: { shortUsage: 'hd', shortDesc: 'Pertajam & upscale resolusi foto 2×' },
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
  hidetag: { shortUsage: 'hidetag <pesan>', shortDesc: 'Dikunci cegah suspend grup' },
  tagall: { shortUsage: 'tagall <pesan>', shortDesc: 'Dikunci cegah suspend grup' },
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
};

interface CompactMenuRow {
  ids: string[];
  argHint?: string;
  summary: string;
}

export interface MenuSectionSpec {
  key: 'downloader' | 'stiker' | 'media' | 'audio' | 'grup' | 'set' | 'info';
  code: string;
  title: string;
  keywords: string[];
  ids: string[];
  compactRows: CompactMenuRow[];
}

export const MENU_SECTIONS: MenuSectionSpec[] = [
  {
    key: 'downloader',
    code: '01',
    title: 'DOWNLOADER',
    keywords: ['1', '01', 'dl', 'download', 'downloader', 'unduh', 'sosmed'],
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
    title: 'STUDIO STIKER',
    keywords: ['2', '02', 'stiker', 'sticker', 'maker', 'brat', 'qc'],
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
      'meme',
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
      { ids: ['meme', 'emojimix'], summary: 'Stiker meme & mix 2 emoji' },
      { ids: ['wm', 'toimg', 'tovid'], summary: 'Ubah EXIF & konversi stiker' },
    ],
  },
  {
    key: 'media',
    code: '03',
    title: 'PERKAKAS MEDIA',
    keywords: ['3', '03', 'media', 'tools', 'hd', 'sw', 'hdsw', 'foto'],
    ids: ['hdsw', 'hd', 'rvo', 'toptv', 'hitamkan', 'imgedit', 'tourl', 'qrcode'],
    compactRows: [
      { ids: ['hdsw'], summary: 'Dokumen ke Status HD (Grup & PC)' },
      { ids: ['hd', 'hitamkan'], summary: 'Upscale foto 2× & hitam-putih' },
      { ids: ['imgedit'], summary: 'Filter blur, invert, mirror, sepia' },
      { ids: ['rvo', 'toptv'], summary: 'Buka ViewOnce & video bulat PTV' },
      { ids: ['tourl', 'qrcode'], summary: 'Link media publik & kode QR' },
    ],
  },
  {
    key: 'audio',
    code: '04',
    title: 'AUDIO & MUSIK',
    keywords: ['4', '04', 'audio', 'musik', 'music', 'vn', 'sound', 'efek'],
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
    title: 'ADMIN GRUP',
    keywords: ['5', '05', 'grup', 'group', 'admin', 'moderasi', 'mod', 'gc'],
    ids: [
      'kick',
      'promote',
      'demote',
      'group',
      'setname',
      'setdesc',
      'linkgc',
      'revoke',
      'add',
      'hidetag',
      'tagall',
    ],
    compactRows: [
      { ids: ['kick', 'promote', 'demote'], summary: 'Kelola anggota & admin' },
      { ids: ['group'], argHint: 'open|close', summary: 'Buka / kunci chat grup' },
      { ids: ['setname', 'setdesc'], summary: 'Ubah nama & deskripsi grup' },
      { ids: ['linkgc', 'revoke'], summary: 'Ambil / reset tautan grup' },
    ],
  },
  {
    key: 'set',
    code: '06',
    title: 'OTOMASI GRUP',
    keywords: ['6', '06', 'set', 'teks', 'custom', 'otomasi', 'setting', 'sambutan'],
    ids: [
      'welcome',
      'out',
      'antilink',
      'setwelcome',
      'setout',
      'setpromote',
      'setdemote',
      'setopen',
      'setclose',
      'setantilink',
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
    title: 'INFO & BANTUAN',
    keywords: ['7', '07', 'info', 'utilitas', 'utility', 'bot', 'bantuan'],
    ids: ['menu', 'owner', 'ping'],
    compactRows: [
      { ids: ['menu'], argHint: '<1-7>', summary: 'Panduan detail per kategori' },
      { ids: ['allmenu'], summary: 'Daftar lengkap semua perintah' },
      { ids: ['owner', 'ping'], summary: 'Kontak owner & cek kecepatan' },
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

const MENU_DIVIDER = '────────────────────';

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

  const totalActive = COMMAND_CATALOG.filter(
    (c) => !c.suspensionRisk && !disabledSet.has(c.id)
  ).length;

  const templateVars = {
    botName: opts.botName,
    ownerName: opts.ownerName,
    ownerNumber: cleanOwnerNumber,
    ownerDisplay: formatPhoneDisplay(cleanOwnerNumber),
    prefix: p,
    packName: opts.stickerPackName,
    authorName: opts.stickerAuthor,
    website: opts.ownerWebsite || `wa.me/${cleanOwnerNumber}`,
    totalCommands: totalActive,
    sender: opts.senderName || 'Pengguna',
  };

  const header = renderBotTemplate(opts.menuHeaderTemplate, templateVars).trim();
  const footer = renderBotTemplate(opts.menuFooterTemplate, templateVars).trim();

  const normalizedQuery = (opts.query || '')
    .trim()
    .toLowerCase()
    .replace(new RegExp(`^\\${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');

  const wantsFullList =
    opts.invokedAlias === 'allmenu' ||
    ['all', 'semua', 'lengkap', 'full', 'allmenu'].includes(normalizedQuery);

  // 1. Sub-menu by category (.menu 1, .menu downloader, etc.)
  if (!wantsFullList && normalizedQuery) {
    const matchedSection = MENU_SECTIONS.find((sec) =>
      sec.keywords.includes(normalizedQuery)
    );

    if (matchedSection) {
      const lines: string[] = [
        `*${opts.botName}* · Kategori ${matchedSection.code}`,
        `*${matchedSection.title}*`,
        MENU_DIVIDER,
      ];

      for (const id of matchedSection.ids) {
        const cmd = COMMAND_CATALOG.find((c) => c.id === id);
        if (!cmd) continue;
        const meta = COMPACT_COMMAND_META[id];
        const statusNote = cmd.suspensionRisk
          ? ' _(dikunci aman)_'
          : isEnabled(id)
          ? ''
          : ' _(nonaktif)_';
        const aliasText =
          cmd.aliases.length > 0
            ? ` · alias: ${cmd.aliases
                .slice(0, 3)
                .map((a) => `${p}${a}`)
                .join(', ')}`
            : '';
        const exampleText = meta?.compactExample || cmd.example;

        lines.push(`• *${p}${meta?.shortUsage || cmd.usage}*${statusNote}`);
        lines.push(`  ${cmd.description}`);
        if (!cmd.suspensionRisk) {
          lines.push(`  _Contoh: ${p}${exampleText}${aliasText}_`);
        }
        lines.push('');
      }

      if (matchedSection.key === 'grup') {
        lines.push(`*Catatan Keamanan Grup:*`);
        lines.push(`• Gunakan *${p}linkgc* untuk mengundang anggota baru.`);
        lines.push(
          `• Gunakan *${p}group close* untuk pengumuman penting tanpa spam tag.`
        );
        lines.push('');
      }

      if (matchedSection.key === 'set') {
        lines.push(`*Variabel Otomatis:*`);
        lines.push(`• *@user* / *@sender* — Mention anggota`);
        lines.push(`• *@group* — Nama grup WhatsApp`);
        lines.push('');
      }

      if (lines[lines.length - 1] === '') {
        lines.pop();
      }
      lines.push(MENU_DIVIDER);
      lines.push(`_Ketik ${p}menu untuk kembali ke menu utama._`);
      return lines.join('\n');
    }

    // 2. Single-command detail card (.menu qc, .menu hdsw, etc.)
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
        `*Detail Perintah · ${p}${matchedCmd.id}*`,
        MENU_DIVIDER,
        `• *Fungsi:* ${matchedCmd.description}`,
        `• *Format:* *${p}${matchedCmd.usage}*`,
        `• *Contoh:* *${p}${meta?.compactExample || matchedCmd.example}*`,
        `• *Alias:* ${aliasList}`,
        `• *Ruang:* ${scopeLabel}`,
        `• *Status:* ${statusLabel}`,
        MENU_DIVIDER,
        `_Ketik ${p}menu untuk kembali ke daftar utama._`,
      ].join('\n');
    }

    // 3. Unknown sub-menu filter fallback
    return [
      `Kategori atau fitur *${opts.query?.trim()}* tidak ditemukan.`,
      '',
      `*Daftar Kategori ${opts.botName}:*`,
      `• *${p}menu 1* — Downloader Sosmed`,
      `• *${p}menu 2* — Studio Stiker`,
      `• *${p}menu 3* — Perkakas Media & Status HD`,
      `• *${p}menu 4* — Audio & Efek Suara`,
      `• *${p}menu 5* — Admin Grup`,
      `• *${p}menu 6* — Otomasi & Teks Grup`,
      `• *${p}menu 7* — Info & Kontak Owner`,
      `• *${p}allmenu* — Daftar lengkap semua fitur`,
    ].join('\n');
  }

  // 4. Full unpaired list (.allmenu / .menu all)
  if (wantsFullList) {
    const lines: string[] = [];
    if (header) {
      lines.push(header);
      lines.push(MENU_DIVIDER);
    }

    for (const sec of MENU_SECTIONS) {
      lines.push(`*${sec.code} · ${sec.title}*`);
      for (const id of sec.ids) {
        const cmd = COMMAND_CATALOG.find((c) => c.id === id);
        if (!cmd || cmd.suspensionRisk) continue;
        const meta = COMPACT_COMMAND_META[id];
        const statusNote = isEnabled(id) ? '' : ' _(off)_';
        lines.push(
          `• *${p}${meta?.shortUsage || cmd.usage}* — ${
            meta?.shortDesc || cmd.description
          }${statusNote}`
        );
      }
      lines.push('');
    }

    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push(MENU_DIVIDER);
    lines.push(`_Ketik ${p}menu <nama_fitur> untuk contoh & alias lengkap._`);
    if (footer) {
      lines.push(footer);
    }
    return lines.join('\n');
  }

  // 5. Default Clean & Tidy Overview (.menu)
  const lines: string[] = [];
  if (header) {
    lines.push(header);
    lines.push(MENU_DIVIDER);
  }

  for (const sec of MENU_SECTIONS) {
    const visibleRows = sec.compactRows.filter((row) =>
      row.ids.some((id) => !isSuspensionLocked(id))
    );
    if (visibleRows.length === 0) continue;

    lines.push(`*${sec.code} · ${sec.title}*`);
    for (const row of visibleRows) {
      const activeIds = row.ids.filter((id) => !isSuspensionLocked(id));
      const allDisabled = activeIds.every((id) => !isEnabled(id));
      const cmdLabels = activeIds
        .map((id) => {
          const singleOff = !allDisabled && !isEnabled(id);
          return singleOff ? `*${p}${id}* _(off)_` : `*${p}${id}*`;
        })
        .join(' / ');
      const argPart = row.argHint ? ` ${row.argHint}` : '';
      const rowOffSuffix = allDisabled ? ' _(nonaktif)_' : '';
      lines.push(`• ${cmdLabels}${argPart} — ${row.summary}${rowOffSuffix}`);
    }
    lines.push('');
  }

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push(MENU_DIVIDER);
  if (footer) {
    lines.push(footer);
  }

  return lines.join('\n');
}
