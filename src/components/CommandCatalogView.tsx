import React, { useMemo, useState } from 'react';
import { Check, Copy, Eye, Play, Search } from 'lucide-react';
import {
  buildBotMenuText,
  COMMAND_CATALOG,
  DEFAULT_TEMPLATES,
  OFFICIAL_OWNER_NUMBER,
} from '../shared/commands.ts';
import type {
  BotConfig,
  CommandCategory,
  CommandDefinition,
} from '../shared/types.ts';

interface CommandCatalogViewProps {
  config: BotConfig;
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
  onTryInSimulator: (fullCommand: string) => void;
}

const CATEGORY_ORDER: CommandCategory[] = [
  'downloader',
  'sticker',
  'media',
  'audio',
  'group',
  'utility',
];

const CATEGORY_META: Record<
  CommandCategory,
  { index: string; title: string; shortLabel: string; subtitle: string }
> = {
  downloader: {
    index: '01',
    title: 'Multi-Downloader Sosmed',
    shortLabel: 'Downloader',
    subtitle: 'Unduh video, foto slide, & file dari TikTok, IG, FB, X, Pinterest, CapCut, YouTube, dan MediaFire',
  },
  sticker: {
    index: '02',
    title: 'Studio Stiker & Teks',
    shortLabel: 'Stiker',
    subtitle: 'Konversi foto/video ke WebP, bubble chat WA & iPhone, Brat animasi, RGB teks, dan EmojiMix',
  },
  media: {
    index: '03',
    title: 'Perkakas Media & Status HD',
    shortLabel: 'Media',
    subtitle: 'Status WA HD tanpa kompresi (.hdsw), upscale 2x, buka ViewOnce, video bulat PTV, dan filter gambar',
  },
  audio: {
    index: '04',
    title: 'Audio, Musik & Efek Suara',
    shortLabel: 'Audio',
    subtitle: 'Pencarian lagu MP3, ekstrak audio, Voice Note PTT, Bass Boost, Nightcore, dan Slowed Reverb',
  },
  group: {
    index: '05',
    title: 'Admin & Otomasi Grup',
    shortLabel: 'Grup',
    subtitle: 'Moderasi anggota, antilink otomatis, sambutan kustom per grup, serta tautan undangan',
  },
  utility: {
    index: '06',
    title: 'Info, Menu & Kontak Owner',
    shortLabel: 'Info',
    subtitle: 'Daftar perintah interaktif, informasi kecepatan server, dan kontak resmi Owner bot',
  },
};

const MENU_PREVIEW_PRESETS: Array<{
  id: string;
  label: string;
  query: string;
  alias?: string;
}> = [
  { id: 'main', label: '.menu (Utama)', query: '' },
  { id: '1', label: '.menu 1 (Downloader)', query: '1' },
  { id: '2', label: '.menu 2 (Stiker)', query: '2' },
  { id: '3', label: '.menu 3 (Media)', query: '3' },
  { id: '4', label: '.menu 4 (Audio)', query: '4' },
  { id: '5', label: '.menu 5 (Admin Grup)', query: '5' },
  { id: '6', label: '.menu 6 (Otomasi)', query: '6' },
  { id: '7', label: '.menu 7 (Info)', query: '7' },
  { id: 'all', label: '.allmenu (Lengkap)', query: '', alias: 'allmenu' },
];

function renderWaFormattedText(raw: string): React.ReactNode {
  const lines = raw.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens = line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
    return (
      <React.Fragment key={lineIdx}>
        {tokens.map((tok, idx) => {
          if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
            return (
              <strong key={idx} className="font-semibold text-zinc-900 dark:text-zinc-100">
                {tok.slice(1, -1)}
              </strong>
            );
          }
          if (tok.startsWith('_') && tok.endsWith('_') && tok.length > 2) {
            return (
              <em key={idx} className="italic text-zinc-500 dark:text-zinc-400">
                {tok.slice(1, -1)}
              </em>
            );
          }
          return <React.Fragment key={idx}>{tok}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export function CommandCatalogView({
  config,
  onUpdateConfig,
  onTryInSimulator,
}: CommandCatalogViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    'all' | CommandCategory
  >('all');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showMenuPreview, setShowMenuPreview] = useState(false);
  const [previewPresetId, setPreviewPresetId] = useState('main');
  const [copiedMenuText, setCopiedMenuText] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts: Record<'all' | CommandCategory, number> = {
      all: COMMAND_CATALOG.length,
      downloader: 0,
      sticker: 0,
      media: 0,
      audio: 0,
      group: 0,
      utility: 0,
    };
    for (const cmd of COMMAND_CATALOG) {
      counts[cmd.category] += 1;
    }
    return counts;
  }, []);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMAND_CATALOG.filter((cmd) => {
      if (selectedCategory !== 'all' && cmd.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        cmd.id.toLowerCase().includes(q) ||
        cmd.aliases.some((a) => a.toLowerCase().includes(q)) ||
        cmd.description.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, query]);

  const groupedSections = useMemo(() => {
    const map = new Map<CommandCategory, CommandDefinition[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = filteredCommands.filter((c) => c.category === cat);
      if (items.length > 0) {
        map.set(cat, items);
      }
    }
    return Array.from(map.entries());
  }, [filteredCommands]);

  const activePreset =
    MENU_PREVIEW_PRESETS.find((p) => p.id === previewPresetId) ||
    MENU_PREVIEW_PRESETS[0];

  const renderedMenuPreview = useMemo(() => {
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
      menuHeaderTemplate:
        config.templates?.menuHeader || DEFAULT_TEMPLATES.menuHeader,
      menuFooterTemplate:
        config.templates?.menuFooter || DEFAULT_TEMPLATES.menuFooter,
      query: activePreset.query,
      invokedAlias: activePreset.alias || 'menu',
      senderName: 'Owner',
    });
  }, [config, activePreset]);

  const toggleCommandEnabled = async (id: string) => {
    const disabled = new Set(config.disabledCommands);
    if (disabled.has(id)) {
      disabled.delete(id);
    } else {
      disabled.add(id);
    }
    await onUpdateConfig({ disabledCommands: Array.from(disabled) });
  };

  const copyCommandExample = async (id: string, example: string) => {
    try {
      await navigator.clipboard.writeText(`${config.prefix}${example}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const copyPreviewMenu = async () => {
    try {
      await navigator.clipboard.writeText(renderedMenuPreview);
      setCopiedMenuText(true);
      setTimeout(() => setCopiedMenuText(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const previewCommandCall = activePreset.alias
    ? `${config.prefix}${activePreset.alias}`
    : activePreset.query
    ? `${config.prefix}menu ${activePreset.query}`
    : `${config.prefix}menu`;

  return (
    <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
      {/* Top Header, Search & Live WA Menu Preview Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Menu &amp; Katalog Perintah ({config.prefix})
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Daftar fitur tersusun rapi per kategori. Kelola status aktif/nonaktif setiap perintah atau uji langsung di Simulator.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowMenuPreview((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              showMenuPreview
                ? 'bg-zinc-900 dark:bg-emerald-600 text-white border-zinc-900 dark:border-emerald-600'
                : 'bg-[#FAF9F6] dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {showMenuPreview ? 'Tutup Pratinjau .menu' : `Lihat Tampilan ${config.prefix}menu WA`}
          </button>

          <div className="relative w-full sm:w-68">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Cari perintah (${config.prefix}tt, ${config.prefix}qc, ${config.prefix}hdsw, ${config.prefix}owner)...`}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Collapsible Live WhatsApp .menu Preview Panel */}
      {showMenuPreview && (
        <div className="pt-4 pb-5 border-y border-zinc-200/80 dark:border-zinc-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Pratinjau Balasan Chat WhatsApp ({previewCommandCall})
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Tampilan bersih &amp; ringkas yang dikirim bot ketika pengguna mengetik perintah menu di WhatsApp.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void copyPreviewMenu()}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedMenuText ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Salin Menu
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onTryInSimulator(previewCommandCall)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                Uji di Simulator
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MENU_PREVIEW_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPreviewPresetId(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors whitespace-nowrap shrink-0 ${
                  previewPresetId === preset.id
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {preset.label.replace(/^\./, config.prefix)}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-[#F5F3EE] dark:bg-[#0D0D10] p-4 sm:p-5 border border-zinc-200/70 dark:border-zinc-800/80">
            <div className="max-w-xl rounded-2xl bg-white dark:bg-[#18181C] border border-zinc-200/80 dark:border-zinc-800 px-4 py-3.5 text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">
              {renderWaFormattedText(renderedMenuPreview)}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Category Filter Bar */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            selectedCategory === 'all'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          Semua ({categoryCounts.all})
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === cat
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {CATEGORY_META[cat].shortLabel} ({categoryCounts[cat]})
          </button>
        ))}
      </div>

      {/* Grouped, Clean Command Sections */}
      {groupedSections.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tidak ada perintah yang cocok dengan pencarian &ldquo;{query}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSelectedCategory('all');
            }}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Tampilkan semua perintah
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSections.map(([cat, commands]) => {
            const meta = CATEGORY_META[cat];
            const activeInCat = commands.filter(
              (c) => !c.suspensionRisk && !config.disabledCommands.includes(c.id)
            ).length;

            return (
              <section key={cat} className="space-y-2">
                {/* Clean Editorial Section Header */}
                <div className="pb-2.5 border-b border-zinc-200/90 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {meta.index}. {meta.title}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {meta.subtitle}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                    {activeInCat}/{commands.length} aktif
                  </span>
                </div>

                {/* Crisp Command Rows */}
                <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
                  {commands.map((cmd) => {
                    const isLockedRisk = Boolean(cmd.suspensionRisk);
                    const isEnabled =
                      !isLockedRisk && !config.disabledCommands.includes(cmd.id);
                    const fullExample = `${config.prefix}${cmd.example}`;

                    return (
                      <div
                        key={cmd.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40 -mx-3 px-3 rounded-xl transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <code className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                              {config.prefix}
                              {cmd.usage}
                            </code>

                            {cmd.aliases.length > 0 && (
                              <>
                                <span
                                  className="text-xs text-zinc-400"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                                  {cmd.aliases
                                    .map((a) => `${config.prefix}${a}`)
                                    .join(', ')}
                                </span>
                              </>
                            )}

                            {cmd.groupOnly && !isLockedRisk && (
                              <>
                                <span
                                  className="text-xs text-zinc-400"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Khusus Grup
                                </span>
                              </>
                            )}

                            {isLockedRisk && (
                              <>
                                <span
                                  className="text-xs text-zinc-400"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                  Dikunci otomatis (proteksi anti-suspend)
                                </span>
                              </>
                            )}
                          </div>

                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {cmd.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void copyCommandExample(cmd.id, cmd.example)
                            }
                            title={`Salin contoh: ${fullExample}`}
                            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            {copiedId === cmd.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                Disalin
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Salin
                              </>
                            )}
                          </button>

                          {!isLockedRisk && (
                            <button
                              type="button"
                              onClick={() => onTryInSimulator(fullExample)}
                              className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <Play className="w-3 h-3" />
                              Coba
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={cmd.id === 'menu' || isLockedRisk}
                            onClick={() => void toggleCommandEnabled(cmd.id)}
                            title={
                              isLockedRisk
                                ? 'Dikunci otomatis demi mencegah grup ditangguhkan WhatsApp'
                                : undefined
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                              isLockedRisk
                                ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                                : isEnabled
                                ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
                            }`}
                          >
                            {isLockedRisk
                              ? 'Dikunci'
                              : isEnabled
                              ? 'Aktif'
                              : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
