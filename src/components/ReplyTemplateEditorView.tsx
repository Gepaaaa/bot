import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Play,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  buildBotMenuText,
  DEFAULT_REACTIONS,
  DEFAULT_TEMPLATES,
  formatPhoneDisplay,
  OFFICIAL_OWNER_NUMBER,
  renderBotTemplate,
} from '../shared/commands.ts';
import type {
  BotConfig,
  BotReactionConfig,
  BotReplyTemplates,
} from '../shared/types.ts';

interface ReplyTemplateEditorViewProps {
  config: BotConfig;
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
  onTryInSimulator: (fullCommand: string) => void;
}

type TemplateGroupFilter = 'all' | 'media' | 'sticker' | 'group' | 'system';

interface TemplateMetaItem {
  key: keyof BotReplyTemplates;
  label: string;
  category: Exclude<TemplateGroupFilter, 'all'>;
  sampleCommandSuffix: string;
  triggerDescription: string;
  availableVars: string[];
  previewMediaBadge?: 'video' | 'audio' | 'sticker';
}

const TEMPLATE_ITEMS: TemplateMetaItem[] = [
  {
    key: 'downloaderCaption',
    label: 'Caption Video Sosmed (.tt / .ig)',
    category: 'media',
    sampleCommandSuffix:
      'tt https://www.tiktok.com/@tiktok/video/7106594312292453675',
    triggerDescription:
      'Muncul sebagai caption video MP4 saat unduhan TikTok/sosmed selesai.',
    availableVars: [
      'platform',
      'title',
      'author',
      'duration',
      'botName',
      'prefix',
    ],
    previewMediaBadge: 'video',
  },
  {
    key: 'audioCaption',
    label: 'Balasan Audio MP3 (.mp3)',
    category: 'media',
    sampleCommandSuffix:
      'mp3 https://www.tiktok.com/@tiktok/video/7106594312292453675',
    triggerDescription:
      'Muncul bersama file musik MP3 yang diekstrak dari tautan video.',
    availableVars: ['title', 'author', 'botName', 'prefix'],
    previewMediaBadge: 'audio',
  },
  {
    key: 'hdswCaption',
    label: 'Caption Kirim Media HD ke Chat Pribadi (.hdsw)',
    category: 'media',
    sampleCommandSuffix: 'hdsw',
    triggerDescription:
      'Dikirim bersama foto/video ukuran asli (dari Dokumen tanpa kompresi) ke Chat Pribadi pengguna agar siap diteruskan ke Status WA.',
    availableVars: [
      'mediaKind',
      'fileName',
      'fileSize',
      'botName',
      'prefix',
    ],
    previewMediaBadge: 'video',
  },
  {
    key: 'hdswGroupConfirm',
    label: 'Konfirmasi Grup saat .hdsw Dipakai di Grup',
    category: 'media',
    sampleCommandSuffix: 'hdsw',
    triggerDescription:
      'Balasan singkat di grup yang memberi tahu pengguna bahwa media HD sudah dikirim ke Chat Pribadi (Japri).',
    availableVars: [
      'sender',
      'mediaKind',
      'fileSize',
      'botName',
      'prefix',
    ],
  },
  {
    key: 'stickerReply',
    label: 'Keterangan Stiker Berhasil (.s / .brat)',
    category: 'sticker',
    sampleCommandSuffix: 'brat santai dulu ga sih',
    triggerDescription:
      'Keterangan stiker otomatis saat membuat .s, .brat, .bratwhite, atau .meme.',
    availableVars: ['packName', 'authorName', 'botName', 'prefix'],
    previewMediaBadge: 'sticker',
  },
  {
    key: 'stickerMissingMedia',
    label: 'Panduan Lupa Lampirkan Foto (.s)',
    category: 'sticker',
    sampleCommandSuffix: 's',
    triggerDescription:
      'Muncul ketika pengguna mengetik .s tanpa melampirkan atau me-reply gambar.',
    availableVars: ['prefix', 'botName'],
  },
  {
    key: 'kickSuccess',
    label: 'Keluarkan Anggota Grup (.kick)',
    category: 'group',
    sampleCommandSuffix: 'kick @628577000333',
    triggerDescription:
      'Muncul setelah admin mengeluarkan anggota dari grup.',
    availableVars: ['target', 'sender', 'groupName', 'botName'],
  },
  {
    key: 'addSuccess',
    label: 'Tambah Anggota Grup (.add)',
    category: 'group',
    sampleCommandSuffix: 'add 628199000777',
    triggerDescription:
      'Muncul setelah nomor baru berhasil ditambahkan ke dalam grup.',
    availableVars: ['target', 'sender', 'groupName', 'botName'],
  },
  {
    key: 'promoteSuccess',
    label: 'Angkat Admin Grup (.promote)',
    category: 'group',
    sampleCommandSuffix: 'promote @628577000333',
    triggerDescription:
      'Muncul saat anggota biasa diangkat menjadi Admin Grup.',
    availableVars: ['target', 'sender', 'groupName', 'botName'],
  },
  {
    key: 'demoteSuccess',
    label: 'Turunkan Admin Grup (.demote)',
    category: 'group',
    sampleCommandSuffix: 'demote @628138000222',
    triggerDescription:
      'Muncul saat status Admin Grup dicabut kembali menjadi anggota biasa.',
    availableVars: ['target', 'sender', 'groupName', 'botName'],
  },
  {
    key: 'groupOpenSuccess',
    label: 'Buka Chat Grup (.group open)',
    category: 'group',
    sampleCommandSuffix: 'group open',
    triggerDescription:
      'Muncul saat ruang diskusi grup dibuka untuk semua anggota.',
    availableVars: ['groupName', 'sender', 'prefix', 'botName'],
  },
  {
    key: 'groupCloseSuccess',
    label: 'Kunci Chat Grup (.group close)',
    category: 'group',
    sampleCommandSuffix: 'group close',
    triggerDescription:
      'Muncul saat grup dikunci sehingga hanya Admin yang bisa mengirim pesan.',
    availableVars: ['groupName', 'sender', 'prefix', 'botName'],
  },
  {
    key: 'antilinkWarn',
    label: 'Peringatan Hapus Tautan (.antilink)',
    category: 'group',
    sampleCommandSuffix: 'antilink on',
    triggerDescription:
      'Muncul otomatis saat member biasa mengirim link grup/promosi ketika antilink aktif.',
    availableVars: ['sender', 'prefix', 'groupName', 'botName'],
  },
  {
    key: 'welcomeMsg',
    label: 'Sambutan Member Baru (.welcome / .setwelcome)',
    category: 'group',
    sampleCommandSuffix: 'welcome on',
    triggerDescription:
      'Dikirim otomatis saat anggota baru masuk grup. Admin grup juga bisa mengubah khusus grupnya lewat .setwelcome <teks>.',
    availableVars: ['target', 'groupName', 'prefix', 'botName'],
  },
  {
    key: 'goodbyeMsg',
    label: 'Pesan Member Keluar (.out / .setout)',
    category: 'group',
    sampleCommandSuffix: 'out on',
    triggerDescription:
      'Dikirim otomatis saat anggota keluar dari grup. Admin grup juga bisa mengubah khusus grupnya lewat .setout <teks>.',
    availableVars: ['target', 'groupName', 'prefix', 'botName'],
  },
  {
    key: 'menuHeader',
    label: 'Header Daftar Menu (.menu)',
    category: 'system',
    sampleCommandSuffix: 'menu',
    triggerDescription:
      'Bagian pembuka paling atas saat seseorang mengetik .menu atau .allmenu. Coba ketik .menu grup atau .menu set di kolom simulasi pratinjau untuk melihat tampilan sub-menu.',
    availableVars: [
      'botName',
      'ownerName',
      'ownerNumber',
      'ownerDisplay',
      'prefix',
      'packName',
      'authorName',
      'website',
      'totalCommands',
      'sender',
    ],
  },
  {
    key: 'menuFooter',
    label: 'Footer Daftar Menu (.menu)',
    category: 'system',
    sampleCommandSuffix: 'menu',
    triggerDescription:
      'Baris penutup di bagian paling bawah daftar perintah .menu.',
    availableVars: ['ownerNumber', 'ownerDisplay', 'website', 'ownerName', 'botName', 'prefix'],
  },
  {
    key: 'pingReply',
    label: 'Status & Kecepatan Bot (.ping)',
    category: 'system',
    sampleCommandSuffix: 'ping',
    triggerDescription:
      'Balasan informasi kecepatan respons dan uptime saat mengetik .ping.',
    availableVars: [
      'botName',
      'latency',
      'uptime',
      'prefix',
      'ownerNumber',
      'ownerDisplay',
      'packName',
      'authorName',
      'website',
    ],
  },
  {
    key: 'unknownCommand',
    label: 'Command Tidak Dikenali',
    category: 'system',
    sampleCommandSuffix: 'fituracak',
    triggerDescription:
      'Muncul saat pengguna mengetik awalan titik tetapi nama command tidak terdaftar.',
    availableVars: ['prefix', 'command', 'botName'],
  },
  {
    key: 'errorReply',
    label: 'Format Pesan Gagal / Error',
    category: 'system',
    sampleCommandSuffix: 'tt https://link-rusak.contoh',
    triggerDescription:
      'Muncul bersama reaksi gagal ketika terjadi kendala saat memproses command.',
    availableVars: ['prefix', 'command', 'error', 'botName'],
  },
];

const REACTION_PRESETS = {
  pending: ['⏳', '⌛', '🔄', '👀'],
  success: ['✔️', '✅', '🔥', '✨'],
  error: ['❌', '⚠️', '🚫', '💥'],
};

function formatWhatsAppPreviewNodes(raw: string): React.ReactNode {
  const lines = raw.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens = line.split(/(\*[^*\n]+\*|_[^_\n]+_|@[0-9]{6,16})/g);
    return (
      <React.Fragment key={lineIdx}>
        {tokens.map((tok, i) => {
          if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
            return (
              <strong key={i} className="font-semibold">
                {tok.slice(1, -1)}
              </strong>
            );
          }
          if (tok.startsWith('_') && tok.endsWith('_') && tok.length > 2) {
            return (
              <em key={i} className="italic opacity-85">
                {tok.slice(1, -1)}
              </em>
            );
          }
          if (/^@[0-9]{6,16}$/.test(tok)) {
            return (
              <span
                key={i}
                className="text-emerald-700 dark:text-emerald-400 font-medium"
              >
                {tok}
              </span>
            );
          }
          return <React.Fragment key={i}>{tok}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export function ReplyTemplateEditorView({
  config,
  onUpdateConfig,
  onTryInSimulator,
}: ReplyTemplateEditorViewProps) {
  const [groupFilter, setGroupFilter] = useState<TemplateGroupFilter>('all');
  const [selectedKey, setSelectedKey] =
    useState<keyof BotReplyTemplates>('downloaderCaption');
  const [draftReactions, setDraftReactions] = useState<BotReactionConfig>({
    ...DEFAULT_REACTIONS,
    ...config.reactions,
  });
  const [draftTemplates, setDraftTemplates] = useState<BotReplyTemplates>({
    ...DEFAULT_TEMPLATES,
    ...config.templates,
  });
  const [previewStage, setPreviewStage] = useState<
    'pending' | 'success' | 'error'
  >('success');
  const [customUserInput, setCustomUserInput] = useState<string>(
    `${config.prefix}tt https://www.tiktok.com/@tiktok/video/7106594312292453675`
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraftReactions({
      ...DEFAULT_REACTIONS,
      ...config.reactions,
    });
    setDraftTemplates({
      ...DEFAULT_TEMPLATES,
      ...config.templates,
    });
  }, [config.reactions, config.templates]);

  const activeMeta = useMemo(
    () =>
      TEMPLATE_ITEMS.find((item) => item.key === selectedKey) ||
      TEMPLATE_ITEMS[0],
    [selectedKey]
  );

  useEffect(() => {
    setCustomUserInput(`${config.prefix}${activeMeta.sampleCommandSuffix}`);
    if (selectedKey === 'errorReply' || selectedKey === 'unknownCommand' || selectedKey === 'stickerMissingMedia') {
      setPreviewStage('error');
    } else {
      setPreviewStage('success');
    }
  }, [selectedKey, config.prefix, activeMeta.sampleCommandSuffix]);

  const filteredItems = useMemo(() => {
    if (groupFilter === 'all') return TEMPLATE_ITEMS;
    return TEMPLATE_ITEMS.filter((item) => item.category === groupFilter);
  }, [groupFilter]);

  const sampleVariables = useMemo(() => {
    const typedBody = customUserInput.startsWith(config.prefix)
      ? customUserInput.slice(config.prefix.length).trim()
      : customUserInput.trim();
    const typedCmd = (typedBody.split(/\s+/)[0] || 'tt').toLowerCase();

    const ownerDigits =
      (config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(
        /[^0-9]/g,
        ''
      ) || OFFICIAL_OWNER_NUMBER;

    return {
      botName: config.botName,
      ownerName: config.ownerName,
      ownerNumber: ownerDigits,
      ownerDisplay: formatPhoneDisplay(ownerDigits),
      website: config.ownerWebsite || `wa.me/${ownerDigits}`,
      prefix: config.prefix,
      packName: config.stickerPackName,
      authorName: config.stickerAuthor,
      platform: 'TikTok HD Tanpa Watermark',
      title: 'Suasana Sore Sinematik',
      author: '@kreator',
      duration: '24 detik',
      target: '628577000333',
      sender: ownerDigits,
      groupName: 'Ruang Diskusi Komunitas',
      latency: 18,
      uptime: '2j 14m 09d',
      command: typedCmd,
      error: 'Tautan video tidak dapat diakses atau bersifat privat.',
      mediaKind: 'Video HD',
      fileSize: '18.4 MB',
      fileName: 'cinematic-sunset-4k.mp4',
    };
  }, [config, customUserInput]);

  const renderedPreviewText = useMemo(() => {
    if (previewStage === 'error' && selectedKey !== 'unknownCommand' && selectedKey !== 'stickerMissingMedia') {
      return renderBotTemplate(draftTemplates.errorReply, sampleVariables);
    }

    if (selectedKey === 'menuHeader' || selectedKey === 'menuFooter') {
      const rawBody = customUserInput.startsWith(config.prefix)
        ? customUserInput.slice(config.prefix.length).trim()
        : customUserInput.trim();
      const spaceIdx = rawBody.search(/\s/);
      const typedAlias = (
        spaceIdx === -1 ? rawBody : rawBody.slice(0, spaceIdx)
      ).toLowerCase();
      const menuQuery =
        ['menu', 'help', 'allmenu', 'fitur'].includes(typedAlias) &&
        spaceIdx !== -1
          ? rawBody.slice(spaceIdx + 1).trim()
          : '';

      const ownerDigits =
        (config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(
          /[^0-9]/g,
          ''
        ) || OFFICIAL_OWNER_NUMBER;

      return buildBotMenuText({
        prefix: config.prefix,
        botName: config.botName,
        ownerName: config.ownerName,
        ownerNumber: ownerDigits,
        ownerWebsite: config.ownerWebsite || `wa.me/${ownerDigits}`,
        stickerPackName: config.stickerPackName,
        stickerAuthor: config.stickerAuthor,
        disabledCommands: config.disabledCommands,
        menuHeaderTemplate: draftTemplates.menuHeader,
        menuFooterTemplate: draftTemplates.menuFooter,
        query: menuQuery,
        invokedAlias: typedAlias || 'menu',
        senderName: 'Owner',
      });
    }

    return renderBotTemplate(draftTemplates[selectedKey], sampleVariables);
  }, [
    previewStage,
    selectedKey,
    draftTemplates,
    sampleVariables,
    config,
    customUserInput,
  ]);

  const activeReactionBadge = useMemo(() => {
    if (!draftReactions.enabled) return null;
    if (previewStage === 'pending') return draftReactions.pending;
    if (previewStage === 'error') return draftReactions.error;
    return draftReactions.success;
  }, [draftReactions, previewStage]);

  const insertTokenAtCursor = (token: string) => {
    const el = textareaRef.current;
    const currentVal = draftTemplates[selectedKey];
    if (!el) {
      setDraftTemplates((prev) => ({
        ...prev,
        [selectedKey]: `${currentVal}${token}`,
      }));
      return;
    }

    const start = el.selectionStart ?? currentVal.length;
    const end = el.selectionEnd ?? currentVal.length;
    const updated =
      currentVal.slice(0, start) + token + currentVal.slice(end);

    setDraftTemplates((prev) => ({
      ...prev,
      [selectedKey]: updated,
    }));

    setTimeout(() => {
      el.focus();
      const nextCursor = start + token.length;
      el.setSelectionRange(nextCursor, nextCursor);
    }, 10);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setSavedNotice(false);
    try {
      await onUpdateConfig({
        reactions: {
          enabled: draftReactions.enabled,
          pending: draftReactions.pending.trim() || DEFAULT_REACTIONS.pending,
          success: draftReactions.success.trim() || DEFAULT_REACTIONS.success,
          error: draftReactions.error.trim() || DEFAULT_REACTIONS.error,
        },
        templates: draftTemplates,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2600);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetSingle = () => {
    setDraftTemplates((prev) => ({
      ...prev,
      [selectedKey]: DEFAULT_TEMPLATES[selectedKey],
    }));
  };

  const handleResetAll = () => {
    setDraftReactions({ ...DEFAULT_REACTIONS });
    setDraftTemplates({ ...DEFAULT_TEMPLATES });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Columns: Reaction Lifecycle Controls & Reply Template Editor */}
      <div className="lg:col-span-7 space-y-6">
        {/* Section 1: Emoji Reaction Interaction Config (⏳ / ✔️ / ❌) */}
        <section className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-display font-semibold text-zinc-900 dark:text-zinc-100">
                Interaksi Reaksi Otomatis ({draftReactions.pending}{' '}
                {draftReactions.error} {draftReactions.success})
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
                Saat anggota mengetik command titik, bot langsung memberi reaksi{' '}
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  Menunggu ({draftReactions.pending})
                </span>{' '}
                lalu otomatis berganti menjadi{' '}
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  Berhasil ({draftReactions.success})
                </span>{' '}
                atau{' '}
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  Gagal ({draftReactions.error})
                </span>
                .
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setDraftReactions((prev) => ({
                  ...prev,
                  enabled: !prev.enabled,
                }))
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                draftReactions.enabled
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {draftReactions.enabled ? 'Reaksi Aktif' : 'Reaksi Nonaktif'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {(
              [
                {
                  field: 'pending' as const,
                  title: 'Saat Menunggu',
                  subtitle: 'Command sedang diproses',
                  stage: 'pending' as const,
                },
                {
                  field: 'success' as const,
                  title: 'Saat Berhasil',
                  subtitle: 'Balasan selesai terkirim',
                  stage: 'success' as const,
                },
                {
                  field: 'error' as const,
                  title: 'Saat Gagal',
                  subtitle: 'Link salah / bukan admin',
                  stage: 'error' as const,
                },
              ] as const
            ).map((slot) => (
              <div
                key={slot.field}
                className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {slot.title}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {slot.subtitle}
                    </div>
                  </div>
                  <input
                    type="text"
                    maxLength={4}
                    value={draftReactions[slot.field]}
                    onFocus={() => setPreviewStage(slot.stage)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftReactions((prev) => ({
                        ...prev,
                        [slot.field]: val,
                      }));
                      setPreviewStage(slot.stage);
                    }}
                    aria-label={slot.title}
                    className="w-12 h-10 text-center text-lg rounded-lg bg-white dark:bg-[#141417] border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 pt-0.5">
                  {REACTION_PRESETS[slot.field].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setDraftReactions((prev) => ({
                          ...prev,
                          [slot.field]: emoji,
                        }));
                        setPreviewStage(slot.stage);
                      }}
                      className={`flex-1 py-1 rounded-lg text-sm border transition-colors ${
                        draftReactions[slot.field] === emoji
                          ? 'bg-white dark:bg-zinc-800 border-emerald-500'
                          : 'border-transparent hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Bot Reply Template Selector & Text Editor */}
        <section className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-display font-semibold text-zinc-900 dark:text-zinc-100">
                  Edit Format Chat Balasan Bot
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Sesuaikan gaya bahasa bot saat membalas command titik dan lihat
                  hasilnya langsung di panel pratinjau kanan.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetAll}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Semua Default
              </button>
            </div>

            {/* Category Segmented Filter */}
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'media', label: 'Unduhan & Audio' },
                  { id: 'sticker', label: 'Stiker' },
                  { id: 'group', label: 'Moderasi Grup' },
                  { id: 'system', label: 'Menu & Sistem' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGroupFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    groupFilter === tab.id
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Picker Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {filteredItems.map((item) => {
              const isSelected = item.key === selectedKey;
              const isModified =
                draftTemplates[item.key] !== DEFAULT_TEMPLATES[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedKey(item.key)}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-zinc-900 dark:bg-emerald-600/20 text-white dark:text-emerald-300 border-zinc-900 dark:border-emerald-500/60'
                      : 'bg-[#FAF9F6] dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-medium truncate">
                    {item.label}
                  </span>
                  {isModified && (
                    <span
                      className={`text-[11px] shrink-0 ${
                        isSelected
                          ? 'text-emerald-300'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      Diedit
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Template Textarea & Variable Insertion */}
          <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeMeta.label}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {activeMeta.triggerDescription}
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetSingle}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
              >
                Reset Template Ini
              </button>
            </div>

            {/* Formatting & Variable Insert Bar */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mr-1">
                Sisipkan variabel:
              </span>
              {activeMeta.availableVars.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertTokenAtCursor(`{${v}}`)}
                  className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:border-emerald-500/60 transition-colors whitespace-nowrap shrink-0"
                >
                  {`{${v}}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => insertTokenAtCursor('*teks tebal*')}
                className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 transition-colors whitespace-nowrap shrink-0"
              >
                *Tebal*
              </button>
              <button
                type="button"
                onClick={() => insertTokenAtCursor('_teks miring_')}
                className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-xs italic text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 transition-colors whitespace-nowrap shrink-0"
              >
                _Miring_
              </button>
            </div>

            <textarea
              ref={textareaRef}
              rows={5}
              value={draftTemplates[selectedKey]}
              onChange={(e) =>
                setDraftTemplates((prev) => ({
                  ...prev,
                  [selectedKey]: e.target.value,
                }))
              }
              placeholder="Tulis teks balasan bot di sini..."
              className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 leading-relaxed focus:outline-none focus:border-emerald-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {savedNotice ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    Perubahan reaksi &amp; template aktif di WhatsApp dan Simulator!
                  </span>
                ) : (
                  <span>
                    Mendukung format WhatsApp *tebal*, _miring_, dan baris baru.
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveAll()}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Right 5 Columns: Live WhatsApp Chat Bubble Preview */}
      <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl overflow-hidden">
          {/* Preview Room Header */}
          <div className="px-5 py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-display font-bold text-xs shrink-0">
                WA
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  Pratinjau Chat {config.botName}
                </h3>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  Tampilan real-time saat command diketik
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTryInSimulator(customUserInput)}
              className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200/80 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3 h-3" />
              Uji di Simulator
            </button>
          </div>

          {/* Interactive Reaction Stage Switcher */}
          <div className="px-5 py-3 bg-[#FAF9F6] dark:bg-[#101013] border-b border-zinc-200/70 dark:border-zinc-800/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">
                Simulasi status reaksi:
              </span>
              <div className="flex items-center gap-1 p-0.5 bg-zinc-200/70 dark:bg-zinc-900 rounded-lg">
                {(
                  [
                    {
                      id: 'pending',
                      label: `Menunggu ${draftReactions.pending}`,
                    },
                    {
                      id: 'success',
                      label: `Berhasil ${draftReactions.success}`,
                    },
                    {
                      id: 'error',
                      label: `Gagal ${draftReactions.error}`,
                    },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setPreviewStage(st.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      previewStage === st.id
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="preview-cmd-input"
                className="block text-[11px] text-zinc-500 dark:text-zinc-400"
              >
                Ketik contoh pesan pengguna:
              </label>
              <input
                id="preview-cmd-input"
                type="text"
                value={customUserInput}
                onChange={(e) => setCustomUserInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Simulated WhatsApp Chat Canvas */}
          <div className="p-5 space-y-6 bg-[#F5F3EE]/80 dark:bg-[#0D0D10] min-h-[360px]">
            {/* 1. Outgoing User Command Bubble + Floating Reaction Pill */}
            <div className="flex flex-col items-end">
              <div className="relative max-w-[88%] rounded-2xl px-4 py-2.5 bg-emerald-600 text-white border border-emerald-700/30">
                <div className="text-[13px] font-mono break-all leading-relaxed">
                  {customUserInput || `${config.prefix}menu`}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-mono tabular-nums text-emerald-100/90">
                  <span>19.42</span>
                  <CheckCheck className="w-3.5 h-3.5" />
                </div>

                {activeReactionBadge && (
                  <div
                    title="Reaksi otomatis bot"
                    className="absolute -bottom-3 right-3 px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs leading-none select-none shadow-xs"
                  >
                    {activeReactionBadge}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Incoming Bot Reply Bubble */}
            {previewStage === 'pending' ? (
              <div className="flex flex-col items-start pt-1">
                <div className="rounded-2xl px-4 py-3 bg-white dark:bg-[#18181C] border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                  {config.botName} memberi reaksi{' '}
                  <span className="text-sm">{draftReactions.pending}</span> dan
                  sedang memproses perintah...
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start pt-1">
                <div className="max-w-[92%] rounded-2xl px-4 py-3 bg-white dark:bg-[#18181C] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {config.botName}
                    </span>
                    <span className="font-mono tabular-nums text-[11px]">
                      Bot Otomatis
                    </span>
                  </div>

                  {/* Quoted User Command inside Bot Bubble */}
                  {selectedKey !== 'welcomeMsg' &&
                    selectedKey !== 'goodbyeMsg' &&
                    selectedKey !== 'antilinkWarn' && (
                      <div className="rounded-xl px-3 py-2 text-xs bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200">
                          {selectedKey === 'hdswCaption'
                            ? 'Dokumen Asli dari Kamu (Owner)'
                            : 'Kamu (Owner)'}
                        </div>
                        <div className="truncate font-mono text-[11px] opacity-85">
                          {selectedKey === 'hdswCaption'
                            ? `[Dokumen] cinematic-sunset-4k.mp4 · 18.4 MB · ${customUserInput}`
                            : customUserInput}
                        </div>
                      </div>
                    )}

                  {/* Simulated Media Attachment Preview when applicable */}
                  {previewStage === 'success' &&
                    activeMeta.previewMediaBadge === 'video' && (
                      <div className="rounded-xl px-3.5 py-5 bg-zinc-900 text-zinc-200 border border-zinc-800 flex flex-col items-center justify-center gap-1 text-center">
                        <span className="text-xs font-medium">
                          {selectedKey === 'hdswCaption'
                            ? '[Video WA Web Ukuran Asli — Siap Teruskan ke SW]'
                            : '[Pratinjau Video MP4 Tanpa Watermark]'}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
                          {selectedKey === 'hdswCaption'
                            ? 'Tanpa Kompresi · 18.4 MB · Grup & Chat Pribadi'
                            : '1080p HD · 24 detik'}
                        </span>
                      </div>
                    )}

                  {previewStage === 'success' &&
                    activeMeta.previewMediaBadge === 'audio' && (
                      <div className="rounded-xl px-3.5 py-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium truncate">
                          wabot-audio.mp3
                        </span>
                        <span className="font-mono tabular-nums text-zinc-500 shrink-0">
                          00:24
                        </span>
                      </div>
                    )}

                  {previewStage === 'success' &&
                    activeMeta.previewMediaBadge === 'sticker' && (
                      <div className="w-32 h-32 rounded-2xl bg-[#8ACE00] text-black p-3 flex items-center justify-center text-center font-bold text-sm leading-tight">
                        santai dulu ga sih
                      </div>
                    )}

                  {/* Rendered Template Message */}
                  <div className="text-[13.5px] leading-relaxed break-words">
                    {formatWhatsAppPreviewNodes(renderedPreviewText)}
                  </div>

                  <div className="flex items-center justify-end text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
                    19.42
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
