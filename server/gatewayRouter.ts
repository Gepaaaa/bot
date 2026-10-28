import { Router, type Request, type Response } from 'express';
import type { AutoResponderRule } from '../src/shared/types.ts';
import { groupCache } from './groupCache.ts';
import { queueEngine } from './queueEngine.ts';
import { botStore } from './stateStore.ts';
import { webhookDispatcher } from './webhookDispatcher.ts';

export const gatewayRouter = Router();

function formatToJid(target: string): string {
  const clean = target.replace(/[^0-9@.a-zA-Z_-]/g, '');
  if (clean.includes('@')) return clean;
  // If digits only
  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length > 15) {
    // Likely a group ID
    return `${digits}@g.us`;
  }
  return `${digits}@s.whatsapp.net`;
}

// 1. Send Text Message
gatewayRouter.post('/send-text', async (req: Request, res: Response) => {
  try {
    const { to, text, quotedMsgId, mentions } = req.body;
    if (!to || !text || typeof text !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Parameter "to" (nomor/grup tujuan) dan "text" (isi pesan) wajib diisi.',
      });
    }

    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: 'text',
      summaryText: text.slice(0, 60),
      content: {
        text: text.trim(),
        mentions: Array.isArray(mentions) ? mentions : undefined,
      },
      options: quotedMsgId ? { quoted: { key: { id: quotedMsgId } } } : undefined,
    });

    return res.json({
      ok: true,
      jobId,
      to: jid,
      status: 'queued',
      message: 'Pesan berhasil dimasukkan ke dalam antrean OpenWA Paced Queue.',
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal memproses pesan' });
  }
});

// 2. Send Media (Image, Video, Audio, Document)
gatewayRouter.post('/send-media', async (req: Request, res: Response) => {
  try {
    const { to, mediaUrl, mediaBase64, mediaType = 'image', caption, fileName } = req.body;
    if (!to) {
      return res.status(400).json({ ok: false, error: 'Parameter "to" wajib diisi.' });
    }
    if (!mediaUrl && !mediaBase64) {
      return res.status(400).json({
        ok: false,
        error: 'Sediakan "mediaUrl" atau "mediaBase64" untuk mengirim media.',
      });
    }

    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    let content: any = {};
    const mediaBuffer = mediaBase64
      ? Buffer.from(mediaBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
      : { url: mediaUrl };

    if (mediaType === 'image') {
      content = { image: mediaBuffer, caption: caption || undefined };
    } else if (mediaType === 'video') {
      content = { video: mediaBuffer, caption: caption || undefined };
    } else if (mediaType === 'audio') {
      content = { audio: mediaBuffer, mimetype: 'audio/mp4', ptt: false };
    } else {
      content = {
        document: mediaBuffer,
        mimetype: 'application/octet-stream',
        fileName: fileName || 'document.pdf',
        caption: caption || undefined,
      };
    }

    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: mediaType,
      summaryText: caption || `Media (${mediaType})`,
      content,
    });

    return res.json({
      ok: true,
      jobId,
      to: jid,
      status: 'queued',
      message: 'Media berhasil dimasukkan ke dalam antrean pengiriman OpenWA.',
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal memproses media' });
  }
});

// 3. Send Poll / Voting
gatewayRouter.post('/send-poll', async (req: Request, res: Response) => {
  try {
    const { to, name, values, selectableCount = 1 } = req.body;
    if (!to || !name || !Array.isArray(values) || values.length < 2) {
      return res.status(400).json({
        ok: false,
        error: 'Parameter "to", "name" (judul poll), dan minimal 2 "values" (pilihan) wajib diisi.',
      });
    }

    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: 'poll',
      summaryText: `Polling: ${name}`,
      content: {
        poll: {
          name: name.trim(),
          values: values.map((v: string) => String(v).trim()),
          selectableCount: Number(selectableCount) || 1,
        },
      },
    });

    return res.json({
      ok: true,
      jobId,
      to: jid,
      status: 'queued',
      message: 'Polling berhasil dimasukkan ke dalam antrean pengiriman OpenWA.',
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal memproses polling' });
  }
});

// 4. Send Reaction
gatewayRouter.post('/send-reaction', async (req: Request, res: Response) => {
  try {
    const { to, emoji, messageId } = req.body;
    if (!to || !emoji || !messageId) {
      return res.status(400).json({
        ok: false,
        error: 'Parameter "to", "emoji", dan "messageId" wajib diisi.',
      });
    }

    const jid = formatToJid(String(to));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    queueEngine.enqueue({
      id: jobId,
      jid,
      jobType: 'text',
      summaryText: `Reaksi ${emoji}`,
      content: {
        react: {
          text: emoji,
          key: { remoteJid: jid, id: messageId },
        },
      },
      isPriority: true,
    });

    return res.json({ ok: true, jobId, message: 'Reaksi emoji dimasukkan ke antrean.' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal memproses reaksi' });
  }
});

// 5. Check Number on WhatsApp (onWhatsApp)
gatewayRouter.post('/check-number', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Nomor telepon wajib diisi.' });
    }

    const digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.length < 7) {
      return res.status(400).json({ ok: false, error: 'Format nomor telepon tidak valid.' });
    }

    // Check with live baileys socket if connected
    const socket = (global as any).__BAILEYS_SOCKET__;
    if (socket && botStore.waState.status === 'connected') {
      try {
        const [result] = await socket.onWhatsApp(digits);
        if (result && result.exists) {
          return res.json({
            ok: true,
            phone: digits,
            exists: true,
            jid: result.jid,
            message: `Nomor terverifikasi aktif di WhatsApp (${result.jid}).`,
          });
        }
        return res.json({
          ok: true,
          phone: digits,
          exists: false,
          jid: `${digits}@s.whatsapp.net`,
          message: 'Nomor tidak terdaftar atau tidak aktif di WhatsApp.',
        });
      } catch (err: any) {
        // Fallback
        return res.json({
          ok: true,
          phone: digits,
          exists: true,
          jid: `${digits}@s.whatsapp.net`,
          simulated: true,
        });
      }
    }

    // In simulator / disconnected mode
    return res.json({
      ok: true,
      phone: digits,
      exists: true,
      jid: `${digits}@s.whatsapp.net`,
      simulated: true,
      message: 'Format nomor valid. (Sambungkan WhatsApp untuk verifikasi live real-time).',
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal memeriksa nomor' });
  }
});

// 6. Test Webhook Ping
gatewayRouter.post('/test-webhook', async (req: Request, res: Response) => {
  try {
    const { url, secret } = req.body;
    const targetUrl = url || botStore.config.webhook?.url;
    const targetSecret = secret !== undefined ? secret : botStore.config.webhook?.secret;

    if (!targetUrl) {
      return res.status(400).json({ ok: false, error: 'URL Webhook wajib diisi.' });
    }

    const result = await webhookDispatcher.testPing(targetUrl, targetSecret);
    return res.json({ ok: result.success, ...result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal mengirim ping webhook' });
  }
});

// 7. Get Gateway & Queue Status
gatewayRouter.get('/status', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    waStatus: botStore.waState.status,
    connectedUser: botStore.waState.connectedUser,
    stats: queueEngine.getStats(),
    isPaused: queueEngine.getIsPaused(),
    cachedGroups: groupCache.size(),
    webhook: botStore.config.webhook,
    autoResponderCount: (botStore.config.autoResponder || []).length,
  });
});

// 8. Get Recent Jobs
gatewayRouter.get('/jobs', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    jobs: queueEngine.getRecentJobs(),
  });
});

// 9. Queue Actions: Clear or Pause
gatewayRouter.post('/queue/clear', (_req: Request, res: Response) => {
  queueEngine.clearQueue();
  return res.json({ ok: true, message: 'Antrean pesan berhasil dikosongkan.' });
});

gatewayRouter.post('/queue/pause', (req: Request, res: Response) => {
  const { paused } = req.body;
  queueEngine.setPaused(Boolean(paused));
  return res.json({
    ok: true,
    isPaused: queueEngine.getIsPaused(),
    message: paused ? 'Antrean pesan dijeda.' : 'Antrean pesan dilanjutkan.',
  });
});

// 10. Auto-Responder CRUD Endpoints
gatewayRouter.post('/auto-responder/add', (req: Request, res: Response) => {
  try {
    const { trigger, matchType = 'contains', replyText, scope = 'all', enabled = true } = req.body;
    if (!trigger || !replyText) {
      return res.status(400).json({
        ok: false,
        error: 'Kata kunci "trigger" dan teks "replyText" wajib diisi.',
      });
    }

    const rule = botStore.addAutoResponderRule({
      trigger: String(trigger).trim(),
      matchType,
      replyText: String(replyText).trim(),
      scope,
      enabled: Boolean(enabled),
    });

    return res.json({ ok: true, rule, message: 'Aturan respon otomatis berhasil ditambahkan.' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal menambah aturan' });
  }
});

gatewayRouter.put('/auto-responder/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = botStore.updateAutoResponderRule(id, req.body);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Aturan tidak ditemukan.' });
    }
    return res.json({ ok: true, rule: updated, message: 'Aturan respon otomatis diperbarui.' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal memperbarui aturan' });
  }
});

gatewayRouter.delete('/auto-responder/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = botStore.deleteAutoResponderRule(id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Aturan tidak ditemukan.' });
    }
    return res.json({ ok: true, message: 'Aturan respon otomatis dihapus.' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Gagal menghapus aturan' });
  }
});
