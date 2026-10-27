import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Moon, Save, Sun } from 'lucide-react';
import type { BotConfig } from '../shared/types.ts';
import { GepaCreatorAvatar } from './GepaAvatar.tsx';

interface SettingsViewProps {
  config: BotConfig;
  darkMode: boolean;
  onToggleDarkMode: (dark: boolean) => void;
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
}

const PRESET_PREFIXES = ['.', '!', '#', '/'];

export function SettingsView({
  config,
  darkMode,
  onToggleDarkMode,
  onUpdateConfig,
}: SettingsViewProps) {
  const [prefix, setPrefix] = useState(config.prefix);
  const [botName, setBotName] = useState(config.botName);
  const [stickerPackName, setStickerPackName] = useState(config.stickerPackName);
  const [stickerAuthor, setStickerAuthor] = useState(config.stickerAuthor);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setPrefix(config.prefix);
    setBotName(config.botName);
    setStickerPackName(config.stickerPackName);
    setStickerAuthor(config.stickerAuthor);
  }, [config]);

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      prefix: prefix.trim() || '.',
      botName: botName.trim() || 'GepaBot',
      stickerPackName: stickerPackName.trim() || 'Gepa Corner',
      stickerAuthor: stickerAuthor.trim() || 'gepacorner.my.id',
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Columns: Prefix, Sticker Pack & Moderation Settings */}
      <form
        onSubmit={handleSaveIdentity}
        className="lg:col-span-7 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Pengaturan Mesin Bot & Identitas Stiker
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Atur awalan karakter command, metadata watermark stiker WhatsApp, serta
            perilaku moderasi grup.
          </p>
        </div>

        {/* Prefix Selector */}
        <div className="space-y-2.5">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Awalan Perintah (Command Prefix)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_PREFIXES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPrefix(item)}
                className={`w-10 h-10 rounded-xl font-mono text-sm font-semibold border transition-colors ${
                  prefix === item
                    ? 'bg-zinc-900 dark:bg-emerald-600 text-white border-zinc-900 dark:border-emerald-600'
                    : 'bg-[#FAF9F6] dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                }`}
              >
                {item}
              </button>
            ))}
            <input
              type="text"
              maxLength={3}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              aria-label="Prefix kustom"
              className="w-20 h-10 px-3 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-sm text-center text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Contoh panggil: <code className="font-mono">{prefix || '.'}tt</code>,{' '}
              <code className="font-mono">{prefix || '.'}brat</code>,{' '}
              <code className="font-mono">{prefix || '.'}s</code>
            </span>
          </div>
        </div>

        {/* Bot Name & Sticker EXIF */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Nama Tampilan Bot
            </label>
            <input
              type="text"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Nama Paket Stiker (Sticker Pack)
            </label>
            <input
              type="text"
              value={stickerPackName}
              onChange={(e) => setStickerPackName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Pembuat Stiker (Publisher EXIF)
            </label>
            <input
              type="text"
              value={stickerAuthor}
              onChange={(e) => setStickerAuthor(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Metadata stiker tertanam otomatis pada setiap hasil {prefix}s,{' '}
            {prefix}brat, dan {prefix}meme.
          </span>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {savedNotice ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Tersimpan
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Simpan Perubahan
              </>
            )}
          </button>
        </div>
      </form>

      {/* Right 5 Columns: Switches & Gepa Personal Corner Identity */}
      <div className="lg:col-span-5 space-y-6">
        {/* Behavior & Appearance Toggles */}
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Preferensi Ruang & Moderasi
          </h3>

          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Tema Antarmuka Panel
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Pilih nuansa kertas hangat Gepa Corner atau mode gelap tenang
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleDarkMode(false)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                    !darkMode
                      ? 'bg-white text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Terang
                </button>
                <button
                  type="button"
                  onClick={() => onToggleDarkMode(true)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                    darkMode
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Gelap
                </button>
              </div>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Moderasi Antilink Grup Otomatis
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Hapus pesan berisi link dari non-admin di grup
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    groupSettings: {
                      ...config.groupSettings,
                      antilink: !config.groupSettings.antilink,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  config.groupSettings.antilink
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {config.groupSettings.antilink ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Sambutan Member Masuk ({prefix}welcome / {prefix}setwelcome)
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sapa otomatis saat ada anggota baru bergabung ke grup
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    groupSettings: {
                      ...config.groupSettings,
                      welcome: !config.groupSettings.welcome,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  config.groupSettings.welcome
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {config.groupSettings.welcome ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Pesan Member Keluar ({prefix}out / {prefix}setout)
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Kirim pesan otomatis saat anggota keluar dari grup
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    groupSettings: {
                      ...config.groupSettings,
                      goodbye: !config.groupSettings.goodbye,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  config.groupSettings.goodbye
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {config.groupSettings.goodbye ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Tanda Baca Otomatis (Auto-Read)
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tandai pesan perintah masuk sebagai terbaca di WhatsApp
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({ autoRead: !config.autoRead })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  config.autoRead
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {config.autoRead ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>
          </div>
        </div>

        {/* Personal Creator Corner Card (Inspired by gepacorner.my.id) */}
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3.5">
            <GepaCreatorAvatar className="w-12 h-12" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Gepa — Personal Corner
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Ruang utilitas bot WhatsApp pribadi & komunitas
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Dirancang senada dengan ruang personal{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">
              gepacorner.my.id
            </strong>{' '}
            — ringan, rapi, dan langsung siap dipakai mengunduh video maupun
            membuat stiker harian hanya dengan satu tanda titik.
          </p>

          <a
            href="https://gepacorner.my.id"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            Kunjungi gepacorner.my.id
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
