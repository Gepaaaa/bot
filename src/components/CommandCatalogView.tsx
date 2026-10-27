import { useMemo, useState } from 'react';
import { Check, Copy, Play, Search } from 'lucide-react';
import { COMMAND_CATALOG } from '../shared/commands.ts';
import type { BotConfig, CommandCategory } from '../shared/types.ts';

interface CommandCatalogViewProps {
  config: BotConfig;
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
  onTryInSimulator: (fullCommand: string) => void;
}

const CATEGORY_TABS: Array<{ id: 'all' | CommandCategory; label: string }> = [
  { id: 'all', label: 'Semua Fitur' },
  { id: 'downloader', label: 'Downloader' },
  { id: 'audio', label: 'Audio MP3' },
  { id: 'sticker', label: 'Studio Stiker' },
  { id: 'group', label: 'Admin Grup' },
  { id: 'utility', label: 'Utilitas' },
];

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  downloader: 'Downloader Sosmed',
  audio: 'Ekstraktor Audio',
  sticker: 'Studio Stiker',
  group: 'Admin Grup',
  utility: 'Utilitas',
};

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

  return (
    <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Katalog Command Awalan ({config.prefix})
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aktifkan atau matikan command tertentu secara langsung, atau klik Coba
            untuk mengujinya di Simulator Chat.
          </p>
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari command (.tt, .brat, .s)..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Interactive Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800 overflow-x-auto">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === tab.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Group Anti-Suspension Safeguard Note (hairline divider, no nested card) */}
      <div className="pt-2 pb-1 border-b border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        <span className="font-semibold text-zinc-900 dark:text-zinc-200">
          Proteksi Anti-Suspend Grup Aktif:
        </span>{' '}
        Perintah pemicu penangguhan grup (<code className="font-mono">{config.prefix}add</code>,{' '}
        <code className="font-mono">{config.prefix}hidetag</code>,{' '}
        <code className="font-mono">{config.prefix}tagall</code>) dikunci otomatis.
        Seluruh fitur grup lainnya dilindungi cache metadata 5 menit, jeda ketik natural,
        serta batas jeda (cooldown) aksi admin agar grup tetap aman.
      </div>

      {/* High-Clarity Command Rows */}
      {filteredCommands.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tidak ada command yang cocok dengan pencarian &ldquo;{query}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSelectedCategory('all');
            }}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Tampilkan semua command
          </button>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800">
          {filteredCommands.map((cmd) => {
            const isLockedRisk = Boolean(cmd.suspensionRisk);
            const isEnabled =
              !isLockedRisk && !config.disabledCommands.includes(cmd.id);
            const fullExample = `${config.prefix}${cmd.example}`;

            return (
              <div
                key={cmd.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40 -mx-3 px-3 rounded-xl transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {config.prefix}
                      {cmd.usage}
                    </code>
                    <span className="text-xs text-zinc-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {CATEGORY_LABELS[cmd.category]}
                    </span>
                    {cmd.aliases.length > 0 && (
                      <>
                        <span
                          className="text-xs text-zinc-400"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          alias:{' '}
                          {cmd.aliases
                            .map((a) => `${config.prefix}${a}`)
                            .join(', ')}
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
                          Dinonaktifkan otomatis (cegah grup suspend)
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
                    onClick={() => void copyCommandExample(cmd.id, cmd.example)}
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

                  <button
                    type="button"
                    onClick={() => onTryInSimulator(fullExample)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3 h-3" />
                    Coba
                  </button>

                  <button
                    type="button"
                    disabled={cmd.id === 'menu' || isLockedRisk}
                    onClick={() => void toggleCommandEnabled(cmd.id)}
                    title={
                      isLockedRisk
                        ? 'Dikunci otomatis karena berpotensi menyebabkan grup ditangguhkan WhatsApp'
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
                      ? 'Dikunci Aman'
                      : isEnabled
                      ? 'Aktif'
                      : 'Nonaktif'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
