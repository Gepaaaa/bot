import {
  buildBotMenuText,
  COMMAND_CATALOG,
  formatPhoneDisplay,
  OFFICIAL_OWNER_NUMBER,
  renderBotTemplate,
  SUSPENSION_RISK_DISABLED_REPLY,
} from '../src/shared/commands.ts';
import type {
  AiEnhanceMode,
  AiFaceModel,
  AiSrModel,
  GroupEditableTemplateKey,
  SimulatorMember,
} from '../src/shared/types.ts';
import { aiEnhancer } from './aiEnhancer.ts';
import { evaluateAutoResponder } from './autoResponder.ts';
import {
  getExcludedCommandsForDevice,
  isAiHdSupportedOnDevice,
  REDMI9C_AI_HD_NOTICE,
} from './deviceProfile.ts';
import { prepareHdStatusImage } from './imageAdapter.ts';
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
  extractOrConvertAudio,
  generateQrImage,
  type ImageFilterMode,
  uploadBufferToPublicUrl,
} from './mediaProcessor.ts';
import { remoteTunnel } from './remoteTunnel.ts';
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
import { fetchMemeFromWeb } from './memeFetcher.ts';

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
  isVoiceNote?: boolean;
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
  imageMimeType?: string | null;
  videoBuffer?: Buffer | null;
  audioBuffer?: Buffer | null;
  stickerBuffer?: Buffer | null;
  senderAvatarBuffer?: Buffer | null;
  quotedAvatarBuffer?: Buffer | null;
  viewOnceMedia?: IncomingViewOncePayload | null;
  viewOnceError?: string | null;
  quotedText?: string;
  quotedSenderName?: string;
  documentMedia?: IncomingDocumentPayload | null;
  attachedNonDocumentMedia?: boolean;
  mentionedJids?: string[];
  quotedParticipantJid?: string;
  quotedParticipantPhone?: string;
  groupMembers?: SimulatorMember[];
  waGroupOps?: WAGroupOperations;
  onProgressStatus?: (statusText: string) => Promise<void>;
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
  slideFallbackImageUrls?: string[][];
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

function isSenderBotOwner(ctx: IncomingBotContext): boolean {
  const configuredOwner = normalizePhoneInput(
    botStore.config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
  );
  const senderNormalized = normalizePhoneInput(ctx.senderPhone || '');
  return Boolean(
    configuredOwner && senderNormalized && configuredOwner === senderNormalized
  );
}

function checkSenderRateLimit(ctx: IncomingBotContext): boolean {
  if (ctx.source !== 'whatsapp') return false;
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
  const ownerDigits =
    normalizePhoneInput(config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER) ||
    OFFICIAL_OWNER_NUMBER;
  return buildBotMenuText({
    prefix: config.prefix,
    botName: config.botName,
    ownerName: config.ownerName,
    ownerNumber: ownerDigits,
    ownerWebsite: config.ownerWebsite,
    stickerPackName: config.stickerPackName,
    stickerAuthor: config.stickerAuthor,
    disabledCommands: config.disabledCommands,
    excludeCommands: getExcludedCommandsForDevice(),
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

  // Support numbered choice input (e.g. "1. .menudownload" or "1. menudownload")
  let normalizedTrimmed = trimmed;
  const numberedMatch = trimmed.match(/^([1-7])\.\s*(.+)$/);
  if (numberedMatch) {
    const rest = numberedMatch[2].trim();
    normalizedTrimmed = rest.startsWith(config.prefix)
      ? rest
      : `${config.prefix}${rest}`;
  }

  // 3. Single Prefix check
  if (!normalizedTrimmed.startsWith(config.prefix)) {
    const autoReply = evaluateAutoResponder(normalizedTrimmed, {
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

  const withoutPrefix = normalizedTrimmed.slice(config.prefix.length).trim();
  if (!withoutPrefix) {
    return { handled: false };
  }

  const firstSpaceIdx = withoutPrefix.search(/\s/);
  const rawCmd = (
    firstSpaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSpaceIdx)
  ).toLowerCase();
  const argsText =
    firstSpaceIdx === -1 ? '' : withoutPrefix.slice(firstSpaceIdx + 1).trim();

  const NUMBER_TO_MENU: Record<string, string> = {
    '1': 'menudownload',
    '2': 'menustiker',
    '3': 'menumedia',
    '4': 'menuaudio',
    '5': 'menugrup',
    '6': 'menuotomasi',
    '7': 'menuinfo',
  };

  const effectiveCmdId = NUMBER_TO_MENU[rawCmd] || rawCmd;

  const matchedCmd = COMMAND_CATALOG.find(
    (c) => c.id === effectiveCmdId || c.aliases.includes(effectiveCmdId)
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
    if (!ctx.isAdmin && !isSenderBotOwner(ctx)) {
      return failReply(
        `Hanya *Admin Grup* atau *Owner Bot* yang diizinkan menjalankan perintah *${config.prefix}${matchedCmd.id}*.`
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
          '🔒 *Perubahan Pengaturan Dikunci Manual*\n\nBot ini dikunci agar *tidak dapat* mengubah setelan grup maupun setelan nomor/akun bot melalui perintah chat WhatsApp.\n\nSeluruh pengaturan (buka/tutup grup, nama & deskripsi grup, reset link grup, antilink, welcome/out, template, dan preferensi bot) hanya bisa diubah secara *MANUAL* oleh Owner lewat aplikasi WhatsApp atau Web Control Panel.',
      };
    }
    return null;
  };

  const handleGroupTemplateSetter = (
    templateKey: GroupEditableTemplateKey,
    titleLabel: string,
    sampleHint: string
  ): BotCommandResult => {
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

  const isNativeMp3Buffer = (buf: Buffer, contentType: string): boolean => {
    if (buf.length < 12) return false;
    // MP4 / M4A containers have 'ftyp' at byte offset 4 -> must transcode to MP3
    if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
      return false;
    }
    // ID3v2 tag header
    if (buf.subarray(0, 3).toString('ascii') === 'ID3') {
      return true;
    }
    // MPEG audio frame sync word (11 set bits: 0xFF and top 3 bits of byte 1)
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
      return true;
    }
    return contentType.includes('audio/mpeg') || contentType.includes('audio/mp3');
  };

  const ensurePlayableMp3Buffer = async (
    rawBuffer: Buffer,
    contentType: string
  ): Promise<Buffer> => {
    if (isNativeMp3Buffer(rawBuffer, contentType)) {
      return rawBuffer;
    }
    const converted = await extractOrConvertAudio(rawBuffer, 'mp3');
    return converted.buffer;
  };

  const buildSocialDownloadResponse = async (
    targetUrl: string,
    platformHint: SupportedPlatform | 'auto',
    options?: { requireSlides?: boolean }
  ): Promise<BotCommandResult> => {
    const media =
      platformHint === 'tiktok'
        ? await downloadTikTokMedia(targetUrl)
        : await resolveSocialMedia(targetUrl, platformHint);

    if (
      options?.requireSlides &&
      (!media.slideImages || media.slideImages.length === 0)
    ) {
      return failReply(
        `Tautan TikTok tersebut berupa *Video*, bukan postingan *Slide Foto*.\nGunakan perintah *${config.prefix}tt <link>* untuk mengunduh videonya.`
      );
    }

    // 1. Multi-photo slide / carousel (TikTok Slide / IG Carousel / X Gallery)
    if (media.slideImages && media.slideImages.length > 0) {
      botStore.incrementStat('mediaDownloaded');
      const caption = renderBotTemplate(config.templates.downloaderCaption, {
        platform: media.platform.toUpperCase(),
        title: media.title,
        author: media.author,
        duration: media.duration ? `${media.duration} detik` : '-',
        botName: config.botName,
        prefix: config.prefix,
      });
      const proxySlides = media.slideImages.map(
        (u) => `/api/proxy-media?url=${encodeURIComponent(u)}&type=image`
      );
      return {
        handled: true,
        reactionStatus: 'success',
        slideImageUrls: media.slideImages,
        slideFallbackImageUrls: media.slideFallbackImageUrls,
        slideProxyUrls: proxySlides,
        audioRemoteUrl: media.audioUrl,
        audioProxyUrl: media.audioUrl
          ? `/api/proxy-media?url=${encodeURIComponent(
              media.audioUrl
            )}&type=audio`
          : undefined,
        mediaTitle: media.title,
        mediaAuthor: media.author,
        replyText: `${caption}\nTotal Urutan: *${media.slideImages.length} Foto*`,
      };
    }

    // 2. Direct file download (MediaFire)
    if (media.fileUrl) {
      const { buffer, contentType } = await fetchRemoteBuffer(media.fileUrl);
      botStore.incrementStat('mediaDownloaded');
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

    const caption = renderBotTemplate(config.templates.downloaderCaption, {
      platform: media.platform.toUpperCase(),
      title: media.title,
      author: media.author,
      duration: media.duration ? `${media.duration} detik` : '-',
      botName: config.botName,
      prefix: config.prefix,
    });

    // 3. Single photo post (Pinterest / IG / X image)
    if (media.imageUrl && !media.videoUrl) {
      const { buffer, contentType } = await fetchRemoteBuffer(media.imageUrl);
      botStore.incrementStat('mediaDownloaded');
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

    // 4. Video post — download & validate binary buffer now (with automatic fallback URL retry)
    const { buffer: videoBuf } = await fetchRemoteBuffer(
      media.videoUrl,
      35 * 1024 * 1024,
      media.fallbackVideoUrls || []
    );
    botStore.incrementStat('mediaDownloaded');
    const videoWebUrl = botStore.storeHdMedia(
      videoBuf,
      'video/mp4',
      `wabot-${media.platform}.mp4`
    );

    return {
      handled: true,
      reactionStatus: 'success',
      videoBuffer: videoBuf,
      videoMimeType: 'video/mp4',
      videoWebUrl,
      mediaTitle: media.title,
      mediaAuthor: media.author,
      mediaDuration: media.duration,
      replyText: caption,
    };
  };

  try {
    let result: BotCommandResult = { handled: true, reactionStatus: 'success' };

    switch (matchedCmd.id) {
      case 'menu':
      case 'allmenu':
      case 'menudownload':
      case 'menustiker':
      case 'menumedia':
      case 'menuaudio':
      case 'menugrup':
      case 'menuotomasi':
      case 'menuinfo': {
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: buildMenuText(argsText, matchedCmd.id, ctx.senderName),
        };
        break;
      }

      case 'owner': {
        const ownerDigits =
          normalizePhoneInput(
            config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
          ) || OFFICIAL_OWNER_NUMBER;
        const ownerDisplay = formatPhoneDisplay(ownerDigits);
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: [
            `*Kontak Resmi Owner ${config.botName}*`,
            '────────────────────',
            `• *Nama:* ${config.ownerName || 'Owner Bot'}`,
            `• *Nomor:* *${ownerDisplay}*`,
            `• *Chat Langsung:* https://wa.me/${ownerDigits}`,
            '────────────────────',
            `_Silakan hubungi nomor di atas untuk keperluan izin grup atau kendala bot._`,
          ].join('\n'),
        };
        break;
      }

      case 'ping': {
        const latency = Math.max(1, Date.now() - startTime);
        const uptime = formatUptime(Date.now() - SERVER_BOOT_TIME);
        const ownerDigits =
          normalizePhoneInput(
            config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
          ) || OFFICIAL_OWNER_NUMBER;
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
            ownerNumber: ownerDigits,
            ownerDisplay: formatPhoneDisplay(ownerDigits),
            website: config.ownerWebsite,
          }),
        };
        break;
      }

      case 'panel': {
        const ownerDigits =
          normalizePhoneInput(
            config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
          ) || OFFICIAL_OWNER_NUMBER;
        const botSelfDigits = normalizePhoneInput(
          botStore.waState.connectedUser?.phone || ''
        );
        const senderDigits = normalizePhoneInput(ctx.senderPhone || '');
        const isAuthorizedOwner =
          isSenderBotOwner(ctx) ||
          Boolean(
            botSelfDigits && senderDigits && botSelfDigits === senderDigits
          );

        if (!isAuthorizedOwner) {
          return failReply(
            `Perintah *${config.prefix}panel* dikhususkan bagi *Owner Bot* (*${formatPhoneDisplay(
              ownerDigits
            )}*).\n\nJika ini HP keduamu, pastikan nomor WA HP ini sudah didaftarkan sebagai *Nomor Owner* (ketik \`bot owner 628xxx\` di Termux Redmi 9C atau ubah di Pengaturan Panel).`
          );
        }

        if (ctx.isGroup) {
          return failReply(
            `Demi keamanan bot kamu, tautan rahasia Web Control Panel tidak dikirim di dalam Grup.\n\nSilakan kirim perintah *${config.prefix}panel* lewat *Chat Pribadi (Japri)* langsung ke nomor bot ini.`
          );
        }

        const sub = argsText.trim().toLowerCase();

        if (sub === 'off' || sub === 'stop' || sub === 'mati') {
          const snap = remoteTunnel.stopTunnel();
          const lanInfo =
            snap.lanUrls.length > 0
              ? snap.lanUrls.join('\n• ')
              : 'Hubungkan ke Wi-Fi yang sama dengan Redmi 9C';
          result = {
            handled: true,
            reactionStatus: 'success',
            replyText: [
              `*Akses Panel Luar Rumah Dimatikan*`,
              '────────────────────',
              `Tunnel publik internet telah dihentikan. Orang luar tidak dapat mengakses server.`,
              '',
              `*Akses Dalam Rumah (Satu Wi-Fi):*`,
              `• ${lanInfo}`,
              '',
              `_Ketik *${config.prefix}panel* kapan saja untuk menyalakan kembali akses luar rumah._`,
            ].join('\n'),
          };
          break;
        }

        if (sub === 'resetkey' || sub === 'reset') {
          remoteTunnel.rotateAccessKey();
          const snap =
            remoteTunnel.getSnapshot().status === 'online'
              ? remoteTunnel.getSnapshot()
              : await remoteTunnel.startTunnel();
          result = {
            handled: true,
            reactionStatus: 'success',
            replyText: [
              `*Kunci Akses Panel Berhasil Diperbarui*`,
              '────────────────────',
              snap.magicUrl
                ? `*Klik Tautan Baru (Otomatis Masuk):*\n${snap.magicUrl}`
                : `*Kunci Akses Baru:* \`${snap.accessKey}\``,
              '',
              `Tautan lama otomatis hangus dan tidak berlaku lagi.`,
            ].join('\n'),
          };
          break;
        }

        const snap = await remoteTunnel.startTunnel();
        const lanLines =
          snap.lanUrls.length > 0
            ? snap.lanUrls.map((u) => `• ${u}`).join('\n')
            : `• ${snap.localhostUrl} _(cek Wi-Fi Redmi 9C)_`;

        const lines: string[] = [
          `*Akses Web Control Panel — ${config.botName}*`,
          '────────────────────',
        ];

        if (snap.magicUrl) {
          lines.push(`*1. Luar Rumah / Beda Jaringan (4G/5G):*`);
          lines.push(`Klik langsung dari browser HP kedua kamu:`);
          lines.push(`${snap.magicUrl}`);
          lines.push(
            `_(Sudah berisi Kunci Owner — otomatis login tanpa ketik sandi)_`
          );
        } else {
          lines.push(`*1. Luar Rumah / Beda Jaringan (4G/5G):*`);
          lines.push(
            `Tunnel belum aktif: ${
              snap.lastError ||
              'Jalankan sekali di Termux Redmi 9C: pkg install -y cloudflared'
            }`
          );
        }

        lines.push('');
        lines.push(`*2. Dalam Rumah (Satu Wi-Fi dgn Redmi 9C):*`);
        lines.push(lanLines);
        lines.push('');
        lines.push(`*Kunci Akses Cadangan:* \`${snap.accessKey}\``);
        lines.push('────────────────────');
        lines.push(
          `_Perintah cepat: *${config.prefix}panel off* (matikan publik) · *${config.prefix}panel resetkey* (ganti kunci)_`
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: lines.join('\n'),
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

      case 'hd':
      case 'remini':
      case 'upscale':
      case 'hd2':
      case 'hd4': {
        if (!isAiHdSupportedOnDevice()) {
          return failReply(REDMI9C_AI_HD_NOTICE);
        }

        const imgBuf =
          ctx.imageBuffer ||
          (ctx.documentMedia?.kind === 'image'
            ? ctx.documentMedia.buffer
            : null);
        const inputMime =
          ctx.imageMimeType ||
          (ctx.documentMedia?.kind === 'image'
            ? ctx.documentMedia.mimeType
            : undefined);

        if (!imgBuf) {
          return failReply(
            `Kirim sebuah foto dengan caption *${config.prefix}${matchedCmd.id}* atau balas (reply) foto seseorang dengan perintah *${config.prefix}${matchedCmd.id}*.`
          );
        }

        const modeMap: Record<string, AiEnhanceMode> = {
          hd: 'auto',
          remini: 'face',
          upscale: 'upscale',
          hd2: '2x',
          hd4: '4x',
        };
        const enhanceMode: AiEnhanceMode = modeMap[matchedCmd.id] || 'auto';
        const scaleOverride: 2 | 4 | undefined =
          matchedCmd.id === 'hd2' ? 2 : matchedCmd.id === 'hd4' ? 4 : undefined;

        let faceModelOverride: AiFaceModel | undefined;
        let srModelOverride: AiSrModel | undefined;
        let fidelityOverride: number | undefined;
        if (argsText) {
          const tokens = argsText
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
          for (const tok of tokens) {
            if (tok === 'codeformer' || tok === 'cf') {
              faceModelOverride = 'codeformer';
            } else if (tok === 'gfpgan' || tok === 'gfp') {
              faceModelOverride = 'gfpgan';
            } else if (
              tok === 'ultra' ||
              tok === 'ultrasharp' ||
              tok === '4x-ultrasharp' ||
              tok === 'ajib'
            ) {
              srModelOverride = 'ultrasharp';
            } else if (
              tok === 'esrgan' ||
              tok === 'realesrgan' ||
              tok === 'real-esrgan'
            ) {
              srModelOverride = 'realesrgan';
            } else {
              const maybeNum = Number(tok.replace(',', '.'));
              if (
                Number.isFinite(maybeNum) &&
                maybeNum >= 0.05 &&
                maybeNum <= 0.98
              ) {
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
          srModelOverride,
          fidelityOverride,
          config: config.aiEnhance,
          onStatus: ctx.onProgressStatus,
        });

        // Zero permanent storage: WhatsApp photos never enter RAM preview cache;
        // Simulator test images auto-expire after 5 minutes.
        const ephemeralWebUrl =
          ctx.source === 'simulator'
            ? botStore.storeHdMedia(
                enhanced.buffer,
                enhanced.mimeType,
                `wabot-${matchedCmd.id}.${
                  enhanced.mimeType === 'image/png' ? 'png' : 'jpg'
                }`,
                5 * 60 * 1000
              )
            : undefined;

        botStore.incrementStat('mediaDownloaded');

        const { meta } = enhanced;
        const isUltraSharpUsed = meta.modelsUsed.some((m) =>
          m.toLowerCase().includes('ultrasharp')
        );

        const headerTitle =
          enhanceMode === 'face'
            ? '*AI Face Restoration Selesai*'
            : isUltraSharpUsed
            ? '*AI Super-Resolution 4x-UltraSharp Selesai (Super Ajib)*'
            : enhanceMode === '2x'
            ? '*AI Super-Resolution 2× Selesai*'
            : enhanceMode === '4x'
            ? '*AI Super-Resolution 4× Selesai*'
            : enhanceMode === 'upscale'
            ? '*AI Super-Resolution Selesai*'
            : '*AI Photo Enhance Selesai*';
        const captionLines: string[] = [
          headerTitle,
          `• Resolusi: *${meta.inputWidth}×${meta.inputHeight} px* → *${meta.outputWidth}×${meta.outputHeight} px* (*${meta.effectiveScale}×*)`,
          `• Pipeline Model: *${meta.modelsUsed.join(' + ')}*`,
        ];

        if (meta.facesDetected > 0 && meta.faceModelUsed) {
          captionLines.push(
            `• Restorasi Wajah: *${meta.facesDetected} wajah* (Fidelity: *${meta.fidelityUsed.toFixed(
              2
            )}*)`
          );
        }

        const elapsedSec =
          meta.durationMs > 0 ? `${(meta.durationMs / 1000).toFixed(1)} dtk · ` : '';
        captionLines.push(
          `• Berkas: *${elapsedSec}${formatByteSize(enhanced.buffer.length)}*`
        );
        captionLines.push(
          '_Hasil diproses murni di HP via Termux menggunakan algoritma Lanczos3 Super-Resolution & Unsharp Detail Masking tanpa server eksternal._'
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          imageBuffer: enhanced.buffer,
          imageMimeType: enhanced.mimeType,
          imageWebUrl: ephemeralWebUrl,
          replyText: captionLines.join('\n'),
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
          `wabot-${filterMode}.jpg`
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
          if (ctx.viewOnceError) {
            return failReply(ctx.viewOnceError);
          }
          return failReply(
            `Ketik *${config.prefix}rvo* (atau balas pesan View Once) untuk membuka foto/video sekali lihat terakhir di chat ini.`
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
            vo.mimeType || 'audio/ogg; codecs=opus',
            'viewonce-audio.ogg'
          );
          result = {
            handled: true,
            reactionStatus: 'success',
            audioBuffer: vo.buffer,
            audioMimeType: vo.mimeType || 'audio/mpeg',
            audioWebUrl: webUrl,
            asVoiceNote: Boolean(vo.isVoiceNote),
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
            `Ketik teks atau tautan setelah perintah.\nContoh: *${config.prefix}qrcode https://wa.me/${OFFICIAL_OWNER_NUMBER}*`
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
          hintMap[matchedCmd.id] || 'auto',
          { requireSlides: matchedCmd.id === 'ttslide' }
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

        const media = await resolveSocialMedia(targetUrl, 'auto', {
          audioOnly: true,
        });
        const streamUrl = media.audioUrl || media.videoUrl;
        if (!streamUrl) {
          throw new Error(
            'Jalur audio MP3 tidak tersedia pada tautan tersebut.'
          );
        }

        const fallbacks = media.audioUrl
          ? [...(media.fallbackAudioUrls || []), ...(media.videoUrl ? [media.videoUrl] : [])]
          : media.fallbackVideoUrls || [];

        const { buffer: rawStreamBuf, contentType } = await fetchRemoteBuffer(
          streamUrl,
          35 * 1024 * 1024,
          fallbacks
        );
        const mp3Buf = await ensurePlayableMp3Buffer(rawStreamBuf, contentType);
        botStore.incrementStat('mediaDownloaded');
        const audioWebUrl = botStore.storeHdMedia(
          mp3Buf,
          'audio/mpeg',
          'wabot-audio.mp3'
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          audioBuffer: mp3Buf,
          audioMimeType: 'audio/mpeg',
          audioWebUrl,
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

        const { buffer: rawAudioBuf, contentType } = await fetchRemoteBuffer(
          track.audioUrl,
          35 * 1024 * 1024,
          track.fallbackAudioUrls || []
        );
        const mp3Buf = await ensurePlayableMp3Buffer(rawAudioBuf, contentType);
        botStore.incrementStat('mediaDownloaded');
        const audioWebUrl = botStore.storeHdMedia(
          mp3Buf,
          'audio/mpeg',
          'wabot-song.mp3'
        );

        result = {
          handled: true,
          reactionStatus: 'success',
          audioBuffer: mp3Buf,
          audioMimeType: 'audio/mpeg',
          audioWebUrl,
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
          `wabot-audio.${converted.ext}`
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
          `wabot-${effectMode}.mp3`
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
        const rawSender =
          !argsText && ctx.quotedSenderName
            ? ctx.quotedSenderName
            : ctx.senderName;
        const bubbleSender =
          ctx.source === 'simulator'
            ? rawSender.replace(/\s*\((Owner|Member)\)\s*$/i, '').trim() ||
              rawSender
            : rawSender;
        // Otomatis pasang foto profil user pemberi perintah qc (atau jika reply murni tanpa teks ke pesan orang lain dan PP tersedia, fallback ke PP pemberi perintah)
        const avatarBuffer =
          ctx.senderAvatarBuffer ??
          (!argsText && ctx.quotedAvatarBuffer ? ctx.quotedAvatarBuffer : null) ??
          ctx.imageBuffer ??
          null;
        const stickerBuf = await createQuoteChatSticker({
          text: bubbleText,
          senderName: bubbleSender,
          style: matchedCmd.id === 'iqc' ? 'ios' : 'wa',
          packName: config.stickerPackName,
          author: config.stickerAuthor,
          avatarBuffer,
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
        try {
          const meme = await fetchMemeFromWeb(argsText);
          const webUrl = botStore.storeHdMedia(
            meme.buffer,
            meme.mimeType,
            'meme.jpg'
          );
          result = {
            handled: true,
            reactionStatus: 'success',
            imageBuffer: meme.buffer,
            imageMimeType: meme.mimeType,
            imageWebUrl: webUrl,
            replyText: `😂 *${meme.title}*\n🌐 _Sumber: ${meme.source}_`,
          };
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.message : 'Gagal mengambil meme';
          return failReply(
            `Gagal mengambil gambar meme dari referensi web (${errMsg}). Coba ketik *${config.prefix}meme* kembali.`
          );
        }
        break;
      }

      case 'smeme': {
        if (!argsText && !ctx.imageBuffer && !ctx.stickerBuffer) {
          return failReply(
            `Gunakan format *${config.prefix}smeme teks atas | teks bawah* (bisa sambil melampirkan atau me-reply foto maupun stiker untuk dijadikan stiker meme).`
          );
        }
        const parts = argsText.split('|');
        const topText = (parts[0] || '').trim();
        const bottomText = (parts.slice(1).join(' ') || '').trim();

        let baseImg: Buffer | null = ctx.imageBuffer ?? null;
        if (!baseImg && ctx.stickerBuffer) {
          try {
            baseImg = await stickerWebpToPng(ctx.stickerBuffer);
          } catch {
            baseImg = null;
          }
        }

        const stickerBuf = await createMemeSticker(
          topText || (bottomText ? '' : 'SANTAI DULU'),
          bottomText,
          baseImg,
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

        let newPack: string;
        let newAuthor: string;

        if (argsText.includes('|')) {
          const parts = argsText.split('|');
          newPack = (parts[0] || '').trim() || config.stickerPackName || 'WA Sticker';
          newAuthor = (parts.slice(1).join('|') || '').trim();
        } else if (argsText.trim()) {
          // Hanya nama saja tanpa tambahan apa pun (tidak memaksakan nick WA atau '•')
          const singleName = argsText.trim();
          newPack = singleName;
          newAuthor = '';
        } else {
          newPack = config.stickerPackName || 'WA Sticker';
          newAuthor = '';
        }

        const rebranded = await rewriteStickerExif(
          targetSticker,
          newPack,
          newAuthor
        );
        const webUrl = botStore.storeSticker(rebranded);
        botStore.incrementStat('stickersCreated');

        const labelConfirmed = newAuthor ? `*${newPack}* · *${newAuthor}*` : `*${newPack}*`;

        result = {
          handled: true,
          reactionStatus: 'success',
          stickerBuffer: rebranded,
          stickerWebUrl: webUrl,
          stickerPackOverride: { pack: newPack, author: newAuthor || newPack },
          replyText: `Watermark stiker diperbarui: ${labelConfirmed}`,
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
            `Masukkan nama grup baru.\nContoh: *${config.prefix}setname Ruang Diskusi Komunitas*`
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
            `Masukkan teks deskripsi baru.\nContoh: *${config.prefix}setdesc Ruang diskusi santai anggota komunitas*`
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
          newCode = `Invite${Math.random()
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

      case 'hidetag': {
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
            'hidetag',
            cooldownSec * 1000
          );
          if (htCooldown) {
            botStore.incrementAntiBanStat('hidetagProtected');
            return failReply(htCooldown);
          }
        }

        const members = ctx.groupMembers || botStore.groupMembers;
        const allJids = Array.from(
          new Set(members.map((m) => m.jid).filter(Boolean))
        );
        const announceText =
          argsText ||
          ctx.quotedText ||
          `📢 *Pengumuman Grup (${
            ctx.groupName || botStore.groupState.subject
          })*`;

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: announceText,
          hiddenMentions: allJids,
        };
        break;
      }

      case 'tagall': {
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
            'hidetag',
            cooldownSec * 1000
          );
          if (tagCooldown) {
            botStore.incrementAntiBanStat('hidetagProtected');
            return failReply(tagCooldown);
          }
        }

        const members = ctx.groupMembers || botStore.groupMembers;
        const allJids = Array.from(
          new Set(members.map((m) => m.jid).filter(Boolean))
        );
        const headerMsg = argsText || ctx.quotedText || 'Panggilan seluruh anggota grup';
        const gTitle = ctx.groupName || botStore.groupState.subject;
        const mentionLines = members.map((m, idx) => {
          const tagId = m.jid.split(':')[0]?.split('@')[0] || m.phone;
          return `${idx + 1}. @${tagId}`;
        });

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: [
            `*TAG ALL · ${gTitle}*`,
            `Pesan: *${headerMsg}*`,
            '────────────────────',
            ...mentionLines,
          ].join('\n'),
          mentions: allJids,
        };
        break;
      }

      case 'antilink': {
        const mode = argsText.toLowerCase();
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (mode !== 'on' && mode !== 'off') {
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: `Status Antilink grup ini: *${
              effectiveGroupSettings.antilink ? 'AKTIF' : 'NONAKTIF'
            }*.\n\nKetik *${config.prefix}antilink on* atau *${config.prefix}antilink off* untuk menyetel.`,
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
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (mode !== 'on' && mode !== 'off') {
          const currentTpl = botStore.getEffectiveTemplate('welcomeMsg', effectiveGroupId);
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: [
              `Sambutan member baru di grup ini: *${
                effectiveGroupSettings.welcome ? 'AKTIF' : 'NONAKTIF'
              }*`,
              '',
              `• Ketik *${config.prefix}welcome on* atau *${config.prefix}welcome off* untuk sakelar.`,
              `• Ketik *${config.prefix}setwelcome <teks>* untuk mengubah teks sambutan.`,
              '',
              `*Teks Sambutan Saat Ini:*`,
              currentTpl,
            ].join('\n'),
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
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        if (mode !== 'on' && mode !== 'off') {
          const currentTpl = botStore.getEffectiveTemplate('goodbyeMsg', effectiveGroupId);
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: [
              `Pesan keluar grup (*out/leave*) saat ini: *${
                effectiveGroupSettings.goodbye ? 'AKTIF' : 'NONAKTIF'
              }*`,
              '',
              `• Ketik *${config.prefix}out on* atau *${config.prefix}out off* untuk sakelar.`,
              `• Ketik *${config.prefix}setout <teks>* untuk mengubah teks perpisahan.`,
              '',
              `*Teks Perpisahan Saat Ini:*`,
              currentTpl,
            ].join('\n'),
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
        const lowerArg = argsText.toLowerCase();
        if (lowerArg === 'on' || lowerArg === 'off') {
          const nextVal = lowerArg === 'on';
          const guard = ensureSenderGroupAdmin();
          if (guard) return guard;
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
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: `Pesan sambutan anggota baru berhasil diatur ke *${
              nextVal ? 'AKTIF' : 'NONAKTIF'
            }*.`,
          };
        }
        result = handleGroupTemplateSetter(
          'welcomeMsg',
          'Sambutan Masuk (Welcome)',
          'Halo *@user*, selamat bergabung di *@group*!'
        );
        break;
      }

      case 'setout': {
        const lowerArg = argsText.toLowerCase();
        if (lowerArg === 'on' || lowerArg === 'off') {
          const nextVal = lowerArg === 'on';
          const guard = ensureSenderGroupAdmin();
          if (guard) return guard;
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
          return {
            handled: true,
            reactionStatus: 'success',
            replyText: `Pesan otomatis saat anggota keluar grup diatur ke *${
              nextVal ? 'AKTIF' : 'NONAKTIF'
            }*.`,
          };
        }
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
        const manualGuard = checkManualOnlySettingsGuard();
        if (manualGuard) return manualGuard;

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
