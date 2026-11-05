import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AuthenticationState,
  type GroupMetadata,
  type MediaType,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import {
  renderBotTemplate,
  SUSPENSION_RISK_DISABLED_REPLY,
} from '../src/shared/commands.ts';
import type { SimulatorMember } from '../src/shared/types.ts';
import {
  processBotMessage,
  shouldSendPendingReaction,
  type WAGroupOperations,
} from './commandEngine.ts';
import { ensureWhatsappImageBuffer } from './imageAdapter.ts';
import { fetchRemoteBuffer } from './mediaDownloader.ts';
import { botStore } from './stateStore.ts';
import { cloudSync } from './cloudSync.ts';
import { groupCache } from './groupCache.ts';
import { queueEngine } from './queueEngine.ts';
import { resolveDataDir } from './storagePath.ts';
import { webhookDispatcher } from './webhookDispatcher.ts';

const AUTH_DIR = path.join(resolveDataDir(), '.baileys_auth');
const VIEWONCE_DIR = path.join(resolveDataDir(), 'viewonce_cache');
const silentLogger = pino({ level: 'silent' });

type SessionLaunchOptions =
  | { mode: 'qr' }
  | { mode: 'pairing'; phoneNumber: string }
  | { mode: 'resume' };

export interface CachedViewOnce {
  id: string;
  remoteJid: string;
  kind: 'image' | 'video' | 'audio';
  buffer?: Buffer;
  diskPath?: string;
  mediaObj?: {
    mediaKey?: Uint8Array | null;
    directPath?: string | null;
    url?: string | null;
  };
  hkdfType?: MediaType;
  mimeType: string;
  caption?: string;
  isVoiceNote?: boolean;
  fullMsg?: WAMessage;
  savedAt: number;
}

class WhatsAppSessionManager {
  private sock: WASocket | null = null;
  private authContext: {
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  } | null = null;
  private pendingCredsSave: Promise<void> = Promise.resolve();
  private isStarting = false;
  private manualDisconnect = false;
  private pairingRequested = false;
  private sawNewLogin = false;
  private reconnectAttempts = 0;
  private sessionGeneration = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cachedWaVersion: [number, number, number] | undefined;
  private groupMetaCache = new Map<
    string,
    { data: GroupMetadata; expiresAt: number }
  >();
  private pendingGroupMeta = new Map<string, Promise<GroupMetadata>>();
  private groupGreetingLastSent = new Map<string, number>();
  private userCommandTimestamps = new Map<string, number[]>();
  private lastHidetagPerGroup = new Map<string, number>();
  private recentViewOnceCache = new Map<string, CachedViewOnce>();
  private lastViewOnceByChat = new Map<string, string>();
  private avatarCache = new Map<
    string,
    { buffer: Buffer | null; expiresAt: number }
  >();
  private outboundQueue: Promise<void> = Promise.resolve();
  private lastOutboundSentAt = 0;

  constructor() {
    void this.loadRecentViewOnceFromDisk();
  }

  private normalizeUserJid(rawJid?: string | null): string | null {
    if (!rawJid) return null;
    const trimmed = rawJid.trim();
    if (!trimmed || trimmed.endsWith('@g.us') || trimmed === 'status@broadcast') {
      return null;
    }
    const atIdx = trimmed.indexOf('@');
    if (atIdx === -1) {
      const digits = trimmed.replace(/[^0-9]/g, '');
      return digits.length >= 8 ? `${digits}@s.whatsapp.net` : null;
    }
    const userPart = trimmed.slice(0, atIdx).split(':')[0]?.trim() || '';
    const domainPart = trimmed.slice(atIdx + 1).trim().toLowerCase();
    if (!userPart) return null;
    if (domainPart === 's.whatsapp.net' || domainPart === 'c.us') {
      return `${userPart}@s.whatsapp.net`;
    }
    if (domainPart === 'lid') {
      return `${userPart}@lid`;
    }
    return null;
  }

  private async fetchUserProfilePicBuffer(
    sock: WASocket,
    candidateJids: Array<string | undefined | null>
  ): Promise<Buffer | null> {
    const normalizedJids: string[] = [];
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

    const queryPpUrl = async (
      jid: string,
      kind: 'image' | 'preview',
      timeoutMs: number
    ): Promise<string | null> => {
      try {
        const url = await Promise.race<string | undefined>([
          sock.profilePictureUrl(jid, kind),
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), timeoutMs)
          ),
        ]);
        return url && /^https?:\/\//i.test(url) ? url : null;
      } catch {
        return null;
      }
    };

    for (const jid of normalizedJids) {
      const ppUrl =
        (await queryPpUrl(jid, 'image', 4500)) ||
        (await queryPpUrl(jid, 'preview', 3500));
      if (!ppUrl) continue;

      try {
        const fetched = await fetchRemoteBuffer(ppUrl, 8000);
        if (fetched.buffer && fetched.buffer.length > 0) {
          const normalizedImg = await ensureWhatsappImageBuffer(
            fetched.buffer,
            fetched.contentType || 'image/jpeg'
          );
          if (this.avatarCache.size >= 60) {
            const oldestKey = this.avatarCache.keys().next().value;
            if (oldestKey) this.avatarCache.delete(oldestKey);
          }
          for (const aliasJid of normalizedJids) {
            this.avatarCache.set(aliasJid, {
              buffer: normalizedImg.buffer,
              expiresAt: Date.now() + 5 * 60 * 1000,
            });
          }
          return normalizedImg.buffer;
        }
      } catch {
        // Try next candidate JID
      }
    }

    for (const jid of normalizedJids) {
      this.avatarCache.set(jid, {
        buffer: null,
        expiresAt: Date.now() + 45 * 1000,
      });
    }
    return null;
  }

  public async getProfilePictureForUser(
    phoneOrJid?: string | null
  ): Promise<Buffer | null> {
    if (!this.sock) return null;
    const candidates: Array<string | undefined | null> = [phoneOrJid];
    if (this.sock.user?.id) {
      const botPhone = this.sock.user.id.split(':')[0]?.split('@')[0] || '';
      const cleanTarget = (phoneOrJid || '').replace(/[^0-9]/g, '');
      if (!cleanTarget || cleanTarget === botPhone) {
        candidates.push(this.sock.user.id);
        candidates.push((this.sock.user as { lid?: string }).lid);
      }
    }
    return this.fetchUserProfilePicBuffer(this.sock, candidates);
  }

  private sleepRandom(minMs: number, maxMs: number): Promise<void> {
    const duration =
      Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  private enqueueOutboundSend<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const isWarmUp =
        botStore.config.antiBan.enabled && botStore.config.antiBan.warmUpMode;
      const minGap = isWarmUp
        ? Math.floor(Math.random() * (4500 - 2800 + 1)) + 2800
        : Math.floor(Math.random() * (2900 - 1600 + 1)) + 1600;
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
      () => undefined,
      () => undefined
    );
    return next;
  }

  private getCachedGroupMetadata(jid: string): GroupMetadata | undefined {
    const entry = this.groupMetaCache.get(jid);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.groupMetaCache.delete(jid);
      return undefined;
    }
    return entry.data;
  }

  private async getOrFetchGroupMetadata(
    sock: WASocket,
    jid: string
  ): Promise<GroupMetadata> {
    const cached = this.getCachedGroupMetadata(jid);
    if (cached) return cached;

    const inflight = this.pendingGroupMeta.get(jid);
    if (inflight) return inflight;

    const promise = sock
      .groupMetadata(jid)
      .then((meta) => {
        this.groupMetaCache.set(jid, {
          data: meta,
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes TTL
        });
        this.pendingGroupMeta.delete(jid);
        return meta;
      })
      .catch((err) => {
        this.pendingGroupMeta.delete(jid);
        throw err;
      });

    this.pendingGroupMeta.set(jid, promise);
    return promise;
  }

  private resolveBrowserProfile(): [string, string, string] {
    const profile =
      botStore.config.antiBan?.browserProfile || 'windows_chrome';
    switch (profile) {
      case 'macos_safari':
        return ['macOS', 'Safari', '18.1'];
      case 'windows_edge':
        return ['Windows', 'Edge', '131.0.2903.112'];
      case 'ubuntu_chrome':
        return Browsers.ubuntu('Chrome');
      case 'windows_chrome':
      default:
        return ['Windows', 'Chrome', '131.0.6778.205'];
    }
  }

  private async simulateHumanTyping(
    sock: WASocket,
    jid: string,
    isGroup: boolean,
    type: 'text' | 'audio' = 'text'
  ): Promise<void> {
    const { antiBan } = botStore.config;
    if (antiBan && !antiBan.humanizeTyping && !antiBan.enabled) {
      return;
    }
    try {
      const presenceState = type === 'audio' ? 'recording' : 'composing';
      await sock.sendPresenceUpdate(presenceState, jid);

      const warmUpExtra =
        antiBan && antiBan.enabled && antiBan.warmUpMode ? 1400 : 0;
      const baseMin = antiBan?.minTypingDelayMs || 1800;
      const baseMax = antiBan?.maxTypingDelayMs || 3800;
      const minD = Math.max(800, baseMin + (isGroup ? 400 : 0) + warmUpExtra);
      const maxD = Math.max(
        minD + 500,
        baseMax + (isGroup ? 800 : 0) + warmUpExtra
      );

      await this.sleepRandom(minD, maxD);
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      // Non-fatal presence error
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private isDevicePaired(state?: AuthenticationState | null): boolean {
    if (this.sawNewLogin) return true;
    const creds = state?.creds;
    if (!creds) return false;
    if (creds.registered) return true;
    if (creds.account) return true;
    if (creds.me?.id && creds.me.id.includes(':')) return true;
    return false;
  }

  public async initAutoResume(): Promise<boolean> {
    try {
      const credsPath = path.join(AUTH_DIR, 'creds.json');
      const raw = await fs.readFile(credsPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        registered?: boolean;
        account?: unknown;
        me?: { id?: string };
      };
      const hasValidSession = Boolean(
        parsed.registered ||
          parsed.account ||
          (parsed.me?.id && parsed.me.id.includes(':'))
      );
      if (hasValidSession) {
        this.manualDisconnect = false;
        await this.launchSocket({ mode: 'resume' });
        return true;
      }
    } catch {
      // No saved session to auto-resume
    }
    return false;
  }

  private destroyActiveSocketOnly() {
    if (this.sock) {
      const oldSock = this.sock;
      this.sock = null;
      try {
        oldSock.ev.removeAllListeners('connection.update');
        oldSock.ev.removeAllListeners('creds.update');
        oldSock.ev.removeAllListeners('messages.upsert');
        oldSock.ev.removeAllListeners('groups.update');
        oldSock.ev.removeAllListeners('group-participants.update');
        oldSock.end(undefined);
      } catch {
        // Ignore close error on old socket
      }
    }
  }

  public async disconnect(clearCredentials = true): Promise<void> {
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
        // Ignore
      }
      try {
        await fs.rm(AUTH_DIR, { recursive: true, force: true });
      } catch {
        // Ignore missing directory
      }
      await cloudSync.clearAuth();
    }

    botStore.updateWAState({
      status: 'disconnected',
      qrDataUrl: null,
      pairingCode: null,
      pairingPhone: null,
      connectedUser: null,
      connectedAt: null,
      statusMessage: null,
      lastError: null,
    });
  }

  public async shutdownGracefully(): Promise<void> {
    this.manualDisconnect = true;
    this.sessionGeneration += 1;
    this.clearReconnectTimer();
    this.isStarting = false;
    this.destroyActiveSocketOnly();
    try {
      await this.pendingCredsSave;
      await cloudSync.flushAllNow(AUTH_DIR);
    } catch {
      // Ignore flush error on exit
    }
  }

  public normalizePhoneNumber(raw: string): string {
    let digits = raw.replace(/[^0-9]/g, '');
    if (digits.startsWith('08')) {
      digits = '62' + digits.slice(1);
    } else if (digits.startsWith('8') && digits.length >= 9) {
      digits = '62' + digits;
    }
    return digits;
  }

  public async connectWithQR(): Promise<void> {
    if (this.isStarting) return;
    await this.disconnect(true);
    this.manualDisconnect = false;
    await this.launchSocket({ mode: 'qr' });
  }

  public async connectWithPairingCode(rawPhone: string): Promise<void> {
    const cleanPhone = this.normalizePhoneNumber(rawPhone);
    if (cleanPhone.length < 9 || cleanPhone.length > 16) {
      throw new Error(
        'Masukkan nomor WhatsApp yang valid dengan kode negara (contoh: 6281234567890).'
      );
    }

    if (this.isStarting) return;
    await this.disconnect(true);
    this.manualDisconnect = false;
    await this.launchSocket({ mode: 'pairing', phoneNumber: cleanPhone });
  }

  private async resolveWaVersion(): Promise<[number, number, number] | undefined> {
    if (this.cachedWaVersion) return this.cachedWaVersion;
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (latest && Array.isArray(latest.version)) {
        this.cachedWaVersion = latest.version;
        return latest.version;
      }
    } catch {
      // Fallback to Baileys default bundled version
    }
    return undefined;
  }

  private async launchSocket(options: SessionLaunchOptions): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;
    this.clearReconnectTimer();
    this.destroyActiveSocketOnly();

    const currentGen = ++this.sessionGeneration;

    if (options.mode !== 'resume') {
      this.pairingRequested = false;
      this.sawNewLogin = false;
      this.reconnectAttempts = 0;
    }

    botStore.updateWAState({
      status: 'connecting',
      ...(options.mode !== 'resume'
        ? {
            qrDataUrl: null,
            pairingCode: null,
            pairingPhone:
              options.mode === 'pairing' ? options.phoneNumber : null,
          }
        : {}),
      statusMessage:
        options.mode === 'resume'
          ? 'Menyelesaikan sinkronisasi sesi WhatsApp...'
          : options.mode === 'pairing'
          ? 'Menyiapkan jalur Pairing Code 8 digit...'
          : 'Menyiapkan Kode QR Multi-Device...',
      lastError: null,
    });

    try {
      await fs.mkdir(AUTH_DIR, { recursive: true });

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
        this.pendingCredsSave = this.pendingCredsSave
          .then(async () => {
            await saveCreds();
            cloudSync.scheduleAuthSync(AUTH_DIR);
          })
          .catch(() => {});
        return this.pendingCredsSave;
      };

      const version = await this.resolveWaVersion();

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        logger: silentLogger as never,
        auth: state,
        printQRInTerminal: false,
        browser: this.resolveBrowserProfile(),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        qrTimeout: 60000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 20000,
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
          return undefined;
        },
      });

      if (currentGen !== this.sessionGeneration || this.manualDisconnect) {
        try {
          sock.end(undefined);
        } catch {
          // Ignore
        }
        this.isStarting = false;
        return;
      }

      this.sock = sock;
      (global as any).__BAILEYS_SOCKET__ = sock;
      queueEngine.setSocketProvider(() => this.sock);
      this.isStarting = false;

      sock.ev.on('creds.update', () => {
        void queueSaveCreds();
      });

      sock.ev.on('call', async (callEvents) => {
        if (!botStore.config.antiBan?.autoRejectCalls) return;
        for (const call of callEvents) {
          if (call.status === 'offer') {
            try {
              await sock.rejectCall(call.id, call.from);
              botStore.incrementAntiBanStat('callsDeclined');

              if (botStore.config.antiBan?.callRejectNotice) {
                const noticeText = botStore.config.antiBan.callRejectNotice;
                const callerJid = call.from;
                setTimeout(async () => {
                  try {
                    await sock.sendMessage(callerJid, {
                      text: `🛡️ *Perlindungan Otomatis ${botStore.config.botName}*\n\n${noticeText}`,
                    });
                  } catch {
                    // Ignore notice failure
                  }
                }, 2500);
              }
            } catch {
              // Ignore call reject error
            }
          }
        }
      });

      const triggerPairingCode = async () => {
        if (
          options.mode !== 'pairing' ||
          this.pairingRequested ||
          this.isDevicePaired(state)
        ) {
          return;
        }
        this.pairingRequested = true;
        try {
          const rawCode = await sock.requestPairingCode(options.phoneNumber);
          await queueSaveCreds();
          const formatted =
            rawCode && rawCode.length === 8
              ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
              : rawCode;
          botStore.updateWAState({
            status: 'pairing_code_ready',
            pairingCode: formatted,
            pairingPhone: options.phoneNumber,
            qrDataUrl: null,
            statusMessage: null,
            lastError: null,
          });
          console.log(
            [
              '',
              '============================================================',
              `[WABot 24/7] PAIRING CODE WHATSAPP (+${options.phoneNumber}):`,
              '',
              `   >>>   ${formatted}   <<<`,
              '',
              'Buka WhatsApp di HP -> Perangkat Tertaut -> Tautkan Perangkat',
              '-> "Tautkan dengan nomor telepon saja" -> Masukkan 8 kode di atas!',
              '============================================================',
              '',
            ].join('\n')
          );
        } catch (err) {
          this.pairingRequested = false;
          const msg =
            err instanceof Error
              ? err.message
              : 'Gagal meminta kode pairing dari server WhatsApp.';
          botStore.updateWAState({
            status: 'disconnected',
            statusMessage: null,
            lastError: `Gagal membuat Pairing Code: ${msg}`,
          });
          console.error(`[WABot 24/7] Gagal membuat Pairing Code: ${msg}`);
        }
      };

      sock.ev.on('connection.update', async (update) => {
        if (currentGen !== this.sessionGeneration || this.manualDisconnect) {
          return;
        }

        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (isNewLogin) {
          this.sawNewLogin = true;
          await queueSaveCreds();
          botStore.updateWAState({
            status: 'connecting',
            qrDataUrl: null,
            pairingCode: null,
            statusMessage:
              'Tautan diterima dari HP! Menyelesaikan sinkronisasi sesi WhatsApp...',
            lastError: null,
          });
        }

        if (qr && !this.isDevicePaired(state)) {
          if (options.mode === 'pairing') {
            await triggerPairingCode();
          } else if (options.mode === 'qr') {
            try {
              const dataUrl = await QRCode.toDataURL(qr, {
                width: 300,
                margin: 2,
                color: {
                  dark: '#18181B',
                  light: '#FFFFFF',
                },
              });
              botStore.updateWAState({
                status: 'qr_ready',
                qrDataUrl: dataUrl,
                pairingCode: null,
                statusMessage: null,
                lastError: null,
              });
            } catch {
              // Ignore QR image render error
            }
          }
        }

        if (connection === 'open') {
          this.reconnectAttempts = 0;
          this.sawNewLogin = true;
          await queueSaveCreds();

          const rawId = sock.user?.id || state.creds.me?.id || '';
          const phone = rawId.split(':')[0]?.split('@')[0] || 'Terhubung';
          const rawName = sock.user?.name || state.creds.me?.name;
          const name =
            rawName && rawName !== '~' ? rawName : botStore.config.botName;

          botStore.updateWAState({
            status: 'connected',
            qrDataUrl: null,
            pairingCode: null,
            connectedUser: {
              id: rawId,
              name,
              phone,
            },
            connectedAt: Date.now(),
            statusMessage: null,
            lastError: null,
          });
          console.log(
            [
              '',
              '============================================================',
              `[WABot 24/7] BERHASIL TERHUBUNG KE WHATSAPP (+${phone} - ${name})!`,
              'Sesi tersimpan permanen di server. Kamu bisa tutup halaman ini,',
              'bot akan tetap menyala dan membalas otomatis 24/7!',
              '============================================================',
              '',
            ].join('\n')
          );
          void webhookDispatcher.dispatch('session.status', {
            status: 'connected',
            user: { id: rawId, name, phone },
          });
        } else if (connection === 'close') {
          await queueSaveCreds();

          const statusCode = (
            lastDisconnect?.error as
              | { output?: { statusCode?: number }; message?: string }
              | undefined
          )?.output?.statusCode;

          const errMessage =
            (lastDisconnect?.error as Error | undefined)?.message || '';

          if (
            statusCode === DisconnectReason.loggedOut ||
            statusCode === DisconnectReason.multideviceMismatch ||
            statusCode === DisconnectReason.forbidden
          ) {
            await this.disconnect(true);
            botStore.updateWAState({
              lastError:
                statusCode === DisconnectReason.forbidden
                  ? 'Nomor WhatsApp dibatasi sementara oleh sistem keamanan Meta (kode 403 / "Akun tidak dapat menggunakan WhatsApp"). Sesi otomatis dihentikan agar aman — silakan ajukan "Minta Tinjauan" di aplikasi WhatsApp HP kamu, dan gunakan nomor khusus kedua untuk bot.'
                  : statusCode === DisconnectReason.loggedOut
                  ? 'Sesi WhatsApp telah keluar dari perangkat. Silakan tautkan ulang.'
                  : `Sesi ditolak WhatsApp (kode ${statusCode}). Silakan buat tautan baru.`,
            });
            return;
          }

          if (statusCode === DisconnectReason.connectionReplaced) {
            this.destroyActiveSocketOnly();
            botStore.updateWAState({
              status: 'disconnected',
              qrDataUrl: null,
              pairingCode: null,
              statusMessage: null,
              lastError:
                'Koneksi digantikan oleh sesi lain (pastikan hanya 1 mesin/instance bot yang berjalan untuk nomor ini).',
            });
            return;
          }

          const paired = this.isDevicePaired(state);

          // Transient 500 (badSession / stream error) on an already paired device: reload disk state & retry before giving up
          if (statusCode === DisconnectReason.badSession && paired) {
            this.authContext = null;
            if (this.reconnectAttempts >= 6) {
              this.destroyActiveSocketOnly();
              botStore.updateWAState({
                status: 'disconnected',
                qrDataUrl: null,
                pairingCode: null,
                statusMessage: null,
                lastError:
                  'Sesi mengalami gangguan sinkronisasi berulang (kode 500). Silakan hubungkan kembali.',
              });
              return;
            }
          }

          // Post-pairing 515 restartRequired OR reconnect of an already paired device
          if (
            statusCode === DisconnectReason.restartRequired ||
            paired ||
            botStore.waState.status === 'connected'
          ) {
            this.reconnectAttempts += 1;
            const delayMs =
              statusCode === DisconnectReason.restartRequired
                ? 500
                : Math.min(1500 * this.reconnectAttempts, 10000);

            botStore.updateWAState({
              status: 'connecting',
              qrDataUrl: null,
              pairingCode: null,
              statusMessage:
                statusCode === DisconnectReason.restartRequired
                  ? 'Tautan berhasil diverifikasi! Membuka koneksi utama WhatsApp...'
                  : 'Menyambungkan kembali ke WhatsApp...',
              lastError: null,
            });

            this.clearReconnectTimer();
            this.reconnectTimer = setTimeout(() => {
              if (!this.manualDisconnect) {
                void this.launchSocket({ mode: 'resume' });
              }
            }, delayMs);
            return;
          }

          if (
            statusCode === DisconnectReason.timedOut &&
            errMessage.toLowerCase().includes('qr refs')
          ) {
            await this.disconnect(true);
            botStore.updateWAState({
              lastError:
                'Batas waktu tunggu kode habis (belum dipindai/dimasukkan). Silakan klik tombol untuk membuat kode baru.',
            });
            return;
          }

          if (this.reconnectAttempts < 3) {
            this.reconnectAttempts += 1;
            const retryMode: SessionLaunchOptions =
              options.mode === 'pairing'
                ? { mode: 'pairing', phoneNumber: options.phoneNumber }
                : { mode: 'qr' };

            if (options.mode === 'pairing' && !paired) {
              this.authContext = null;
              await fs.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
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
            lastError:
              'Koneksi ke server WhatsApp terputus sebelum penautan selesai. Silakan coba lagi.',
          });
        }
      });

      sock.ev.on('groups.update', (updates) => {
        for (const upd of updates) {
          if (!upd.id) continue;
          const existing = this.getCachedGroupMetadata(upd.id);
          if (existing) {
            this.groupMetaCache.set(upd.id, {
              data: { ...existing, ...upd } as GroupMetadata,
              expiresAt: Date.now() + 5 * 60 * 1000,
            });
          } else {
            this.groupMetaCache.delete(upd.id);
          }
        }
      });

      sock.ev.on('group-participants.update', async (event) => {
        // Invalidate cached participant roster so admin/member checks stay fresh
        this.groupMetaCache.delete(event.id);
        groupCache.updateParticipants(event.id, event.action, event.participants);
        void webhookDispatcher.dispatch('group.participant_update', event);

        if (
          (event.action !== 'add' && event.action !== 'remove') ||
          event.participants.length === 0
        ) {
          return;
        }

        // Anti-suspension guard: skip automated spam greetings on mass join/leave bursts (> 5 at once)
        if (event.participants.length > 5) {
          return;
        }

        const effectiveSettings = botStore.getEffectiveGroupSettings(event.id);
        if (event.action === 'add' && !effectiveSettings.welcome) return;
        if (event.action === 'remove' && !effectiveSettings.goodbye) return;

        // Per-group greeting cooldown (15s) to prevent rapid burst messages when invite links are active
        const now = Date.now();
        const lastGreet = this.groupGreetingLastSent.get(event.id) || 0;
        if (now - lastGreet < 15000) {
          return;
        }
        this.groupGreetingLastSent.set(event.id, now);

        await this.sleepRandom(1400, 2600);

        let groupName = 'Grup';
        try {
          const meta = await this.getOrFetchGroupMetadata(sock, event.id);
          if (meta.subject) groupName = meta.subject;
        } catch {
          // Fallback group title
        }

        const templateKey =
          event.action === 'add' ? 'welcomeMsg' : 'goodbyeMsg';
        const templateRaw = botStore.getEffectiveTemplate(
          templateKey,
          event.id
        );

        const mentionJids: string[] = [];
        const phoneLabels: string[] = [];
        for (const participant of event.participants) {
          const jid =
            typeof participant === 'string' ? participant : participant.id;
          const phone = jid.split(':')[0]?.split('@')[0] || jid;
          mentionJids.push(jid);
          phoneLabels.push(phone);
        }

        // Combine simultaneous joins/leaves into a single clean message instead of looping sendMessage
        const combinedTarget =
          phoneLabels.length === 1
            ? phoneLabels[0]
            : phoneLabels.join(', @');
        const renderedText = renderBotTemplate(templateRaw, {
          target: combinedTarget,
          sender: phoneLabels[0] || '',
          groupName,
          prefix: botStore.config.prefix,
          botName: botStore.config.botName,
        });

        try {
          await this.simulateHumanTyping(sock, event.id, true);
          await sock.sendMessage(event.id, {
            text: renderedText,
            mentions: mentionJids,
            linkPreview: null,
          });
        } catch {
          // Ignore group welcome/goodbye error
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        for (const msg of messages) {
          void this.cacheIncomingViewOnceIfAny(sock, msg);
        }
        if (type !== 'notify') return;
        for (const msg of messages) {
          void this.handleIncomingMessage(sock, msg);
          if (!msg.key.fromMe) {
            void webhookDispatcher.dispatch('message.received', {
              id: msg.key.id,
              from: msg.key.remoteJid,
              participant: msg.key.participant,
              pushName: msg.pushName,
              timestamp: msg.messageTimestamp,
            });
          }
        }
      });
    } catch (err) {
      this.isStarting = false;
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Gagal menginisialisasi koneksi WhatsApp.';
      botStore.updateWAState({
        status: 'disconnected',
        statusMessage: null,
        lastError: errMsg,
      });
    }
  }

  private unwrapWaMessage(
    raw: WAMessage['message'] | null | undefined
  ): WAMessage['message'] | null {
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

  private inspectViewOnceCandidate(
    raw: WAMessage['message'] | null | undefined
  ): {
    isViewOnce: boolean;
    kind: 'image' | 'video' | 'audio';
    hkdfType: MediaType;
    mediaObj: {
      mediaKey?: Uint8Array | null;
      directPath?: string | null;
      url?: string | null;
      mimetype?: string | null;
      caption?: string | null;
    };
    hasDownloadKeys: boolean;
    mimeType: string;
    caption?: string;
    isVoiceNote?: boolean;
  } | null {
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

    const checkHasKeys = (m: {
      mediaKey?: Uint8Array | null;
      directPath?: string | null;
      url?: string | null;
    }) =>
      Boolean(
        m?.mediaKey &&
          m.mediaKey.length > 0 &&
          (Boolean(m.directPath) || Boolean(m.url))
      );

    if (current.imageMessage) {
      const m = current.imageMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: 'image',
        hkdfType: 'image',
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || 'image/jpeg',
        caption: m.caption || undefined,
      };
    }

    if (current.videoMessage) {
      const m = current.videoMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: 'video',
        hkdfType: 'video',
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || 'video/mp4',
        caption: m.caption || undefined,
      };
    }

    if (current.ptvMessage) {
      const m = current.ptvMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: 'video',
        hkdfType: 'ptv',
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || 'video/mp4',
        caption: m.caption || undefined,
      };
    }

    if (current.audioMessage) {
      const m = current.audioMessage;
      return {
        isViewOnce: sawVoWrapper || Boolean(m.viewOnce),
        kind: 'audio',
        hkdfType: 'audio',
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || 'audio/ogg; codecs=opus',
        isVoiceNote: Boolean(m.ptt),
      };
    }

    if (
      current.documentMessage &&
      (sawVoWrapper || (current.documentMessage as { viewOnce?: boolean }).viewOnce)
    ) {
      const m = current.documentMessage;
      const mime = (m.mimetype || '').toLowerCase();
      const isVid = mime.startsWith('video/');
      const isAud = mime.startsWith('audio/');
      return {
        isViewOnce: true,
        kind: isVid ? 'video' : isAud ? 'audio' : 'image',
        hkdfType: isVid ? 'video' : isAud ? 'audio' : 'image',
        mediaObj: m,
        hasDownloadKeys: checkHasKeys(m),
        mimeType: m.mimetype || (isVid ? 'video/mp4' : 'image/jpeg'),
        caption: m.caption || undefined,
      };
    }

    return null;
  }

  private async ensureViewOnceDir(): Promise<void> {
    try {
      await fs.mkdir(VIEWONCE_DIR, { recursive: true });
    } catch {
      // Ignore
    }
  }

  private async persistViewOnceToDisk(item: CachedViewOnce): Promise<void> {
    if (!item.buffer || item.buffer.length === 0) return;
    try {
      await this.ensureViewOnceDir();
      const metaPath = path.join(VIEWONCE_DIR, `${item.id}.json`);
      const binPath = path.join(VIEWONCE_DIR, `${item.id}.bin`);
      const meta = {
        id: item.id,
        remoteJid: item.remoteJid,
        kind: item.kind,
        mimeType: item.mimeType,
        caption: item.caption,
        isVoiceNote: item.isVoiceNote,
        savedAt: item.savedAt,
      };
      await fs.writeFile(metaPath, JSON.stringify(meta), 'utf-8');
      await fs.writeFile(binPath, item.buffer);

      // Prune old files (> 24h) or keep max 25 items to protect Redmi 9C disk
      const files = await fs.readdir(VIEWONCE_DIR);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      if (jsonFiles.length > 25) {
        const parsed = await Promise.all(
          jsonFiles.map(async (jf) => {
            try {
              const raw = await fs.readFile(path.join(VIEWONCE_DIR, jf), 'utf-8');
              const data = JSON.parse(raw);
              return { file: jf, id: data.id || jf.replace('.json', ''), savedAt: data.savedAt || 0 };
            } catch {
              return { file: jf, id: jf.replace('.json', ''), savedAt: 0 };
            }
          })
        );
        parsed.sort((a, b) => a.savedAt - b.savedAt);
        const toDelete = parsed.slice(0, parsed.length - 20);
        for (const d of toDelete) {
          await fs.unlink(path.join(VIEWONCE_DIR, `${d.id}.json`)).catch(() => {});
          await fs.unlink(path.join(VIEWONCE_DIR, `${d.id}.bin`)).catch(() => {});
        }
      }
    } catch {
      // Ignore non-fatal disk write error
    }
  }

  private async loadRecentViewOnceFromDisk(): Promise<void> {
    try {
      await this.ensureViewOnceDir();
      const files = await fs.readdir(VIEWONCE_DIR);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const now = Date.now();
      for (const jf of jsonFiles) {
        try {
          const metaPath = path.join(VIEWONCE_DIR, jf);
          const raw = await fs.readFile(metaPath, 'utf-8');
          const data = JSON.parse(raw) as {
            id: string;
            remoteJid: string;
            kind: 'image' | 'video' | 'audio';
            mimeType: string;
            caption?: string;
            isVoiceNote?: boolean;
            savedAt: number;
          };
          if (now - data.savedAt > 24 * 60 * 60 * 1000) {
            await fs.unlink(metaPath).catch(() => {});
            await fs.unlink(path.join(VIEWONCE_DIR, `${data.id}.bin`)).catch(() => {});
            continue;
          }
          const binPath = path.join(VIEWONCE_DIR, `${data.id}.bin`);
          const buf = await fs.readFile(binPath).catch(() => null);
          if (buf && buf.length > 0) {
            const item: CachedViewOnce = {
              id: data.id,
              remoteJid: data.remoteJid,
              kind: data.kind,
              buffer: buf,
              mimeType: data.mimeType,
              caption: data.caption,
              isVoiceNote: data.isVoiceNote,
              savedAt: data.savedAt,
            };
            this.recentViewOnceCache.set(data.id, item);
            if (data.remoteJid) {
              this.lastViewOnceByChat.set(data.remoteJid, data.id);
            }
          }
        } catch {
          // Ignore corrupt entry
        }
      }
    } catch {
      // Ignore disk load error
    }
  }

  private async cacheIncomingViewOnceIfAny(
    sock: WASocket,
    msg: WAMessage
  ): Promise<void> {
    const id = msg.key?.id;
    const remoteJid = msg.key?.remoteJid;
    if (!id || !remoteJid || !msg.message) return;

    const inspected = this.inspectViewOnceCandidate(msg.message);
    if (!inspected || !inspected.isViewOnce) {
      return;
    }

    // Immediately register chat pointer so unquoted .rvo knows this chat has a View Once
    this.lastViewOnceByChat.set(remoteJid, id);

    const now = Date.now();
    for (const [k, v] of this.recentViewOnceCache.entries()) {
      if (now - v.savedAt > 60 * 60 * 1000) {
        this.recentViewOnceCache.delete(k);
      }
    }
    while (this.recentViewOnceCache.size >= 50) {
      const oldestKey = this.recentViewOnceCache.keys().next().value;
      if (!oldestKey) break;
      this.recentViewOnceCache.delete(oldestKey);
    }

    const cachedItem: CachedViewOnce = {
      id,
      remoteJid,
      kind: inspected.kind,
      hkdfType: inspected.hkdfType,
      mediaObj: inspected.mediaObj,
      mimeType: inspected.mimeType,
      caption: inspected.caption,
      isVoiceNote: inspected.isVoiceNote,
      fullMsg: msg,
      savedAt: now,
    };
    this.recentViewOnceCache.set(id, cachedItem);

    // Auto pre-download buffer immediately while WhatsApp CDN keys are 100% fresh & unconsumed!
    try {
      let buffer: Buffer | null = null;
      try {
        const direct = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: silentLogger as never,
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        if (direct && direct.length > 0) {
          buffer = Buffer.from(direct);
        }
      } catch {
        // Fall through to manual stream download
      }

      if (!buffer && inspected.hasDownloadKeys) {
        try {
          buffer = await this.downloadStreamToBuffer(
            inspected.mediaObj,
            inspected.hkdfType
          );
        } catch {
          // Retry once with updateMediaMessage
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
            // Ignore
          }
        }
      }

      if (buffer && buffer.length > 0) {
        cachedItem.buffer = buffer;
        this.recentViewOnceCache.set(id, cachedItem);
        void this.persistViewOnceToDisk(cachedItem);
      }
    } catch {
      // Non-fatal pre-download background error
    }
  }

  private extractMessageText(msg: WAMessage): string {
    const m = this.unwrapWaMessage(msg.message);
    if (!m) return '';
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      ''
    );
  }

  private extractContextInfo(msg: WAMessage) {
    const m = this.unwrapWaMessage(msg.message);
    return (
      m?.extendedTextMessage?.contextInfo ||
      m?.imageMessage?.contextInfo ||
      m?.videoMessage?.contextInfo ||
      m?.documentMessage?.contextInfo ||
      m?.audioMessage?.contextInfo ||
      m?.stickerMessage?.contextInfo ||
      undefined
    );
  }

  private async sendReaction(
    sock: WASocket,
    msg: WAMessage,
    emoji: string
  ): Promise<void> {
    if (!msg.key.remoteJid || !msg.key.id) return;
    try {
      await sock.sendMessage(msg.key.remoteJid, {
        react: {
          text: emoji,
          key: msg.key,
        },
      });
    } catch {
      // Ignore non-fatal reaction error
    }
  }

  private async extractAttachedOrQuotedMediaByKind(
    sock: WASocket,
    msg: WAMessage,
    kind: 'image' | 'video' | 'audio' | 'sticker'
  ): Promise<Buffer | null> {
    const pickField = (m: WAMessage['message'] | null | undefined) => {
      if (!m) return null;
      if (kind === 'image') return m.imageMessage || null;
      if (kind === 'video') return m.videoMessage || m.ptvMessage || null;
      if (kind === 'audio') return m.audioMessage || null;
      return m.stickerMessage || null;
    };

    try {
      const m = this.unwrapWaMessage(msg.message);
      if (pickField(m)) {
        const buf = await downloadMediaMessage(
          { key: msg.key, message: m! },
          'buffer',
          {},
          {
            logger: silentLogger as never,
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        return Buffer.from(buf);
      }

      const contextInfo = this.extractContextInfo(msg);
      const quoted = this.unwrapWaMessage(contextInfo?.quotedMessage);
      if (pickField(quoted) && contextInfo?.stanzaId) {
        const quotedMsg: WAMessage = {
          key: {
            remoteJid: msg.key.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: quoted!,
        };
        const buf = await downloadMediaMessage(
          quotedMsg,
          'buffer',
          {},
          {
            logger: silentLogger as never,
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        return Buffer.from(buf);
      }
    } catch {
      return null;
    }
    return null;
  }

  private async downloadStreamToBuffer(
    mediaObj: {
      mediaKey?: Uint8Array | null;
      directPath?: string | null;
      url?: string | null;
    },
    hkdfType: MediaType
  ): Promise<Buffer> {
    const candidateHosts = [
      'mmg.whatsapp.net',
      'media-sin1-1.cdn.whatsapp.net',
      'media-cgk1-1.cdn.whatsapp.net',
      'media-cgk1-2.cdn.whatsapp.net',
      'media.fsub3-2.fna.whatsapp.net',
    ];
    let lastErr: unknown;
    for (const host of candidateHosts) {
      try {
        const stream = await downloadContentFromMessage(mediaObj, hkdfType, {
          host,
        });
        const chunks: Buffer[] = [];
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
    throw lastErr || new Error('Hasil dekripsi media View Once kosong.');
  }

  private async extractViewOnceForRvo(
    sock: WASocket,
    msg: WAMessage
  ): Promise<{
    payload: {
      kind: 'image' | 'video' | 'audio';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      isVoiceNote?: boolean;
    } | null;
    errorHint?: string;
  }> {
    const remoteJid = msg.key.remoteJid || '';
    const contextInfo = this.extractContextInfo(msg);
    const stanzaId = contextInfo?.stanzaId || '';
    const rawQuoted = contextInfo?.quotedMessage;

    // 1. Direct candidate: did user send a View Once with caption .rvo?
    const selfInspected = this.inspectViewOnceCandidate(msg.message);
    if (selfInspected && selfInspected.isViewOnce) {
      if (msg.key.id && this.recentViewOnceCache.has(msg.key.id)) {
        const c = this.recentViewOnceCache.get(msg.key.id)!;
        if (c.buffer) {
          return {
            payload: {
              kind: c.kind,
              buffer: c.buffer,
              mimeType: c.mimeType,
              caption: c.caption,
              isVoiceNote: c.isVoiceNote,
            },
          };
        }
      }
      try {
        const direct = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: silentLogger as never,
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        if (direct && direct.length > 0) {
          return {
            payload: {
              kind: selfInspected.kind,
              buffer: Buffer.from(direct),
              mimeType: selfInspected.mimeType,
              caption: selfInspected.caption,
              isVoiceNote: selfInspected.isVoiceNote,
            },
          };
        }
      } catch {
        // Fall through
      }
    }

    // 2. Quoted candidate: did user reply to a specific View Once message?
    if (stanzaId) {
      // Memory check
      const cached = this.recentViewOnceCache.get(stanzaId);
      if (cached && cached.buffer) {
        return {
          payload: {
            kind: cached.kind,
            buffer: cached.buffer,
            mimeType: cached.mimeType,
            caption: cached.caption,
            isVoiceNote: cached.isVoiceNote,
          },
        };
      }

      // If cached metadata exists without buffer yet, try downloading now
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
              isVoiceNote: cached.isVoiceNote,
            },
          };
        } catch {
          // Fall through
        }
      }

      // Check raw quoted message keys
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
                isVoiceNote: quotedInspected.isVoiceNote,
              },
            };
          } catch {
            // Fall through
          }
        }
      }
    }

    // 3. Fallback: Unquoted .rvo! (WhatsApp blocks the reply swipe on View Once)
    // Automatically retrieve the last View Once received in this chat!
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
            isVoiceNote: lastVo.isVoiceNote,
          },
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
              isVoiceNote: lastVo.isVoiceNote,
            },
          };
        } catch {
          // Fall through
        }
      }
    }

    // 4. Global fallback: Most recent View Once received anywhere in the last 60 minutes
    let newestItem: CachedViewOnce | null = null;
    for (const item of this.recentViewOnceCache.values()) {
      if (item.buffer && (!newestItem || item.savedAt > newestItem.savedAt)) {
        newestItem = item;
      }
    }
    if (newestItem && Date.now() - newestItem.savedAt < 60 * 60 * 1000) {
      return {
        payload: {
          kind: newestItem.kind,
          buffer: newestItem.buffer!,
          mimeType: newestItem.mimeType,
          caption: newestItem.caption,
          isVoiceNote: newestItem.isVoiceNote,
        },
      };
    }

    return {
      payload: null,
      errorHint:
        'Belum ada pesan *View Once* (sekali lihat) yang tersimpan di chat ini. Kirim foto/video sekali lihat baru, lalu ketik *.rvo* (bisa tanpa reply) untuk membukanya kembali.',
    };
  }


  private classifyDocKind(
    mimeType: string,
    fileName: string
  ): 'image' | 'video' | 'unsupported' {
    const lowerMime = mimeType.toLowerCase();
    const lowerName = fileName.toLowerCase();
    if (
      lowerMime.startsWith('image/') ||
      /\.(jpe?g|png|webp)$/i.test(lowerName)
    ) {
      return 'image';
    }
    if (
      lowerMime.startsWith('video/') ||
      /\.(mp4|mov|m4v|mkv|webm|3gp)$/i.test(lowerName)
    ) {
      return 'video';
    }
    return 'unsupported';
  }

  private async extractDocumentForHdsw(
    sock: WASocket,
    msg: WAMessage
  ): Promise<{
    documentMedia: {
      kind: 'image' | 'video' | 'unsupported';
      buffer?: Buffer;
      mimeType: string;
      fileName: string;
      fileSize: number;
      jpegThumbnail?: Buffer;
    } | null;
    attachedNonDocumentMedia: boolean;
  }> {
    const m = this.unwrapWaMessage(msg.message);
    const contextInfo = this.extractContextInfo(msg);
    const quoted = this.unwrapWaMessage(contextInfo?.quotedMessage);

    let targetDoc = m?.documentMessage || null;
    let targetWaMsg: WAMessage | null = targetDoc
      ? { key: msg.key, message: m! }
      : null;

    if (!targetDoc && quoted?.documentMessage && contextInfo?.stanzaId) {
      targetDoc = quoted.documentMessage;
      targetWaMsg = {
        key: {
          remoteJid: msg.key.remoteJid,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
        },
        message: quoted,
      };
    }

    if (!targetDoc || !targetWaMsg) {
      const hasRegularMedia = Boolean(
        m?.imageMessage ||
          m?.videoMessage ||
          quoted?.imageMessage ||
          quoted?.videoMessage
      );
      return {
        documentMedia: null,
        attachedNonDocumentMedia: hasRegularMedia,
      };
    }

    const mimeType = targetDoc.mimetype || 'application/octet-stream';
    const fileName = targetDoc.fileName || '';
    const fileSize = Number(targetDoc.fileLength || 0);
    const kind = this.classifyDocKind(mimeType, fileName);

    if (kind === 'unsupported') {
      return {
        documentMedia: {
          kind: 'unsupported',
          mimeType,
          fileName,
          fileSize,
        },
        attachedNonDocumentMedia: false,
      };
    }

    const maxBytes = 65 * 1024 * 1024; // 65 MB safe ceiling for WA Status HD
    if (fileSize > maxBytes) {
      throw new Error(
        'Ukuran dokumen melebihi batas aman 65 MB untuk pengiriman Status WhatsApp.'
      );
    }

    const downloaded = await downloadMediaMessage(
      targetWaMsg,
      'buffer',
      {},
      {
        logger: silentLogger as never,
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    const rawBuffer = Buffer.from(downloaded);
    const jpegThumbnail = targetDoc.jpegThumbnail
      ? Buffer.from(targetDoc.jpegThumbnail)
      : undefined;

    return {
      documentMedia: {
        kind,
        buffer: rawBuffer,
        mimeType,
        fileName,
        fileSize: rawBuffer.length,
        jpegThumbnail,
      },
      attachedNonDocumentMedia: false,
    };
  }

  private async handleIncomingMessage(
    sock: WASocket,
    msg: WAMessage
  ): Promise<void> {
    if (!msg.message || !msg.key.remoteJid) return;
    if (msg.key.remoteJid === 'status@broadcast') return;

    // Cache incoming ViewOnce metadata BEFORE checking text so captionless ViewOnce media can always be opened via .rvo
    void this.cacheIncomingViewOnceIfAny(sock, msg);

    const text = this.extractMessageText(msg).trim();
    if (!text) return;

    if (msg.key.fromMe && !botStore.config.selfMode) {
      return;
    }

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? msg.key.participant || remoteJid : remoteJid;
    const keyAlt = msg.key as {
      participantAlt?: string;
      remoteJidAlt?: string;
    };
    const senderAltJid =
      (isGroup ? keyAlt.participantAlt : keyAlt.remoteJidAlt) || '';
    const preferredPhoneSource = senderAltJid.endsWith('@s.whatsapp.net')
      ? senderAltJid
      : senderJid;
    let senderPhone =
      preferredPhoneSource.split(':')[0]?.split('@')[0] || 'user';
    const senderName = msg.pushName || `+${senderPhone}`;

    const isPrefixCommand = text
      .toLowerCase()
      .startsWith(botStore.config.prefix.toLowerCase());

    const normalizeWaPhone = (raw: string) => {
      let d = raw.replace(/[^0-9]/g, '');
      if (d.startsWith('08')) d = '62' + d.slice(1);
      else if (d.startsWith('8') && d.length >= 9) d = '62' + d;
      return d;
    };

    const ownerNumberDigits = normalizeWaPhone(
      botStore.config.antiBan?.ownerNumber || '6289673533963'
    );
    const normalizedSenderPhone = normalizeWaPhone(senderPhone);
    const isOwner =
      Boolean(msg.key.fromMe) ||
      Boolean(
        ownerNumberDigits &&
          normalizedSenderPhone &&
          normalizedSenderPhone === ownerNumberDigits
      );

    // Anti-Ban: Owner-Only Mode check
    if (
      botStore.config.antiBan?.enabled &&
      botStore.config.antiBan?.ownerOnlyMode
    ) {
      if (!isOwner) {
        return;
      }
    }

    // Anti-Ban: User & Group Command Rate Limiter (Bot Owner is exempt)
    if (
      botStore.config.antiBan?.enabled &&
      isPrefixCommand &&
      !isOwner
    ) {
      const now = Date.now();
      const userKey = senderPhone || senderJid;
      const history = this.userCommandTimestamps.get(userKey) || [];
      const windowStart = now - 60000;
      const recent = history.filter((ts) => ts > windowStart);

      const maxPerMin = botStore.config.antiBan.warmUpMode
        ? Math.min(botStore.config.antiBan.maxCommandsPerMinutePerUser || 3, 3)
        : botStore.config.antiBan.maxCommandsPerMinutePerUser || 5;
      const cooldownSec = botStore.config.antiBan.warmUpMode
        ? Math.max(botStore.config.antiBan.userCooldownSeconds || 8, 8)
        : botStore.config.antiBan.userCooldownSeconds || 5;

      const lastTs = recent.length > 0 ? recent[recent.length - 1] : 0;
      const elapsedSec = (now - lastTs) / 1000;

      if (elapsedSec < cooldownSec || recent.length >= maxPerMin) {
        botStore.incrementAntiBanStat('throttledSpams');
        recent.push(now);
        this.userCommandTimestamps.set(userKey, recent);

        if (recent.length === maxPerMin + 1) {
          const waitTime = Math.ceil(Math.max(cooldownSec - elapsedSec, 5));
          try {
            await sock.sendMessage(
              remoteJid,
              {
                text: `🛡️ *Anti-Ban Guard*: Mohon santai sejenak (*${waitTime} detik*).\nBatas perintah diterapkan untuk melindungi nomor bot dari pemblokiran spam WhatsApp.`,
              },
              { quoted: msg }
            );
          } catch {
            // Ignore
          }
        }
        return;
      }

      recent.push(now);
      this.userCommandTimestamps.set(userKey, recent);
    }

    // Anti-ban: ONLY send read receipt on actual bot commands
    if (
      isPrefixCommand &&
      botStore.config.autoRead &&
      msg.key.id &&
      !msg.key.fromMe
    ) {
      try {
        await this.sleepRandom(250, 550);
        await sock.readMessages([msg.key]);
      } catch {
        // Ignore read receipt error
      }
    }

    const pendingSent = shouldSendPendingReaction(text);
    if (pendingSent) {
      await this.sendReaction(sock, msg, botStore.config.reactions.pending);
    }

    let isAdmin = !isGroup || isOwner;
    let isBotGroupAdmin: boolean | undefined;
    let groupName: string | undefined;
    let groupMembers: SimulatorMember[] | undefined;
    let waGroupOps: WAGroupOperations | undefined;

    if (isGroup) {
      waGroupOps = {
        removeParticipant: async (targetJid: string) => {
          await this.sleepRandom(1100, 2200);
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove');
          this.groupMetaCache.delete(remoteJid);
        },
        addParticipant: async () => {
          throw new Error(SUSPENSION_RISK_DISABLED_REPLY);
        },
        promoteParticipant: async (targetJid: string) => {
          await this.sleepRandom(1100, 2200);
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote');
          this.groupMetaCache.delete(remoteJid);
        },
        demoteParticipant: async (targetJid: string) => {
          await this.sleepRandom(1100, 2200);
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote');
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupAnnouncement: async (announcementOnly: boolean) => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error(
              'Pengubahan setelan grup dikunci manual oleh Owner.'
            );
          }
          await this.sleepRandom(1000, 1900);
          await sock.groupSettingUpdate(
            remoteJid,
            announcementOnly ? 'announcement' : 'not_announcement'
          );
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupSubject: async (subject: string) => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error('Pengubahan nama grup dikunci manual oleh Owner.');
          }
          await this.sleepRandom(1100, 2000);
          await sock.groupUpdateSubject(remoteJid, subject);
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupDescription: async (description: string) => {
          if (botStore.config.lockSettingsManualOnly ?? true) {
            throw new Error(
              'Pengubahan deskripsi grup dikunci manual oleh Owner.'
            );
          }
          await this.sleepRandom(1100, 2000);
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
              'Reset tautan undangan grup dikunci manual oleh Owner.'
            );
          }
          await this.sleepRandom(1300, 2400);
          return await sock.groupRevokeInvite(remoteJid);
        },
      };

      try {
        const meta = await this.getOrFetchGroupMetadata(sock, remoteJid);
        groupName = meta.subject;

        const botRawId = sock.user?.id || '';
        const botPhoneBase = botRawId.split(':')[0]?.split('@')[0] || '';
        const botLidRaw =
          (sock.user as { lid?: string } | undefined)?.lid || '';
        const botLidBase = botLidRaw.split(':')[0]?.split('@')[0] || '';

        let detectedBotAdmin = false;

        groupMembers = meta.participants.map((p) => {
          const rawP = p as {
            id: string;
            lid?: string;
            phoneNumber?: string;
            admin?: string | null;
          };
          const phoneSource =
            rawP.phoneNumber ||
            (rawP.id.endsWith('@s.whatsapp.net') ? rawP.id : rawP.id);
          const phone = phoneSource.split(':')[0]?.split('@')[0] || rawP.id;
          const lid =
            rawP.lid || (rawP.id.endsWith('@lid') ? rawP.id : undefined);
          const participantIsAdmin = Boolean(rawP.admin);

          const pIdBase = rawP.id.split(':')[0]?.split('@')[0] || '';
          const pLidBase = lid ? lid.split(':')[0]?.split('@')[0] || '' : '';

          if (
            (botPhoneBase &&
              (phone === botPhoneBase || pIdBase === botPhoneBase)) ||
            (botLidBase && (pIdBase === botLidBase || pLidBase === botLidBase))
          ) {
            detectedBotAdmin = participantIsAdmin;
          }

          return {
            jid: rawP.id,
            lid,
            name: phone,
            phone,
            isAdmin: participantIsAdmin,
          };
        });

        isBotGroupAdmin = detectedBotAdmin;

        const cleanSenderDigits = normalizeWaPhone(senderPhone);
        const baseSenderJid = senderJid.split(':')[0]?.split('@')[0] || '';
        const foundSender = groupMembers.find(
          (p) =>
            p.jid === senderJid ||
            p.jid.split(':')[0]?.split('@')[0] === baseSenderJid ||
            (p.lid && (p.lid === senderJid || p.lid.split(':')[0]?.split('@')[0] === baseSenderJid)) ||
            (senderAltJid &&
              (p.jid === senderAltJid || p.lid === senderAltJid)) ||
            p.phone === senderPhone ||
            (cleanSenderDigits && normalizeWaPhone(p.phone) === cleanSenderDigits)
        );
        if (foundSender) {
          if (/^[0-9]{8,16}$/.test(foundSender.phone)) {
            senderPhone = foundSender.phone;
          }
          const resolvedIsOwner =
            isOwner ||
            (Boolean(ownerNumberDigits) &&
              normalizeWaPhone(senderPhone) === ownerNumberDigits);
          isAdmin = foundSender.isAdmin || resolvedIsOwner;
        }
      } catch {
        // Default non-admin if group metadata fails
      }
    }

    const contextInfo = this.extractContextInfo(msg);
    const mentionedJids = contextInfo?.mentionedJid || [];
    const quotedParticipantJid = contextInfo?.participant || undefined;
    const unwrappedQuoted = this.unwrapWaMessage(contextInfo?.quotedMessage);
    const quotedText =
      unwrappedQuoted?.conversation ||
      unwrappedQuoted?.extendedTextMessage?.text ||
      unwrappedQuoted?.imageMessage?.caption ||
      unwrappedQuoted?.videoMessage?.caption ||
      unwrappedQuoted?.documentMessage?.caption ||
      undefined;
    const quotedBaseId = quotedParticipantJid
      ? quotedParticipantJid.split(':')[0]?.split('@')[0] || ''
      : '';
    const foundQuotedMember =
      quotedBaseId && groupMembers
        ? groupMembers.find(
            (m) =>
              m.jid === quotedParticipantJid ||
              m.jid.split(':')[0]?.split('@')[0] === quotedBaseId ||
              (m.lid &&
                (m.lid === quotedParticipantJid ||
                  m.lid.split(':')[0]?.split('@')[0] === quotedBaseId))
          )
        : undefined;
    const quotedSenderPhone =
      foundQuotedMember?.phone ||
      (quotedParticipantJid
        ? quotedParticipantJid.split(':')[0]?.split('@')[0]
        : undefined);
    const isSelfQuoted =
      Boolean(quotedParticipantJid) &&
      (quotedParticipantJid === senderJid ||
        (senderAltJid && quotedParticipantJid === senderAltJid) ||
        (quotedSenderPhone && quotedSenderPhone === senderPhone));
    const quotedSenderName = isSelfQuoted
      ? senderName
      : quotedSenderPhone
      ? `+${quotedSenderPhone}`
      : undefined;

    const pfx = botStore.config.prefix;
    const lowerText = text.toLowerCase();
    const firstToken = lowerText.startsWith(pfx.toLowerCase())
      ? lowerText.slice(pfx.length).trim().split(/\s+/)[0] || ''
      : '';

    const needsQcAvatar = [
      'qc',
      'quotely',
      'quotechat',
      'bubble',
      'iqc',
      'iphoneqc',
      'ioschat',
    ].includes(firstToken);

    const needsImage = [
      's',
      'stiker',
      'sticker',
      'sgif',
      'smeme',
      'memesticker',
      'stikermeme',
      'wm',
      'take',
      'colong',
      'swm',
      'hd',
      'enhance',
      'jernih',
      'hdr',
      'remini',
      'facehd',
      'restoreface',
      'upscale',
      'sr',
      'superres',
      'hd2',
      'upscale2x',
      '2x',
      'hd4',
      'upscale4x',
      '4x',
      'hitamkan',
      'grayscale',
      'bw',
      'hitamputih',
      'imgedit',
      'blur',
      'invert',
      'negatif',
      'mirror',
      'flip',
      'sepia',
      'tourl',
      'upload',
      'catbox',
      'linkmedia',
    ].includes(firstToken);

    const needsVideo = [
      's',
      'stiker',
      'sticker',
      'sgif',
      'toptv',
      'ptv',
      'videobulat',
      'tomp3',
      'toaudio',
      'vn2mp3',
      'tovn',
      'toptt',
      'vn',
      'bass',
      'bassboost',
      'jedagjedug',
      'nightcore',
      'nc',
      'tupai',
      'slow',
      'slowed',
      'reverb',
      'fast',
      'speedup',
      'cepat',
      'robot',
      'robo',
      'cyborg',
      'reverse',
      'baliksuara',
      'tourl',
      'upload',
      'catbox',
      'linkmedia',
    ].includes(firstToken);

    const needsAudio = [
      'tomp3',
      'toaudio',
      'vn2mp3',
      'tovn',
      'toptt',
      'vn',
      'bass',
      'bassboost',
      'jedagjedug',
      'nightcore',
      'nc',
      'tupai',
      'slow',
      'slowed',
      'reverb',
      'fast',
      'speedup',
      'cepat',
      'robot',
      'robo',
      'cyborg',
      'reverse',
      'baliksuara',
      'tourl',
      'upload',
      'catbox',
      'linkmedia',
    ].includes(firstToken);

    const needsSticker = [
      'wm',
      'take',
      'colong',
      'swm',
      'exif',
      'toimg',
      'topng',
      'toimage',
      'tovid',
      'tomp4',
      'togif',
      'tourl',
      'upload',
      'catbox',
      'linkmedia',
      'smeme',
      'memesticker',
      'stikermeme',
    ].includes(firstToken);

    const needsViewOnce = [
      'rvo',
      'readviewonce',
      'bukavo',
      'lihatsekali',
    ].includes(firstToken);

    const needsHdswDoc = [
      'hdsw',
      'sw',
      'tosw',
      'hdstatus',
      'swori',
      's',
      'stiker',
      'sticker',
      'sgif',
      'hd',
      'enhance',
      'jernih',
      'hdr',
      'remini',
      'facehd',
      'restoreface',
      'upscale',
      'sr',
      'superres',
      'hd2',
      'upscale2x',
      '2x',
      'hd4',
      'upscale4x',
      '4x',
      'toptv',
      'ptv',
      'tourl',
    ].includes(firstToken);

    const senderAvatarJids: Array<string | undefined | null> = [
      /^[0-9]{8,16}$/.test(senderPhone)
        ? `${senderPhone}@s.whatsapp.net`
        : undefined,
      senderAltJid,
      senderJid,
      ...(groupMembers
        ? groupMembers
            .filter((m) => m.phone === senderPhone || m.jid === senderJid)
            .flatMap((m) => [m.jid, m.lid])
        : []),
      ...(msg.key.fromMe
        ? [
            sock.user?.id,
            (sock.user as { lid?: string } | undefined)?.lid,
          ]
        : []),
    ];

    const quotedAvatarJids: Array<string | undefined | null> = [
      quotedSenderPhone && /^[0-9]{8,16}$/.test(quotedSenderPhone)
        ? `${quotedSenderPhone}@s.whatsapp.net`
        : undefined,
      quotedParticipantJid,
      foundQuotedMember?.jid,
      foundQuotedMember?.lid,
    ];

    const [
      imageBuffer,
      videoBuffer,
      audioBuffer,
      stickerBuffer,
      voResult,
      senderAvatarBuffer,
      quotedAvatarBuffer,
    ] = await Promise.all([
      needsImage
        ? this.extractAttachedOrQuotedMediaByKind(sock, msg, 'image')
        : Promise.resolve(null),
      needsVideo
        ? this.extractAttachedOrQuotedMediaByKind(sock, msg, 'video')
        : Promise.resolve(null),
      needsAudio
        ? this.extractAttachedOrQuotedMediaByKind(sock, msg, 'audio')
        : Promise.resolve(null),
      needsSticker
        ? this.extractAttachedOrQuotedMediaByKind(sock, msg, 'sticker')
        : Promise.resolve(null),
      needsViewOnce
        ? this.extractViewOnceForRvo(sock, msg)
        : Promise.resolve(null),
      needsQcAvatar
        ? this.fetchUserProfilePicBuffer(sock, senderAvatarJids)
        : Promise.resolve(null),
      needsQcAvatar && quotedParticipantJid && !isSelfQuoted
        ? this.fetchUserProfilePicBuffer(sock, quotedAvatarJids)
        : Promise.resolve(null),
    ]);
    const viewOnceMedia = voResult?.payload ?? null;
    const viewOnceError = voResult?.errorHint ?? null;

    let documentMedia: {
      kind: 'image' | 'video' | 'unsupported';
      buffer?: Buffer;
      mimeType: string;
      fileName: string;
      fileSize: number;
      jpegThumbnail?: Buffer;
    } | null = null;
    let attachedNonDocumentMedia = false;

    // Works in BOTH Private Chat and Group Chat!
    if (needsHdswDoc) {
      try {
        const extracted = await this.extractDocumentForHdsw(sock, msg);
        documentMedia = extracted.documentMedia;
        attachedNonDocumentMedia = extracted.attachedNonDocumentMedia;
      } catch (docErr) {
        if (botStore.config.reactions.enabled) {
          await this.sendReaction(sock, msg, botStore.config.reactions.error);
        }
        const errMsg =
          docErr instanceof Error
            ? docErr.message
            : 'Gagal mengunduh file dokumen.';
        await sock.sendMessage(
          remoteJid,
          { text: errMsg },
          { quoted: msg }
        );
        return;
      }
    }

    const unwrappedIncoming = this.unwrapWaMessage(msg.message);
    const detectedImageMime =
      unwrappedIncoming?.imageMessage?.mimetype ||
      unwrappedQuoted?.imageMessage?.mimetype ||
      null;

    const result = await processBotMessage({
      source: 'whatsapp',
      isGroup,
      groupId: isGroup ? remoteJid : undefined,
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
      onProgressStatus: async (statusText: string) => {
        await this.enqueueOutboundSend(async () => {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              text: statusText,
              linkPreview: null,
            },
            { quoted: msg }
          );
        }).catch(() => {});
      },
    });

    if (!result.handled) {
      if (pendingSent) {
        await this.sendReaction(sock, msg, '');
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
            // Bot might not be group admin yet
          }
          if (result.replyText) {
            await this.simulateHumanTyping(sock, remoteJid, isGroup);
            await sock.sendMessage(remoteJid, {
              text: result.replyText,
              mentions: result.mentions,
              linkPreview: null,
            });
          }
          return;
        }

        if (result.hdswMedia) {
          const hd = result.hdswMedia;
          await this.simulateHumanTyping(sock, remoteJid, isGroup);

          if (hd.kind === 'image') {
            await sock.sendMessage(
              remoteJid,
              {
                image: hd.buffer,
                mimetype: hd.mimeType,
                caption: hd.caption,
                mentions: result.mentions,
                ...(hd.width ? { width: hd.width } : {}),
                ...(hd.height ? { height: hd.height } : {}),
                ...(hd.jpegThumbnail ? { jpegThumbnail: hd.jpegThumbnail } : {}),
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
                ...(hd.jpegThumbnail ? { jpegThumbnail: hd.jpegThumbnail } : {}),
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
              mimetype: result.imageMimeType || 'image/jpeg',
              caption: result.replyText || '',
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
                mimetype: 'video/mp4',
                ptv: true,
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(
              remoteJid,
              {
                video: result.videoBuffer,
                mimetype: result.videoMimeType || 'video/mp4',
                caption: result.replyText || '',
              },
              { quoted: msg }
            );
          }
        } else if (result.audioBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup, 'audio');
          await sock.sendMessage(
            remoteJid,
            {
              audio: result.audioBuffer,
              mimetype: result.audioMimeType || 'audio/mpeg',
              ptt: Boolean(result.asVoiceNote),
            },
            { quoted: msg }
          );
        } else if (result.documentBuffer) {
          await this.simulateHumanTyping(sock, remoteJid, isGroup);
          await sock.sendMessage(
            remoteJid,
            {
              document: result.documentBuffer,
              mimetype: result.documentMimeType || 'application/octet-stream',
              fileName: result.documentFileName || 'berkas-unduhan',
              caption: result.replyText || '',
            },
            { quoted: msg }
          );
        } else if (
          result.slideImageUrls &&
          result.slideImageUrls.length > 0
        ) {
          const slides = result.slideImageUrls.slice(0, 35);
          const slideFallbacks = result.slideFallbackImageUrls || [];
          const total = slides.length;
          const CHUNK_SIZE = 4;

          await this.simulateHumanTyping(sock, remoteJid, isGroup);

          for (
            let chunkStart = 0;
            chunkStart < total;
            chunkStart += CHUNK_SIZE
          ) {
            const chunkUrls = slides.slice(chunkStart, chunkStart + CHUNK_SIZE);
            // Pre-download up to 4 slides concurrently while strictly keeping array order [0, 1, 2, 3]
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
                  mimeType: normalized.mimeType,
                };
              })
            );

            // Dispatch each photo sequentially in exact TikTok order (1/N, 2/N, ..., N/N) back-to-back
            for (const item of preparedChunk) {
              const stepLabel = `📸 *Foto ${item.index + 1}/${total}*`;
              const photoCaption =
                item.index === 0
                  ? result.replyText
                    ? `${result.replyText}\n${stepLabel}`
                    : stepLabel
                  : stepLabel;

              await sock.sendMessage(
                remoteJid,
                {
                  image: item.buffer,
                  mimetype: item.mimeType,
                  caption: photoCaption,
                },
                item.index === 0 ? { quoted: msg } : undefined
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
              caption: result.replyText || '',
              mimetype: 'video/mp4',
            },
            { quoted: msg }
          );
        } else if (result.audioRemoteUrl) {
          const { buffer } = await fetchRemoteBuffer(result.audioRemoteUrl);
          await this.simulateHumanTyping(sock, remoteJid, isGroup, 'audio');
          await sock.sendMessage(
            remoteJid,
            {
              audio: buffer,
              mimetype: 'audio/mpeg',
              ptt: false,
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
              linkPreview: null,
            },
            { quoted: msg }
          );
        }
      });

      if (botStore.config.reactions.enabled && result.reactionStatus) {
        const finalEmoji =
          result.reactionStatus === 'success'
            ? botStore.config.reactions.success
            : botStore.config.reactions.error;
        await this.sendReaction(sock, msg, finalEmoji);
      }
    } catch (sendErr) {
      if (botStore.config.reactions.enabled) {
        await this.sendReaction(sock, msg, botStore.config.reactions.error);
      }
      const fallbackErr =
        sendErr instanceof Error
          ? sendErr.message
          : 'Gagal mengirim media ke WhatsApp.';
      try {
        await sock.sendMessage(
          remoteJid,
          { text: `Kendala pengiriman media: ${fallbackErr}` },
          { quoted: msg }
        );
      } catch {
        // Ignore secondary failure
      }
    }
  }
}

export const waManager = new WhatsAppSessionManager();
