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
import {
  downloadTikTokMedia,
  extractFirstUrl,
  resolveSocialMedia,
} from './mediaDownloader.ts';
import { botStore } from './stateStore.ts';
import {
  createBratSticker,
  createMemeSticker,
  imageToStickerWebp,
} from './stickerStudio.ts';
import { evaluateAutoResponder } from './autoResponder.ts';

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

export interface HdSwPreparedMedia {
  kind: 'image' | 'video';
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  fileSizeLabel: string;
  privateCaption: string;
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

  // 1. Check quoted reply participant first
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

  // 2. Check explicit @mention JIDs from WhatsApp message contextInfo
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

  // 3. Parse phone digits or @628... from argsText
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

  // 4. Match by name in Simulator group roster
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

  // 1. Passive Group Antilink Moderation (for non-admins sending links)
  if (
    ctx.isGroup &&
    effectiveGroupSettings.antilink &&
    !ctx.isAdmin &&
    LINK_REGEX.test(trimmed) &&
    !trimmed.startsWith(`${config.prefix}tt`) &&
    !trimmed.startsWith(`${config.prefix}mp3`) &&
    !trimmed.startsWith(`${config.prefix}ig`) &&
    !trimmed.startsWith(`${config.prefix}yt`)
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

  // 3. Prefix check
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

  // Silently ignore rapid command floods (<3.5s) from the same WhatsApp sender to protect bot number from spam ban
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

      case 'hdsw': {
        // Anti-ban safeguard: never initiate cold outbound DM to a group member who hasn't chatted the bot privately first
        if (ctx.source === 'whatsapp' && ctx.isGroup) {
          return failReply(
            `Demi keamanan nomor bot agar tidak terdeteksi spam pesan pribadi (DM) ke nomor baru oleh WhatsApp, silakan kirim file *Dokumen* foto/video langsung ke *Chat Pribadi* *${config.botName}* dengan caption *${config.prefix}hdsw*.`
          );
        }

        if (!ctx.documentMedia) {
          if (ctx.attachedNonDocumentMedia) {
            return failReply(
              `Supaya kualitas & ukuran file tetap 100% asli (tidak dikompresi WhatsApp), kirim file foto/video melalui menu *Dokumen (Document)* lalu beri caption *${config.prefix}hdsw* atau balas dokumen tersebut dengan *${config.prefix}hdsw*.`
            );
          }
          return failReply(
            `Kirim file *Foto* atau *Video* lewat menu *Dokumen (Document)* dengan caption *${config.prefix}hdsw* (atau balas file dokumen foto/video dengan *${config.prefix}hdsw*).\n\nBot akan mengirimkannya kembali ke *Chat Pribadi* kamu sebagai media ukuran asli seperti kiriman WA Web, jadi kamu tinggal teruskan jernih ke Status WA!`
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

            // Convert WebP document to lossless PNG for universal WA photo forwarding; keep JPEG/PNG bytes 100% untouched
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
          // Video: preserve 100% untouched original bytes (WA Web native upload)
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

        const privateCaption =
          argsText.toLowerCase() === 'nocaption'
            ? ''
            : argsText
            ? argsText
            : renderBotTemplate(config.templates.hdswCaption, {
                mediaKind: mediaKindLabel,
                fileSize: fileSizeLabel,
                fileName: doc.fileName || mediaKindLabel,
                botName: config.botName,
                prefix: config.prefix,
              });

        botStore.incrementStat('mediaDownloaded');

        const groupReply = ctx.isGroup
          ? renderBotTemplate(config.templates.hdswGroupConfirm, {
              mediaKind: mediaKindLabel,
              fileName: doc.fileName || mediaKindLabel,
              fileSize: fileSizeLabel,
              sender: ctx.senderPhone,
              target: ctx.senderPhone,
              botName: config.botName,
              prefix: config.prefix,
            })
          : privateCaption;

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: groupReply,
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
            privateCaption,
            webUrl,
            width,
            height,
            jpegThumbnail,
          },
        };
        break;
      }

      case 'tt':
      case 'ig':
      case 'yt': {
        const targetUrl = extractFirstUrl(argsText);
        if (!targetUrl) {
          return failReply(
            `Masukkan tautan yang valid.\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }

        const platformHint =
          matchedCmd.id === 'tt'
            ? 'tiktok'
            : matchedCmd.id === 'ig'
            ? 'instagram'
            : 'youtube';

        const media =
          platformHint === 'tiktok'
            ? await downloadTikTokMedia(targetUrl)
            : await resolveSocialMedia(targetUrl, platformHint);

        if (!media.videoUrl) {
          throw new Error('URL video tidak ditemukan dari tautan tersebut.');
        }

        botStore.incrementStat('mediaDownloaded');
        const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(
          media.videoUrl
        )}&type=video`;

        result = {
          handled: true,
          reactionStatus: 'success',
          videoRemoteUrl: media.videoUrl,
          videoProxyUrl: proxyUrl,
          mediaTitle: media.title,
          mediaAuthor: media.author,
          mediaDuration: media.duration,
          replyText: renderBotTemplate(config.templates.downloaderCaption, {
            platform: media.platform.toUpperCase(),
            title: media.title,
            author: media.author,
            duration: media.duration ? `${media.duration} detik` : '-',
            botName: config.botName,
            prefix: config.prefix,
          }),
        };
        break;
      }

      case 'mp3': {
        const targetUrl = extractFirstUrl(argsText);
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

      case 's': {
        if (!ctx.imageBuffer) {
          return failReply(
            renderBotTemplate(config.templates.stickerMissingMedia, {
              prefix: config.prefix,
              botName: config.botName,
              packName: config.stickerPackName,
              authorName: config.stickerAuthor,
            })
          );
        }

        const stickerBuf = await imageToStickerWebp(
          ctx.imageBuffer,
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

      case 'brat':
      case 'bratwhite': {
        if (!argsText) {
          return failReply(
            `Ketik teks setelah perintah.\nContoh: *${config.prefix}${matchedCmd.example}*`
          );
        }

        const variant = matchedCmd.id === 'brat' ? 'lime' : 'white';
        const stickerBuf = await createBratSticker(
          argsText,
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
              `Nomor *+${target.phone}* tidak berada di dalam grup ini.`
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
            targetName: target.member?.name || `+${target.phone}`,
            sender: ctx.senderPhone,
            botName: config.botName,
            groupName: ctx.groupName || botStore.groupState.subject,
          }),
          mentions: [target.jid],
        };
        break;
      }

      case 'add': {
        const guard = ensureFullGroupAdminWithBot();
        if (guard) return guard;

        const cleanDigits = normalizePhoneInput(argsText);
        if (cleanDigits.length < 9 || cleanDigits.length > 16) {
          return failReply(
            `Masukkan nomor WhatsApp yang ingin ditambahkan.\nContoh: *${config.prefix}add 628199000777*`
          );
        }
        const targetJid = `${cleanDigits}@s.whatsapp.net`;

        if (ctx.waGroupOps) {
          await ctx.waGroupOps.addParticipant(targetJid);
        } else {
          const already = botStore.groupMembers.some(
            (m) => m.phone === cleanDigits
          );
          if (already) {
            return failReply(
              `Nomor *+${cleanDigits}* sudah menjadi anggota grup.`
            );
          }
          botStore.setGroupMembers([
            ...botStore.groupMembers,
            {
              jid: targetJid,
              name: `Anggota +${cleanDigits.slice(-4)}`,
              phone: cleanDigits,
              isAdmin: false,
            },
          ]);
        }

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: renderBotTemplate(config.templates.addSuccess, {
            target: cleanDigits,
            botName: config.botName,
            groupName: ctx.groupName || botStore.groupState.subject,
          }),
          mentions: [targetJid],
        };
        break;
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

        const promoteCooldown = checkGroupActionCooldown(ctx, 'mutation', 12000);
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
        const groupLockCooldown = checkGroupActionCooldown(ctx, 'mutation', 10000);
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
        const setNameCooldown = checkGroupActionCooldown(ctx, 'mutation', 15000);
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

        const setDescCooldown = checkGroupActionCooldown(ctx, 'mutation', 15000);
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

        const linkCooldown = checkGroupActionCooldown(ctx, 'invite_link', 20000);
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

      case 'hidetag': {
        const { antiBan } = botStore.config;

        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        const cooldownSec = antiBan?.enabled
          ? antiBan.hidetagCooldownSeconds || 45
          : 15;
        const hidetagCooldown = checkGroupActionCooldown(
          ctx,
          'hidetag',
          cooldownSec * 1000
        );
        if (hidetagCooldown) {
          return failReply(
            `🛡️ *Anti-Ban Shield Aktif*: Perintah hidetag dibatasi jeda *${cooldownSec} detik* per grup untuk melindungi nomor bot dari deteksi spam WhatsApp. ${hidetagCooldown}`
          );
        }

        const members = ctx.groupMembers || botStore.groupMembers;
        const maxLimit = antiBan?.enabled
          ? antiBan.maxMentionsLimit || 40
          : 50;

        const targetMentions = members.slice(0, maxLimit).map((m) => m.jid);
        const announcement =
          argsText || 'Perhatian untuk seluruh anggota grup!';

        botStore.incrementAntiBanStat('hidetagProtected');

        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: announcement,
          hiddenMentions: targetMentions,
        };
        break;
      }

      case 'tagall': {
        const guard = ensureSenderGroupAdmin();
        if (guard) return guard;

        const members = ctx.groupMembers || botStore.groupMembers;
        const header = argsText || 'Panggilan seluruh anggota grup';
        const mentionLines = members.map(
          (m, i) => `${i + 1}. @${m.phone} (${m.name})`
        );
        result = {
          handled: true,
          reactionStatus: 'success',
          replyText: `*${header}*\n\n${mentionLines.join('\n')}`,
          mentions: members.map((m) => m.jid),
        };
        break;
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
