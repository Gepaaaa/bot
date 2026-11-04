import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  type IncomingDocumentPayload,
  type IncomingViewOncePayload,
  processBotMessage,
  shouldSendPendingReaction,
} from './server/commandEngine.ts';
import { cloudSync } from './server/cloudSync.ts';
import { gatewayRouter } from './server/gatewayRouter.ts';
import { getActiveImageBackend } from './server/imageAdapter.ts';
import { buildCdnRequestHeaders } from './server/mediaDownloader.ts';
import {
  getOrCreateSampleAudioBuffer,
  getOrCreateSampleVideoBuffer,
} from './server/mediaProcessor.ts';
import { remoteTunnel } from './server/remoteTunnel.ts';
import { botStore } from './server/stateStore.ts';
import { resolveDataDir } from './server/storagePath.ts';
import { waManager } from './server/waManager.ts';
import {
  COMMAND_CATALOG,
  OFFICIAL_OWNER_NUMBER,
  renderBotTemplate,
} from './src/shared/commands.ts';
import type { BotConfig, SimulatorMessage } from './src/shared/types.ts';

function resolveListenConfig(): { port: number; host: string; explicitCliPort: boolean } {
  const args = process.argv.slice(2);
  let cliPort: number | undefined;
  let host = '0.0.0.0';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--port' || arg === '-p') && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        cliPort = parsed;
      }
      i++;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) {
        cliPort = parsed;
      }
    } else if (arg === '--host' && args[i + 1] && !args[i + 1].startsWith('-')) {
      host = args[i + 1];
      i++;
    } else if (arg.startsWith('--host=')) {
      const val = arg.slice('--host='.length).trim();
      if (val) host = val;
    }
  }

  if (cliPort !== undefined) {
    return { port: cliPort, host, explicitCliPort: true };
  }

  // Support Pterodactyl / Wispbyte panels automatically via SERVER_PORT
  const pterodactylPort = Number(process.env.SERVER_PORT || 0);
  if (Number.isFinite(pterodactylPort) && pterodactylPort > 0) {
    return {
      port: pterodactylPort,
      host,
      explicitCliPort: false,
    };
  }

  // In development and AI Studio container, always listen on port 3000
  // unless APP_PORT is explicitly configured.
  return {
    port: Number(process.env.APP_PORT || 3000),
    host,
    explicitCliPort: false,
  };
}

const LISTEN_CONFIG = resolveListenConfig();

function getLocalLanUrls(port: number): string[] {
  const urls: string[] = [];
  try {
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const net of entries) {
        const fam = String(net.family);
        if ((fam === 'IPv4' || fam === '4') && !net.internal && net.address) {
          const url = `http://${net.address}:${port}`;
          if (!urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }
  } catch {
    // Android 11+ SELinux may restrict os.networkInterfaces() on some ROMs; ignore safely
  }
  return urls;
}

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
      'Content-Type, Authorization, X-Api-Key, X-Owner-Key'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(remoteTunnel.expressMiddleware);

  // WebSocket server mounted on /ws on the same port 3000 HTTP server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/ws')) {
      if (!remoteTunnel.isAuthorizedWsUpgrade(request)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    botStore.attachClient(ws);
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (msg?.type === 'ping' && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // Ignore non-JSON frames
      }
    });
  });

  // Keep WebSocket connections alive across Fly.io / cloud proxies (60s idle timeout)
  const wsHeartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        try {
          client.ping();
        } catch {
          // Ignore ping error
        }
      }
    }
  }, 25000);
  wsHeartbeatInterval.unref();

  const externalSelfUrl = (
    process.env.KEEPALIVE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_SERVER_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');

  // Ultra-lightweight 4-byte keep-alive endpoint (<2 MB/month bandwidth when pinged every 5-10 mins)
  app.get('/ping', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send('pong');
  });

  // --- REST API ROUTES ---
  app.get('/api/health', (_req, res) => {
    const activeDataDir = resolveDataDir();
    const cloudDbSync = cloudSync.isEnabled();
    res.json({
      ok: true,
      engine: 'WABot Stateful Engine',
      waStatus: botStore.waState.status,
      uptimeSeconds: Math.floor(process.uptime()),
      dataDir: activeDataDir,
      cloudDbSync,
      keepAliveActive: Boolean(externalSelfUrl),
      persistentMount:
        activeDataDir === '/data' ||
        Boolean(process.env.DATA_DIR) ||
        cloudDbSync,
      timestamp: Date.now(),
    });
  });

  app.get('/api/network-info', (_req, res) => {
    const port = activePort || LISTEN_CONFIG.port;
    res.json({
      ok: true,
      port,
      localhostUrl: `http://localhost:${port}`,
      loopbackUrl: `http://127.0.0.1:${port}`,
      lanUrls: getLocalLanUrls(port),
      arch: process.arch,
      platform: process.platform,
      nodeVersion: process.version,
      imageBackend: getActiveImageBackend(),
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    });
  });

  app.get('/api/remote-tunnel', (_req, res) => {
    const port = activePort || LISTEN_CONFIG.port;
    res.json(remoteTunnel.getSnapshot(port));
  });

  app.post('/api/remote-tunnel/start', async (_req, res) => {
    try {
      const port = activePort || LISTEN_CONFIG.port;
      const snap = await remoteTunnel.startTunnel(port);
      res.json(snap);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal menyalakan tunnel jarak jauh.',
      });
    }
  });

  app.post('/api/remote-tunnel/stop', (_req, res) => {
    res.json(remoteTunnel.stopTunnel());
  });

  app.post('/api/remote-tunnel/rotate-key', (_req, res) => {
    const port = activePort || LISTEN_CONFIG.port;
    remoteTunnel.rotateAccessKey();
    res.json(remoteTunnel.getSnapshot(port));
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
        headers: buildCdnRequestHeaders(rawUrl),
        redirect: 'follow',
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
          `attachment; filename="wabot-${Date.now()}.${ext}"`
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
          const resolvedName = 'Portrait-RAW-Original.jpg';
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
          let resolvedBuf = await resolveCachedBufferFromUrl(mUrl);
          if (targetMsg.media?.isViewOnce && !resolvedBuf) {
            resolvedBuf =
              mType === 'video'
                ? await getOrCreateSampleVideoBuffer()
                : mType === 'audio' || mType === 'vn'
                ? await getOrCreateSampleAudioBuffer()
                : await loadSampleCatBuffer();
          }

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

      if (
        !viewOnceMedia &&
        (text.toLowerCase().trim().startsWith(`${botStore.config.prefix}rvo`) ||
          ['rvo', 'readviewonce', 'bukavo', 'lihatsekali'].includes(
            text.toLowerCase().replace(/^[^\w\s]+/, '').trim()
          ))
      ) {
        const lastVo = [...botStore.simulatorMessages]
          .reverse()
          .find((m) => m.media?.isViewOnce);
        if (lastVo) {
          const mType = lastVo.media?.type || 'image';
          const mUrl = lastVo.media?.url;
          let resolvedBuf = await resolveCachedBufferFromUrl(mUrl);
          if (!resolvedBuf) {
            resolvedBuf =
              mType === 'video'
                ? await getOrCreateSampleVideoBuffer()
                : mType === 'audio' || mType === 'vn'
                ? await getOrCreateSampleAudioBuffer()
                : await loadSampleCatBuffer();
          }
          if (resolvedBuf) {
            viewOnceMedia = {
              kind:
                mType === 'video'
                  ? 'video'
                  : mType === 'audio' || mType === 'vn'
                  ? 'audio'
                  : 'image',
              buffer: resolvedBuf,
              mimeType:
                lastVo.media?.mimeType ||
                (mType === 'video' ? 'video/mp4' : 'image/jpeg'),
              caption: lastVo.text || undefined,
            };
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

      const configuredOwner =
        (botStore.config.antiBan?.ownerNumber || '6289673533963').replace(
          /[^0-9]/g,
          ''
        ) || '6289673533963';
      const senderName = isMemberSimulation
        ? 'Nadia Putri (Member)'
        : 'Kamu (Owner)';
      const senderPhone = isMemberSimulation ? '628577000333' : configuredOwner;
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

      const simPfx = botStore.config.prefix.toLowerCase();
      const simFirstToken = text.toLowerCase().startsWith(simPfx)
        ? text.toLowerCase().slice(simPfx.length).trim().split(/\s+/)[0] || ''
        : '';
      const isSimQc = [
        'qc',
        'quotely',
        'quotechat',
        'bubble',
        'iqc',
        'iphoneqc',
        'ioschat',
      ].includes(simFirstToken);
      const simSenderAvatar = isSimQc
        ? await waManager.getProfilePictureForUser(senderPhone)
        : null;

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
        senderAvatarBuffer: simSenderAvatar,
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
        } else if (botResult.slideProxyUrls?.length) {
          const slides = botResult.slideProxyUrls.slice(0, 35);
          const total = slides.length;
          const baseTs = Date.now();
          for (let i = 0; i < total; i += 1) {
            const stepLabel = `📸 *Foto ${i + 1}/${total}*`;
            const captionText =
              i === 0
                ? botResult.replyText
                  ? `${botResult.replyText}\n${stepLabel}`
                  : stepLabel
                : stepLabel;
            const slideMsg: SimulatorMessage = {
              id: `sim-slide-${baseTs}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              chatMode,
              sender: 'bot',
              senderName: botStore.config.botName,
              senderPhone: 'Bot Engine',
              text: captionText,
              timestamp: baseTs + i,
              replyTo:
                i === 0
                  ? {
                      id: userMsg.id,
                      senderName: userMsg.senderName,
                      senderPhone: userMsg.senderPhone,
                      text: userMsg.text || '[Tautan Slide TikTok]',
                    }
                  : undefined,
              media: {
                type: 'image',
                url: slides[i],
                mimeType: 'image/jpeg',
                fileName: `tiktok-slide-${i + 1}.jpg`,
                title: botResult.mediaTitle
                  ? `${botResult.mediaTitle} (${i + 1}/${total})`
                  : `Foto ${i + 1}/${total}`,
                author: botResult.mediaAuthor,
              },
            };
            botStore.addSimulatorMessage(slideMsg);
          }
        } else {
          let resolvedMedia: SimulatorMessage['media'] | undefined;

          if (botResult.stickerWebUrl) {
            resolvedMedia = {
              type: 'sticker',
              url: botResult.stickerWebUrl,
              mimeType: 'image/webp',
              fileName: 'wabot-sticker.webp',
              packInfo: botResult.stickerPackOverride || {
                pack: botStore.config.stickerPackName,
                author: botStore.config.stickerAuthor,
              },
            };
          } else if (botResult.imageWebUrl) {
            resolvedMedia = {
              type: 'image',
              url: botResult.imageWebUrl,
              mimeType: botResult.imageMimeType || 'image/jpeg',
              fileName: 'wabot-image.jpg',
            };
          } else if (botResult.videoWebUrl) {
            resolvedMedia = {
              type: botResult.asPtv ? 'ptv' : 'video',
              url: botResult.videoWebUrl,
              mimeType: botResult.videoMimeType || 'video/mp4',
              fileName: botResult.asPtv ? 'video-note.mp4' : 'wabot-video.mp4',
              title: botResult.mediaTitle,
            };
          } else if (botResult.audioWebUrl) {
            resolvedMedia = {
              type: botResult.asVoiceNote ? 'vn' : 'audio',
              url: botResult.audioWebUrl,
              mimeType: botResult.audioMimeType || 'audio/mpeg',
              fileName: botResult.asVoiceNote
                ? 'voice-note.ogg'
                : 'wabot-audio.mp3',
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
              fileName: 'wabot-video.mp4',
              title: botResult.mediaTitle,
              author: botResult.mediaAuthor,
              duration: botResult.mediaDuration,
            };
          } else if (botResult.audioProxyUrl) {
            resolvedMedia = {
              type: 'audio',
              url: botResult.audioProxyUrl,
              mimeType: 'audio/mpeg',
              fileName: 'wabot-audio.mp3',
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

  // 1. Pre-built Ready-to-Run Termux Bundle (.tar.gz) including compiled dist/ Web Panel + server.bundle.mjs
  //    Specifically engineered so 32-bit ARMv7 phones (Xiaomi Redmi 9C 3/32) never need vite or esbuild!
  let prepareBundlePromise: Promise<void> | null = null;
  async function isFrontendSourceNewerThanDist(
    root: string,
    distHtmlPath: string
  ): Promise<boolean> {
    try {
      const distStat = await fs.stat(distHtmlPath);
      const distMtime = distStat.mtimeMs;
      const checkTargets = [
        path.join(root, 'index.html'),
        path.join(root, 'src'),
      ];
      const stack = [...checkTargets];
      while (stack.length > 0) {
        const current = stack.pop()!;
        try {
          const st = await fs.stat(current);
          if (st.isDirectory()) {
            const entries = await fs.readdir(current);
            for (const entry of entries) {
              stack.push(path.join(current, entry));
            }
          } else if (st.mtimeMs > distMtime + 1000) {
            return true;
          }
        } catch {
          // Ignore missing optional paths
        }
      }
      return false;
    } catch {
      return true;
    }
  }

  async function ensureTermuxArtifactsBuilt(): Promise<void> {
    if (!prepareBundlePromise) {
      prepareBundlePromise = (async () => {
        const root = process.cwd();
        const distHtmlPath = path.join(root, 'dist', 'index.html');
        const needsViteBuild = await isFrontendSourceNewerThanDist(
          root,
          distHtmlPath
        );
        if (needsViteBuild) {
          try {
            const { build: viteBuild } = await import('vite');
            await viteBuild({ logLevel: 'warn' });
          } catch (err) {
            console.warn(
              '[Bundle Builder] Vite build skipped:',
              err instanceof Error ? err.message : err
            );
          }
        }

        try {
          const { build: esbuildBundle } = await import('esbuild');
          await esbuildBundle({
            entryPoints: [path.join(root, 'server.ts')],
            bundle: true,
            platform: 'node',
            format: 'esm',
            packages: 'external',
            outfile: path.join(root, 'server.bundle.mjs'),
            logLevel: 'warning',
          });
        } catch (err) {
          console.warn(
            '[Bundle Builder] esbuild bundle skipped:',
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
    ['/api/termux-bundle.tar.gz', '/api/project-bundle.tar.gz'],
    async (req, res) => {
      try {
        await ensureTermuxArtifactsBuilt();
      } catch {
        // Stream available files even if optional build step warned
      }

      const fileName = req.path.includes('termux-bundle')
        ? 'wabot-redmi9c-ready.tar.gz'
        : 'wabot-project.tar.gz';

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      const tar = spawn('tar', [
        '--exclude=node_modules',
        '--exclude=.git',
        '--exclude=.aistudio',
        '--exclude=.baileys_auth',
        '--exclude=.bot-state.json',
        '--exclude=.wabot-state.json',
        '--exclude=.remote-access.json',
        '--exclude=data',
        '--exclude=.env',
        '--exclude=server.mjs',
        '--exclude=public/assets/aistudio',
        '-czf',
        '-',
        '.',
      ]);
      tar.stdout.pipe(res);
      tar.stderr.on('data', (d) => console.error('[TAR]', d.toString()));
    }
  );

  // 2. Serve termux.sh installer script directly
  app.get(
    ['/termux.sh', '/api/termux-install', '/termux-install'],
    async (_req, res) => {
      try {
        const termuxShPath = path.join(process.cwd(), 'termux.sh');
        const content = await fs.readFile(termuxShPath, 'utf-8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
      } catch {
        res.status(404).send('# termux.sh not found');
      }
    }
  );

  // --- VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD) ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const distHtml = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.get('*', async (_req, res) => {
      try {
        await fs.access(distHtml);
        res.sendFile(distHtml);
      } catch {
        const catalogJson = JSON.stringify(
          COMMAND_CATALOG.filter((c) => !c.suspensionRisk).map((c) => ({
            id: c.id,
            category: c.category,
            usage: c.usage,
            desc: c.description,
          }))
        );
        const totalCatalogCount = COMMAND_CATALOG.length;
        const lockedCatalogCount = COMMAND_CATALOG.filter(
          (c) => c.suspensionRisk
        ).length;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WABot — WhatsApp Multi-Feature Bot &amp; Control Panel</title>
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
          <span aria-hidden="true">·</span>
          <span id="ov-owner">Owner +${OFFICIAL_OWNER_NUMBER}</span>
          <span aria-hidden="true">·</span>
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
    <div id="ftr-left">WABot · Owner +${OFFICIAL_OWNER_NUMBER}</div>
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
        document.title = botName + ' — WhatsApp Multi-Feature Bot & Control Panel';
        document.getElementById('ov-prefix').innerText = 'Prefix ' + (cfg.prefix || '.');
        document.getElementById('ov-owner').innerText = 'Owner +' + ownerNum;
        document.getElementById('ftr-left').innerText = botName + ' · Owner: +' + ownerNum;

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

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (
      err.code === 'EADDRINUSE' &&
      !LISTEN_CONFIG.explicitCliPort &&
      activePort !== 3000 &&
      !retriedFallbackPort
    ) {
      retriedFallbackPort = true;
      activePort = 3000;
      console.warn(
        `Port ${LISTEN_CONFIG.port} is already in use, falling back to port 3000...`
      );
      server.listen(activePort, LISTEN_CONFIG.host);
      return;
    }
    console.error('Fatal HTTP server error:', err);
    process.exit(1);
  });

  // Automatic 9-minute external keep-alive ping when hosted on Render Free (prevents 15-min idle sleep)
  let selfKeepAliveInterval: ReturnType<typeof setInterval> | null = null;
  if (externalSelfUrl && /^https?:\/\//i.test(externalSelfUrl)) {
    const pingEndpoint = externalSelfUrl.endsWith('/ping')
      ? externalSelfUrl
      : `${externalSelfUrl}/ping`;
    selfKeepAliveInterval = setInterval(() => {
      fetch(pingEndpoint, {
        headers: { 'User-Agent': 'WABot-SelfKeepAlive/1.0' },
        signal: AbortSignal.timeout(15000),
      }).catch(() => {
        // Ignore transient self-ping network hiccups
      });
    }, 9 * 60 * 1000);
    selfKeepAliveInterval.unref();
  }

  server.listen(activePort, LISTEN_CONFIG.host, () => {
    remoteTunnel.setPort(activePort);
    console.log(`WABot server running on http://${LISTEN_CONFIG.host}:${activePort}`);
    console.log(`🌐 Web Control Panel: http://localhost:${activePort} (atau http://127.0.0.1:${activePort})`);
    void (async () => {
      try {
        await remoteTunnel.autoResumeIfEnabled(activePort);
        await cloudSync.initAndRestore(resolveDataDir());
        if (cloudSync.isEnabled()) {
          botStore.reloadFromDisk();
        }
        const resumed = await waManager.initAutoResume();
        if (!resumed) {
          const envPhone = (process.env.PAIRING_PHONE || '').trim();
          if (envPhone) {
            console.log(
              `[WABot 24/7] Meminta Pairing Code otomatis untuk nomor ${envPhone}...`
            );
            await waManager.connectWithPairingCode(envPhone);
          } else {
            console.log(
              [
                '',
                '============================================================',
                '[WABot 24/7] Mesin Aktif! Belum ada nomor WhatsApp tertaut.',
                '-> CARA CEPAT (TANPA BUKA WEB): Ketik nomor WA bot kamu',
                '   langsung di kolom Console bawah (contoh: 6281234567890)',
                '   lalu tekan Enter untuk mendapat 8-digit Pairing Code!',
                '-> Perintah Console lain: "status" | "logout"',
                '============================================================',
                '',
              ].join('\n')
            );
          }
        }
      } catch (err) {
        console.error('Auto-resume initialization error:', err);
      }
    })();
  });

  // Interactive Console Listener for Wispbyte / Pterodactyl ("Type a command..." input box)
  if (process.stdin && !process.stdin.destroyed) {
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });
    rl.on('line', (rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const lower = line.toLowerCase();

      if (lower === 'status') {
        const st = botStore.waState;
        console.log(
          `[WABot Status] WA=${st.status} | User=${
            st.connectedUser?.phone ? '+' + st.connectedUser.phone : '-'
          } | Prefix=${botStore.config.prefix} | Uptime=${Math.floor(
            process.uptime()
          )}s`
        );
        return;
      }

      if (lower === 'logout' || lower === 'disconnect' || lower === 'reset') {
        console.log('[WABot 24/7] Memutuskan & mereset sesi WhatsApp...');
        void waManager.disconnect(true).then(() => {
          console.log(
            '[WABot 24/7] Sesi direset. Ketik nomor WA baru (contoh: 6281234567890) untuk menautkan ulang.'
          );
        });
        return;
      }

      const phoneCandidate = lower.startsWith('pair ')
        ? line.slice(5).trim()
        : line;
      const digitsOnly = phoneCandidate.replace(/[^0-9]/g, '');
      if (
        digitsOnly.length >= 9 &&
        digitsOnly.length <= 16 &&
        /^[+\d\s()-]+$/.test(phoneCandidate)
      ) {
        console.log(
          `[WABot 24/7] Meminta 8-digit Pairing Code ke server WhatsApp untuk ${digitsOnly}...`
        );
        void waManager.connectWithPairingCode(digitsOnly).catch((err) => {
          console.error(
            '[WABot 24/7] Gagal meminta Pairing Code:',
            err instanceof Error ? err.message : err
          );
        });
      }
    });
  }

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}, flushing bot state & closing WA socket...`);
    clearInterval(wsHeartbeatInterval);
    if (selfKeepAliveInterval) {
      clearInterval(selfKeepAliveInterval);
    }
    botStore.saveToDisk();
    await waManager.shutdownGracefully();
    await cloudSync.flushAllNow(path.join(resolveDataDir(), '.baileys_auth'));
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('SIGINT', () => void handleShutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in WABot server:', reason);
});

void startServer();
