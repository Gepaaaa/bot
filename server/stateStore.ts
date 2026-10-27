import fs from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';
import {
  DEFAULT_REACTIONS,
  DEFAULT_TEMPLATES,
} from '../src/shared/commands.ts';
import type {
  BotConfig,
  BotReplyTemplates,
  CommandExecutionLog,
  GroupCustomConfig,
  GroupEditableTemplateKey,
  GroupSimulatorState,
  ServerStateSnapshot,
  SimulatorMember,
  SimulatorMessage,
  WAConnectionState,
} from '../src/shared/types.ts';

const STATE_FILE = path.join(process.cwd(), '.bot-state.json');

const DEFAULT_CONFIG: BotConfig = {
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

const INITIAL_GROUP_MEMBERS: SimulatorMember[] = [
  {
    jid: '628129000111@s.whatsapp.net',
    name: 'Gepa (Owner)',
    phone: '628129000111',
    isAdmin: true,
  },
  {
    jid: '628138000222@s.whatsapp.net',
    name: 'Raka Pratama',
    phone: '628138000222',
    isAdmin: true,
  },
  {
    jid: '628577000333@s.whatsapp.net',
    name: 'Nadia Putri',
    phone: '628577000333',
    isAdmin: false,
  },
  {
    jid: '628966000444@s.whatsapp.net',
    name: 'Dimas Saputra',
    phone: '628966000444',
    isAdmin: false,
  },
  {
    jid: '628215000555@s.whatsapp.net',
    name: 'Alya Maharani',
    phone: '628215000555',
    isAdmin: false,
  },
];

const INITIAL_GROUP_STATE: GroupSimulatorState = {
  subject: 'Gepa Corner Lounge',
  description:
    'Ruang diskusi komunitas & berbagi karya Gepa Corner. Dilarang kirim spam link.',
  isAnnouncementOnly: false,
  inviteCode: 'GpCrnr2026Official',
};

const INITIAL_MESSAGES: SimulatorMessage[] = [
  {
    id: 'msg-welcome-private',
    chatMode: 'private',
    sender: 'bot',
    senderName: 'GepaBot',
    senderPhone: 'Bot Engine',
    text: 'Halo! Selamat datang di ruang uji GepaBot (Gepa Corner).\n\nKetik *.menu* untuk melihat semua fitur, kirim dokumen foto/video dengan *.hdsw* agar jadi media ukuran asli siap teruskan ke Status WA, atau uji *.tt <link tiktok>* dan *.brat santai dulu*.',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'msg-welcome-group',
    chatMode: 'group',
    sender: 'bot',
    senderName: 'GepaBot',
    senderPhone: 'Bot Engine',
    text: 'Grup Komunitas *Gepa Corner Lounge* aktif.\nAdmin grup bisa mengatur *.setwelcome*, *.setout*, *.out on/off*, *.setpromote*, *.setantilink*, *.cekset*, serta moderasi *.kick*, *.promote*, *.demote*, dan *.group close/open*.',
    timestamp: Date.now() - 55000,
  },
];

class BotStateStore {
  public waState: WAConnectionState = {
    status: 'disconnected',
    qrDataUrl: null,
    pairingCode: null,
    pairingPhone: null,
    connectedUser: null,
    connectedAt: null,
    statusMessage: null,
    lastError: null,
  };

  public config: BotConfig = {
    ...DEFAULT_CONFIG,
    reactions: { ...DEFAULT_REACTIONS },
    templates: { ...DEFAULT_TEMPLATES },
    groupSettings: { ...DEFAULT_CONFIG.groupSettings },
    groupOverrides: {},
  };
  public simulatorMessages: SimulatorMessage[] = [...INITIAL_MESSAGES];
  public logs: CommandExecutionLog[] = [];
  public groupMembers: SimulatorMember[] = [...INITIAL_GROUP_MEMBERS];
  public groupState: GroupSimulatorState = { ...INITIAL_GROUP_STATE };
  public stats = {
    totalCommands: 0,
    stickersCreated: 0,
    mediaDownloaded: 0,
    linksModerated: 0,
  };

  public stickerCache = new Map<string, Buffer>();
  public hdMediaCache = new Map<
    string,
    { buffer: Buffer; mimeType: string; fileName: string }
  >();
  private clients = new Set<WebSocket>();

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        if (raw.config) {
          this.config = {
            ...DEFAULT_CONFIG,
            ...raw.config,
            reactions: {
              ...DEFAULT_REACTIONS,
              ...(raw.config.reactions || {}),
            },
            templates: {
              ...DEFAULT_TEMPLATES,
              ...(raw.config.templates || {}),
            },
            groupSettings: {
              ...DEFAULT_CONFIG.groupSettings,
              ...(raw.config.groupSettings || {}),
            },
            groupOverrides: raw.config.groupOverrides || {},
          };
        }
        if (raw.stats) {
          this.stats = { ...this.stats, ...raw.stats };
        }
        if (Array.isArray(raw.logs)) {
          this.logs = raw.logs.slice(0, 60);
        }
      }
    } catch {
      // Ignore invalid local cache
    }
  }

  public saveToDisk() {
    try {
      fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(
          {
            config: this.config,
            stats: this.stats,
            logs: this.logs.slice(0, 50),
          },
          null,
          2
        )
      );
    } catch {
      // Ignore write failures
    }
  }

  public attachClient(ws: WebSocket) {
    this.clients.add(ws);
    this.sendTo(ws, { type: 'state:init', payload: this.getSnapshot() });
    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  private sendTo(ws: WebSocket, message: unknown) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  public broadcast(type: string, payload: unknown) {
    const encoded = JSON.stringify({ type, payload });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(encoded);
      }
    }
  }

  public getSnapshot(): ServerStateSnapshot {
    return {
      waState: this.waState,
      config: this.config,
      simulatorMessages: this.simulatorMessages,
      logs: this.logs,
      groupMembers: this.groupMembers,
      groupState: this.groupState,
      stats: this.stats,
    };
  }

  public updateWAState(patch: Partial<WAConnectionState>) {
    this.waState = { ...this.waState, ...patch };
    this.broadcast('wa:update', this.waState);
  }

  public updateConfig(patch: Partial<BotConfig>): BotConfig {
    this.config = {
      ...this.config,
      ...patch,
      prefix: (patch.prefix ?? this.config.prefix).trim().slice(0, 3) || '.',
      reactions: {
        ...this.config.reactions,
        ...(patch.reactions || {}),
      },
      templates: {
        ...this.config.templates,
        ...(patch.templates || {}),
      },
      groupSettings: {
        ...this.config.groupSettings,
        ...(patch.groupSettings || {}),
      },
      groupOverrides: patch.groupOverrides ?? this.config.groupOverrides ?? {},
    };
    this.saveToDisk();
    this.broadcast('config:update', this.config);
    return this.config;
  }

  public getEffectiveGroupSettings(groupId?: string): {
    antilink: boolean;
    welcome: boolean;
    goodbye: boolean;
  } {
    const base = this.config.groupSettings;
    if (!groupId) return base;
    const ov = this.config.groupOverrides?.[groupId];
    if (!ov) return base;
    return {
      antilink: ov.antilink ?? base.antilink,
      welcome: ov.welcome ?? base.welcome,
      goodbye: ov.goodbye ?? base.goodbye,
    };
  }

  public getEffectiveTemplate(
    key: keyof BotReplyTemplates,
    groupId?: string
  ): string {
    if (groupId) {
      const custom =
        this.config.groupOverrides?.[groupId]?.templates?.[
          key as GroupEditableTemplateKey
        ];
      if (custom && custom.trim()) {
        return custom;
      }
    }
    return this.config.templates[key] || DEFAULT_TEMPLATES[key];
  }

  public updateGroupCustomConfig(
    groupId: string,
    patch: Partial<GroupCustomConfig>
  ) {
    const currentOverrides = { ...(this.config.groupOverrides || {}) };
    const existing = currentOverrides[groupId] || {};
    currentOverrides[groupId] = {
      ...existing,
      ...patch,
      templates: {
        ...(existing.templates || {}),
        ...(patch.templates || {}),
      },
    };
    this.config = {
      ...this.config,
      groupOverrides: currentOverrides,
    };
    this.saveToDisk();
    this.broadcast('config:update', this.config);
  }

  public resetGroupCustomTemplates(
    groupId: string,
    singleKey?: GroupEditableTemplateKey
  ) {
    const currentOverrides = { ...(this.config.groupOverrides || {}) };
    const existing = currentOverrides[groupId];
    if (!existing) return;

    if (singleKey) {
      const nextTemplates = { ...(existing.templates || {}) };
      delete nextTemplates[singleKey];
      currentOverrides[groupId] = {
        ...existing,
        templates: nextTemplates,
      };
    } else {
      delete currentOverrides[groupId];
    }

    this.config = {
      ...this.config,
      groupOverrides: currentOverrides,
    };
    this.saveToDisk();
    this.broadcast('config:update', this.config);
  }

  public broadcastGroupSync() {
    this.broadcast('group:update', {
      groupMembers: this.groupMembers,
      groupState: this.groupState,
    });
  }

  public updateGroupState(patch: Partial<GroupSimulatorState>) {
    this.groupState = { ...this.groupState, ...patch };
    this.broadcastGroupSync();
  }

  public setGroupMembers(members: SimulatorMember[]) {
    this.groupMembers = members;
    this.broadcastGroupSync();
  }

  public resetGroupSimulator() {
    this.groupMembers = [...INITIAL_GROUP_MEMBERS];
    this.groupState = { ...INITIAL_GROUP_STATE };
    this.broadcastGroupSync();
  }

  public addSimulatorMessage(msg: SimulatorMessage) {
    if (this.simulatorMessages.some((m) => m.id === msg.id)) return;
    this.simulatorMessages = [...this.simulatorMessages.slice(-99), msg];
    this.broadcast('simulator:message', msg);
  }

  public updateSimulatorMessage(id: string, patch: Partial<SimulatorMessage>) {
    let updated: SimulatorMessage | null = null;
    this.simulatorMessages = this.simulatorMessages.map((m) => {
      if (m.id === id) {
        updated = { ...m, ...patch };
        return updated;
      }
      return m;
    });
    if (updated) {
      this.broadcast('simulator:update_message', updated);
    }
  }

  public clearSimulatorMessages(chatMode?: 'private' | 'group') {
    if (chatMode) {
      const defaults = INITIAL_MESSAGES.filter((m) => m.chatMode === chatMode);
      this.simulatorMessages = [
        ...this.simulatorMessages.filter((m) => m.chatMode !== chatMode),
        ...defaults,
      ];
      if (chatMode === 'group') {
        this.resetGroupSimulator();
      }
    } else {
      this.simulatorMessages = [...INITIAL_MESSAGES];
      this.resetGroupSimulator();
    }
    this.broadcast('simulator:reset', this.simulatorMessages);
  }

  public addLog(entry: CommandExecutionLog) {
    if (this.logs.some((l) => l.id === entry.id)) return;
    this.logs = [entry, ...this.logs].slice(0, 60);
    this.saveToDisk();
    this.broadcast('log:new', entry);
  }

  public incrementStat(key: keyof BotStateStore['stats']) {
    this.stats[key] += 1;
    this.saveToDisk();
    this.broadcast('stats:update', this.stats);
  }

  public storeSticker(buffer: Buffer): string {
    const id = `stk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.stickerCache.set(id, buffer);
    if (this.stickerCache.size > 80) {
      const oldestKey = this.stickerCache.keys().next().value;
      if (oldestKey) this.stickerCache.delete(oldestKey);
    }
    return `/api/stickers/${id}.webp`;
  }

  public storeHdMedia(
    buffer: Buffer,
    mimeType: string,
    fileName: string
  ): string {
    const id = `hd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.hdMediaCache.set(id, { buffer, mimeType, fileName });
    if (this.hdMediaCache.size > 15) {
      const oldestKey = this.hdMediaCache.keys().next().value;
      if (oldestKey) this.hdMediaCache.delete(oldestKey);
    }
    return `/api/hd-media/${id}`;
  }
}

export const botStore = new BotStateStore();
