import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_REACTIONS, DEFAULT_TEMPLATES } from '../shared/commands.ts';
import {
  buildApiUrl,
  buildRealtimeWsUrl,
  getActiveBackendBaseUrl,
  isLikelyStaticFrontendHost,
  setStoredBackendUrl,
} from '../lib/apiBase.ts';
import type {
  BotConfig,
  CommandExecutionLog,
  GatewayJob,
  GatewayStats,
  GroupSimulatorState,
  ServerStateSnapshot,
  SimulatorMember,
  SimulatorMessage,
  WAConnectionState,
  WebhookDeliveryLog,
} from '../shared/types.ts';

const INITIAL_WA_STATE: WAConnectionState = {
  status: 'disconnected',
  qrDataUrl: null,
  pairingCode: null,
  pairingPhone: null,
  connectedUser: null,
  connectedAt: null,
  lastError: null,
};

const INITIAL_CONFIG: BotConfig = {
  prefix: '.',
  botName: 'GepaBot',
  ownerName: 'Gepa — Personal Corner',
  ownerWebsite: 'gepacorner.my.id',
  stickerPackName: 'Gepa Corner',
  stickerAuthor: 'gepacorner.my.id',
  autoRead: true,
  selfMode: false,
  disabledCommands: [],
  reactions: { ...DEFAULT_REACTIONS },
  templates: { ...DEFAULT_TEMPLATES },
  groupSettings: {
    antilink: true,
    welcome: true,
    goodbye: true,
  },
  groupOverrides: {},
  antiBan: {
    enabled: true,
    warmUpMode: true,
    humanizeTyping: true,
    minTypingDelayMs: 1800,
    maxTypingDelayMs: 3800,
    userCooldownSeconds: 6,
    maxCommandsPerMinutePerUser: 4,
    hidetagCooldownSeconds: 45,
    hidetagAdminOnly: true,
    maxMentionsLimit: 40,
    autoRejectCalls: true,
    callRejectNotice:
      'Maaf, bot ini berjalan secara otomatis dan tidak menerima panggilan telepon atau video WhatsApp.',
    ownerOnlyMode: false,
    ownerNumber: '',
    browserProfile: 'windows_chrome',
  },
  lockSettingsManualOnly: true,
  webhook: {
    enabled: false,
    url: '',
    secret: '',
    events: ['message.received', 'message.sent', 'session.status'],
  },
  autoResponder: [
    {
      id: 'rule-halo',
      trigger: 'halo',
      matchType: 'contains',
      replyText:
        'Halo {sender}! Ada yang bisa {botName} bantu hari ini? Ketik *{prefix}menu* untuk melihat seluruh fitur.',
      scope: 'all',
      enabled: true,
      hitCount: 0,
      createdAt: 1714500000000,
    },
    {
      id: 'rule-web',
      trigger: 'website',
      matchType: 'contains',
      replyText:
        'Kunjungi website resmi kreator kami di https://gepacorner.my.id untuk artikel, panduan, dan update terbaru!',
      scope: 'all',
      enabled: true,
      hitCount: 0,
      createdAt: 1714500000000,
    },
  ],
};

const INITIAL_GROUP_STATE: GroupSimulatorState = {
  subject: 'Gepa Corner Lounge',
  description:
    'Ruang diskusi komunitas kreator & teman-teman gepacorner.my.id. Gunakan awalan titik (.) untuk memakai fitur GepaBot.',
  isAnnouncementOnly: false,
  inviteCode: 'GepaCornerInvite2026',
};

export interface SendSimulatorPayload {
  chatMode: 'private' | 'group';
  text: string;
  senderRole?: 'admin' | 'member';
  imageBase64?: string | null;
  useSampleCat?: boolean;
  useSampleVideo?: boolean;
  useSampleAudio?: boolean;
  documentBase64?: string | null;
  documentMimeType?: string;
  documentFileName?: string;
  useSampleHdDoc?: boolean;
  replyToId?: string | null;
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'Server Bot belum terhubung (menerima respon statis HTML). Buka menu Koneksi WA untuk menghubungkan URL Server Bot 24/7.'
    );
  }
  return (await res.json()) as T;
}

export function useBotRealtime() {
  const [waState, setWaState] = useState<WAConnectionState>(INITIAL_WA_STATE);
  const [config, setConfig] = useState<BotConfig>(INITIAL_CONFIG);
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [logs, setLogs] = useState<CommandExecutionLog[]>([]);
  const [groupMembers, setGroupMembers] = useState<SimulatorMember[]>([]);
  const [groupState, setGroupState] =
    useState<GroupSimulatorState>(INITIAL_GROUP_STATE);
  const [stats, setStats] = useState({
    totalCommands: 0,
    stickersCreated: 0,
    mediaDownloaded: 0,
    linksModerated: 0,
  });
  const [webhookLogs, setWebhookLogs] = useState<WebhookDeliveryLog[]>([]);
  const [gatewayJobs, setGatewayJobs] = useState<GatewayJob[]>([]);
  const [gatewayStats, setGatewayStats] = useState<GatewayStats>({
    totalSent: 0,
    queuedNow: 0,
    failedCount: 0,
    webhooksDelivered: 0,
  });
  const [socketConnected, setSocketConnected] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [backendUrl, setBackendUrl] = useState<string>(() =>
    getActiveBackendBaseUrl()
  );
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const isStaticHost = isLikelyStaticFrontendHost();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySnapshot = useCallback((snap: ServerStateSnapshot) => {
    setWaState(snap.waState);
    setConfig({
      ...snap.config,
      reactions: { ...DEFAULT_REACTIONS, ...(snap.config.reactions || {}) },
      templates: { ...DEFAULT_TEMPLATES, ...(snap.config.templates || {}) },
      groupSettings: {
        antilink: snap.config.groupSettings?.antilink ?? true,
        welcome: snap.config.groupSettings?.welcome ?? true,
        goodbye: snap.config.groupSettings?.goodbye ?? true,
      },
    });
    setMessages(snap.simulatorMessages);
    setLogs(snap.logs);
    setGroupMembers(snap.groupMembers);
    if (snap.groupState) {
      setGroupState(snap.groupState);
    }
    setStats(snap.stats);
    if (snap.webhookLogs) {
      setWebhookLogs(snap.webhookLogs);
    }
    if (snap.gatewayJobs) {
      setGatewayJobs(snap.gatewayJobs);
    }
    if (snap.gatewayStats) {
      setGatewayStats(snap.gatewayStats);
    }
    setBackendUnreachable(false);
    setIsLoadingInitial(false);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl('/api/state'));
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const snap = (await res.json()) as ServerStateSnapshot;
        applySnapshot(snap);
      } else {
        setBackendUnreachable(true);
      }
    } catch {
      setBackendUnreachable(true);
    } finally {
      setIsLoadingInitial(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    let unmounted = false;
    void fetchSnapshot();

    const connectWs = () => {
      if (unmounted) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(buildRealtimeWsUrl());
      } catch {
        setSocketConnected(false);
        setBackendUnreachable(true);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) {
          setSocketConnected(true);
          setBackendUnreachable(false);
        }
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const parsed = JSON.parse(String(event.data)) as {
            type: string;
            payload: unknown;
          };

          switch (parsed.type) {
            case 'state:init':
              applySnapshot(parsed.payload as ServerStateSnapshot);
              break;
            case 'wa:update':
              setWaState(parsed.payload as WAConnectionState);
              break;
            case 'config:update': {
              const incomingCfg = parsed.payload as BotConfig;
              setConfig({
                ...incomingCfg,
                reactions: {
                  ...DEFAULT_REACTIONS,
                  ...(incomingCfg.reactions || {}),
                },
                templates: {
                  ...DEFAULT_TEMPLATES,
                  ...(incomingCfg.templates || {}),
                },
                groupSettings: {
                  antilink: incomingCfg.groupSettings?.antilink ?? true,
                  welcome: incomingCfg.groupSettings?.welcome ?? true,
                  goodbye: incomingCfg.groupSettings?.goodbye ?? true,
                },
              });
              break;
            }
            case 'group:update': {
              const groupPayload = parsed.payload as {
                groupMembers?: SimulatorMember[];
                groupState?: GroupSimulatorState;
              };
              if (groupPayload.groupMembers) {
                setGroupMembers(groupPayload.groupMembers);
              }
              if (groupPayload.groupState) {
                setGroupState(groupPayload.groupState);
              }
              break;
            }
            case 'simulator:message': {
              const incoming = parsed.payload as SimulatorMessage;
              setMessages((prev) =>
                prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
              );
              break;
            }
            case 'simulator:update_message': {
              const updated = parsed.payload as SimulatorMessage;
              setMessages((prev) =>
                prev.map((m) => (m.id === updated.id ? updated : m))
              );
              break;
            }
            case 'simulator:reset':
              setMessages(parsed.payload as SimulatorMessage[]);
              break;
            case 'log:new': {
              const entry = parsed.payload as CommandExecutionLog;
              setLogs((prev) =>
                prev.some((l) => l.id === entry.id)
                  ? prev
                  : [entry, ...prev].slice(0, 60)
              );
              break;
            }
            case 'stats:update':
              setStats(parsed.payload as typeof stats);
              break;
            case 'webhook:logs':
              setWebhookLogs(parsed.payload as WebhookDeliveryLog[]);
              break;
            case 'gateway:jobs':
              setGatewayJobs(parsed.payload as GatewayJob[]);
              break;
            case 'gateway:stats':
              setGatewayStats(parsed.payload as GatewayStats);
              break;
          }
        } catch {
          // Ignore malformed event
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setSocketConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [applySnapshot, fetchSnapshot, backendUrl]);

  const updateBackendUrl = useCallback((rawUrl: string) => {
    const normalized = setStoredBackendUrl(rawUrl);
    const active = getActiveBackendBaseUrl();
    setSocketConnected(false);
    setBackendUrl(active || normalized);
  }, []);

  const connectQR = useCallback(async () => {
    const res = await fetch(buildApiUrl('/api/wa/connect-qr'), {
      method: 'POST',
    });
    const data = await parseApiJson<{ ok: boolean; error?: string }>(res);
    if (!data.ok) throw new Error(data.error || 'Gagal memulai sesi QR');
  }, []);

  const connectPairing = useCallback(async (phoneNumber: string) => {
    const res = await fetch(buildApiUrl('/api/wa/connect-pairing'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await parseApiJson<{ ok: boolean; error?: string }>(res);
    if (!data.ok) throw new Error(data.error || 'Gagal meminta Pairing Code');
  }, []);

  const disconnectWA = useCallback(async () => {
    await fetch(buildApiUrl('/api/wa/disconnect'), { method: 'POST' });
  }, []);

  const updateConfig = useCallback(async (patch: Partial<BotConfig>) => {
    const res = await fetch(buildApiUrl('/api/config'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await parseApiJson<{ ok: boolean; config?: BotConfig }>(res);
    if (data.ok && data.config) {
      setConfig(data.config);
    }
  }, []);

  const sendSimulatorMessage = useCallback(
    async (payload: SendSimulatorPayload) => {
      const res = await fetch(buildApiUrl('/api/simulator/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson<{ ok: boolean; error?: string }>(res);
      if (!data.ok) {
        throw new Error(data.error || 'Gagal mengirim pesan simulasi');
      }
    },
    []
  );

  const injectViewOnce = useCallback(
    async (chatMode: 'private' | 'group'): Promise<SimulatorMessage | null> => {
      const res = await fetch(buildApiUrl('/api/simulator/inject-viewonce'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatMode }),
      });
      const data = await parseApiJson<{
        ok: boolean;
        message?: SimulatorMessage;
        error?: string;
      }>(res);
      if (!data.ok) {
        throw new Error(data.error || 'Gagal membuat pesan View Once');
      }
      return data.message ?? null;
    },
    []
  );

  const triggerGroupEvent = useCallback(
    async (action: 'welcome' | 'goodbye') => {
      const res = await fetch(buildApiUrl('/api/simulator/group-event'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await parseApiJson<{ ok: boolean; error?: string }>(res);
      if (!data.ok) {
        throw new Error(data.error || 'Gagal memicu simulasi event grup');
      }
    },
    []
  );

  const clearSimulator = useCallback(async (chatMode?: 'private' | 'group') => {
    await fetch(buildApiUrl('/api/simulator/clear'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatMode }),
    });
  }, []);

  return {
    waState,
    config,
    messages,
    logs,
    groupMembers,
    groupState,
    stats,
    webhookLogs,
    gatewayJobs,
    gatewayStats,
    socketConnected,
    isLoadingInitial,
    backendUrl,
    backendUnreachable,
    isStaticHost,
    updateBackendUrl,
    connectQR,
    connectPairing,
    disconnectWA,
    updateConfig,
    sendSimulatorMessage,
    injectViewOnce,
    triggerGroupEvent,
    clearSimulator,
  };
}
