import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Download,
  Eye,
  FileUp,
  Film,
  ImagePlus,
  Mic,
  Music,
  Reply,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  BotConfig,
  CommandExecutionLog,
  GroupSimulatorState,
  SimulatorMember,
  SimulatorMessage,
} from '../shared/types.ts';
import type { SendSimulatorPayload } from '../hooks/useBotRealtime.ts';
import { OFFICIAL_OWNER_NUMBER } from '../shared/commands.ts';
import { resolveBackendMediaUrl } from '../lib/apiBase.ts';
import { ResilientImage, SAMPLE_CAT_IMAGE_URL } from './BrandMedia.tsx';

interface ChatSimulatorViewProps {
  config: BotConfig;
  messages: SimulatorMessage[];
  logs: CommandExecutionLog[];
  groupMembers: SimulatorMember[];
  groupState: GroupSimulatorState;
  prefillCommand: string | null;
  onConsumePrefill: () => void;
  onSendMessage: (payload: SendSimulatorPayload) => Promise<void>;
  onInjectViewOnce: (
    chatMode: 'private' | 'group'
  ) => Promise<SimulatorMessage | null>;
  onTriggerGroupEvent: (action: 'welcome' | 'goodbye') => Promise<void>;
  onClearMessages: (chatMode: 'private' | 'group') => Promise<void>;
}

function formatWaFormattedText(raw: string): React.ReactNode {
  const lines = raw.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*[^*\n]+\*|_[^_\n]+_|@[0-9]{6,16})/g);
    return (
      <React.Fragment key={lineIdx}>
        {parts.map((part, i) => {
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
              <strong key={i} className="font-semibold">
                {part.slice(1, -1)}
              </strong>
            );
          }
          if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
            return (
              <em key={i} className="italic opacity-85">
                {part.slice(1, -1)}
              </em>
            );
          }
          if (/^@[0-9]{6,16}$/.test(part)) {
            return (
              <span
                key={i}
                className="text-emerald-700 dark:text-emerald-400 font-medium"
              >
                {part}
              </span>
            );
          }
          return <React.Fragment key={i}>{part}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytesLabel(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const SAMPLE_TIKTOK_URL =
  'https://www.tiktok.com/@tiktok/video/7106594312292453675';

const GROUP_CMD_KEYWORDS = [
  'kick',
  'tendang',
  'add',
  'tambah',
  'promote',
  'jadiadmin',
  'demote',
  'unadmin',
  'group',
  'gc',
  'setname',
  'setdesc',
  'linkgc',
  'revoke',
  'hidetag',
  'tagall',
  'antilink',
  'welcome',
  'out',
  'leave',
  'bye',
  'goodbye',
  'setwelcome',
  'setout',
  'setleave',
  'setbye',
  'setpromote',
  'setdemote',
  'setantilink',
  'setopen',
  'setclose',
  'cekset',
  'listset',
  'resetset',
];

const HDSW_KEYWORDS = ['hdsw', 'sw', 'tosw', 'hdstatus', 'swori'];
const SAMPLE_IMAGE_KEYWORDS = [
  's',
  'sticker',
  'stiker',
  'meme',
  'smeme',
  'hd',
  'remini',
  'enhance',
  'hitamkan',
  'grayscale',
  'hitamputih',
  'imgedit',
  'blur',
  'invert',
  'mirror',
  'flip',
  'sepia',
  'tourl',
  'upload',
];
const SAMPLE_VIDEO_KEYWORDS = ['toptv', 'ptv', 'videobulat', 'tomp3', 'toaudio'];
const SAMPLE_AUDIO_KEYWORDS = [
  'tovn',
  'toptt',
  'vn',
  'bass',
  'bassboost',
  'nightcore',
  'nc',
  'slow',
  'slowed',
  'fast',
  'speedup',
  'robot',
  'reverse',
];

export function ChatSimulatorView({
  config,
  messages,
  logs,
  groupMembers,
  groupState,
  prefillCommand,
  onConsumePrefill,
  onSendMessage,
  onInjectViewOnce,
  onTriggerGroupEvent,
  onClearMessages,
}: ChatSimulatorViewProps) {
  const [chatMode, setChatMode] = useState<'private' | 'group'>('private');
  const [inputText, setInputText] = useState('');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(
    null
  );
  const [useSampleCat, setUseSampleCat] = useState(false);
  const [useSampleVideo, setUseSampleVideo] = useState(false);
  const [useSampleAudio, setUseSampleAudio] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<{
    base64: string;
    mimeType: string;
    fileName: string;
    sizeLabel: string;
  } | null>(null);
  const [useSampleHdDoc, setUseSampleHdDoc] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SimulatorMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lightboxSticker, setLightboxSticker] = useState<{
    url: string;
    pack: string;
    author: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const clearAllAttachments = () => {
    setUploadedImageBase64(null);
    setUseSampleCat(false);
    setUseSampleVideo(false);
    setUseSampleAudio(false);
    setUploadedDoc(null);
    setUseSampleHdDoc(false);
  };

  useEffect(() => {
    if (prefillCommand) {
      const normalized = prefillCommand
        .trim()
        .slice(config.prefix.length)
        .split(/\s+/)[0]
        ?.toLowerCase();
      if (normalized && GROUP_CMD_KEYWORDS.includes(normalized)) {
        setChatMode('group');
      }

      clearAllAttachments();
      if (normalized && HDSW_KEYWORDS.includes(normalized)) {
        setUseSampleHdDoc(true);
      } else if (normalized && SAMPLE_VIDEO_KEYWORDS.includes(normalized)) {
        setUseSampleVideo(true);
      } else if (normalized && SAMPLE_AUDIO_KEYWORDS.includes(normalized)) {
        setUseSampleAudio(true);
      } else if (normalized && SAMPLE_IMAGE_KEYWORDS.includes(normalized)) {
        setUseSampleCat(true);
      }

      setInputText(prefillCommand);
      onConsumePrefill();
      setTimeout(() => textInputRef.current?.focus(), 60);
    }
  }, [prefillCommand, config.prefix, onConsumePrefill]);

  const filteredMessages = messages.filter((m) => m.chatMode === chatMode);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [filteredMessages.length, chatMode, isSending]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSendError('Pilih file gambar (JPG, PNG, atau WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      clearAllAttachments();
      setUploadedImageBase64(String(reader.result || ''));
      if (!inputText.trim()) {
        setInputText(`${config.prefix}s`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) {
      setSendError('Untuk simulator web, pilih file foto/video maksimal 35 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      clearAllAttachments();
      setUploadedDoc({
        base64: String(reader.result || ''),
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        sizeLabel: formatBytesLabel(file.size),
      });
      if (!inputText.trim()) {
        setInputText(`${config.prefix}hdsw`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const executeSend = async (override?: Partial<SendSimulatorPayload>) => {
    const activeMode = override?.chatMode ?? chatMode;
    const finalText = (override?.text ?? inputText).trim();
    const finalImage =
      override?.imageBase64 !== undefined
        ? override.imageBase64
        : uploadedImageBase64;
    const finalSampleCat =
      override?.useSampleCat !== undefined ? override.useSampleCat : useSampleCat;
    const finalSampleVideo =
      override?.useSampleVideo !== undefined
        ? override.useSampleVideo
        : useSampleVideo;
    const finalSampleAudio =
      override?.useSampleAudio !== undefined
        ? override.useSampleAudio
        : useSampleAudio;
    const finalDocBase64 =
      override?.documentBase64 !== undefined
        ? override.documentBase64
        : uploadedDoc?.base64 ?? null;
    const finalDocMime =
      override?.documentMimeType !== undefined
        ? override.documentMimeType
        : uploadedDoc?.mimeType ?? null;
    const finalDocName =
      override?.documentFileName !== undefined
        ? override.documentFileName
        : uploadedDoc?.fileName ?? null;
    const finalSampleHdDoc =
      override?.useSampleHdDoc !== undefined
        ? override.useSampleHdDoc
        : useSampleHdDoc;
    const finalReplyId =
      override?.replyToId !== undefined
        ? override.replyToId
        : replyTarget?.id ?? null;

    if (
      !finalText &&
      !finalImage &&
      !finalSampleCat &&
      !finalSampleVideo &&
      !finalSampleAudio &&
      !finalDocBase64 &&
      !finalSampleHdDoc
    ) {
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      await onSendMessage({
        chatMode: activeMode,
        text: finalText,
        senderRole: override?.senderRole ?? 'admin',
        imageBase64: finalImage,
        useSampleCat: finalSampleCat,
        useSampleVideo: finalSampleVideo,
        useSampleAudio: finalSampleAudio,
        documentBase64: finalDocBase64,
        documentMimeType: finalDocMime ?? undefined,
        documentFileName: finalDocName ?? undefined,
        useSampleHdDoc: finalSampleHdDoc,
        replyToId: finalReplyId,
      });

      if (!override) {
        setInputText('');
        clearAllAttachments();
        setReplyTarget(null);
      }
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : 'Gagal mengirim perintah ke bot.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleInjectAndPrepareRvo = async () => {
    setIsSending(true);
    setSendError(null);
    try {
      const injected = await onInjectViewOnce(chatMode);
      if (injected) {
        setReplyTarget(injected);
        setInputText(`${config.prefix}rvo`);
        setTimeout(() => textInputRef.current?.focus(), 60);
      }
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : 'Gagal membuat pesan View Once.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleGroupEvent = async (action: 'welcome' | 'goodbye') => {
    setIsSending(true);
    setSendError(null);
    try {
      await onTriggerGroupEvent(action);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : 'Gagal memicu event grup.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const p = config.prefix;

  const findLatestStickerMsg = () =>
    [...filteredMessages].reverse().find((m) => m.media?.type === 'sticker');

  const quickActions =
    chatMode === 'private'
      ? [
          {
            label: `${p}s (Foto -> Stiker)`,
            run: () =>
              void executeSend({
                text: `${p}s`,
                useSampleCat: true,
              }),
          },
          {
            label: `${p}qc (Bubble Chat WA)`,
            run: () =>
              void executeSend({
                text: `${p}qc santai dulu malam ini`,
              }),
          },
          {
            label: `${p}toimg (Stiker -> PNG)`,
            run: () => {
              const target = findLatestStickerMsg();
              if (target) {
                setReplyTarget(target);
                void executeSend({ replyToId: target.id, text: `${p}toimg` });
              } else {
                void executeSend({ text: `${p}toimg` });
              }
            },
          },
          {
            label: `${p}wm (Ganti Watermark)`,
            run: () => {
              const target = findLatestStickerMsg();
              const wmCmd = `${p}wm Ryo Yamada | 6289673533963`;
              if (target) {
                setReplyTarget(target);
                void executeSend({ replyToId: target.id, text: wmCmd });
              } else {
                void executeSend({ text: wmCmd });
              }
            },
          },
          {
            label: `${p}hdsw (Dokumen Asli -> SW)`,
            run: () =>
              void executeSend({
                text: `${p}hdsw`,
                useSampleHdDoc: true,
              }),
          },
          {
            label: `${p}bratvid (Brat Animasi)`,
            run: () =>
              void executeSend({
                text: `${p}bratvid lagi sibuk ngoding bot`,
              }),
          },
          {
            label: `${p}attp (Teks RGB)`,
            run: () =>
              void executeSend({
                text: `${p}attp MANTAP BANGET`,
              }),
          },
          {
            label: `${p}emojimix 😀+😎`,
            run: () =>
              void executeSend({
                text: `${p}emojimix 😀+😎`,
              }),
          },
          {
            label: `${p}toptv (Video Bulat)`,
            run: () =>
              void executeSend({
                text: `${p}toptv`,
                useSampleVideo: true,
              }),
          },
          {
            label: `${p}tt (TikTok HD)`,
            run: () => void executeSend({ text: `${p}tt ${SAMPLE_TIKTOK_URL}` }),
          },
          {
            label: `${p}menu`,
            run: () => void executeSend({ text: `${p}menu` }),
          },
        ]
      : [
          {
            label: `${p}hdsw (Langsung di Grup!)`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: `${p}hdsw`,
                useSampleHdDoc: true,
              }),
          },
          {
            label: `${p}qc (Stiker Quote Grup)`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: `${p}qc rapat komunitas jam 8 malam ya`,
              }),
          },
          {
            label: `${p}s (Video -> Stiker Gerak)`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: `${p}s`,
                useSampleVideo: true,
              }),
          },
          {
            label: `${p}setwelcome`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: `${p}setwelcome Halo @user! Selamat bergabung di *{groupName}*, jangan lupa kenalan ya.`,
              }),
          },
          {
            label: `${p}cekset`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: `${p}cekset`,
              }),
          },
          {
            label: `${p}promote @Nadia`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: `${p}promote @628577000333`,
              }),
          },
          {
            label: groupState.isAnnouncementOnly
              ? `${p}group open`
              : `${p}group close`,
            run: () =>
              void executeSend({
                chatMode: 'group',
                text: groupState.isAnnouncementOnly
                  ? `${p}group open`
                  : `${p}group close`,
              }),
          },
        ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 8 Columns: Interactive WhatsApp Chat Workspace */}
      <div className="lg:col-span-8 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
        {/* Simulator Workspace Header */}
        <div className="px-5 py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-display font-bold text-sm shrink-0">
              {chatMode === 'private' ? 'WB' : 'GC'}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {chatMode === 'private'
                  ? `${config.botName} — Ruang Uji Pribadi`
                  : `${groupState.subject} (Simulasi Grup)`}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                <span>Awalan {config.prefix}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {chatMode === 'private'
                    ? `Reaksi ${
                        config.reactions.enabled
                          ? `${config.reactions.pending} ${config.reactions.success} ${config.reactions.error}`
                          : 'Nonaktif'
                      }`
                    : `${groupMembers.length} anggota · ${
                        groupState.isAnnouncementOnly
                          ? 'Dikunci Admin'
                          : 'Chat Terbuka'
                      } · .hdsw Grup Aktif`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Segmented Mode Control */}
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setChatMode('private')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  chatMode === 'private'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Chat Pribadi
              </button>
              <button
                type="button"
                onClick={() => setChatMode('group')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  chatMode === 'group'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Grup Komunitas
              </button>
            </div>

            <button
              type="button"
              onClick={() => void onClearMessages(chatMode)}
              title="Bersihkan ruang chat ini"
              className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick 1-Click Command Bar */}
        <div className="px-5 py-2.5 bg-[#FAF9F6] dark:bg-[#101013] border-b border-zinc-200/70 dark:border-zinc-800/80 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0 mr-1">
            Coba cepat:
          </span>
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              type="button"
              disabled={isSending}
              onClick={qa.run}
              className="px-2.5 py-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-lg hover:border-emerald-500/60 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {qa.label}
            </button>
          ))}
        </div>

        {/* Chat Stream Canvas */}
        <div
          ref={chatScrollRef}
          className="h-[480px] overflow-y-auto px-5 py-5 space-y-4 bg-[#F5F3EE]/70 dark:bg-[#0D0D10]"
        >
          {filteredMessages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isBot = msg.sender === 'bot';
            const mediaUrl = resolveBackendMediaUrl(msg.media?.url);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`group relative max-w-[86%] sm:max-w-[76%] rounded-2xl px-4 py-3 border transition-opacity ${
                    msg.deletedByAntilink
                      ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 opacity-75'
                      : isUser
                      ? 'bg-emerald-600 text-white border-emerald-700/30'
                      : isBot
                      ? 'bg-white dark:bg-[#18181C] text-zinc-900 dark:text-zinc-100 border-zinc-200/80 dark:border-zinc-800'
                      : 'bg-amber-50/70 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {/* Sender Header in Group or Bot */}
                  {(!isUser || chatMode === 'group') && (
                    <div
                      className={`flex items-center justify-between gap-3 mb-1 text-xs ${
                        isUser
                          ? 'text-emerald-100'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      <span
                        className={`font-medium ${
                          isUser
                            ? 'text-white'
                            : 'text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {isUser ? 'Kamu (Admin)' : msg.senderName}
                      </span>
                      {!msg.deletedByAntilink && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTarget(msg);
                            textInputRef.current?.focus();
                          }}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center gap-1 text-[11px] hover:underline whitespace-nowrap shrink-0"
                        >
                          <Reply className="w-3 h-3" />
                          Balas
                        </button>
                      )}
                    </div>
                  )}

                  {isUser && chatMode === 'private' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTarget(msg);
                        textInputRef.current?.focus();
                      }}
                      title="Balas pesan ini"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute -left-8 top-2 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Quoted Reply Box */}
                  {msg.replyTo && (
                    <div
                      className={`mb-2 rounded-xl px-3 py-2 text-xs border ${
                        isUser
                          ? 'bg-emerald-700/50 border-emerald-500/40 text-emerald-50'
                          : 'bg-zinc-100/90 dark:bg-zinc-900/90 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <div className="font-medium truncate">
                        {msg.replyTo.senderName}
                      </div>
                      <div className="truncate opacity-85">
                        {msg.replyTo.text || '[Media]'}
                      </div>
                    </div>
                  )}

                  {/* Deleted by Antilink state */}
                  {msg.deletedByAntilink ? (
                    <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 italic">
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Pesan tautan dihapus otomatis oleh {config.botName} Antilink
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Uncompressed Document Attachment (for .hdsw or MediaFire) */}
                      {msg.media?.type === 'document' && (
                        <div
                          className={`mb-2.5 rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-3 ${
                            isUser
                              ? 'bg-emerald-700/60 border-emerald-500/40 text-white'
                              : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-xs font-semibold truncate">
                              {msg.media.fileName || 'dokumen-asli'}
                            </div>
                            <div
                              className={`text-[11px] font-mono tabular-nums truncate ${
                                isUser
                                  ? 'text-emerald-100/90'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {msg.media.docMediaKind === 'video'
                                ? 'Dokumen Video'
                                : msg.media.docMediaKind === 'image'
                                ? 'Dokumen Foto'
                                : 'Dokumen'}{' '}
                              · {msg.media.fileSizeLabel || 'Ukuran Asli'} · Tanpa Kompresi
                            </div>
                          </div>
                          {mediaUrl ? (
                            <a
                              href={
                                mediaUrl.includes('?')
                                  ? `${mediaUrl}&download=1`
                                  : `${mediaUrl}?download=1`
                              }
                              download={msg.media.fileName || 'dokumen'}
                              className="p-1.5 rounded-lg hover:bg-black/10 shrink-0"
                              title="Unduh dokumen"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          ) : (
                            <FileUp className="w-4 h-4 shrink-0 opacity-85" />
                          )}
                        </div>
                      )}

                      {/* View Once Locked Card */}
                      {msg.media?.isViewOnce ? (
                        <div className="mb-2.5 p-3 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                Media Sekali Lihat (View Once)
                              </div>
                              <div className="text-[11px] text-zinc-400 truncate">
                                Balas dengan {p}rvo untuk membuka ke ruang chat
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={() =>
                              void executeSend({
                                chatMode,
                                text: `${p}rvo`,
                                replyToId: msg.id,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:opacity-90 whitespace-nowrap shrink-0"
                          >
                            Buka ({p}rvo)
                          </button>
                        </div>
                      ) : (
                        /* Standard Image / HD Status Image */
                        msg.media?.type === 'image' && (
                          <div className="mb-2.5 space-y-1.5">
                            <div className="rounded-xl overflow-hidden border border-black/10 max-w-[270px]">
                              <ResilientImage
                                src={msg.media.url}
                                alt="Lampiran foto"
                                className="w-full h-auto max-h-64 object-cover"
                              />
                            </div>
                            {msg.media.url.includes('/api/hd-media/') && (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span>
                                  Kualitas Asli ({msg.media.fileSizeLabel || 'HD'})
                                </span>
                                <span aria-hidden="true">·</span>
                                <a
                                  href={
                                    mediaUrl.includes('?')
                                      ? `${mediaUrl}&download=1`
                                      : `${mediaUrl}?download=1`
                                  }
                                  download={msg.media.fileName || 'hd-media.png'}
                                  className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium whitespace-nowrap"
                                >
                                  <Download className="w-3 h-3" />
                                  Simpan File
                                </a>
                              </div>
                            )}
                          </div>
                        )
                      )}

                      {/* Photo Carousel Gallery (.ttslide) */}
                      {msg.media?.type === 'gallery' &&
                        msg.media.galleryUrls &&
                        msg.media.galleryUrls.length > 0 && (
                          <div className="mb-2.5 space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5 max-w-[300px]">
                              {msg.media.galleryUrls.slice(0, 6).map((gUrl, idx) => (
                                <div
                                  key={`${msg.id}-slide-${idx}`}
                                  className="aspect-square rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800"
                                >
                                  <ResilientImage
                                    src={gUrl}
                                    alt={`Slide ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {msg.media.galleryUrls.length} slide foto berhasil diekstrak
                            </div>
                          </div>
                        )}

                      {/* Generated WebP Sticker (Static or Animated) */}
                      {msg.media?.type === 'sticker' && (
                        <div className="my-1 flex flex-col items-start gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxSticker({
                                url: msg.media!.url,
                                pack:
                                  msg.media!.packInfo?.pack ||
                                  config.stickerPackName,
                                author:
                                  msg.media!.packInfo?.author ||
                                  config.stickerAuthor,
                              })
                            }
                            className="rounded-2xl p-2 bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 hover:scale-[1.02] transition-transform"
                          >
                            <ResilientImage
                              src={msg.media.url}
                              alt="Stiker WebP"
                              className="w-40 h-40 object-contain"
                              fallbackLabel="Stiker WebP"
                            />
                          </button>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>
                              {msg.media.isAnimated
                                ? 'Stiker Animasi'
                                : msg.media.packInfo?.pack}
                            </span>
                            <span aria-hidden="true">·</span>
                            <a
                              href={mediaUrl}
                              download={msg.media.fileName || 'wabot-sticker.webp'}
                              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium whitespace-nowrap"
                            >
                              <Download className="w-3 h-3" />
                              Simpan .webp
                            </a>
                          </div>
                          {/* Quick Tooling Buttons for this sticker */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(msg);
                                void executeSend({
                                  replyToId: msg.id,
                                  text: `${config.prefix}toimg`,
                                });
                              }}
                              className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 hover:text-emerald-700 dark:hover:text-emerald-400 border border-zinc-200/60 dark:border-zinc-700/60 transition-colors"
                              title="Ubah stiker ini kembali jadi gambar PNG"
                            >
                              {config.prefix}toimg
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(msg);
                                void executeSend({
                                  replyToId: msg.id,
                                  text: `${config.prefix}wm Ryo Yamada | 6289673533963`,
                                });
                              }}
                              className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 hover:text-emerald-700 dark:hover:text-emerald-400 border border-zinc-200/60 dark:border-zinc-700/60 transition-colors"
                              title="Ganti Pack Name & Author (EXIF) stiker ini"
                            >
                              {config.prefix}wm
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(msg);
                                void executeSend({
                                  replyToId: msg.id,
                                  text: `${config.prefix}tovid`,
                                });
                              }}
                              className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 hover:text-emerald-700 dark:hover:text-emerald-400 border border-zinc-200/60 dark:border-zinc-700/60 transition-colors"
                              title="Ubah stiker animasi menjadi video MP4"
                            >
                              {config.prefix}tovid
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Circular Video Note / PTV (.toptv) */}
                      {msg.media?.type === 'ptv' && (
                        <div className="my-1.5 flex flex-col items-center gap-2">
                          <div className="w-48 h-48 rounded-full overflow-hidden border-2 border-emerald-500/60 bg-zinc-950 shrink-0">
                            <video
                              src={mediaUrl}
                              controls
                              loop
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>Video Note Bulat (PTV)</span>
                            <span aria-hidden="true">·</span>
                            <a
                              href={
                                mediaUrl.includes('?')
                                  ? `${mediaUrl}&download=1`
                                  : `${mediaUrl}?download=1`
                              }
                              download={msg.media.fileName || 'ptv-note.mp4'}
                              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium whitespace-nowrap"
                            >
                              <Download className="w-3 h-3" />
                              Unduh .mp4
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Downloaded Video MP4 or Uncompressed .hdsw Video */}
                      {msg.media?.type === 'video' && !msg.media.isViewOnce && (
                        <div className="mb-2.5 space-y-2">
                          <div className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 max-w-[300px]">
                            <video
                              src={mediaUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full max-h-80 object-contain"
                            />
                          </div>
                          <a
                            href={
                              mediaUrl.includes('?')
                                ? `${mediaUrl}&download=1`
                                : `${mediaUrl}?download=1`
                            }
                            download={msg.media.fileName || 'video-hd.mp4'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {msg.media.url.includes('/api/hd-media/')
                              ? `Simpan Video (${msg.media.fileSizeLabel || 'HD'})`
                              : 'Download Video (.mp4)'}
                          </a>
                        </div>
                      )}

                      {/* Voice Note PTT (.tovn) */}
                      {msg.media?.type === 'vn' && (
                        <div className="mb-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 space-y-2 min-w-[250px]">
                          <div className="flex items-center gap-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                            <Mic className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              Voice Note WhatsApp (PTT)
                            </span>
                          </div>
                          <audio
                            src={mediaUrl}
                            controls
                            preload="metadata"
                            className="w-full h-9"
                          />
                        </div>
                      )}

                      {/* Extracted / Filtered Audio MP3 */}
                      {msg.media?.type === 'audio' && (
                        <div className="mb-2.5 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5 min-w-[250px]">
                          <div className="flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            <Music className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              {msg.media.title || 'Audio MP3'}
                            </span>
                          </div>
                          <audio
                            src={mediaUrl}
                            controls
                            preload="metadata"
                            className="w-full h-9"
                          />
                          <a
                            href={
                              mediaUrl.includes('?')
                                ? `${mediaUrl}&download=1`
                                : `${mediaUrl}?download=1`
                            }
                            download={msg.media.fileName || 'audio.mp3'}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Simpan Audio (.mp3)
                          </a>
                        </div>
                      )}

                      {/* Message Text */}
                      {msg.text && (
                        <div className="text-[14px] leading-relaxed break-words">
                          {formatWaFormattedText(msg.text)}
                        </div>
                      )}

                      {/* Hidetag Metadata Footnote */}
                      {msg.hiddenMentions && msg.hiddenMentions.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-zinc-200/70 dark:border-zinc-800 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Hidetag terkirim ke {msg.hiddenMentions.length} anggota
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`mt-1.5 flex items-center justify-end gap-1 text-[11px] font-mono tabular-nums ${
                      isUser
                        ? 'text-emerald-100/90'
                        : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    <span>{formatTime(msg.timestamp)}</span>
                    {isUser && <CheckCheck className="w-3.5 h-3.5" />}
                  </div>

                  {/* Floating Emoji Reaction Badge */}
                  {msg.reaction && (
                    <div
                      title="Reaksi otomatis bot"
                      className={`absolute -bottom-3 ${
                        isUser ? 'right-3' : 'left-3'
                      } px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs leading-none select-none shadow-xs`}
                    >
                      {msg.reaction}
                    </div>
                  )}
                </div>
                {msg.reaction && <div className="h-2" aria-hidden="true" />}
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start">
              <div className="bg-white dark:bg-[#18181C] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
                {config.botName} sedang memproses perintah...
              </div>
            </div>
          )}
        </div>

        {/* Attachment / Reply Preview Strip */}
        {(replyTarget ||
          uploadedImageBase64 ||
          useSampleCat ||
          useSampleVideo ||
          useSampleAudio ||
          uploadedDoc ||
          useSampleHdDoc ||
          sendError) && (
          <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-900/90 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2">
            {sendError && (
              <div className="flex items-center justify-between gap-2 text-xs text-rose-600 dark:text-rose-400">
                <span>{sendError}</span>
                <button
                  type="button"
                  onClick={() => setSendError(null)}
                  className="p-0.5 hover:opacity-75"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {replyTarget && (
              <div className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-800 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Membalas {replyTarget.senderName}:
                  </span>{' '}
                  <span className="text-zinc-500 dark:text-zinc-400 truncate">
                    {replyTarget.media?.isViewOnce
                      ? '[Media Sekali Lihat — siap dibuka dengan .rvo]'
                      : replyTarget.text ||
                        (replyTarget.media?.type === 'document'
                          ? `[Dokumen Asli: ${replyTarget.media.fileName || 'media'}]`
                          : '[Media]')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {(uploadedDoc || useSampleHdDoc) && (
              <div className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-800 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <FileUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {uploadedDoc
                        ? `[Dokumen] ${uploadedDoc.fileName} (${uploadedDoc.sizeLabel})`
                        : '[Dokumen Contoh] story-hd-original.jpg (Ukuran Asli)'}
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400 truncate">
                      Tanpa kompresi WA · Kirim dengan {p}hdsw (bisa langsung di Grup &amp; Chat Pribadi)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUploadedDoc(null);
                    setUseSampleHdDoc(false);
                  }}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {(uploadedImageBase64 || useSampleCat) && (
              <div className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-800 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
                <div className="flex items-center gap-3 min-w-0">
                  <ResilientImage
                    src={uploadedImageBase64 || SAMPLE_CAT_IMAGE_URL}
                    alt="Lampiran foto"
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {uploadedImageBase64
                        ? 'Foto unggahan siap diproses'
                        : 'Foto contoh studio siap diproses'}
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400 truncate">
                      Gunakan {p}s, {p}hd, {p}hitamkan, {p}meme atas|bawah, atau {p}tourl
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUploadedImageBase64(null);
                    setUseSampleCat(false);
                  }}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {useSampleVideo && (
              <div className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-800 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Film className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      [Video Contoh] sample-clip.mp4 (Klip Pendek Uji Coba)
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400 truncate">
                      Cocok untuk {p}s (stiker bergerak), {p}toptv (video bulat), atau {p}tomp3
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUseSampleVideo(false)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {useSampleAudio && (
              <div className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-800 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      [Audio Contoh] sample-audio.mp3 (Sampel Musik)
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400 truncate">
                      Cocok untuk {p}tovn, {p}bass, {p}nightcore, {p}slow, {p}fast, {p}robot, {p}reverse
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUseSampleAudio(false)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sample Media Quick Toolbar */}
        <div className="px-4 py-2 bg-[#FAF9F6] dark:bg-[#111114] border-t border-zinc-200/70 dark:border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0 mr-1">
            Lampirkan media uji:
          </span>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Upload Foto
          </button>

          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            className={`px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              uploadedDoc || useSampleHdDoc
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/60'
            }`}
          >
            <FileUp className="w-3.5 h-3.5" />
            Dokumen HD ({p}hdsw)
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !useSampleCat;
              clearAllAttachments();
              setUseSampleCat(next);
              if (next && !inputText.trim()) setInputText(`${p}s`);
            }}
            className={`px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              useSampleCat
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Foto Contoh
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !useSampleVideo;
              clearAllAttachments();
              setUseSampleVideo(next);
              if (next && !inputText.trim()) setInputText(`${p}toptv`);
            }}
            className={`px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              useSampleVideo
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/60'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Video Contoh
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !useSampleAudio;
              clearAllAttachments();
              setUseSampleAudio(next);
              if (next && !inputText.trim()) setInputText(`${p}bass`);
            }}
            className={`px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              useSampleAudio
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/60'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            Audio Contoh
          </button>

          <button
            type="button"
            disabled={isSending}
            onClick={() => void handleInjectAndPrepareRvo()}
            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            Simulasi ViewOnce ({p}rvo)
          </button>
        </div>

        {/* Composer Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void executeSend();
          }}
          className="px-4 py-3.5 bg-white dark:bg-[#141417] border-t border-zinc-200/80 dark:border-zinc-800 flex items-center gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <input
            ref={docInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleDocFileChange}
            className="hidden"
          />

          <input
            ref={textInputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              chatMode === 'group'
                ? `Ketik ${p}hdsw, ${p}qc, ${p}setwelcome, ${p}kick, ${p}promote...`
                : `Ketik ${p}hdsw, ${p}qc <teks>, ${p}tt <link>, ${p}play <lagu>, atau ${p}menu...`
            }
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
          />

          <button
            type="submit"
            disabled={
              isSending ||
              (!inputText.trim() &&
                !uploadedImageBase64 &&
                !useSampleCat &&
                !useSampleVideo &&
                !useSampleAudio &&
                !uploadedDoc &&
                !useSampleHdDoc)
            }
            className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Kirim
          </button>
        </form>
      </div>

      {/* Right 4 Columns: Group Context / Quick Guide & Real-Time Execution Log */}
      <div className="lg:col-span-4 space-y-6">
        {chatMode === 'group' ? (
          <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {groupState.subject}
                </h3>
                <span className="text-xs font-mono tabular-nums text-zinc-500 shrink-0">
                  {groupMembers.length} orang
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                {groupState.description}
              </p>
              <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate pt-0.5">
                chat.whatsapp.com/{groupState.inviteCode}
              </div>
            </div>

            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
              {groupMembers.map((member) => {
                const ownerPhone =
                  (config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(
                    /[^0-9]/g,
                    ''
                  ) || OFFICIAL_OWNER_NUMBER;
                const isSelfOwner = member.phone === ownerPhone;
                return (
                  <div
                    key={member.jid}
                    className="py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {member.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <span className="font-mono tabular-nums">
                          +{member.phone}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            member.isAdmin
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : ''
                          }
                        >
                          {member.isAdmin ? 'Admin' : 'Anggota'}
                        </span>
                      </div>
                    </div>

                    {!isSelfOwner && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={isSending}
                          onClick={() =>
                            void executeSend({
                              chatMode: 'group',
                              text: `${p}${
                                member.isAdmin ? 'demote' : 'promote'
                              } @${member.phone}`,
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors whitespace-nowrap"
                        >
                          {member.isAdmin ? 'Demote' : 'Promote'}
                        </button>
                        <button
                          type="button"
                          disabled={isSending}
                          onClick={() =>
                            void executeSend({
                              chatMode: 'group',
                              text: `${p}kick @${member.phone}`,
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-[11px] font-medium text-rose-700 dark:text-rose-400 transition-colors whitespace-nowrap"
                        >
                          Kick
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Uji Event Sambutan &amp; Keluar Grup ({p}setwelcome / {p}setout):
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => void handleGroupEvent('welcome')}
                  className="py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100/80 dark:hover:bg-emerald-950/50 transition-colors whitespace-nowrap"
                >
                  Simulasi Masuk
                </button>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => void handleGroupEvent('goodbye')}
                  className="py-2 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
                >
                  Simulasi Keluar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isSending}
                onClick={() =>
                  void executeSend({
                    chatMode: 'group',
                    text: `${p}cekset`,
                  })
                }
                className="py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                Lihat Set Grup ({p}cekset)
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={() =>
                  void executeSend({
                    chatMode: 'group',
                    text: `${p}resetset`,
                  })
                }
                className="py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                Reset Set ({p}resetset)
              </button>
            </div>

            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                void executeSend({
                  chatMode: 'group',
                  senderRole: 'member',
                  text: 'Cek promo gratis di https://chat.whatsapp.com/ContohLinkLuar88',
                })
              }
              className="w-full py-2.5 px-4 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 text-xs font-medium hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              Simulasikan Member Kirim Link
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-3.5">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Ringkasan Fitur Unggulan ({p})
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Seluruh command di bawah berjalan pada engine FFmpeg &amp; Sharp yang sama dengan koneksi WhatsApp asli.
            </p>
            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 text-xs">
              <div className="py-2 flex items-baseline justify-between gap-3">
                <code className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {p}hdsw
                </code>
                <span className="text-zinc-500 text-right">
                  Dokumen asli siap SW (Grup &amp; PC)
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <code className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {p}qc / {p}iqc
                </code>
                <span className="text-zinc-500 text-right">
                  Stiker bubble chat WA &amp; iPhone
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <code className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {p}s / {p}bratvid
                </code>
                <span className="text-zinc-500 text-right">
                  Foto/video ke stiker &amp; Brat animasi
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <code className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {p}toptv / {p}rvo
                </code>
                <span className="text-zinc-500 text-right">
                  Video bulat WA &amp; buka ViewOnce
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <code className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {p}tt / {p}ig / {p}fb / {p}pin
                </code>
                <span className="text-zinc-500 text-right">
                  Multi-platform downloader HD
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <code className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {p}play / {p}bass / {p}nc
                </code>
                <span className="text-zinc-500 text-right">
                  Cari lagu MP3 &amp; efek audio studio
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Real-Time Command Execution Log */}
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Riwayat Eksekusi Terbaru
            </h3>
            <span className="text-xs font-mono tabular-nums text-zinc-500">
              {logs.length} aktivitas
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Belum ada perintah dijalankan pada sesi ini.
              </p>
              <button
                type="button"
                onClick={() => void executeSend({ text: `${p}qc halo semuanya` })}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:opacity-85 transition-opacity whitespace-nowrap"
              >
                Jalankan Contoh {p}qc
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 max-h-[290px] overflow-y-auto pr-1">
              {logs.slice(0, 12).map((log) => (
                <div key={log.id} className="py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {log.summary}
                    </span>
                    <span className="font-mono tabular-nums text-zinc-400 shrink-0">
                      {log.durationMs} ms
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      {log.source === 'whatsapp' ? 'WhatsApp Asli' : 'Simulator'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{log.sender}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        log.status === 'success'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : log.status === 'blocked'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {log.status === 'success'
                        ? 'Berhasil'
                        : log.status === 'blocked'
                        ? 'Dimoderasi'
                        : 'Gagal'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticker Lightbox Preview Modal */}
      {lightboxSticker && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightboxSticker(null)}
        >
          <div
            className="bg-white dark:bg-[#18181C] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Pratinjau Stiker 512×512 WebP
              </h4>
              <button
                type="button"
                onClick={() => setLightboxSticker(null)}
                className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-square rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center p-4 border border-zinc-200/70 dark:border-zinc-800">
              <ResilientImage
                src={lightboxSticker.url}
                alt="Stiker ukuran penuh"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="truncate">
                <span>{lightboxSticker.pack}</span>
                <span aria-hidden="true"> · </span>
                <span>{lightboxSticker.author}</span>
              </div>
              <a
                href={resolveBackendMediaUrl(lightboxSticker.url)}
                download="wabot-sticker.webp"
                className="px-3.5 py-2 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh .webp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
