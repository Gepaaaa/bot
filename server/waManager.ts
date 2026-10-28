import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AuthenticationState,
  type GroupMetadata,
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
import { fetchRemoteBuffer } from './mediaDownloader.ts';
import { botStore } from './stateStore.ts';
import { groupCache } from './groupCache.ts';
import { queueEngine } from './queueEngine.ts';
import { resolveDataDir } from './storagePath.ts';
import { webhookDispatcher } from './webhookDispatcher.ts';

const AUTH_DIR = path.join(resolveDataDir(), '.baileys_auth');
const silentLogger = pino({ level: 'silent' });

type SessionLaunchOptions =
  | { mode: 'qr' }
  | { mode: 'pairing'; phoneNumber: string }
  | { mode: 'resume' };

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
  private outboundQueue: Promise<void> = Promise.resolve();
  private lastOutboundSentAt = 0;

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

  public async initAutoResume(): Promise<void> {
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
      }
    } catch {
      // No saved session to auto-resume
    }
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
        this.authContext = await useMultiFileAuthState(AUTH_DIR);
      }
      const { state, saveCreds } = this.authContext;

      const queueSaveCreds = () => {
        this.pendingCredsSave = this.pendingCredsSave
          .then(() => saveCreds())
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
        getMessage: async () => undefined,
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
    for (let depth = 0; depth < 4 && current; depth += 1) {
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
      break;
    }
    return current || null;
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

  private async extractQuotedViewOnceMedia(
    sock: WASocket,
    msg: WAMessage
  ): Promise<{
    kind: 'image' | 'video' | 'audio';
    buffer: Buffer;
    mimeType: string;
    caption?: string;
  } | null> {
    try {
      const contextInfo = this.extractContextInfo(msg);
      const rawQuoted = contextInfo?.quotedMessage;
      if (!rawQuoted || !contextInfo?.stanzaId) return null;

      const voInner =
        rawQuoted.viewOnceMessage?.message ||
        rawQuoted.viewOnceMessageV2?.message ||
        rawQuoted.viewOnceMessageV2Extension?.message ||
        (rawQuoted.imageMessage?.viewOnce ||
        rawQuoted.videoMessage?.viewOnce ||
        rawQuoted.audioMessage?.viewOnce
          ? rawQuoted
          : null);

      const unwrapped = voInner || this.unwrapWaMessage(rawQuoted);
      if (!unwrapped) return null;

      const isVoFlagged = Boolean(
        voInner ||
          unwrapped.imageMessage?.viewOnce ||
          unwrapped.videoMessage?.viewOnce ||
          unwrapped.audioMessage?.viewOnce
      );
      if (!isVoFlagged) return null;

      let kind: 'image' | 'video' | 'audio' | null = null;
      let mimeType = 'application/octet-stream';
      let caption: string | undefined;

      if (unwrapped.imageMessage) {
        kind = 'image';
        mimeType = unwrapped.imageMessage.mimetype || 'image/jpeg';
        caption = unwrapped.imageMessage.caption || undefined;
      } else if (unwrapped.videoMessage) {
        kind = 'video';
        mimeType = unwrapped.videoMessage.mimetype || 'video/mp4';
        caption = unwrapped.videoMessage.caption || undefined;
      } else if (unwrapped.audioMessage) {
        kind = 'audio';
        mimeType = unwrapped.audioMessage.mimetype || 'audio/mpeg';
      }

      if (!kind) return null;

      const cleanInner = { ...unwrapped };
      if (cleanInner.imageMessage) {
        cleanInner.imageMessage = {
          ...cleanInner.imageMessage,
          viewOnce: false,
        };
      }
      if (cleanInner.videoMessage) {
        cleanInner.videoMessage = {
          ...cleanInner.videoMessage,
          viewOnce: false,
        };
      }
      if (cleanInner.audioMessage) {
        cleanInner.audioMessage = {
          ...cleanInner.audioMessage,
          viewOnce: false,
        };
      }

      const dlBuf = await downloadMediaMessage(
        {
          key: {
            remoteJid: msg.key.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: cleanInner,
        },
        'buffer',
        {},
        {
          logger: silentLogger as never,
          reuploadRequest: sock.updateMediaMessage,
        }
      );

      return {
        kind,
        buffer: Buffer.from(dlBuf),
        mimeType,
        caption,
      };
    } catch {
      return null;
    }
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
          await this.sleepRandom(1000, 1900);
          await sock.groupSettingUpdate(
            remoteJid,
            announcementOnly ? 'announcement' : 'not_announcement'
          );
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupSubject: async (subject: string) => {
          await this.sleepRandom(1100, 2000);
          await sock.groupUpdateSubject(remoteJid, subject);
          this.groupMetaCache.delete(remoteJid);
        },
        setGroupDescription: async (description: string) => {
          await this.sleepRandom(1100, 2000);
          await sock.groupUpdateDescription(remoteJid, description);
          this.groupMetaCache.delete(remoteJid);
        },
        getGroupInviteCode: async () => {
          await this.sleepRandom(800, 1500);
          return await sock.groupInviteCode(remoteJid);
        },
        revokeGroupInviteCode: async () => {
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

        const foundSender = groupMembers.find(
          (p) =>
            p.jid === senderJid ||
            (p.lid && p.lid === senderJid) ||
            (senderAltJid &&
              (p.jid === senderAltJid || p.lid === senderAltJid)) ||
            p.phone === senderPhone
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
    const quotedSenderPhone = quotedParticipantJid
      ? quotedParticipantJid.split(':')[0]?.split('@')[0]
      : undefined;
    const quotedSenderName = quotedSenderPhone
      ? `+${quotedSenderPhone}`
      : undefined;

    const pfx = botStore.config.prefix;
    const lowerText = text.toLowerCase();
    const firstToken = lowerText.startsWith(pfx.toLowerCase())
      ? lowerText.slice(pfx.length).trim().split(/\s+/)[0] || ''
      : '';

    const needsImage = [
      's',
      'stiker',
      'sticker',
      'sgif',
      'meme',
      'smeme',
      'memesticker',
      'hd',
      'remini',
      'upscale',
      'jernih',
      'hdr',
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
      'remini',
      'upscale',
      'toptv',
      'ptv',
      'tourl',
    ].includes(firstToken);

    const [imageBuffer, videoBuffer, audioBuffer, stickerBuffer, viewOnceMedia] =
      await Promise.all([
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
          ? this.extractQuotedViewOnceMedia(sock, msg)
          : Promise.resolve(null),
      ]);

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
      videoBuffer,
      audioBuffer,
      stickerBuffer,
      viewOnceMedia,
      quotedText,
      quotedSenderName,
      documentMedia,
      attachedNonDocumentMedia,
      mentionedJids,
      quotedParticipantJid,
      groupMembers,
      waGroupOps,
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
          const slides = result.slideImageUrls.slice(0, 8);
          for (let i = 0; i < slides.length; i += 1) {
            const { buffer, contentType } = await fetchRemoteBuffer(slides[i]);
            await this.simulateHumanTyping(sock, remoteJid, isGroup);
            await sock.sendMessage(
              remoteJid,
              {
                image: buffer,
                mimetype: contentType.startsWith('image/')
                  ? contentType
                  : 'image/jpeg',
                caption:
                  i === 0
                    ? result.replyText || `Slide 1/${slides.length}`
                    : `Slide ${i + 1}/${slides.length}`,
              },
              i === 0 ? { quoted: msg } : undefined
            );
            if (i < slides.length - 1) {
              await this.sleepRandom(1100, 1900);
            }
          }
          if (result.audioRemoteUrl) {
            try {
              const { buffer } = await fetchRemoteBuffer(result.audioRemoteUrl);
              await this.sleepRandom(900, 1500);
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
            } catch {
              // Optional slide background audio non-fatal
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
