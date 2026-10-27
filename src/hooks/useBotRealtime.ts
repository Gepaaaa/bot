import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_REACTIONS, DEFAULT_TEMPLATES } from '../shared/commands.ts';
import type {
  BotConfig,
  CommandExecutionLog,
  GroupSimulatorState,
  ServerStateSnapshot,
  SimulatorMember,
  SimulatorMessage,
  WAConnectionState,
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
  documentBase64?: string | null;
  documentMimeType?: string;
  documentFileName?: string;
  useSampleHdDoc?: boolean;
  replyToId?: string | null;
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

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
    setIsLoadingInitial(false);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const snap = (await res.json()) as ServerStateSnapshot;
        applySnapshot(snap);
      }
    } catch {
      // Will retry via WebSocket reconnect
    } finally {
      setIsLoadingInitial(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    let unmounted = false;
    void fetchSnapshot();

    const connectWs = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) setSocketConnected(true);
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
          }
        } catch {
          // Ignore malformed event
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setSocketConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWs, 2500);
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
  }, [applySnapshot, fetchSnapshot]);

  const connectQR = useCallback(async () => {
    const res = await fetch('/api/wa/connect-qr', { method: 'POST' });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(data.error || 'Gagal memulai sesi QR');
  }, []);

  const connectPairing = useCallback(async (phoneNumber: string) => {
    const res = await fetch('/api/wa/connect-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(data.error || 'Gagal meminta Pairing Code');
  }, []);

  const disconnectWA = useCallback(async () => {
    await fetch('/api/wa/disconnect', { method: 'POST' });
  }, []);

  const updateConfig = useCallback(async (patch: Partial<BotConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { ok: boolean; config?: BotConfig };
    if (data.ok && data.config) {
      setConfig(data.config);
    }
  }, []);

  const sendSimulatorMessage = useCallback(async (payload: SendSimulatorPayload) => {
    const res = await fetch('/api/simulator/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(data.error || 'Gagal mengirim pesan simulasi');
    }
  }, []);

  const triggerGroupEvent = useCallback(async (action: 'welcome' | 'goodbye') => {
    const res = await fetch('/api/simulator/group-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(data.error || 'Gagal memicu simulasi event grup');
    }
  }, []);

  const clearSimulator = useCallback(async (chatMode?: 'private' | 'group') => {
    await fetch('/api/simulator/clear', {
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
    socketConnected,
    isLoadingInitial,
    connectQR,
    connectPairing,
    disconnectWA,
    updateConfig,
    sendSimulatorMessage,
    triggerGroupEvent,
    clearSimulator,
  };
}
