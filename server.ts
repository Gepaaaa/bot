import 'dotenv/config';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  type IncomingDocumentPayload,
  type IncomingViewOncePayload,
  processBotMessage,
  shouldSendPendingReaction,
} from './server/commandEngine.ts';
import { gatewayRouter } from './server/gatewayRouter.ts';
import {
  getOrCreateSampleAudioBuffer,
  getOrCreateSampleVideoBuffer,
} from './server/mediaProcessor.ts';
import { botStore } from './server/stateStore.ts';
import { waManager } from './server/waManager.ts';
import { renderBotTemplate } from './src/shared/commands.ts';
import type { BotConfig, SimulatorMessage } from './src/shared/types.ts';

const PORT = Number(process.env.PORT || 3000);

function classifySimulatorDocKind(
  mimeType: string,
  fileName: string
): 'image' | 'video' | 'unsupported' {
  const m = (mimeType || '').toLowerCase();
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (
    m.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)
  ) {
    return 'image';
  }
  if (
    m.startsWith('video/') ||
    ['mp4', 'mov', 'mkv', 'webm', 'm4v', '3gp'].includes(ext)
  ) {
    return 'video';
  }
  return 'unsupported';
}

function formatByteLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function loadSampleCatBuffer(): Promise<Buffer | null> {
  try {
    const samplePath = path.join(
      process.cwd(),
      'src',
      'assets',
      'images',
      'sample_sticker_cat_1793095457845.jpg'
    );
    return await fs.readFile(samplePath);
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Cross-Origin Resource Sharing (CORS) so a Vercel static frontend can connect to this 24/7 Bot Server
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Api-Key'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // WebSocket server mounted on /ws on the same port 3000 HTTP server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    botStore.attachClient(ws);
  });

  // --- REST API ROUTES ---
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      engine: 'GepaBot Stateful Engine',
      waStatus: botStore.waState.status,
      timestamp: Date.now(),
    });
  });

  app.use('/api/gateway', gatewayRouter);

  app.get('/api/state', (_req, res) => {
    res.json(botStore.getSnapshot());
  });

  app.post('/api/wa/connect-qr', async (_req, res) => {
    try {
      await waManager.connectWithQR();
      res.json({ ok: true, waState: botStore.waState });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memulai sesi QR.',
      });
    }
  });

  app.post('/api/wa/connect-pairing', async (req, res) => {
    try {
      const phoneNumber = String(req.body?.phoneNumber || '');
      await waManager.connectWithPairingCode(phoneNumber);
      res.json({ ok: true, waState: botStore.waState });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Gagal meminta Pairing Code.',
      });
    }
  });

  app.post('/api/wa/disconnect', async (_req, res) => {
    await waManager.disconnect(true);
    res.json({ ok: true, waState: botStore.waState });
  });

  app.patch('/api/config', (req, res) => {
    const patch = (req.body || {}) as Partial<BotConfig>;
    const updated = botStore.updateConfig(patch);
    res.json({ ok: true, config: updated });
  });

  app.get('/api/sample-cat.jpg', async (_req, res) => {
    const buf = await loadSampleCatBuffer();
    if (!buf) {
      res.status(404).send('Gambar contoh tidak ditemukan.');
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  });

  app.get('/api/sample-video.mp4', async (_req, res) => {
    try {
      const buf = await getOrCreateSampleVideoBuffer();
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(500).send('Gagal menyiapkan video contoh.');
    }
  });

  app.get('/api/sample-audio.mp3', async (_req, res) => {
    try {
      const buf = await getOrCreateSampleAudioBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(500).send('Gagal menyiapkan audio contoh.');
    }
  });

  app.get('/api/stickers/:stickerFile', (req, res) => {
    const rawParam = String(req.params.stickerFile || '');
    const id = rawParam.replace(/\.webp$/i, '');
    const buffer = botStore.stickerCache.get(id);
    if (!buffer) {
      res.status(404).send('Stiker tidak ditemukan.');
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });

  app.get('/api/hd-media/:mediaId', (req, res) => {
    const mediaId = String(req.params.mediaId || '');
    const item = botStore.hdMediaCache.get(mediaId);
    if (!item) {
      res.status(404).send('Media HD tidak ditemukan atau sudah kedaluwarsa.');
      return;
    }
    const forceDownload = req.query.download === '1';
    res.setHeader('Content-Type', item.mimeType);
    res.setHeader('Content-Length', String(item.buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (forceDownload) {
      const safeName = (item.fileName || 'hd-status').replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}"`
      );
    }
    res.send(item.buffer);
  });

  app.get('/api/proxy-media', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const mediaType = String(req.query.type || 'video');
    const forceDownload = req.query.download === '1';

    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      res.status(400).send('URL media tidak valid.');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const upstream = await fetch(rawUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: rawUrl.includes('tikwm')
            ? 'https://www.tikwm.com/'
            : rawUrl,
        },
        signal: controller.signal,
      });

      if (!upstream.ok || !upstream.body) {
        res.status(upstream.status || 502).send('Gagal memuat aliran media.');
        return;
      }

      const contentType =
        mediaType === 'audio'
          ? 'audio/mpeg'
          : mediaType === 'image'
          ? upstream.headers.get('content-type') || 'image/jpeg'
          : upstream.headers.get('content-type') || 'video/mp4';

      res.setHeader('Content-Type', contentType);
      const len = upstream.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);

      if (forceDownload) {
        const ext =
          mediaType === 'audio'
            ? 'mp3'
            : mediaType === 'image'
            ? 'jpg'
            : 'mp4';
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="gepabot-${Date.now()}.${ext}"`
        );
      }

      const arrayBuf = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Waktu habis saat mengambil media dari sumber.');
      }
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post('/api/simulator/clear', (req, res) => {
    const chatMode =
      req.body?.chatMode === 'group'
        ? 'group'
        : req.body?.chatMode === 'private'
        ? 'private'
        : undefined;
    botStore.clearSimulatorMessages(chatMode);
    res.json({ ok: true, messages: botStore.simulatorMessages });
  });

  app.post('/api/simulator/group-event', (req, res) => {
    const action: 'welcome' | 'goodbye' =
      req.body?.action === 'goodbye' ? 'goodbye' : 'welcome';
    const gid = 'simulator-group';
    const settings = botStore.getEffectiveGroupSettings(gid);

    if (action === 'welcome' && !settings.welcome) {
      res.status(400).json({
        ok: false,
        error: `Fitur welcome sedang nonaktif di grup ini. Ketik ${botStore.config.prefix}welcome on terlebih dahulu.`,
      });
      return;
    }
    if (action === 'goodbye' && !settings.goodbye) {
      res.status(400).json({
        ok: false,
        error: `Fitur pesan keluar (out) sedang nonaktif di grup ini. Ketik ${botStore.config.prefix}out on terlebih dahulu.`,
      });
      return;
    }

    const samplePhone = '628577000333';
    const tpl = botStore.getEffectiveTemplate(
      action === 'welcome' ? 'welcomeMsg' : 'goodbyeMsg',
      gid
    );
    const rendered = renderBotTemplate(tpl, {
      target: samplePhone,
      sender: samplePhone,
      groupName: botStore.groupState.subject,
      prefix: botStore.config.prefix,
      botName: botStore.config.botName,
    });

    const botMsg: SimulatorMessage = {
      id: `sim-ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatMode: 'group',
      sender: 'bot',
      senderName: botStore.config.botName,
      senderPhone: 'Bot Engine',
      text: rendered,
      timestamp: Date.now(),
      mentions: [`${samplePhone}@s.whatsapp.net`],
    };

    botStore.addSimulatorMessage(botMsg);
    res.json({ ok: true });
  });

  app.post('/api/simulator/inject-viewonce', async (req, res) => {
    const chatMode: 'private' | 'group' =
      req.body?.chatMode === 'group' ? 'group' : 'private';
    const catBuf = await loadSampleCatBuffer();
    if (!catBuf) {
      res.status(500).json({ ok: false, error: 'Media contoh tidak ditemukan.' });
      return;
    }
    const voUrl = botStore.storeHdMedia(catBuf, 'image/jpeg', 'viewonce-secret.jpg');
    const voMsg: SimulatorMessage = {
      id: `sim-vo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatMode,
      sender: 'member',
      senderName: 'Raka Pratama',
      senderPhone: '628138000222',
      isAdmin: true,
      text: 'Foto rahasia sekali lihat (coba klik Balas lalu ketik .rvo)',
      timestamp: Date.now(),
      media: {
        type: 'image',
        url: voUrl,
        mimeType: 'image/jpeg',
        isViewOnce: true,
        title: 'Foto Sekali Lihat (View Once)',
      },
    };
    botStore.addSimulatorMessage(voMsg);
    res.json({ ok: true, message: voMsg });
  });

  app.post('/api/simulator/send', async (req, res) => {
    try {
      const chatMode: 'private' | 'group' =
        req.body?.chatMode === 'group' ? 'group' : 'private';
      const senderRole: 'admin' | 'member' =
        req.body?.senderRole === 'member' ? 'member' : 'admin';
      const text = String(req.body?.text || '').trim();
      const imageBase64 = req.body?.imageBase64
        ? String(req.body.imageBase64)
        : null;
      const useSampleCat = Boolean(req.body?.useSampleCat);
      const useSampleVideo = Boolean(req.body?.useSampleVideo);
      const useSampleAudio = Boolean(req.body?.useSampleAudio);
      const documentBase64 = req.body?.documentBase64
        ? String(req.body.documentBase64)
        : null;
      const documentMimeType = req.body?.documentMimeType
        ? String(req.body.documentMimeType)
        : '';
      const documentFileName = req.body?.documentFileName
        ? String(req.body.documentFileName)
        : '';
      const useSampleHdDoc = Boolean(req.body?.useSampleHdDoc);
      const replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;

      if (
        !text &&
        !imageBase64 &&
        !useSampleCat &&
        !useSampleVideo &&
        !useSampleAudio &&
        !documentBase64 &&
        !useSampleHdDoc
      ) {
        res.status(400).json({ ok: false, error: 'Pesan tidak boleh kosong.' });
        return;
      }

      let imageBuffer: Buffer | null = null;
      let videoBuffer: Buffer | null = null;
      let audioBuffer: Buffer | null = null;
      let stickerBuffer: Buffer | null = null;
      let viewOnceMedia: IncomingViewOncePayload | null = null;
      let attachedPreviewMedia: SimulatorMessage['media'] | undefined;

      if (imageBase64) {
        const base64Clean = imageBase64.includes(',')
          ? imageBase64.split(',')[1]
          : imageBase64;
        imageBuffer = Buffer.from(base64Clean, 'base64');
        attachedPreviewMedia = {
          type: 'image',
          url: imageBase64,
          mimeType: 'image/jpeg',
        };
      } else if (useSampleCat) {
        imageBuffer = await loadSampleCatBuffer();
        attachedPreviewMedia = {
          type: 'image',
          url: '/api/sample-cat.jpg',
          mimeType: 'image/jpeg',
        };
      } else if (useSampleVideo) {
        videoBuffer = await getOrCreateSampleVideoBuffer();
        attachedPreviewMedia = {
          type: 'video',
          url: '/api/sample-video.mp4',
          mimeType: 'video/mp4',
          fileName: 'sample-clip.mp4',
          title: 'Video Pendek Uji Coba',
        };
      } else if (useSampleAudio) {
        audioBuffer = await getOrCreateSampleAudioBuffer();
        attachedPreviewMedia = {
          type: 'audio',
          url: '/api/sample-audio.mp3',
          mimeType: 'audio/mpeg',
          fileName: 'sample-audio.mp3',
          title: 'Audio / Voice Note Uji Coba',
        };
      }

      let documentMedia: IncomingDocumentPayload | null = null;

      if (documentBase64) {
        const base64Clean = documentBase64.includes(',')
          ? documentBase64.split(',')[1]
          : documentBase64;
        const docBuf = Buffer.from(base64Clean, 'base64');
        const resolvedMime = documentMimeType || 'application/octet-stream';
        const resolvedName = documentFileName || 'dokumen-asli';
        const kind = classifySimulatorDocKind(resolvedMime, resolvedName);
        const storedDocUrl = botStore.storeHdMedia(
          docBuf,
          resolvedMime,
          resolvedName
        );
        const sizeLabel = formatByteLabel(docBuf.length);

        documentMedia = {
          kind,
          buffer: kind !== 'unsupported' ? docBuf : undefined,
          mimeType: resolvedMime,
          fileName: resolvedName,
          fileSize: docBuf.length,
        };

        attachedPreviewMedia = {
          type: 'document',
          url: storedDocUrl,
          mimeType: resolvedMime,
          fileName: resolvedName,
          fileSizeLabel: sizeLabel,
          docMediaKind: kind === 'unsupported' ? 'other' : kind,
        };
      } else if (useSampleHdDoc) {
        const catBuf = await loadSampleCatBuffer();
        if (catBuf) {
          const resolvedName = 'GepaCorner-Portrait-RAW-Original.jpg';
          const resolvedMime = 'image/jpeg';
          const storedDocUrl = botStore.storeHdMedia(
            catBuf,
            resolvedMime,
            resolvedName
          );
          const sizeLabel = formatByteLabel(catBuf.length);

          documentMedia = {
            kind: 'image',
            buffer: catBuf,
            mimeType: resolvedMime,
            fileName: resolvedName,
            fileSize: catBuf.length,
          };

          attachedPreviewMedia = {
            type: 'document',
            url: storedDocUrl,
            mimeType: resolvedMime,
            fileName: resolvedName,
            fileSizeLabel: sizeLabel,
            docMediaKind: 'image',
          };
        }
      }

      let replySnapshot: SimulatorMessage['replyTo'] | undefined;
      let quotedParticipantPhone: string | undefined;
      let quotedParticipantJid: string | undefined;
      let quotedText: string | undefined;
      let quotedSenderName: string | undefined;
      let quotedRegularMedia = false;

      const resolveCachedBufferFromUrl = async (
        mediaUrl?: string
      ): Promise<Buffer | null> => {
        if (!mediaUrl) return null;
        if (mediaUrl.startsWith('data:')) {
          const rawB64 = mediaUrl.split(',')[1];
          return rawB64 ? Buffer.from(rawB64, 'base64') : null;
        }
        if (
          mediaUrl.includes('sample_sticker_cat') ||
          mediaUrl.includes('sample-cat.jpg')
        ) {
          return loadSampleCatBuffer();
        }
        if (mediaUrl.includes('sample-video.mp4')) {
          return getOrCreateSampleVideoBuffer();
        }
        if (mediaUrl.includes('sample-audio.mp3')) {
          return getOrCreateSampleAudioBuffer();
        }
        if (mediaUrl.startsWith('/api/hd-media/')) {
          const id = mediaUrl.replace('/api/hd-media/', '').split('?')[0];
          return botStore.hdMediaCache.get(id)?.buffer || null;
        }
        if (mediaUrl.startsWith('/api/stickers/')) {
          const id = mediaUrl
            .replace('/api/stickers/', '')
            .replace(/\.webp.*$/i, '');
          return botStore.stickerCache.get(id) || null;
        }
        return null;
      };

      if (replyToId) {
        const targetMsg = botStore.simulatorMessages.find(
          (m) => m.id === replyToId
        );
        if (targetMsg) {
          quotedText = targetMsg.text || undefined;
          quotedSenderName = targetMsg.senderName;
          if (targetMsg.sender !== 'bot' && targetMsg.sender !== 'system') {
            quotedParticipantPhone = targetMsg.senderPhone;
            quotedParticipantJid = `${targetMsg.senderPhone}@s.whatsapp.net`;
          }
          replySnapshot = {
            id: targetMsg.id,
            senderName: targetMsg.senderName,
            senderPhone: targetMsg.senderPhone,
            text:
              targetMsg.text ||
              (targetMsg.media
                ? `[${
                    targetMsg.media.isViewOnce
                      ? 'View Once'
                      : targetMsg.media.type === 'document'
                      ? `Dokumen: ${targetMsg.media.fileName || 'File'}`
                      : targetMsg.media.type
                  }]`
                : ''),
            mediaType: targetMsg.media?.type,
            mediaUrl: targetMsg.media?.url,
            isViewOnce: targetMsg.media?.isViewOnce,
            hasImage: targetMsg.media?.type === 'image',
            imageUrl: targetMsg.media?.url,
            hasDocument: targetMsg.media?.type === 'document',
            documentUrl:
              targetMsg.media?.type === 'document'
                ? targetMsg.media.url
                : undefined,
            documentMimeType:
              targetMsg.media?.type === 'document'
                ? targetMsg.media.mimeType
                : undefined,
            documentFileName:
              targetMsg.media?.type === 'document'
                ? targetMsg.media.fileName
                : undefined,
          };

          const mType = targetMsg.media?.type;
          const mUrl = targetMsg.media?.url;
          const resolvedBuf = await resolveCachedBufferFromUrl(mUrl);

          if (targetMsg.media?.isViewOnce && resolvedBuf) {
            viewOnceMedia = {
              kind:
                mType === 'video'
                  ? 'video'
                  : mType === 'audio' || mType === 'vn'
                  ? 'audio'
                  : 'image',
              buffer: resolvedBuf,
              mimeType: targetMsg.media.mimeType || 'image/jpeg',
              caption: targetMsg.text,
            };
          } else if (mType === 'image' && resolvedBuf && !imageBuffer) {
            quotedRegularMedia = true;
            imageBuffer = resolvedBuf;
          } else if (
            (mType === 'video' || mType === 'ptv') &&
            resolvedBuf &&
            !videoBuffer
          ) {
            quotedRegularMedia = true;
            videoBuffer = resolvedBuf;
          } else if (
            (mType === 'audio' || mType === 'vn') &&
            resolvedBuf &&
            !audioBuffer
          ) {
            audioBuffer = resolvedBuf;
          } else if (mType === 'sticker' && resolvedBuf && !stickerBuffer) {
            stickerBuffer = resolvedBuf;
          } else if (
            !documentMedia &&
            mType === 'document' &&
            mUrl?.startsWith('/api/hd-media/')
          ) {
            const id = mUrl.replace('/api/hd-media/', '').split('?')[0];
            const cached = botStore.hdMediaCache.get(id);
            if (cached) {
              const kind = classifySimulatorDocKind(
                cached.mimeType,
                cached.fileName
              );
              documentMedia = {
                kind,
                buffer: kind !== 'unsupported' ? cached.buffer : undefined,
                mimeType: cached.mimeType,
                fileName: cached.fileName,
                fileSize: cached.buffer.length,
              };
            }
          }
        }
      }

      const isMemberSimulation = chatMode === 'group' && senderRole === 'member';
      if (isMemberSimulation && botStore.groupState.isAnnouncementOnly) {
        res.status(403).json({
          ok: false,
          error: `Ruang chat grup sedang dikunci khusus Admin (${botStore.config.prefix}group close). Buka kembali dengan ${botStore.config.prefix}group open.`,
        });
        return;
      }

      const senderName = isMemberSimulation
        ? 'Nadia Putri (Member)'
        : 'Kamu (Gepa)';
      const senderPhone = isMemberSimulation ? '628577000333' : '628129000111';
      const isAdmin = !isMemberSimulation;

      const pendingReaction = shouldSendPendingReaction(text)
        ? botStore.config.reactions.pending
        : null;

      const userMsgId = `sim-u-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const userMsg: SimulatorMessage = {
        id: userMsgId,
        chatMode,
        sender: isMemberSimulation ? 'member' : 'user',
        senderName,
        senderPhone,
        isAdmin,
        text,
        timestamp: Date.now(),
        reaction: pendingReaction,
        replyTo: replySnapshot,
        media: attachedPreviewMedia,
      };

      botStore.addSimulatorMessage(userMsg);

      const execStartedAt = Date.now();
      const botResult = await processBotMessage({
        source: 'simulator',
        isGroup: chatMode === 'group',
        groupId: chatMode === 'group' ? 'simulator-group' : undefined,
        groupName: botStore.groupState.subject,
        senderName,
        senderPhone,
        senderJid: `${senderPhone}@s.whatsapp.net`,
        isAdmin,
        isBotGroupAdmin: true,
        text,
        imageBuffer,
        videoBuffer,
        audioBuffer,
        stickerBuffer,
        viewOnceMedia,
        quotedText,
        quotedSenderName,
        documentMedia,
        attachedNonDocumentMedia:
          !documentMedia &&
          Boolean(imageBuffer || videoBuffer || quotedRegularMedia),
        quotedParticipantPhone,
        quotedParticipantJid,
        groupMembers: botStore.groupMembers,
      });

      if (pendingReaction) {
        const elapsed = Date.now() - execStartedAt;
        if (elapsed < 180) {
          await new Promise((resolve) => setTimeout(resolve, 180 - elapsed));
        }
      }

      if (botResult.moderatedLink) {
        botStore.updateSimulatorMessage(userMsgId, {
          deletedByAntilink: true,
        });
      }

      if (botStore.config.reactions.enabled && botResult.reactionStatus) {
        const finalEmoji =
          botResult.reactionStatus === 'success'
            ? botStore.config.reactions.success
            : botStore.config.reactions.error;
        botStore.updateSimulatorMessage(userMsgId, {
          reaction: finalEmoji,
        });
      } else if (pendingReaction && !botResult.handled) {
        botStore.updateSimulatorMessage(userMsgId, {
          reaction: null,
        });
      }

      if (botResult.handled) {
        if (botResult.hdswMedia) {
          // Replies directly inside the active chatMode (works in BOTH Group & Private Chat!)
          const hd = botResult.hdswMedia;
          const hdReplyMsg: SimulatorMessage = {
            id: `sim-hd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            chatMode,
            sender: 'bot',
            senderName: botStore.config.botName,
            senderPhone: 'Bot Engine',
            text: hd.caption,
            timestamp: Date.now(),
            mentions: botResult.mentions,
            replyTo: {
              id: userMsg.id,
              senderName: userMsg.senderName,
              senderPhone: userMsg.senderPhone,
              text: `[Dokumen Asli: ${hd.fileName} · ${hd.fileSizeLabel}]`,
            },
            media: {
              type: hd.kind === 'video' ? 'video' : 'image',
              url: hd.webUrl,
              mimeType: hd.mimeType,
              fileName: hd.fileName,
              fileSizeLabel: hd.fileSizeLabel,
              title: `${hd.fileName} (${hd.fileSizeLabel})`,
            },
          };
          botStore.addSimulatorMessage(hdReplyMsg);
        } else {
          let resolvedMedia: SimulatorMessage['media'] | undefined;

          if (botResult.stickerWebUrl) {
            resolvedMedia = {
              type: 'sticker',
              url: botResult.stickerWebUrl,
              mimeType: 'image/webp',
              fileName: 'gepa-corner-sticker.webp',
              packInfo: botResult.stickerPackOverride || {
                pack: botStore.config.stickerPackName,
                author: botStore.config.stickerAuthor,
              },
            };
          } else if (botResult.slideProxyUrls?.length) {
            resolvedMedia = {
              type: 'gallery',
              url: botResult.slideProxyUrls[0],
              galleryUrls: botResult.slideProxyUrls,
              mimeType: 'image/jpeg',
              title: botResult.mediaTitle,
              author: botResult.mediaAuthor,
            };
          } else if (botResult.imageWebUrl) {
            resolvedMedia = {
              type: 'image',
              url: botResult.imageWebUrl,
              mimeType: botResult.imageMimeType || 'image/jpeg',
              fileName: 'gepabot-image.jpg',
            };
          } else if (botResult.videoWebUrl) {
            resolvedMedia = {
              type: botResult.asPtv ? 'ptv' : 'video',
              url: botResult.videoWebUrl,
              mimeType: botResult.videoMimeType || 'video/mp4',
              fileName: botResult.asPtv ? 'video-note.mp4' : 'gepabot-video.mp4',
              title: botResult.mediaTitle,
            };
          } else if (botResult.audioWebUrl) {
            resolvedMedia = {
              type: botResult.asVoiceNote ? 'vn' : 'audio',
              url: botResult.audioWebUrl,
              mimeType: botResult.audioMimeType || 'audio/mpeg',
              fileName: botResult.asVoiceNote
                ? 'voice-note.ogg'
                : 'gepabot-audio.mp3',
              title: botResult.mediaTitle,
            };
          } else if (botResult.documentWebUrl) {
            resolvedMedia = {
              type: 'document',
              url: botResult.documentWebUrl,
              mimeType:
                botResult.documentMimeType || 'application/octet-stream',
              fileName: botResult.documentFileName || 'berkas-unduhan',
            };
          } else if (botResult.videoProxyUrl) {
            resolvedMedia = {
              type: 'video',
              url: botResult.videoProxyUrl,
              mimeType: 'video/mp4',
              fileName: 'gepabot-video.mp4',
              title: botResult.mediaTitle,
              author: botResult.mediaAuthor,
              duration: botResult.mediaDuration,
            };
          } else if (botResult.audioProxyUrl) {
            resolvedMedia = {
              type: 'audio',
              url: botResult.audioProxyUrl,
              mimeType: 'audio/mpeg',
              fileName: 'gepabot-audio.mp3',
              title: botResult.mediaTitle,
              author: botResult.mediaAuthor,
              duration: botResult.mediaDuration,
            };
          }

          const botMsg: SimulatorMessage = {
            id: `sim-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            chatMode,
            sender: 'bot',
            senderName: botStore.config.botName,
            senderPhone: 'Bot Engine',
            text: botResult.replyText || '',
            timestamp: Date.now(),
            mentions: botResult.mentions,
            hiddenMentions: botResult.hiddenMentions,
            replyTo: !botResult.moderatedLink
              ? {
                  id: userMsg.id,
                  senderName: userMsg.senderName,
                  senderPhone: userMsg.senderPhone,
                  text: userMsg.text || '[Lampiran Media]',
                }
              : undefined,
            media: resolvedMedia,
          };
          botStore.addSimulatorMessage(botMsg);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal menjalankan simulasi pesan.',
      });
    }
  });

  // --- VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD) ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GepaBot server running on http://0.0.0.0:${PORT}`);
    void waManager.initAutoResume();
  });
}

void startServer();
