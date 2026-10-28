import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Moon, Save, ShieldCheck, Sun } from 'lucide-react';
import {
  formatPhoneDisplay,
  OFFICIAL_OWNER_NUMBER,
} from '../shared/commands.ts';
import type { BotConfig } from '../shared/types.ts';

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
  const [ownerName, setOwnerName] = useState(config.ownerName || 'Owner Bot');
  const [ownerNumber, setOwnerNumber] = useState(
    config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
  );
  const [stickerPackName, setStickerPackName] = useState(config.stickerPackName);
  const [stickerAuthor, setStickerAuthor] = useState(config.stickerAuthor);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setPrefix(config.prefix);
    setBotName(config.botName);
    setOwnerName(config.ownerName || 'Owner Bot');
    setOwnerNumber(config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER);
    setStickerPackName(config.stickerPackName);
    setStickerAuthor(config.stickerAuthor);
  }, [config]);

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawDigits = ownerNumber.replace(/[^0-9]/g, '');
    const normalizedOwner = rawDigits.startsWith('08')
      ? `62${rawDigits.slice(1)}`
      : rawDigits || OFFICIAL_OWNER_NUMBER;

    await onUpdateConfig({
      prefix: prefix.trim() || '.',
      botName: botName.trim() || 'WABot',
      ownerName: ownerName.trim() || 'Owner Bot',
      ownerWebsite: `wa.me/${normalizedOwner}`,
      stickerPackName: stickerPackName.trim() || 'WA Sticker',
      stickerAuthor: stickerAuthor.trim() || normalizedOwner,
      antiBan: {
        ...config.antiBan,
        ownerNumber: normalizedOwner,
      },
    });
    setOwnerNumber(normalizedOwner);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  const activeOwnerDigits =
    (config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(
      /[^0-9]/g,
      ''
    ) || OFFICIAL_OWNER_NUMBER;
  const activeOwnerDisplay = formatPhoneDisplay(activeOwnerDigits);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Columns: Prefix, Bot & Owner Identity, Sticker EXIF */}
      <form
        onSubmit={handleSaveIdentity}
        className="lg:col-span-7 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Identitas Bot, Nomor Owner &amp; Metadata Stiker
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Atur awalan karakter perintah, nomor WhatsApp Owner utama, serta EXIF paket stiker.
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
              Contoh panggil: <code className="font-mono">{prefix || '.'}menu</code>,{' '}
              <code className="font-mono">{prefix || '.'}tt</code>,{' '}
              <code className="font-mono">{prefix || '.'}owner</code>
            </span>
          </div>
        </div>

        {/* Bot Name, Owner Name & Number, Sticker EXIF */}
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
              Nama Owner Bot
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Nomor WhatsApp Owner (Kode 62)
            </label>
            <input
              type="tel"
              value={ownerNumber}
              onChange={(e) => setOwnerNumber(e.target.value)}
              placeholder="6289673533963"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Metadata stiker tertanam otomatis pada setiap hasil {prefix}s,{' '}
            {prefix}qc, dan {prefix}brat.
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

      {/* Right 5 Columns: Moderation Switches & Official Bot Owner Card */}
      <div className="lg:col-span-5 space-y-6">
        {/* Behavior & Appearance Toggles */}
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Preferensi Ruang &amp; Moderasi
          </h3>

          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Tema Antarmuka Panel
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Pilih tampilan terang bersih atau mode gelap nyaman
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

            {/* Kunci Pengaturan Hanya Manual */}
            <div className="py-3.5 flex items-start justify-between gap-4 bg-emerald-500/5 -mx-2 px-3 rounded-xl border border-emerald-500/20 my-1">
              <div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Kunci Pengaturan: Hanya Manual via Web Panel
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  Mencegah bot mengubah setelan grup (buka/tutup chat grup, ganti nama/deskripsi, ubah link, antilink, welcome) via chat WhatsApp. Semua setelan dikontrol manual dari panel ini.
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    lockSettingsManualOnly: !config.lockSettingsManualOnly,
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 mt-0.5 ${
                  config.lockSettingsManualOnly
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {config.lockSettingsManualOnly ? 'Terkunci (Aman)' : 'Bebas'}
              </button>
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

        {/* Official Bot Owner Information Card */}
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {config.ownerName || 'Owner Bot'}
              </div>
              <div className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                {activeOwnerDisplay}
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Nomor <strong className="font-mono text-zinc-900 dark:text-zinc-100">{activeOwnerDigits}</strong> ditetapkan sebagai Owner utama bot: bebas dari antrean cooldown anti-spam, tetap diizinkan saat Mode Stealth (Owner Saja) menyala, memiliki hak penuh perintah admin grup, serta tampil otomatis saat pengguna mengetik <code className="font-mono">{prefix}owner</code>.
          </p>

          <a
            href={`https://wa.me/${activeOwnerDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            Chat Owner (wa.me/{activeOwnerDigits})
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
