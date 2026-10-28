import sharp from 'sharp';
import {
  buildBotMenuText,
  COMMAND_CATALOG,
  renderBotTemplate,
  SUSPENSION_RISK_DISABLED_REPLY,
} from '../src/shared/commands.ts';
import type {
  GroupEditableTemplateKey,
  SimulatorMember,
} from '../src/shared/types.ts';
import { evaluateAutoResponder } from './autoResponder.ts';
import {
  downloadTikTokMedia,
  extractFirstUrl,
  fetchRemoteBuffer,
  resolveSocialMedia,
  searchAndDownloadPlay,
  type SupportedPlatform,
} from './mediaDownloader.ts';
import {
  applyAudioEffect,
  applyImageFilter,
  type AudioEffectMode,
  convertVideoToPtv,
  enhanceImageHd,
  extractOrConvertAudio,
  generateQrImage,
  type ImageFilterMode,
  uploadBufferToPublicUrl,
} from './mediaProcessor.ts';
import { botStore } from './stateStore.ts';
import {
  animatedWebpToMp4,
  createAttpSticker,
  createBratAnimatedSticker,
  createBratSticker,
  createEmojiMixSticker,
  createMemeSticker,
  createQuoteChatSticker,
  createTtpSticker,
  imageToStickerWebp,
  rewriteStickerExif,
  stickerWebpToPng,
  videoToAnimatedStickerWebp,
} from './stickerStudio.ts';

export interface WAGroupOperations {
  removeParticipant: (targetJid: string) => Promise<void>;
  addParticipant: (targetJid: string) => Promise<void>;
  promoteParticipant: (targetJid: string) => Promise<void>;
  demoteParticipant: (targetJid: string) => Promise<void>;
  setGroupAnnouncement: (announcementOnly: boolean) => Promise<void>;
  setGroupSubject: (subject: string) => Promise<void>;
  setGroupDescription: (description: string) => Promise<void>;
  getGroupInviteCode: () => Promise<string | undefined>;
  revokeGroupInviteCode: () => Promise<string | undefined>;
}

export interface IncomingDocumentPayload {
  kind: 'image' | 'video' | 'unsupported';
  buffer?: Buffer;
  mimeType: string;
  fileName: string;
  fileSize: number;
  jpegThumbnail?: Buffer;
}

export interface IncomingViewOncePayload {
  kind: 'image' | 'video' | 'audio';
  buffer: Buffer;
  mimeType: string;
  caption?: string;
}

export interface HdSwPreparedMedia {
  kind: 'image' | 'video';
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  fileSizeLabel: string;
  caption: string;
  webUrl: string;
  width?: number;
  height?: number;
  jpegThumbnail?: string;
}

export interface IncomingBotContext {
  source: 'whatsapp' | 'simulator';
  isGroup: boolean;
  groupId?: string;
  groupName?: string;
  senderName: string;
  senderPhone: string;
  senderJid?: string;
  isAdmin: boolean;
  isBotGroupAdmin?: boolean;
  text: string;
  imageBuffer?: Buffer | null;
  videoBuffer?: Buffer | null;
  audioBuffer?: Buffer | null;
  stickerBuffer?: Buffer | null;
  viewOnceMedia?: IncomingViewOncePayload | null;
  quotedText?: string;
  quotedSenderName?: string;
  documentMedia?: IncomingDocumentPayload | null;
  attachedNonDocumentMedia?: boolean;
  mentionedJids?: string[];
  quotedParticipantJid?: string;
  quotedParticipantPhone?: string;
  groupMembers?: SimulatorMember[];
  waGroupOps?: WAGroupOperations;
}

export interface BotCommandResult {
  handled: boolean;
  reactionStatus?: 'success' | 'error';
  moderatedLink?: boolean;
  replyText?: string;
  stickerBuffer?: Buffer;
  stickerWebUrl?: string;
  stickerPackOverride?: { pack: string; author: string };
  imageBuffer?: Buffer;
  imageMimeType?: string;
  imageWebUrl?: string;
  videoBuffer?: Buffer;
  videoMimeType?: string;
  videoWebUrl?: string;
  asPtv?: boolean;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  audioWebUrl?: string;
  asVoiceNote?: boolean;
  documentBuffer?: Buffer;
  documentMimeType?: string;
  documentFileName?: string;
  documentWebUrl?: string;
  slideImageUrls?: string[];
  slideProxyUrls?: string[];
  videoRemoteUrl?: string;
  videoProxyUrl?: string;
  audioRemoteUrl?: string;
  audioProxyUrl?: string;
  hdswMedia?: HdSwPreparedMedia;
  mediaTitle?: string;
  mediaAuthor?: string;
  mediaDuration?: number;
  mentions?: string[];
  hiddenMentions?: string[];
}

const LINK_REGEX =
  /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+)/i;
const SERVER_BOOT_TIME = Date.now();

const LINK_COMMAND_ALLOWLIST = new Set([
  'aio',
  'dl',
  'autodl',
  'unduh',
  'tt',
  'tiktok',
  'ttdl',
  'vt',
  'ttslide',
  'ttimg',
  'ttfoto',
  'tiktokslide',
  'ig',
  'instagram',
  'igdl',
  'reels',
  'fb',
  'facebook',
  'fbdl',
  'fbwatch',
  'tw',
  'twitter',
  'x',
  'xdl',
  'pin',
  'pinterest',
  'pindl',
  'capcut',
  'cc',
  'ccdl',
  'mf',
  'mediafire',
  'mfdl',
  'yt',
  'youtube',
  'ytmp4',
  'shorts',
  'mp3',
  'ttmp3',
  'ytmp3',
  'musik',
  'qrcode',
  'qr',
  'buatqr',
]);

// Anti-suspension rate-limit tracker per WhatsApp group JID
const groupActionLastRun = new Map<string, number>();
// Per-sender anti-ban spam guard on real WhatsApp (prevents command flood bans)
const senderLastCmdRun = new Map<string, number>();

function checkSenderRateLimit(ctx: IncomingBotContext): boolean {
  if (ctx.source !== 'whatsapp') return false;
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

function checkGroupActionCooldown(
  ctx: IncomingBotContext,
  bucket: 'mutation' | 'invite_link' | 'revoke_link' | 'hidetag',
  cooldownMs: number
): string | null {
  if (ctx.source !== 'whatsapp' || !ctx.isGroup || !ctx.groupId) {
    return null;
  }
  const key = `${ctx.groupId}:${bucket}`;
  const now = Date.now();
  const prev = groupActionLastRun.get(key) || 0;
  const elapsed = now - prev;
  if (elapsed < cooldownMs) {
    const waitSec = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
    return `Proteksi keamanan grup aktif: tunggu *${waitSec} detik* lagi sebelum menjalankan aksi grup berikutnya agar grup aman dari deteksi spam WhatsApp.`;
  }
  groupActionLastRun.set(key, now);
  return null;
}

export function shouldSendPendingReaction(rawText: string): boolean {
  const { config } = botStore;
  if (!config.reactions.enabled) return false;
  const trimmed = rawText.trim();
  if (!trimmed.startsWith(config.prefix)) return false;
  const withoutPrefix = trimmed.slice(config.prefix.length).trim();
  return withoutPrefix.length > 0;
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}j ${m}m ${s}d`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s} detik`;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizePhoneInput(raw: string): string {
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8') && digits.length >= 9) {
    digits = '62' + digits;
  }
  return digits;
}

function resolveGroupTarget(
  argsText: string,
  ctx: IncomingBotContext
): { jid: string; phone: string; member?: SimulatorMember } | null {
  const members = ctx.groupMembers || botStore.groupMembers;

  if (ctx.quotedParticipantJid || ctx.quotedParticipantPhone) {
    const qJid = ctx.quotedParticipantJid || '';
    const qPhone =
      ctx.quotedParticipantPhone || qJid.split(':')[0]?.split('@')[0] || '';
    const found = members.find(
      (m) =>
        m.jid === qJid ||
        (m.lid && m.lid === qJid) ||
        (qPhone && m.phone === qPhone)
    );
    if (found) {
      return { jid: found.jid, phone: found.phone, member: found };
    }
    if (qJid) {
      return { jid: qJid, phone: qPhone || qJid.split('@')[0] };
    }
  }

  if (ctx.mentionedJids && ctx.mentionedJids.length > 0) {
    const mJid = ctx.mentionedJids[0];
    const mPhone = mJid.split(':')[0]?.split('@')[0] || '';
    const found = members.find(
      (m) =>
        m.jid === mJid ||
        (m.lid && m.lid === mJid) ||
        (mPhone && m.phone === mPhone)
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
    const cleanQuery = argsText.replace(/^@/, '').trim().toLowerCase();
    const byName = members.find((m) =>
      m.name.toLowerCase().includes(cleanQuery)
    );
    if (byName) {
      return { jid: byName.jid, phone: byName.phone, member: byName };
    }
  }

  return null;
}

function buildMenuText(
  query?: string,
  invokedAlias?: string,
  senderName?: string
): string {
  const { config } = botStore;
  return buildBotMenuText({
    prefix: config.prefix,
    botName: config.botName,
    ownerName: config.ownerName,
    ownerWebsite: config.ownerWebsite,
    stickerPackName: config.stickerPackName,
    stickerAuthor: config.stickerAuthor,
    disabledCommands: config.disabledCommands,
    menuHeaderTemplate: config.templates.menuHeader,
    menuFooterTemplate: config.templates.menuFooter,
    query,
    invokedAlias,
    senderName,
  });
}

function isAllowedLinkCommand(trimmed: string, prefix: string): boolean {
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return false;
  const cmdPart = trimmed
    .slice(prefix.length)
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  return Boolean(cmdPart && LINK_COMMAND_ALLOWLIST.has(cmdPart));
}

export async function processBotMessage(
  ctx: IncomingBotContext
): Promise<BotCommandResult> {
  const startTime = Date.now();
  const { config } = botStore;
  const trimmed = ctx.text.trim();
  const effectiveGroupId =
    ctx.groupId || (ctx.isGroup ? 'simulator-group' : undefined);
  const effectiveGroupSettings =
    botStore.getEffectiveGroupSettings(effectiveGroupId);

  // 1. Passive Group Antilink Moderation (for non-admins sending external links)
  if (
    ctx.isGroup &&
    effectiveGroupSettings.antilink &&
    !ctx.isAdmin &&
    LINK_REGEX.test(trimmed) &&
    !isAllowedLinkCommand(trimmed, config.prefix)
  ) {
    botStore.incrementStat('linksModerated');
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: 'antilink:guard',
      source: ctx.source,
      sender: ctx.senderName,
      status: 'blocked',
      summary: `Menghapus pesan bertautan dari ${ctx.senderName}`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });

    const warnTpl = botStore.getEffectiveTemplate(
      'antilinkWarn',
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
        groupName: ctx.groupName || botStore.groupState.subject,
      }),
      mentions: ctx.senderJid
        ? [ctx.senderJid]
        : [`${ctx.senderPhone}@s.whatsapp.net`],
    };
  }

  // 2. Simulator Announcement-Only Guard
  if (
    ctx.source === 'simulator' &&
    ctx.isGroup &&
    botStore.groupState.isAnnouncementOnly &&
    !ctx.isAdmin
  ) {
    return {
      handled: true,
      moderatedLink: true,
      replyText: `Grup sedang *DIKUNCI* (Hanya Admin yang dapat mengirim pesan).`,
    };
  }

  // 3. Single Prefix check
  if (!trimmed.startsWith(config.prefix)) {
    const autoReply = evaluateAutoResponder(trimmed, {
      isGroup: Boolean(ctx.isGroup),
      senderPhone: ctx.senderPhone,
      senderName: ctx.senderName,
      groupName: ctx.groupName || botStore.groupState.subject,
    });
    if (autoReply.matched && autoReply.replyText) {
      return {
        handled: true,
        reactionStatus: 'success',
        replyText: autoReply.replyText,
      };
    }
    return { handled: false };
  }

  const withoutPrefix = trimmed.slice(config.prefix.length).trim();
  if (!withoutPrefix) {
    return { handled: false };
  }

  const firstSpaceIdx = withoutPrefix.search(/\s/);
  const rawCmd = (
    firstSpaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSpaceIdx)
  ).toLowerCase();
  const argsText =
    firstSpaceIdx === -1 ? '' : withoutPrefix.slice(firstSpaceIdx + 1).trim();

  const matchedCmd = COMMAND_CATALOG.find(
    (c) => c.id === rawCmd || c.aliases.includes(rawCmd)
  );

  if (!matchedCmd) {
    return {
      handled: true,
      reactionStatus: 'error',
      replyText: renderBotTemplate(config.templates.unknownCommand, {
        prefix: config.prefix,
        command: rawCmd,
        botName: config.botName,
      }),
    };
  }

  if (matchedCmd.suspensionRisk) {
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: 'blocked',
      summary: `Proteksi anti-suspend: ${config.prefix}${matchedCmd.id} dinonaktifkan`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
    return {
      handled: true,
      reactionStatus: 'error',
      replyText: SUSPENSION_RISK_DISABLED_REPLY,
    };
  }

  if (config.disabledCommands.includes(matchedCmd.id)) {
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: 'blocked',
      summary: `Command ${config.prefix}${matchedCmd.id} sedang dinonaktifkan`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
    return {
      handled: true,
      reactionStatus: 'error',
      replyText: `Maaf, fitur *${config.prefix}${matchedCmd.id}* sedang dinonaktifkan sementara oleh pengelola bot.`,
    };
  }

  if (matchedCmd.groupOnly && !ctx.isGroup) {
    return {
      handled: true,
      reactionStatus: 'error',
      replyText: `Perintah *${config.prefix}${matchedCmd.id}* khusus digunakan di dalam ruang Grup WhatsApp.`,
    };
  }

  // Silently ignore rapid command floods (<3.5s) from the same WhatsApp sender
  if (checkSenderRateLimit(ctx)) {
    return { handled: false };
  }

  botStore.incrementStat('totalCommands');

  const failReply = (msg: string): BotCommandResult => ({
    handled: true,
    reactionStatus: 'error',
    replyText: msg,
  });

  const ensureSenderGroupAdmin = (): BotCommandResult | null => {
    if (!ctx.isAdmin) {
      return failReply(
        `Hanya *Admin Grup* yang diizinkan menjalankan perintah *${config.prefix}${matchedCmd.id}*.`
      );
    }
    return null;
  };

  const ensureFullGroupAdminWithBot = (): BotCommandResult | null => {
    const senderCheck = ensureSenderGroupAdmin();
    if (senderCheck) return senderCheck;
    if (ctx.source === 'whatsapp' && ctx.isBotGroupAdmin === false) {
      return failReply(
        `Jadikan nomor *${config.botName}* sebagai *Admin Grup* terlebih dahulu agar bisa mengeksekusi *${config.prefix}${matchedCmd.id}*.`
      );
    }
    return null;
  };

  const checkManualOnlySettingsGuard = (): BotCommandResult | null => {
    if (config.lockSettingsManualOnly ?? true) {
      return {
        handled: true,
        reactionStatus: 'error',
        replyText:
          '🔒 *Perubahan Pengaturan Dinonaktifkan via Chat*\n\nBot ini telah dikonfigurasi agar *tidak dapat* mengubah setelan grup maupun preferensi bot melalui perintah chat WhatsApp.\n\nSemua perubahan setelan (buka/tutup chat grup, nama grup, deskripsi, tautan undangan, antilink, welcome, dan template) hanya dapat diubah secara *MANUAL* melalui Dashboard Web Panel oleh pemilik bot.',
      };
    }
    return null;
  };

  const handleGroupTemplateSetter = (
    templateKey: GroupEditableTemplateKey,
    titleLabel: string,
    sampleHint: string
  ): BotCommandResult => {
    if (argsText) {
      const manualGuard = checkManualOnlySettingsGuard();
      if (manualGuard) return manualGuard;
    }

    const guard = ensureSenderGroupAdmin();
    if (guard) return guard;

    const gid = effectiveGroupId || 'simulator-group';

    if (!argsText) {
      const currentTpl = botStore.getEffectiveTemplate(templateKey, gid);
      return {
        handled: true,
        reactionStatus: 'success',
        replyText: [
          `*Pengaturan ${titleLabel} Grup Ini*`,
          `Teks aktif saat ini:`,
          `${currentTpl}`,
          '',
          `Untuk mengubah, ketik:`,
          `*${config.prefix}${matchedCmd.id} ${sampleHint}*`,
          `Variabel otomatis: *@user*, *@group*, *{prefix}*, *{botName}*`,
          `Ketik *${config.prefix}${matchedCmd.id} reset* untuk kembali ke teks bawaan.`,
        ].join('\n'),
      };
    }

    if (argsText.toLowerCase() === 'reset') {
      botStore.resetGroupCustomTemplates(gid, templateKey);
      return {
        handled: true,
        reactionStatus: 'success',
        replyText: `Teks *${titleLabel}* untuk grup ini berhasil dikembalikan ke pengaturan bawaan bot.`,
      };
    }

    botStore.updateGroupCustomConfig(gid, {
      templates: {
        [templateKey]: argsText,
      },
    });

    const previewRendered = renderBotTemplate(argsText, {
      target: ctx.senderPhone,
      sender: ctx.senderPhone,
      groupName: ctx.groupName || botStore.groupState.subject,
      prefix: config.prefix,
      botName: config.botName,
    });

    return {
      handled: true,
      reactionStatus: 'success',
      replyText: [
        `*${titleLabel} Berhasil Diperbarui!*`,
        '',
        `*Contoh Pratinjau:*`,
        previewRendered,
      ].join('\n'),
      mentions: ctx.senderJid ? [ctx.senderJid] : undefined,
    };
  };

  const buildSocialDownloadResponse = async (
    targetUrl: string,
    platformHint: SupportedPlatform | 'auto'
  ): Promise<BotCommandResult> => {
    const media =
      platformHint === 'tiktok'
        ? await downloadTikTokMedia(targetUrl)
        : await resolveSocialMedia(targetUrl, platformHint);

    botStore.incrementStat('mediaDownloaded');

    const caption = renderBotTemplate(config.templates.downloaderCaption, {
      platform: media.platform.toUpperCase(),
      title: media.title,
      author: media.author,
      duration: media.duration ? `${media.duration} detik` : '-',
      botName: config.botName,
      prefix: config.prefix,
    });

    // 1. Multi-photo slide / carousel (TikTok Slide / X Gallery)
    if (media.slideImages && media.slideImages.length > 0) {
      const proxySlides = media.slideImages.map(
        (u) => `/api/proxy-media?url=${encodeURIComponent(u)}&type=image`
      );
      return {
        handled: true,
        reactionStatus: 'success',
        slideImageUrls: media.slideImages,
        slideProxyUrls: proxySlides,
        audioRemoteUrl: media.audioUrl,
        audioProxyUrl: media.audioUrl
          ? `/api/proxy-media?url=${encodeURIComponent(
              media.audioUrl
            )}&type=audio`
          : undefined,
        mediaTitle: media.title,
        mediaAuthor: media.author,
        replyText: `${caption}\nJumlah Slide: *${media.slideImages.length} Foto*`,
      };
    }

    // 2. Direct file download (MediaFire)
    if (media.fileUrl) {
      const { buffer, contentType } = await fetchRemoteBuffer(media.fileUrl);
      const fname = media.fileName || 'berkas-unduhan';
      const storedUrl = botStore.storeHdMedia(buffer, contentType, fname);
      return {
        handled: true,
        reactionStatus: 'success',
        documentBuffer: buffer,
        documentMimeType: contentType,
        documentFileName: fname,
        documentWebUrl: storedUrl,
        replyText: `*Unduhan Berkas Selesai (${media.platform.toUpperCase()})*\nNama: *${fname}*\nUkuran: *${formatByteSize(
          buffer.length
        )}*`,
      };
    }

    // 3. Single photo post (Pinterest / IG / X image)
    if (media.imageUrl && !media.videoUrl) {
      const { buffer, contentType } = await fetchRemoteBuffer(media.imageUrl);
      const mime = contentType.startsWith('image/')
        ? contentType
        : 'image/jpeg';
      const webUrl = botStore.storeHdMedia(buffer, mime, 'social-photo.jpg');
      return {
        handled: true,
        reactionStatus: 'success',
        imageBuffer: buffer,
        imageMimeType: mime,
        imageWebUrl: webUrl,
        replyText: caption,
      };
    }

    if (!media.videoUrl) {
      throw new Error('URL media tidak ditemukan pada tautan tersebut.');
    }

    const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(
      media.videoUrl
    )}&type=video`;

    return {
      handled: true,
      reactionStatus: 'success',
      videoRemoteUrl: media.videoUrl,
      videoProxyUrl: proxyUrl,
      mediaTitle: media.title,
      mediaAuthor: media.author,
      mediaDuration: media.duration,
      replyText: caption,
    };
  };

  try {
    let result: BotCommandResult = { handled: true, reactionStatus: 'success' };

    switch (matchedCmd.id) {
      case 'menu': {
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: buildMenuText(argsText, rawCmd, ctx.senderName),
        };
        break;
      }

      case 'ping': {
        const latency = Math.max(1, Date.now() - startTime);
        const uptime = formatUptime(Date.now() - SERVER_BOOT_TIME);
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: renderBotTemplate(config.templates.pingReply, {
            botName: config.botName,
            latency,
            uptime,
            prefix: config.prefix,
            packName: config.stickerPackName,
            authorName: config.stickerAuthor,
          }),
        };
        break;
      }

      // ================= PERKAKAS MEDIA & .HDSW (GRUP & CHAT PRIBADI) =================
      case 'hdsw': {
        if (!ctx.documentMedia) {
          if (ctx.attachedNonDocumentMedia) {
            return failReply(
              `Supaya kualitas & ukuran file tetap 100% asli (tidak dikompresi WhatsApp), kirim file foto/video melalui menu *Dokumen (Document)* lalu beri caption *${config.prefix}hdsw* atau balas dokumen tersebut dengan *${config.prefix}hdsw*.`
            );
          }
          return failReply(
            `Kirim file *Foto* atau *Video* lewat menu *Dokumen (Document)* dengan caption *${config.prefix}hdsw* (atau balas file dokumen foto/video dengan *${config.prefix}hdsw*).\n\nBisa dipakai di *Grup* maupun *Chat Pribadi*! Bot akan membalasnya sebagai media ukuran asli ala WA Web agar tinggal kamu *Teruskan (Forward)* jernih ke Status WA.`
          );
        }

        if (
          ctx.documentMedia.kind === 'unsupported' ||
          !ctx.documentMedia.buffer
        ) {
          return failReply(
            `Fitur *${config.prefix}hdsw* hanya berfungsi untuk file Dokumen berupa *Foto* (JPG, PNG, WebP) atau *Video* (MP4, MOV). File *${
              ctx.documentMedia.fileName ||
              ctx.documentMedia.mimeType ||
              'terlampir'
            }* tidak didukung.`
          );
        }

        const doc = ctx.documentMedia;
        const validKind: 'image' | 'video' =
          doc.kind === 'video' ? 'video' : 'image';
        let finalBuffer = doc.buffer!;
        let finalMime = doc.mimeType;
        let width: number | undefined;
        let height: number | undefined;
        let jpegThumbnail: string | undefined = doc.jpegThumbnail
          ? doc.jpegThumbnail.toString('base64')
          : undefined;

        if (validKind === 'image') {
          try {
            const meta = await sharp(finalBuffer).metadata();
            width = meta.width;
            height = meta.height;

            if (
              meta.format === 'webp' ||
              finalMime.toLowerCase().includes('webp')
            ) {
              finalBuffer = await sharp(finalBuffer)
                .png({ compressionLevel: 0 })
                .toBuffer();
              finalMime = 'image/png';
            } else if (meta.format === 'png') {
              finalMime = 'image/png';
            } else {
              finalMime = 'image/jpeg';
            }

            const thumbBuf = await sharp(finalBuffer)
              .resize(72, 72, { fit: 'inside' })
              .jpeg({ quality: 65 })
              .toBuffer();
            jpegThumbnail = thumbBuf.toString('base64');
          } catch {
            finalMime = finalMime.startsWith('image/')
              ? finalMime
              : 'image/jpeg';
          }
        } else {
          finalMime = 'video/mp4';
        }

        const fileSizeLabel = formatByteSize(finalBuffer.length);
        const mediaKindLabel =
          validKind === 'video' ? 'Video Asli' : 'Foto Asli';
        const webUrl = botStore.storeHdMedia(
          finalBuffer,
          finalMime,
          doc.fileName ||
            (validKind === 'video' ? 'hd-status.mp4' : 'hd-status.jpg')
        );

        const resolvedCaption =
          argsText.toLowerCase() === 'nocaption'
            ? ''
            : argsText
            ? argsText
            : ctx.isGroup
            ? renderBotTemplate(config.templates.hdswGroupConfirm, {
                mediaKind: mediaKindLabel,
                fileName: doc.fileName || mediaKindLabel,
                fileSize: fileSizeLabel,
                sender: ctx.senderPhone,
                target: ctx.senderPhone,
                botName: config.botName,
                prefix: config.prefix,
              })
            : renderBotTemplate(config.templates.hdswCaption, {
                mediaKind: mediaKindLabel,
                fileSize: fileSizeLabel,
                fileName: doc.fileName || mediaKindLabel,
                botName: config.botName,
                prefix: config.prefix,
              });

        botStore.incrementStat('mediaDownloaded');

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: resolvedCaption,
          mentions: ctx.isGroup
            ? [ctx.senderJid || `${ctx.senderPhone}@s.whatsapp.net`]
            : undefined,
          hdswMedia: {
            kind: validKind,
            buffer: finalBuffer,
            mimeType: finalMime,
            fileName:
              doc.fileName ||
              (validKind === 'video' ? 'status-hd.mp4' : 'status-hd.jpg'),
            fileSizeLabel,
            caption: resolvedCaption,
            webUrl,
            width,
            height,
            jpegThumbnail,
          },
        };
        break;
      }

      case 'hd': {
        const imgBuf =
          ctx.imageBuffer ||
          (ctx.documentMedia?.kind === 'image'
            ? ctx.documentMedia.buffer
            : null);
        if (!imgBuf) {
          return failReply(
            `Kirim atau balas (reply) sebuah foto dengan *${config.prefix}hd* untuk dipertajam resolusinya 2× lipat.`
          );
        }
        const enhanced = await enhanceImageHd(imgBuf);
        const webUrl = botStore.storeHdMedia(
          enhanced.buffer,
          'image/jpeg',
          'gepabot-hd-upscale.jpg'
        );
        botStore.incrementStat('mediaDownloaded');
        result = {
          handled: true,
          reactionStatus: 'success',
          imageBuffer: enhanced.buffer,
          imageMimeType: 'image/jpeg',
          imageWebUrl: webUrl,
          replyText: `*Foto HD Berhasil Dipertajam*\nResolusi akhir: *${enhanced.width}×${enhanced.height} px* (${formatByteSize(
            enhanced.buffer.length
          )})`,
        };
        break;
      }

      case 'hitamkan':
      case 'imgedit': {
        const imgBuf =
          ctx.imageBuffer ||
          (ctx.documentMedia?.kind === 'image'
            ? ctx.documentMedia.buffer
            : null);
        if (!imgBuf) {
          return failReply(
            `Kirim atau balas (reply) sebuah foto.\nContoh: *${config.prefix}hitamkan*, *${config.prefix}blur*, *${config.prefix}invert*, *${config.prefix}mirror*, atau *${config.prefix}sepia*.`
          );
        }

        let filterMode: ImageFilterMode = 'grayscale';
        const sub = (
          matchedCmd.id === 'hitamkan'
            ? 'hitamkan'
            : rawCmd !== 'imgedit'
            ? rawCmd
            : argsText.split(/\s+/)[0] || 'blur'
        ).toLowerCase();

        if (sub === 'negatif' || sub === 'invert') filterMode = 'invert';
        else if (sub === 'blur') filterMode = 'blur';
        else if (sub === 'mirror') filterMode = 'mirror';
        else if (sub === 'flip') filterMode = 'flip';
        else if (sub === 'sepia') filterMode = 'sepia';
        else filterMode = 'hitamkan';

        const outBuf = await applyImageFilter(imgBuf, filterMode);
        const webUrl = botStore.storeHdMedia(
          outBuf,
          'image/jpeg',
          `gepabot-${filterMode}.jpg`
        );
        result = {
          handled: true,
          reactionStatus: 'success',
          imageBuffer: outBuf,
          imageMimeType: 'image/jpeg',
          imageWebUrl: webUrl,
          replyText: `*Efek Gambar (${filterMode.toUpperCase()}) Selesai*`,
        };
        break;
      }

      case 'rvo': {
        if (!ctx.viewOnceMedia) {
          return failReply(
            `Balas (reply) pada pesan *View Once* (foto, video, atau suara sekali lihat) dengan *${config.prefix}rvo* untuk membukanya kembali.`
          );
        }
        const vo = ctx.viewOnceMedia;
        const caption = vo.caption
          ? `*Media View Once Dibuka*\nCaption asli: ${vo.caption}`
          : `*Media View Once Berhasil Dibuka*`;

        if (vo.kind === 'image') {
          const webUrl = botStore.storeHdMedia(
            vo.buffer,
            vo.mimeType || 'image/jpeg',
            'viewonce.jpg'
          );
          result = {
            handled: true,
            reactionStatus: 'success',
            imageBuffer: vo.buffer,
            imageMimeType: vo.mimeType || 'image/jpeg',
            imageWebUrl: webUrl,
            replyText: caption,
          };
        } else if (vo.kind === 'video') {
          const webUrl = botStore.storeHdMedia(
            vo.buffer,
            vo.mimeType || 'video/mp4',
            'viewonce.mp4'
          );
          result = {
            handled: true,
            reactionStatus: 'success',
            videoBuffer: vo.buffer,
            videoMimeType: vo.mimeType || 'video/mp4',
            videoWebUrl: webUrl,
            replyText: caption,
          };
        } else {
          const webUrl = botStore.storeHdMedia(
            vo.buffer,
            vo.mimeType || 'audio/mpeg',
            'viewonce.mp3'
          );
          result = {
            handled: true,
            reactionStatus: 'success',
            audioBuffer: vo.buffer,
            audioMimeType: vo.mimeType || 'audio/mpeg',
            audioWebUrl: webUrl,
            replyText: caption,
          };
        }
        break;
      }

      case 'toptv': {
        const vidBuf =
          ctx.videoBuffer ||
          (ctx.documentMedia?.kind === 'video'
            ? ctx.documentMedia.buffer
            : null);
        if (!vidBuf) {
          return failReply(
            `Kirim atau balas (reply) video dengan *${config.prefix}toptv* untuk mengubahnya menjadi Video Note bulat (PTV).`
          );
        }
        const ptvBuf = await convertVideoToPtv(vidBuf);
        const webUrl = botStore.storeHdMedia(ptvBuf, 'video/mp4', 'ptv-note.mp4');
        result = {
          handled: true,
          reactionStatus: 'success',
          videoBuffer: ptvBuf,
          videoMimeType: 'video/mp4',
          videoWebUrl: webUrl,
          asPtv: true,
          replyText: 'Video Note bulat (PTV) berhasil dibuat.',
        };
        break;
      }

      case 'qrcode': {
        if (!argsText && !ctx.quotedText) {
          return failReply(
            `Ketik teks atau tautan setelah perintah.\nContoh: *${config.prefix}qrcode https://gepacorner.my.id*`
          );
        }
        const targetStr = argsText || ctx.quotedText || '';
        const qrBuf = await generateQrImage(targetStr);
        const webUrl = botStore.storeHdMedia(qrBuf, 'image/png', 'qrcode.png');
        result = {
          handled: true,
          reactionStatus: 'success',
          imageBuffer: qrBuf,
          imageMimeType: 'image/png',
          imageWebUrl: webUrl,
          replyText: `*Kode QR Siap Pindai*\nIsi: ${targetStr.slice(0, 140)}`,
        };
        break;
      }

      case 'tourl': {
        let buf: Buffer | null = null;
        let mime = 'application/octet-stream';
        let name = 'media.bin';

        if (ctx.imageBuffer) {
          buf = ctx.imageBuffer;
          mime = 'image/jpeg';
          name = 'image.jpg';
        } else if (ctx.videoBuffer) {
          buf = ctx.videoBuffer;
          mime = 'video/mp4';
          name = 'video.mp4';
        } else if (ctx.audioBuffer) {
          buf = ctx.audioBuffer;
          mime = 'audio/mpeg';
          name = 'audio.mp3';
        } else if (ctx.stickerBuffer) {
          buf = ctx.stickerBuffer;
          mime = 'image/webp';
          name = 'sticker.webp';
        } else if (ctx.documentMedia?.buffer) {
          buf = ctx.documentMedia.buffer;
          mime = ctx.documentMedia.mimeType;
          name = ctx.documentMedia.fileName || 'file.bin';
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
          reactionStatus: 'success',
          replyText: [
            `*Media Berhasil Diunggah*`,
            `Ukuran: *${formatByteSize(buf.length)}*`,
            remoteLink
              ? `Tautan Publik: ${remoteLink}`
              : `Tautan Server Lokal: ${localPath}`,
          ].join('\n'),
        };
        break;
      }

      // ================= DOWNLOADER MULTI-PLATFORM =================
      case 'aio':
      case 'tt':
      case 'ttslide':
      case 'ig':
      case 'fb':
      case 'tw':
      case 'pin':
      case 'capcut':
      case 'mf':
      case 'yt': {
        const targetUrl =
          extractFirstUrl(argsText) || extractFirstUrl(ctx.quotedText || '');
        if (!targetUrl) {
          return failReply(
            `Masukkan tautan yang valid (atau reply pesan berisi link).\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }

        const hintMap: Record<string, SupportedPlatform | 'auto'> = {
          aio: 'auto',
          tt: 'tiktok',
          ttslide: 'tiktok',
          ig: 'instagram',
          fb: 'facebook',
          tw: 'twitter',
          pin: 'pinterest',
          capcut: 'capcut',
          mf: 'mediafire',
          yt: 'youtube',
        };

        result = await buildSocialDownloadResponse(
          targetUrl,
          hintMap[matchedCmd.id] || 'auto'
        );
        break;
      }

      // ================= AUDIO, MUSIK & EFEK SUARA =================
      case 'mp3': {
        const targetUrl =
          extractFirstUrl(argsText) || extractFirstUrl(ctx.quotedText || '');
        if (!targetUrl) {
          return failReply(
            `Masukkan tautan video sosmed yang ingin diambil MP3-nya.\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }

        const media = await resolveSocialMedia(targetUrl, 'auto');
        const streamUrl = media.audioUrl || media.videoUrl;
        if (!streamUrl) {
          throw new Error(
            'Jalur audio MP3 tidak tersedia pada tautan tersebut.'
          );
        }

        botStore.incrementStat('mediaDownloaded');
        const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(
          streamUrl
        )}&type=audio`;

        result = {
          handled: true,
          reactionStatus: 'success',
          audioRemoteUrl: streamUrl,
          audioProxyUrl: proxyUrl,
          mediaTitle: media.title,
          mediaAuthor: media.author,
          mediaDuration: media.duration,
          replyText: renderBotTemplate(config.templates.audioCaption, {
            title: media.title,
            author: media.author,
            duration: media.duration ? `${media.duration} detik` : '-',
            botName: config.botName,
            prefix: config.prefix,
          }),
        };
        break;
      }

      case 'play': {
        const query = argsText || ctx.quotedText || '';
        if (!query.trim()) {
          return failReply(
            `Ketik judul lagu atau nama penyanyi.\nContoh: *${config.prefix}play Hindia Evaluasi*`
          );
        }
        const track = await searchAndDownloadPlay(query);
        if (!track.audioUrl) {
          throw new Error('Sumber audio lagu tidak tersedia saat ini.');
        }
        botStore.incrementStat('mediaDownloaded');
        const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(
          track.audioUrl
        )}&type=audio`;

        result = {
          handled: true,
          reactionStatus: 'success',
          audioRemoteUrl: track.audioUrl,
          audioProxyUrl: proxyUrl,
          mediaTitle: track.title,
          mediaAuthor: track.author,
          mediaDuration: track.duration,
          replyText: `*Lagu Ditemukan*\nJudul: *${track.title}*\nArtis: *${track.author}*`,
        };
        break;
      }

      case 'tomp3':
      case 'tovn': {
        const mediaBuf =
          ctx.audioBuffer ||
          ctx.videoBuffer ||
          (ctx.documentMedia?.kind === 'video'
            ? ctx.documentMedia.buffer
            : null);
        if (!mediaBuf) {
          return failReply(
            `Balas (reply) sebuah video, musik, atau Voice Note dengan *${config.prefix}${matchedCmd.id}*.`
          );
        }
        const isVn = matchedCmd.id === 'tovn';
        const converted = await extractOrConvertAudio(
          mediaBuf,
          isVn ? 'vn' : 'mp3'
        );
        const webUrl = botStore.storeHdMedia(
          converted.buffer,
          converted.mimeType,
          `gepabot-audio.${converted.ext}`
        );
        result = {
          handled: true,
          reactionStatus: 'success',
          audioBuffer: converted.buffer,
          audioMimeType: converted.mimeType,
          audioWebUrl: webUrl,
          asVoiceNote: isVn,
          mediaTitle: isVn ? 'Voice Note (PTT)' : 'Ekstraksi Audio MP3',
          replyText: isVn
            ? 'Berhasil diubah menjadi pesan suara Voice Note.'
            : 'Audio MP3 berhasil diekstrak.',
        };
        break;
      }

      case 'bass':
      case 'nightcore':
      case 'slow':
      case 'fast':
      case 'robot':
      case 'reverse': {
        const audioInput = ctx.audioBuffer || ctx.videoBuffer;
        if (!audioInput) {
          return failReply(
            `Balas (reply) sebuah lagu, Voice Note, atau video dengan *${config.prefix}${matchedCmd.id}* untuk menerapkan efek suara.`
          );
        }
        const effectMode = matchedCmd.id as AudioEffectMode;
        const processed = await applyAudioEffect(audioInput, effectMode);
        const webUrl = botStore.storeHdMedia(
          processed.buffer,
          processed.mimeType,
          `gepabot-${effectMode}.mp3`
        );
        result = {
          handled: true,
          reactionStatus: 'success',
          audioBuffer: processed.buffer,
          audioMimeType: processed.mimeType,
          audioWebUrl: webUrl,
          mediaTitle: `Efek Suara ${effectMode.toUpperCase()}`,
          replyText: `*Efek Audio (${effectMode.toUpperCase()}) Selesai*`,
        };
        break;
      }

      // ================= STUDIO STIKER & MAKER =================
      case 's': {
        const vidSource =
          ctx.videoBuffer ||
          (ctx.documentMedia?.kind === 'video'
            ? ctx.documentMedia.buffer
            : null);
        const imgSource =
          ctx.imageBuffer ||
          (ctx.documentMedia?.kind === 'image'
            ? ctx.documentMedia.buffer
            : null);

        if (!imgSource && !vidSource) {
          return failReply(
            renderBotTemplate(config.templates.stickerMissingMedia, {
              prefix: config.prefix,
              botName: config.botName,
              packName: config.stickerPackName,
              authorName: config.stickerAuthor,
            })
          );
        }

        const stickerBuf = vidSource
          ? await videoToAnimatedStickerWebp(
              vidSource,
              config.stickerPackName,
              config.stickerAuthor
            )
          : await imageToStickerWebp(
              imgSource!,
              config.stickerPackName,
              config.stickerAuthor
            );

        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
          replyText: renderBotTemplate(config.templates.stickerReply, {
            packName: config.stickerPackName,
            authorName: config.stickerAuthor,
            botName: config.botName,
          }),
        };
        break;
      }

      case 'qc':
      case 'iqc': {
        const bubbleText = argsText || ctx.quotedText || '';
        if (!bubbleText.trim()) {
          return failReply(
            `Ketik teks setelah perintah atau balas (reply) pesan teman dengan *${config.prefix}${matchedCmd.id}*.\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const bubbleSender =
          !argsText && ctx.quotedSenderName
            ? ctx.quotedSenderName
            : ctx.senderName;
        const stickerBuf = await createQuoteChatSticker({
          text: bubbleText,
          senderName: bubbleSender,
          style: matchedCmd.id === 'iqc' ? 'ios' : 'wa',
          packName: config.stickerPackName,
          author: config.stickerAuthor,
        });
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'brat':
      case 'bratwhite': {
        const textVal = argsText || ctx.quotedText || '';
        if (!textVal) {
          return failReply(
            `Ketik teks setelah perintah.\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const variant = matchedCmd.id === 'brat' ? 'lime' : 'white';
        const stickerBuf = await createBratSticker(
          textVal,
          variant,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'bratcolor': {
        if (!argsText) {
          return failReply(
            `Gunakan format *${config.prefix}bratcolor warna | teks*.\nPilihan warna: pink, biru, merah, ungu, kuning, hitam, oranye, cyan.\nContoh: *${config.prefix}bratcolor pink | santai dulu*`
          );
        }
        let colorKey = 'pink';
        let content = argsText;
        if (argsText.includes('|')) {
          const [c, ...rest] = argsText.split('|');
          colorKey = (c || 'pink').trim();
          content = rest.join('|').trim();
        } else {
          const [firstWord, ...restWords] = argsText.split(/\s+/);
          if (restWords.length > 0) {
            colorKey = firstWord;
            content = restWords.join(' ');
          }
        }
        const stickerBuf = await createBratSticker(
          content || 'santai',
          colorKey,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'bratvid': {
        const textVal = argsText || ctx.quotedText || '';
        if (!textVal) {
          return failReply(
            `Ketik kalimat singkat setelah perintah untuk dibuat stiker Brat bergerak.\nContoh: *${config.prefix}bratvid santai dulu ngopi sebentar*`
          );
        }
        const stickerBuf = await createBratAnimatedSticker(
          textVal,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'ttp':
      case 'attp': {
        const textVal = argsText || ctx.quotedText || '';
        if (!textVal) {
          return failReply(
            `Ketik teks setelah perintah.\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }
        const stickerBuf =
          matchedCmd.id === 'attp'
            ? await createAttpSticker(
                textVal,
                config.stickerPackName,
                config.stickerAuthor
              )
            : await createTtpSticker(
                textVal,
                config.stickerPackName,
                config.stickerAuthor
              );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'meme': {
        if (!argsText && !ctx.imageBuffer) {
          return failReply(
            `Gunakan format *${config.prefix}meme teks atas | teks bawah* (bisa sambil melampirkan atau me-reply foto).`
          );
        }
        const parts = argsText.split('|');
        const topText = (parts[0] || '').trim();
        const bottomText = (parts.slice(1).join(' ') || '').trim();

        const stickerBuf = await createMemeSticker(
          topText || (bottomText ? '' : 'SANTAI DULU'),
          bottomText,
          ctx.imageBuffer ?? null,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'emojimix': {
        if (!argsText) {
          return failReply(
            `Masukkan 2 emoji dipisah tanda tambah.\nContoh: *${config.prefix}emojimix 😀+😎*`
          );
        }
        const stickerBuf = await createEmojiMixSticker(
          argsText,
          config.stickerPackName,
          config.stickerAuthor
        );
        const webUrl = botStore.storeSticker(stickerBuf);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: stickerBuf,
          stickerWebUrl: webUrl,
        };
        break;
      }

      case 'wm': {
        if (!ctx.stickerBuffer) {
          return failReply(
            `Balas (reply) sebuah stiker dengan format *${config.prefix}wm Nama Pack | Nama Author* untuk mengganti hak cipta stiker.`
          );
        }
        const parts = argsText.split('|');
        const newPack =
          (parts[0] || '').trim() || config.stickerPackName || 'Gepa Corner';
        const newAuthor =
          (parts.slice(1).join('|') || '').trim() ||
          ctx.senderName ||
          config.stickerAuthor;

        const rebranded = await rewriteStickerExif(
          ctx.stickerBuffer,
          newPack,
          newAuthor
        );
        const webUrl = botStore.storeSticker(rebranded);
        botStore.incrementStat('stickersCreated');

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: rebranded,
          stickerWebUrl: webUrl,
          stickerPackOverride: { pack: newPack, author: newAuthor },
          replyText: `Watermark stiker diperbarui: *${newPack}* · *${newAuthor}*`,
        };
        break;
      }

      case 'toimg': {
        if (!ctx.stickerBuffer) {
          return failReply(
            `Balas (reply) sebuah stiker dengan *${config.prefix}toimg* untuk mengubahnya menjadi foto PNG.`
          );
        }
        const pngBuf = await stickerWebpToPng(ctx.stickerBuffer);
        const webUrl = botStore.storeHdMedia(
          pngBuf,
          'image/png',
          'sticker-to-image.png'
        );
        result = {
          handled: true,
          reactionStatus: 'success',
          imageBuffer: pngBuf,
          imageMimeType: 'image/png',
          imageWebUrl: webUrl,
          replyText: '*Stiker berhasil diubah menjadi gambar PNG*',
        };
        break;
      }

      case 'tovid': {
        if (!ctx.stickerBuffer) {
          return failReply(
            `Balas (reply) sebuah stiker animasi bergerak dengan *${config.prefix}tovid* untuk mengubahnya menjadi video MP4.`
          );
        }
        const mp4Buf = await animatedWebpToMp4(ctx.stickerBuffer);
        const webUrl = botStore.storeHdMedia(
          mp4Buf,
          'video/mp4',
          'sticker-to-video.mp4'
        );
        result = {
          handled: true,
          reactionStatus: 'success',
          videoBuffer: mp4Buf,
          videoMimeType: 'video/mp4',
          videoWebUrl: webUrl,
          replyText: '*Stiker berhasil diubah menjadi video MP4*',
        };
        break;
      }

      // ================= ADMIN & MODERASI GRUP =================
      case 'kick': {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const target = resolveGroupTarget(argsText, ctx);
        if (!target) {
          return failReply(
            `Tag anggota, masukkan nomor, atau reply pesan anggota yang ingin dikeluarkan.\nContoh: *${config.prefix}kick @628577000333*`
          );
        }

        if (target.phone === ctx.senderPhone) {
          return failReply(
            'Kamu tidak dapat mengeluarkan nomor kamu sendiri.'
          );
        }

        const kickCooldown = checkGroupActionCooldown(ctx, 'mutation', 12000);
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
          reactionStatus: 'success',
          replyText: renderBotTemplate(config.templates.kickSuccess, {
            target: target.phone,
            sender: ctx.senderPhone,
            targetName: target.member?.name || `+${target.phone}`,
            botName: config.botName,
            prefix: config.prefix,
            groupName: ctx.groupName || botStore.groupState.subject,
          }),
          mentions: [target.jid],
        };
        break;
      }

      case 'add': {
        return failReply(SUSPENSION_RISK_DISABLED_REPLY);
      }

      case 'promote': {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const target = resolveGroupTarget(argsText, ctx);
        if (!target) {
          return failReply(
            `Tag anggota, masukkan nomor, atau reply pesan anggota yang ingin dijadikan Admin.\nContoh: *${config.prefix}promote @628577000333*`
          );
        }

        const promoteCooldown = checkGroupActionCooldown(
          ctx,
          'mutation',
          12000
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
            botStore.groupMembers.map((m) =>
              m.jid === target.jid || m.phone === target.phone
                ? { ...m, isAdmin: true }
                : m
            )
          );
        }

        const promoteTpl = botStore.getEffectiveTemplate(
          'promoteSuccess',
          effectiveGroupId
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: renderBotTemplate(promoteTpl, {
            target: target.phone,
            sender: ctx.senderPhone,
            targetName: target.member?.name || `+${target.phone}`,
            botName: config.botName,
            prefix: config.prefix,
            groupName: ctx.groupName || botStore.groupState.subject,
          }),
          mentions: [target.jid],
        };
        break;
      }

      case 'demote': {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const target = resolveGroupTarget(argsText, ctx);
        if (!target) {
          return failReply(
            `Tag admin, masukkan nomor, atau reply pesan admin yang ingin diturunkan.\nContoh: *${config.prefix}demote @628138000222*`
          );
        }

        const demoteCooldown = checkGroupActionCooldown(ctx, 'mutation', 12000);
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
            botStore.groupMembers.map((m) =>
              m.jid === target.jid || m.phone === target.phone
                ? { ...m, isAdmin: false }
                : m
            )
          );
        }

        const demoteTpl = botStore.getEffectiveTemplate(
          'demoteSuccess',
          effectiveGroupId
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: renderBotTemplate(demoteTpl, {
            target: target.phone,
            sender: ctx.senderPhone,
            targetName: target.member?.name || `+${target.phone}`,
            botName: config.botName,
            prefix: config.prefix,
            groupName: ctx.groupName || botStore.groupState.subject,
          }),
          mentions: [target.jid],
        };
        break;
      }

      case 'group': {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;

        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const arg = argsText.toLowerCase();
        const isOpen = arg === 'open' || arg === 'buka' || arg === 'unlocked';
        const isClose = arg === 'close' || arg === 'tutup' || arg === 'locked';

        if (!isOpen && !isClose) {
          return failReply(
            `Gunakan *${config.prefix}group open* (buka chat semua member) atau *${config.prefix}group close* (khusus admin).`
          );
        }

        const announcementOnly = isClose;
        const groupLockCooldown = checkGroupActionCooldown(
          ctx,
          'mutation',
          10000
        );
        if (groupLockCooldown) return failReply(groupLockCooldown);

        if (ctx.waGroupOps) {
          await ctx.waGroupOps.setGroupAnnouncement(announcementOnly);
        } else {
          botStore.updateGroupState({ isAnnouncementOnly: announcementOnly });
        }

        const groupTpl = botStore.getEffectiveTemplate(
          announcementOnly ? 'groupCloseSuccess' : 'groupOpenSuccess',
          effectiveGroupId
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: renderBotTemplate(groupTpl, {
            botName: config.botName,
            prefix: config.prefix,
            sender: ctx.senderPhone,
            groupName: ctx.groupName || botStore.groupState.subject,
          }),
        };
        break;
      }

      case 'setname': {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;

        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        if (!argsText) {
          return failReply(
            `Masukkan nama grup baru.\nContoh: *${config.prefix}setname Gepa Corner Official*`
          );
        }

        const newSubject = argsText.slice(0, 80);
        const setNameCooldown = checkGroupActionCooldown(
          ctx,
          'mutation',
          15000
        );
        if (setNameCooldown) return failReply(setNameCooldown);

        if (ctx.waGroupOps) {
          await ctx.waGroupOps.setGroupSubject(newSubject);
        } else {
          botStore.updateGroupState({ subject: newSubject });
        }

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `Nama grup berhasil diperbarui menjadi *${newSubject}*.`,
        };
        break;
      }

      case 'setdesc': {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;

        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        if (!argsText) {
          return failReply(
            `Masukkan teks deskripsi baru.\nContoh: *${config.prefix}setdesc Diskusi santai komunitas Gepa Corner*`
          );
        }

        const setDescCooldown = checkGroupActionCooldown(
          ctx,
          'mutation',
          15000
        );
        if (setDescCooldown) return failReply(setDescCooldown);

        if (ctx.waGroupOps) {
          await ctx.waGroupOps.setGroupDescription(argsText);
        } else {
          botStore.updateGroupState({ description: argsText });
        }

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `Deskripsi grup berhasil diperbarui:\n_${argsText}_`,
        };
        break;
      }

      case 'linkgc': {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const linkCooldown = checkGroupActionCooldown(
          ctx,
          'invite_link',
          20000
        );
        if (linkCooldown) return failReply(linkCooldown);

        let code: string | undefined;
        if (ctx.waGroupOps) {
          code = await ctx.waGroupOps.getGroupInviteCode();
        } else {
          code = botStore.groupState.inviteCode;
        }

        if (!code) {
          throw new Error('Tidak dapat mengambil kode tautan undangan grup.');
        }

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `*Tautan Undangan Grup*\nhttps://chat.whatsapp.com/${code}`,
        };
        break;
      }

      case 'revoke': {
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;

        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const revokeCooldown = checkGroupActionCooldown(
          ctx,
          'revoke_link',
          60000
        );
        if (revokeCooldown) return failReply(revokeCooldown);

        let newCode: string | undefined;
        if (ctx.waGroupOps) {
          newCode = await ctx.waGroupOps.revokeGroupInviteCode();
        } else {
          newCode = `GpCrnr${Math.random()
            .toString(36)
            .slice(2, 10)
            .toUpperCase()}`;
          botStore.updateGroupState({ inviteCode: newCode });
        }

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `Tautan undangan grup lama telah dihanguskan.\nTautan baru: https://chat.whatsapp.com/${
            newCode || 'diperbarui'
          }`,
        };
        break;
      }

      case 'hidetag':
      case 'tagall': {
        return failReply(SUSPENSION_RISK_DISABLED_REPLY);
      }

      case 'antilink': {
        const mode = argsText.toLowerCase();
        if (mode === 'on' || mode === 'off') {
          const manualGuard = checkManualOnlySettingsGuard();
          if (manualGuard) return manualGuard;
        }

        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (mode !== 'on' && mode !== 'off') {
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: `Status Antilink grup ini: *${
              effectiveGroupSettings.antilink ? 'AKTIF' : 'NONAKTIF'
            }*.\nCatatan: Pengubahan setelan antilink dikelola secara manual melalui Dashboard Web Panel demi menjaga keamanan grup.`,
          };
        }

        const nextVal = mode === 'on';
        if (effectiveGroupId) {
          botStore.updateGroupCustomConfig(effectiveGroupId, {
            antilink: nextVal,
          });
        }
        if (ctx.source === 'simulator') {
          botStore.updateConfig({
            groupSettings: {
              ...config.groupSettings,
              antilink: nextVal,
            },
          });
        }
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: nextVal
            ? `Moderasi *Antilink Grup* berhasil *DIAKTIFKAN*. Pesan berisi tautan dari non-admin akan dihapus otomatis.`
            : `Moderasi *Antilink Grup* telah *DINONAKTIFKAN*.`,
        };
        break;
      }

      case 'welcome': {
        const mode = argsText.toLowerCase();
        if (mode === 'on' || mode === 'off') {
          const manualGuard = checkManualOnlySettingsGuard();
          if (manualGuard) return manualGuard;
        }

        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (mode !== 'on' && mode !== 'off') {
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: `Sambutan member baru di grup ini: *${
              effectiveGroupSettings.welcome ? 'AKTIF' : 'NONAKTIF'
            }*.\nCatatan: Pengubahan setelan sambutan dikelola secara manual melalui Dashboard Web Panel demi ketertiban grup.`,
          };
        }

        const nextVal = mode === 'on';
        if (effectiveGroupId) {
          botStore.updateGroupCustomConfig(effectiveGroupId, {
            welcome: nextVal,
          });
        }
        if (ctx.source === 'simulator') {
          botStore.updateConfig({
            groupSettings: {
              ...config.groupSettings,
              welcome: nextVal,
            },
          });
        }
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `Pesan sambutan anggota baru berhasil diatur ke *${
            nextVal ? 'AKTIF' : 'NONAKTIF'
          }*.`,
        };
        break;
      }

      case 'out': {
        const mode = argsText.toLowerCase();
        if (mode === 'on' || mode === 'off') {
          const manualGuard = checkManualOnlySettingsGuard();
          if (manualGuard) return manualGuard;
        }

        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (mode !== 'on' && mode !== 'off') {
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: `Pesan keluar grup (*out/leave*) saat ini: *${
              effectiveGroupSettings.goodbye ? 'AKTIF' : 'NONAKTIF'
            }*.\nCatatan: Pengubahan setelan pesan keluar dikelola secara manual melalui Dashboard Web Panel.`,
          };
        }

        const nextVal = mode === 'on';
        if (effectiveGroupId) {
          botStore.updateGroupCustomConfig(effectiveGroupId, {
            goodbye: nextVal,
          });
        }
        if (ctx.source === 'simulator') {
          botStore.updateConfig({
            groupSettings: {
              ...config.groupSettings,
              goodbye: nextVal,
            },
          });
        }
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `Pesan otomatis saat anggota keluar grup diatur ke *${
            nextVal ? 'AKTIF' : 'NONAKTIF'
          }*.`,
        };
        break;
      }

      case 'setwelcome': {
        result = handleGroupTemplateSetter(
          'welcomeMsg',
          'Sambutan Masuk (Welcome)',
          'Halo *@user*, selamat bergabung di *@group*!'
        );
        break;
      }

      case 'setout': {
        result = handleGroupTemplateSetter(
          'goodbyeMsg',
          'Pesan Keluar Grup (Out/Leave)',
          'Sampai jumpa *@user*, terima kasih sudah meramaikan *@group*!'
        );
        break;
      }

      case 'setpromote': {
        result = handleGroupTemplateSetter(
          'promoteSuccess',
          'Pengumuman Promote Admin',
          'Selamat *@user*, kamu resmi diangkat menjadi Admin di *@group*!'
        );
        break;
      }

      case 'setdemote': {
        result = handleGroupTemplateSetter(
          'demoteSuccess',
          'Pengumuman Demote Admin',
          'Status Admin *@user* di *@group* telah dicabut.'
        );
        break;
      }

      case 'setantilink': {
        result = handleGroupTemplateSetter(
          'antilinkWarn',
          'Peringatan Antilink',
          'Maaf *@sender*, dilarang mengirim tautan luar di *@group*!'
        );
        break;
      }

      case 'setopen': {
        result = handleGroupTemplateSetter(
          'groupOpenSuccess',
          'Pengumuman Buka Grup',
          'Grup *@group* telah dibuka, silakan berdiskusi kembali!'
        );
        break;
      }

      case 'setclose': {
        result = handleGroupTemplateSetter(
          'groupCloseSuccess',
          'Pengumuman Kunci Grup',
          'Grup *@group* dikunci sementara khusus pengumuman Admin.'
        );
        break;
      }

      case 'cekset': {
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        const gid = effectiveGroupId || 'simulator-group';
        const gName = ctx.groupName || botStore.groupState.subject;
        const lines = [
          `*Pengaturan Fitur & Chat Grup (${gName})*`,
          '',
          `• Welcome Masuk: *${
            effectiveGroupSettings.welcome ? 'AKTIF' : 'NONAKTIF'
          }*`,
          `• Pesan Keluar (Out): *${
            effectiveGroupSettings.goodbye ? 'AKTIF' : 'NONAKTIF'
          }*`,
          `• Moderasi Antilink: *${
            effectiveGroupSettings.antilink ? 'AKTIF' : 'NONAKTIF'
          }*`,
          '',
          `*Teks Welcome (${config.prefix}setwelcome):*`,
          botStore.getEffectiveTemplate('welcomeMsg', gid),
          '',
          `*Teks Out/Keluar (${config.prefix}setout):*`,
          botStore.getEffectiveTemplate('goodbyeMsg', gid),
          '',
          `*Teks Antilink (${config.prefix}setantilink):*`,
          botStore.getEffectiveTemplate('antilinkWarn', gid),
        ];

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: lines.join('\n'),
        };
        break;
      }

      case 'resetset': {
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (effectiveGroupId) {
          botStore.resetGroupCustomTemplates(effectiveGroupId);
        }
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `Seluruh pengaturan teks custom grup berhasil dikembalikan ke bawaan *${config.botName}*.`,
        };
        break;
      }
    }

    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: result.reactionStatus === 'error' ? 'error' : 'success',
      summary: argsText
        ? `${config.prefix}${matchedCmd.id} ${argsText.slice(0, 48)}`
        : `${config.prefix}${matchedCmd.id}`,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });

    return result;
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : 'Terjadi kesalahan saat memproses perintah.';
    botStore.addLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: `${config.prefix}${matchedCmd.id}`,
      source: ctx.source,
      sender: ctx.senderName,
      status: 'error',
      summary: errMsg.slice(0, 80),
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
    return {
      handled: true,
      reactionStatus: 'error',
      replyText: renderBotTemplate(config.templates.errorReply, {
        prefix: config.prefix,
        command: matchedCmd.id,
        error: errMsg,
        botName: config.botName,
      }),
    };
  }
}
