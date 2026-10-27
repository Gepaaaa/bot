export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'pairing_code_ready'
  | 'connected';

export interface WAConnectionState {
  status: ConnectionStatus;
  qrDataUrl: string | null;
  pairingCode: string | null;
  pairingPhone: string | null;
  connectedUser: {
    id: string;
    name: string;
    phone: string;
  } | null;
  connectedAt: number | null;
  statusMessage?: string | null;
  lastError: string | null;
}

export interface BotReactionConfig {
  enabled: boolean;
  pending: string;
  success: string;
  error: string;
}

export interface BotReplyTemplates {
  menuHeader: string;
  menuFooter: string;
  downloaderCaption: string;
  audioCaption: string;
  stickerReply: string;
  stickerMissingMedia: string;
  hdswCaption: string;
  hdswGroupConfirm: string;
  pingReply: string;
  kickSuccess: string;
  addSuccess: string;
  promoteSuccess: string;
  demoteSuccess: string;
  groupOpenSuccess: string;
  groupCloseSuccess: string;
  antilinkWarn: string;
  welcomeMsg: string;
  goodbyeMsg: string;
  unknownCommand: string;
  errorReply: string;
}

export type GroupEditableTemplateKey =
  | 'welcomeMsg'
  | 'goodbyeMsg'
  | 'promoteSuccess'
  | 'demoteSuccess'
  | 'antilinkWarn'
  | 'groupOpenSuccess'
  | 'groupCloseSuccess';

export interface GroupCustomConfig {
  antilink?: boolean;
  welcome?: boolean;
  goodbye?: boolean;
  templates?: Partial<Record<GroupEditableTemplateKey, string>>;
}

export interface BotConfig {
  prefix: string;
  botName: string;
  ownerName: string;
  ownerWebsite: string;
  stickerPackName: string;
  stickerAuthor: string;
  autoRead: boolean;
  selfMode: boolean;
  disabledCommands: string[];
  reactions: BotReactionConfig;
  templates: BotReplyTemplates;
  groupSettings: {
    antilink: boolean;
    welcome: boolean;
    goodbye: boolean;
  };
  groupOverrides?: Record<string, GroupCustomConfig>;
}

export type CommandCategory =
  | 'downloader'
  | 'audio'
  | 'sticker'
  | 'group'
  | 'utility';

export interface CommandDefinition {
  id: string;
  aliases: string[];
  category: CommandCategory;
  usage: string;
  description: string;
  example: string;
  requiresMedia?: boolean;
  groupOnly?: boolean;
  suspensionRisk?: boolean;
}

export interface SimulatorMember {
  jid: string;
  lid?: string;
  name: string;
  phone: string;
  isAdmin: boolean;
}

export interface GroupSimulatorState {
  subject: string;
  description: string;
  isAnnouncementOnly: boolean;
  inviteCode: string;
}

export interface MessageMedia {
  type: 'video' | 'audio' | 'sticker' | 'image' | 'document';
  url: string;
  mimeType: string;
  fileName?: string;
  fileSizeLabel?: string;
  docMediaKind?: 'image' | 'video' | 'other';
  title?: string;
  author?: string;
  duration?: number;
  packInfo?: {
    pack: string;
    author: string;
  };
}

export interface SimulatorMessage {
  id: string;
  chatMode: 'private' | 'group';
  sender: 'user' | 'bot' | 'member' | 'system';
  senderName: string;
  senderPhone: string;
  isAdmin?: boolean;
  text: string;
  timestamp: number;
  reaction?: string | null;
  replyTo?: {
    id: string;
    senderName: string;
    senderPhone?: string;
    text: string;
    hasImage?: boolean;
    imageUrl?: string;
    hasDocument?: boolean;
    documentUrl?: string;
    documentMimeType?: string;
    documentFileName?: string;
  };
  media?: MessageMedia;
  mentions?: string[];
  hiddenMentions?: string[];
  deletedByAntilink?: boolean;
}

export interface CommandExecutionLog {
  id: string;
  command: string;
  source: 'whatsapp' | 'simulator';
  sender: string;
  status: 'success' | 'error' | 'blocked';
  summary: string;
  durationMs: number;
  timestamp: number;
}

export interface ServerStateSnapshot {
  waState: WAConnectionState;
  config: BotConfig;
  simulatorMessages: SimulatorMessage[];
  logs: CommandExecutionLog[];
  groupMembers: SimulatorMember[];
  groupState: GroupSimulatorState;
  stats: {
    totalCommands: number;
    stickersCreated: number;
    mediaDownloaded: number;
    linksModerated: number;
  };
}
