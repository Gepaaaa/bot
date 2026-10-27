import type {
  BotReactionConfig,
  BotReplyTemplates,
  CommandDefinition,
} from './types.ts';

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
    '*{botName}* — {ownerName}\nAwalan aktif: *{prefix}* · Pack Stiker: *{packName}*',
  menuFooter: '_Dibuat untuk ekosistem {website}_',
  downloaderCaption:
    '*Unduhan Selesai ({platform})*\nJudul: {title}\nKreator: {author}\nDurasi: {duration}',
  audioCaption:
    '*Audio MP3 Berhasil Diekstrak*\nJudul: {title}\nSumber: {author}',
  stickerReply: 'Stiker berhasil dibuat ({packName} · {authorName})',
  stickerMissingMedia:
    'Kirim foto dengan caption *{prefix}s* atau balas (reply) foto dengan *{prefix}s* untuk dijadikan stiker.',
  hdswCaption:
    '*Media HD Siap Status WA*\nFormat asli tanpa kompresi ({mediaKind} · {fileSize}) — tinggal tekan *Teruskan (Forward)* ke *Status Saya*.',
  hdswGroupConfirm:
    'Media HD ukuran asli (*{fileName}* · {fileSize}) sudah dikirim ke *Chat Pribadi* kamu, *@{sender}*! Buka chat pribadi dengan *{botName}* lalu tinggal teruskan ke Status WA.',
  pingReply:
    '*{botName} Aktif*\nKecepatan respons: *{latency} ms*\nMasa aktif mesin: *{uptime}*\nAwalan perintah: *{prefix}*\nPack Stiker: *{packName}* ({authorName})',
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
    'Selamat datang *@{target}* di *{groupName}*! Ketik *{prefix}menu* untuk melihat fitur *{botName}*.',
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

  // Support convenient @user, @sender, @group, @subject shorthands used by WA group admins
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
  {
    id: 'hdsw',
    aliases: ['sw', 'tosw', 'hdstatus', 'swori'],
    category: 'utility',
    usage: 'hdsw (kirim/reply dokumen foto/video)',
    description:
      'Ubah file Dokumen foto/video ukuran asli (tanpa kompresi WA) menjadi chat media WA Web di chat pribadi agar siap diteruskan jernih ke Status WA.',
    example: 'hdsw',
    requiresMedia: true,
  },
  {
    id: 'tt',
    aliases: ['tiktok', 'ttdl', 'vt'],
    category: 'downloader',
    usage: 'tt <link tiktok>',
    description:
      'Download video TikTok kualitas HD tanpa watermark langsung dari link.',
    example: 'tt https://www.tiktok.com/@tiktok/video/7106594312292453675',
  },
  {
    id: 'ig',
    aliases: ['instagram', 'igdl', 'reels'],
    category: 'downloader',
    usage: 'ig <link instagram>',
    description:
      'Download video Instagram Reels atau postingan publik dari tautan.',
    example: 'ig https://www.instagram.com/reel/C8xYzExample/',
  },
  {
    id: 'yt',
    aliases: ['youtube', 'ytmp4', 'shorts'],
    category: 'downloader',
    usage: 'yt <link youtube>',
    description: 'Ambil video atau informasi YouTube Shorts & video reguler.',
    example: 'yt https://www.youtube.com/watch?v=jNQXAC9IVRw',
  },
  {
    id: 'mp3',
    aliases: ['ttmp3', 'ytmp3', 'audio', 'musik'],
    category: 'audio',
    usage: 'mp3 <link video sosmed>',
    description:
      'Ekstrak audio MP3 jernih langsung dari link video TikTok atau sosmed.',
    example: 'mp3 https://www.tiktok.com/@tiktok/video/7106594312292453675',
  },
  {
    id: 's',
    aliases: ['stiker', 'sticker', 'sgif'],
    category: 'sticker',
    usage: 's (kirim/reply foto)',
    description:
      'Ubah gambar atau foto yang dikirim/di-reply menjadi stiker WebP 512×512 resmi.',
    example: 's',
    requiresMedia: true,
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
    description: 'Buat stiker teks otomatis gaya Brat versi latar putih bersih.',
    example: 'bratwhite ngopi di gepa corner',
  },
  {
    id: 'meme',
    aliases: ['smeme', 'memesticker'],
    category: 'sticker',
    usage: 'meme <teks atas> | <teks bawah>',
    description:
      'Tambahkan teks meme tebal atas & bawah pada foto lalu jadikan stiker WebP.',
    example: 'meme niatnya tidur cepat | malah scroll tiktok jam 3 pagi',
  },
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
    description: 'Buka grup agar semua anggota bisa chat atau kunci khusus Admin.',
    example: 'group close',
    groupOnly: true,
  },
  {
    id: 'setname',
    aliases: ['setsubject', 'namagrup'],
    category: 'group',
    usage: 'setname <nama baru>',
    description: 'Ganti nama/judul grup WhatsApp secara langsung.',
    example: 'setname Gepa Corner Official',
    groupOnly: true,
  },
  {
    id: 'setdesc',
    aliases: ['deskripsi', 'setdeskripsi'],
    category: 'group',
    usage: 'setdesc <teks deskripsi>',
    description: 'Perbarui teks deskripsi aturan atau informasi grup.',
    example:
      'setdesc Ruang diskusi santai anggota Gepa Corner. Dilarang spam link.',
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
    example: 'tagall Absen hadir anggota Gepa Corner',
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
    example: 'setout Sampai jumpa *@user*, semoga sukses selalu di luar *@group*!',
    groupOnly: true,
  },
  {
    id: 'setpromote',
    aliases: ['ubahpromote'],
    category: 'group',
    usage: 'setpromote <teks>',
    description:
      'Ubah teks pengumuman saat anggota diangkat jadi Admin di grup ini.',
    example: 'setpromote Mantap *@user* sekarang resmi jadi Admin di *@group*!',
    groupOnly: true,
  },
  {
    id: 'setdemote',
    aliases: ['ubahdemote'],
    category: 'group',
    usage: 'setdemote <teks>',
    description:
      'Ubah teks pengumuman saat jabatan Admin dicabut di grup ini.',
    example: 'setdemote Terima kasih *@user*, kini kembali jadi anggota biasa di *@group*.',
    groupOnly: true,
  },
  {
    id: 'setantilink',
    aliases: ['setwarn', 'ubahantilink'],
    category: 'group',
    usage: 'setantilink <teks>',
    description:
      'Ubah teks peringatan otomatis saat bot menghapus link dari non-admin di grup ini.',
    example: 'setantilink Ups *@sender*, dilarang sebar link promosi di *@group* ya!',
    groupOnly: true,
  },
  {
    id: 'setopen',
    aliases: ['ubahopen'],
    category: 'group',
    usage: 'setopen <teks>',
    description: 'Ubah teks pengumuman saat Admin membuka chat grup (.group open).',
    example: 'setopen Grup *@group* sudah dibuka! Silakan berdiskusi dengan sopan.',
    groupOnly: true,
  },
  {
    id: 'setclose',
    aliases: ['ubahclose'],
    category: 'group',
    usage: 'setclose <teks>',
    description: 'Ubah teks pengumuman saat Admin mengunci chat grup (.group close).',
    example: 'setclose Grup *@group* dikunci sementara khusus pengumuman Admin.',
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
  {
    id: 'menu',
    aliases: ['help', 'allmenu', 'fitur'],
    category: 'utility',
    usage: 'menu [kategori / fitur]',
    description:
      'Tampilkan daftar fitur ringkas, sub-menu kategori (media/stiker/grup/set), atau panduan detail suatu command.',
    example: 'menu',
  },
  {
    id: 'ping',
    aliases: ['info', 'status', 'speed'],
    category: 'utility',
    usage: 'ping',
    description:
      'Cek kecepatan respons bot, masa aktif sesi, dan identitas Gepa Corner.',
    example: 'ping',
  },
];

interface CompactCommandMeta {
  shortUsage: string;
  shortDesc: string;
  compactExample?: string;
}

const COMPACT_COMMAND_META: Record<string, CompactCommandMeta> = {
  hdsw: {
    shortUsage: 'hdsw',
    shortDesc: 'Dokumen asli jadi media Status HD',
    compactExample: 'hdsw (kirim/reply dokumen foto/video)',
  },
  tt: {
    shortUsage: 'tt <link>',
    shortDesc: 'Video TikTok HD tanpa watermark',
    compactExample: 'tt https://vt.tiktok.com/ZSexample/',
  },
  ig: {
    shortUsage: 'ig <link>',
    shortDesc: 'Video Reels & postingan Instagram',
    compactExample: 'ig https://instagram.com/reel/...',
  },
  yt: {
    shortUsage: 'yt <link>',
    shortDesc: 'Video YouTube & Shorts',
    compactExample: 'yt https://youtu.be/jNQXAC9IVRw',
  },
  mp3: {
    shortUsage: 'mp3 <link>',
    shortDesc: 'Ekstrak audio MP3 dari link video',
    compactExample: 'mp3 https://vt.tiktok.com/ZSexample/',
  },
  s: {
    shortUsage: 's',
    shortDesc: 'Ubah foto/gambar jadi stiker WebP',
    compactExample: 's (kirim/reply foto)',
  },
  brat: {
    shortUsage: 'brat <teks>',
    shortDesc: 'Stiker teks hijau limau khas Brat',
  },
  bratwhite: {
    shortUsage: 'bratwhite <teks>',
    shortDesc: 'Stiker teks Brat latar putih bersih',
  },
  meme: {
    shortUsage: 'meme <atas|bawah>',
    shortDesc: 'Stiker foto dengan teks meme tebal',
    compactExample: 'meme ekspresi tenang | deadline besok',
  },
  kick: {
    shortUsage: 'kick <@tag/reply>',
    shortDesc: 'Keluarkan anggota dari grup',
  },
  add: {
    shortUsage: 'add <nomor>',
    shortDesc: 'Tambah anggota ke grup via nomor',
  },
  promote: {
    shortUsage: 'promote <@tag/reply>',
    shortDesc: 'Angkat anggota jadi Admin Grup',
  },
  demote: {
    shortUsage: 'demote <@tag/reply>',
    shortDesc: 'Turunkan status Admin Grup',
  },
  group: {
    shortUsage: 'group <open|close>',
    shortDesc: 'Buka atau kunci ruang chat grup',
  },
  hidetag: {
    shortUsage: 'hidetag <pesan>',
    shortDesc: 'Pengumuman tag semua member senyap',
    compactExample: 'hidetag Kumpul malam ini jam 20.00 WIB',
  },
  tagall: {
    shortUsage: 'tagall <pesan>',
    shortDesc: 'Sebut seluruh anggota satu per satu',
  },
  setname: {
    shortUsage: 'setname <nama>',
    shortDesc: 'Ganti nama/judul grup WhatsApp',
  },
  setdesc: {
    shortUsage: 'setdesc <teks>',
    shortDesc: 'Perbarui deskripsi & aturan grup',
    compactExample: 'setdesc Grup diskusi santai Gepa Corner.',
  },
  linkgc: {
    shortUsage: 'linkgc',
    shortDesc: 'Ambil link undangan grup saat ini',
  },
  revoke: {
    shortUsage: 'revoke',
    shortDesc: 'Reset & hanguskan link grup lama',
  },
  welcome: {
    shortUsage: 'welcome <on|off>',
    shortDesc: 'Sambutan otomatis member masuk',
  },
  out: {
    shortUsage: 'out <on|off>',
    shortDesc: 'Pesan otomatis member keluar grup',
  },
  antilink: {
    shortUsage: 'antilink <on|off>',
    shortDesc: 'Hapus otomatis tautan non-admin',
  },
  setwelcome: {
    shortUsage: 'setwelcome <teks>',
    shortDesc: 'Edit teks sambutan member baru',
    compactExample: 'setwelcome Halo *@user*, selamat datang di *@group*!',
  },
  setout: {
    shortUsage: 'setout <teks>',
    shortDesc: 'Edit teks saat member keluar grup',
    compactExample: 'setout Sampai jumpa *@user* dari *@group*!',
  },
  setpromote: {
    shortUsage: 'setpromote <teks>',
    shortDesc: 'Edit pengumuman angkat Admin',
    compactExample: 'setpromote Selamat *@user* resmi jadi Admin!',
  },
  setdemote: {
    shortUsage: 'setdemote <teks>',
    shortDesc: 'Edit pengumuman cabut Admin',
    compactExample: 'setdemote Status admin *@user* telah dicabut.',
  },
  setopen: {
    shortUsage: 'setopen <teks>',
    shortDesc: 'Edit pengumuman grup dibuka',
    compactExample: 'setopen Grup *@group* telah dibuka kembali.',
  },
  setclose: {
    shortUsage: 'setclose <teks>',
    shortDesc: 'Edit pengumuman grup dikunci',
    compactExample: 'setclose Grup *@group* dikunci khusus Admin.',
  },
  setantilink: {
    shortUsage: 'setantilink <teks>',
    shortDesc: 'Edit peringatan hapus link grup',
    compactExample: 'setantilink Maaf *@sender*, dilarang kirim link!',
  },
  cekset: {
    shortUsage: 'cekset',
    shortDesc: 'Lihat status & teks custom grup',
  },
  resetset: {
    shortUsage: 'resetset',
    shortDesc: 'Kembalikan teks grup ke bawaan',
  },
  menu: {
    shortUsage: 'menu [kategori]',
    shortDesc: 'Ringkasan fitur & panduan detail',
  },
  ping: {
    shortUsage: 'ping',
    shortDesc: 'Cek kecepatan respons & status bot',
  },
};

interface CompactMenuRow {
  ids: string[];
  argHint?: string;
  summary: string;
}

interface MenuSectionSpec {
  key: 'media' | 'stiker' | 'grup' | 'set' | 'info';
  code: string;
  title: string;
  keywords: string[];
  ids: string[];
  compactRows: CompactMenuRow[];
}

const MENU_SECTIONS: MenuSectionSpec[] = [
  {
    key: 'media',
    code: '01',
    title: 'Media & Status HD',
    keywords: ['1', '01', 'media', 'download', 'downloader', 'unduh', 'audio', 'sosmed', 'sw'],
    ids: ['hdsw', 'tt', 'ig', 'yt', 'mp3'],
    compactRows: [
      { ids: ['hdsw'], summary: 'Dokumen asli jadi Status HD' },
      { ids: ['tt'], argHint: '<link>', summary: 'Video TikTok tanpa WM' },
      { ids: ['ig'], argHint: '<link>', summary: 'Video Reels & post IG' },
      { ids: ['yt'], argHint: '<link>', summary: 'Video YouTube & Shorts' },
      { ids: ['mp3'], argHint: '<link>', summary: 'Ambil audio MP3 sosmed' },
    ],
  },
  {
    key: 'stiker',
    code: '02',
    title: 'Studio Stiker',
    keywords: ['2', '02', 'stiker', 'sticker', 'brat', 'meme'],
    ids: ['s', 'brat', 'bratwhite', 'meme'],
    compactRows: [
      { ids: ['s'], summary: 'Foto jadi stiker WebP' },
      { ids: ['brat'], argHint: '<teks>', summary: 'Stiker teks hijau Brat' },
      { ids: ['bratwhite'], argHint: '<teks>', summary: 'Stiker teks putih Brat' },
      { ids: ['meme'], argHint: '<atas|bawah>', summary: 'Stiker foto teks meme' },
    ],
  },
  {
    key: 'grup',
    code: '03',
    title: 'Moderasi Admin Grup',
    keywords: ['3', '03', 'grup', 'group', 'admin', 'moderasi', 'mod', 'gc'],
    ids: [
      'kick',
      'add',
      'promote',
      'demote',
      'group',
      'hidetag',
      'tagall',
      'setname',
      'setdesc',
      'linkgc',
      'revoke',
    ],
    compactRows: [
      { ids: ['kick'], argHint: '<@tag/reply>', summary: 'Keluarkan anggota grup' },
      { ids: ['promote', 'demote'], summary: 'Atur jabatan admin grup' },
      { ids: ['group'], argHint: 'open|close', summary: 'Buka / kunci chat grup' },
      { ids: ['setname', 'setdesc'], summary: 'Ubah nama & deskripsi' },
      { ids: ['linkgc', 'revoke'], summary: 'Ambil / reset link grup' },
      { ids: ['add', 'hidetag', 'tagall'], summary: 'Dikunci cegah suspend grup' },
    ],
  },
  {
    key: 'set',
    code: '04',
    title: 'Otomasi & Teks Grup',
    keywords: ['4', '04', 'set', 'teks', 'custom', 'otomasi', 'setting', 'sambutan'],
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
      { ids: ['welcome', 'out'], argHint: 'on|off', summary: 'Sambutan masuk & keluar' },
      { ids: ['antilink'], argHint: 'on|off', summary: 'Hapus link non-admin' },
      { ids: ['setwelcome', 'setout'], summary: 'Edit teks masuk / keluar' },
      { ids: ['setpromote', 'setdemote'], summary: 'Edit teks jabatan admin' },
      { ids: ['setopen', 'setclose'], summary: 'Edit teks buka / kunci' },
      { ids: ['setantilink'], argHint: '<teks>', summary: 'Edit peringatan link' },
      { ids: ['cekset', 'resetset'], summary: 'Cek / reset teks grup' },
    ],
  },
  {
    key: 'info',
    code: '05',
    title: 'Info & Panduan Detail',
    keywords: ['5', '05', 'info', 'utilitas', 'utility', 'bot', 'bantuan'],
    ids: ['menu', 'ping'],
    compactRows: [
      { ids: ['menu'], argHint: '<media|stiker|grup|set>', summary: 'Detail per kategori' },
      { ids: ['allmenu', 'ping'], summary: 'Daftar penuh & cek respons' },
    ],
  },
];

export interface BuildBotMenuOptions {
  prefix: string;
  botName: string;
  ownerName: string;
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
    prefix: p,
    packName: opts.stickerPackName,
    authorName: opts.stickerAuthor,
    website: opts.ownerWebsite,
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

  // 1. Sub-menu by category (e.g. .menu media, .menu stiker, .menu grup, .menu set)
  if (!wantsFullList && normalizedQuery) {
    const matchedSection = MENU_SECTIONS.find((sec) =>
      sec.keywords.includes(normalizedQuery)
    );

    if (matchedSection) {
      const lines: string[] = [
        `*${opts.botName}* — Panduan Kategori`,
        `*${matchedSection.code}. ${matchedSection.title}*`,
        MENU_DIVIDER,
      ];

      for (const id of matchedSection.ids) {
        const cmd = COMMAND_CATALOG.find((c) => c.id === id);
        if (!cmd) continue;
        const meta = COMPACT_COMMAND_META[id];
        const statusNote = cmd.suspensionRisk
          ? ' _(nonaktif: cegah grup ditangguhkan)_'
          : isEnabled(id)
          ? ''
          : ' _(nonaktif)_';
        const aliasText =
          cmd.aliases.length > 0
            ? ` _(alias: ${cmd.aliases.slice(0, 3).map((a) => `${p}${a}`).join(', ')})_`
            : '';
        const exampleText = meta?.compactExample || cmd.example;

        lines.push(`▸ *${p}${meta?.shortUsage || cmd.usage}*${aliasText}${statusNote}`);
        lines.push(`  ${cmd.description}`);
        if (!cmd.suspensionRisk) {
          lines.push(`  Contoh: *${p}${exampleText}*`);
        }
        lines.push('');
      }

      if (matchedSection.key === 'grup') {
        lines.push(`*Tips Aman Anti-Suspend Grup:*`);
        lines.push(`◦ Undang member baru lewat *${p}linkgc* (bukan *${p}add*).`);
        lines.push(`◦ Untuk pengumuman penting, gunakan *${p}group close* tanpa mention massal.`);
        lines.push('');
      }

      if (matchedSection.key === 'set') {
        lines.push(`*Variabel Teks Otomatis Grup:*`);
        lines.push(`◦ *@user* / *@sender* — Mention anggota terkait`);
        lines.push(`◦ *@group* — Nama grup WhatsApp`);
        lines.push(`◦ Ketik *${p}setwelcome reset* (dll.) untuk kembali ke bawaan.`);
        lines.push('');
      }

      lines.push(MENU_DIVIDER);
      lines.push(`Ketik *${p}menu* untuk kembali ke ringkasan utama.`);
      return lines.join('\n');
    }

    // 2. Single-command detail card (e.g. .menu hdsw, .menu setwelcome, .menu kick)
    const matchedCmd = COMMAND_CATALOG.find(
      (c) => c.id === normalizedQuery || c.aliases.includes(normalizedQuery)
    );

    if (matchedCmd) {
      const meta = COMPACT_COMMAND_META[matchedCmd.id];
      const aliasList =
        matchedCmd.aliases.length > 0
          ? matchedCmd.aliases.map((a) => `${p}${a}`).join(', ')
          : 'Tidak ada';
      const scopeLabel = matchedCmd.groupOnly
        ? 'Khusus Grup WhatsApp'
        : 'Chat Pribadi & Grup';
      const statusLabel = matchedCmd.suspensionRisk
        ? 'Dinonaktifkan (berpotensi grup ditangguhkan)'
        : isEnabled(matchedCmd.id)
        ? 'Aktif'
        : 'Dinonaktifkan';

      return [
        `*Panduan Perintah: ${p}${matchedCmd.id}*`,
        MENU_DIVIDER,
        `◦ *Fungsi:* ${matchedCmd.description}`,
        `◦ *Format:* *${p}${matchedCmd.usage}*`,
        `◦ *Contoh:* *${p}${meta?.compactExample || matchedCmd.example}*`,
        `◦ *Alias:* ${aliasList}`,
        `◦ *Ruang:* ${scopeLabel}`,
        `◦ *Status:* ${statusLabel}`,
        MENU_DIVIDER,
        `Ketik *${p}menu* untuk kembali ke daftar fitur.`,
      ].join('\n');
    }

    // 3. Unknown sub-menu filter fallback
    return [
      `Sub-menu atau perintah *${opts.query?.trim()}* tidak ditemukan.`,
      '',
      `*Pilihan Sub-Menu ${opts.botName}:*`,
      `◦ *${p}menu media* — Status HD, TikTok, IG, YT, MP3`,
      `◦ *${p}menu stiker* — Stiker foto, Brat, & Meme`,
      `◦ *${p}menu grup* — Moderasi & admin grup`,
      `◦ *${p}menu set* — Otomasi & edit teks grup`,
      `◦ *${p}allmenu* — Daftar lengkap satu per satu`,
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
      lines.push(`*${sec.code}. ${sec.title}*`);
      for (const id of sec.ids) {
        const cmd = COMMAND_CATALOG.find((c) => c.id === id);
        if (!cmd) continue;
        const meta = COMPACT_COMMAND_META[id];
        const statusNote = isEnabled(id) ? '' : ' _(nonaktif)_';
        lines.push(
          `◦ *${p}${meta?.shortUsage || cmd.usage}* — ${meta?.shortDesc || cmd.description}${statusNote}`
        );
      }
      lines.push('');
    }

    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push(MENU_DIVIDER);
    lines.push(`Ketik *${p}menu <nama_fitur>* untuk contoh & alias detail.`);
    if (footer) {
      lines.push(footer);
    }
    return lines.join('\n');
  }

  // 5. Default Compact & Scannable Overview (.menu)
  const lines: string[] = [];
  if (header) {
    lines.push(header);
    lines.push(MENU_DIVIDER);
  }

  for (const sec of MENU_SECTIONS) {
    lines.push(`*${sec.code}. ${sec.title}*`);
    for (const row of sec.compactRows) {
      const allDisabled = row.ids.every((id) => !isEnabled(id));
      const cmdLabels = row.ids
        .map((id) => {
          const singleOff = !allDisabled && !isEnabled(id);
          return singleOff ? `*${p}${id}* _(off)_` : `*${p}${id}*`;
        })
        .join(' / ');
      const argPart = row.argHint ? ` ${row.argHint}` : '';
      const rowOffSuffix = allDisabled ? ' _(nonaktif)_' : '';
      lines.push(`◦ ${cmdLabels}${argPart} — ${row.summary}${rowOffSuffix}`);
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
