import React, { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  ExternalLink,
  Moon,
  RefreshCw,
  Save,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { buildApiUrl } from '../lib/apiBase.ts';
import {
  DEFAULT_AI_ENHANCE_CONFIG,
  formatPhoneDisplay,
  OFFICIAL_OWNER_NUMBER,
} from '../shared/commands.ts';
import type { AiFaceModel, AiSrModel, BotConfig } from '../shared/types.ts';

interface AiGpuProbeState {
  checking: boolean;
  checked: boolean;
  ok: boolean;
  reachable: boolean;
  device?: string;
  gpuName?: string | null;
  vramTotalGb?: number | null;
  fp16?: boolean;
  latencyMs?: number;
  botActiveJobs?: number;
  botQueuedJobs?: number;
  apiKeyConfigured?: boolean;
  error?: string;
}

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

  const aiCfg = config.aiEnhance || DEFAULT_AI_ENHANCE_CONFIG;
  const [aiServiceUrl, setAiServiceUrl] = useState(aiCfg.serviceUrl);
  const [aiSrModel, setAiSrModel] = useState<AiSrModel>(
    aiCfg.preferredSrModel || 'ultrasharp'
  );
  const [aiFaceModel, setAiFaceModel] = useState<AiFaceModel>(
    aiCfg.preferredFaceModel
  );
  const [aiFidelity, setAiFidelity] = useState(aiCfg.faceFidelity);
  const [aiDefaultScale, setAiDefaultScale] = useState<2 | 4>(
    aiCfg.defaultScale
  );
  const [aiMaxConcurrent, setAiMaxConcurrent] = useState(
    aiCfg.maxConcurrentJobs
  );
  const [aiMaxQueue, setAiMaxQueue] = useState(aiCfg.maxQueueSize);
  const [aiTimeoutSec, setAiTimeoutSec] = useState(
    Math.round((aiCfg.timeoutMs || 90000) / 1000)
  );
  const [aiMaxFileMb, setAiMaxFileMb] = useState(aiCfg.maxFileSizeMb);
  const [aiSavedNotice, setAiSavedNotice] = useState(false);
  const [gpuProbe, setGpuProbe] = useState<AiGpuProbeState>({
    checking: false,
    checked: false,
    ok: false,
    reachable: false,
  });

  useEffect(() => {
    setPrefix(config.prefix);
    setBotName(config.botName);
    setOwnerName(config.ownerName || 'Owner Bot');
    setOwnerNumber(config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER);
    setStickerPackName(config.stickerPackName);
    setStickerAuthor(config.stickerAuthor);

    const nextAi = config.aiEnhance || DEFAULT_AI_ENHANCE_CONFIG;
    setAiServiceUrl(nextAi.serviceUrl);
    setAiSrModel(nextAi.preferredSrModel || 'ultrasharp');
    setAiFaceModel(nextAi.preferredFaceModel);
    setAiFidelity(nextAi.faceFidelity);
    setAiDefaultScale(nextAi.defaultScale);
    setAiMaxConcurrent(nextAi.maxConcurrentJobs);
    setAiMaxQueue(nextAi.maxQueueSize);
    setAiTimeoutSec(Math.round((nextAi.timeoutMs || 90000) / 1000));
    setAiMaxFileMb(nextAi.maxFileSizeMb);
  }, [config]);

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentAi = config.aiEnhance || DEFAULT_AI_ENHANCE_CONFIG;
    await onUpdateConfig({
      aiEnhance: {
        ...currentAi,
        serviceUrl: aiServiceUrl.trim().replace(/\/+$/, ''),
        preferredSrModel: aiSrModel,
        preferredFaceModel: aiFaceModel,
        faceFidelity: Math.min(0.98, Math.max(0.05, Number(aiFidelity) || 0.72)),
        defaultScale: aiDefaultScale,
        maxConcurrentJobs: Math.min(
          8,
          Math.max(1, Math.round(Number(aiMaxConcurrent) || 2))
        ),
        maxQueueSize: Math.min(
          60,
          Math.max(1, Math.round(Number(aiMaxQueue) || 15))
        ),
        timeoutMs:
          Math.min(300, Math.max(10, Math.round(Number(aiTimeoutSec) || 90))) *
          1000,
        maxFileSizeMb: Math.min(
          30,
          Math.max(1, Math.round(Number(aiMaxFileMb) || 15))
        ),
      },
    });
    setAiSavedNotice(true);
    setTimeout(() => setAiSavedNotice(false), 2200);
  };

  const handleProbeAiGpu = async () => {
    setGpuProbe((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch(buildApiUrl('/api/ai-enhance/status'));
      const data = (await res.json()) as Partial<AiGpuProbeState>;
      setGpuProbe({
        checking: false,
        checked: true,
        ok: Boolean(data.ok),
        reachable: Boolean(data.reachable),
        device: data.device,
        gpuName: data.gpuName,
        vramTotalGb: data.vramTotalGb,
        fp16: data.fp16,
        latencyMs: data.latencyMs,
        botActiveJobs: data.botActiveJobs,
        botQueuedJobs: data.botQueuedJobs,
        apiKeyConfigured: data.apiKeyConfigured,
        error: data.error,
      });
    } catch {
      setGpuProbe({
        checking: false,
        checked: true,
        ok: false,
        reachable: false,
        error: 'Gagal menghubungi endpoint pengecekan server bot.',
      });
    }
  };

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
                  Kunci Pengaturan Grup &amp; Akun: Hanya Manual
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  Bot dikunci agar tidak bisa mengubah setelan grup (buka/tutup grup, ganti nama/deskripsi, reset link, antilink, welcome, template) via chat WA, serta tidak pernah mengubah profil, bio, foto profil, maupun privasi nomor bot sendiri.
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

      {/* Full-Width 12 Columns: AI Photo Enhancement Pipeline (Python FastAPI GPU Service) */}
      <form
        onSubmit={handleSaveAiConfig}
        className="lg:col-span-12 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-zinc-200/70 dark:border-zinc-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Pipeline AI Photo Enhancement (FastAPI GPU)
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Pengaturan model pretrained Real-ESRGAN, CodeFormer, GFPGAN, dan SCUNet/NAFNet untuk perintah{' '}
              <code className="font-mono">{prefix}hd</code>,{' '}
              <code className="font-mono">{prefix}remini</code>,{' '}
              <code className="font-mono">{prefix}upscale</code>,{' '}
              <code className="font-mono">{prefix}hd2</code>, dan{' '}
              <code className="font-mono">{prefix}hd4</code> tanpa mengedit kode sumber.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleProbeAiGpu()}
            disabled={gpuProbe.checking}
            className="px-4 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {gpuProbe.checking ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Activity className="w-3.5 h-3.5" />
            )}
            Cek Status Server GPU
          </button>
        </div>

        {gpuProbe.checked && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 border-b border-zinc-200/70 dark:border-zinc-800">
            <span
              className={
                gpuProbe.ok
                  ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                  : 'font-semibold text-amber-700 dark:text-amber-400'
              }
            >
              {gpuProbe.ok ? 'Terhubung ke FastAPI GPU' : 'Layanan GPU Belum Aktif'}
            </span>
            <span aria-hidden="true">·</span>
            {gpuProbe.ok ? (
              <>
                <span className="font-mono">
                  {gpuProbe.gpuName || gpuProbe.device || 'CPU/GPU'}
                </span>
                {typeof gpuProbe.vramTotalGb === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      VRAM {gpuProbe.vramTotalGb.toFixed(1)} GB
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  {gpuProbe.fp16 ? 'FP16 Aktif' : 'FP32'}
                </span>
                {typeof gpuProbe.latencyMs === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Respons {gpuProbe.latencyMs} ms
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>{gpuProbe.error || 'Endpoint belum terjangkau.'}</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Antrean Bot: {gpuProbe.botActiveJobs ?? 0} proses /{' '}
              {gpuProbe.botQueuedJobs ?? 0} tunggu
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left 7 cols: Endpoint, Model Selectors & Fidelity Slider */}
          <div className="md:col-span-7 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Endpoint HTTP Layanan Python FastAPI GPU
              </label>
              <input
                type="url"
                value={aiServiceUrl}
                onChange={(e) => setAiServiceUrl(e.target.value)}
                placeholder="http://127.0.0.1:8001"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Autentikasi antar-server dibaca otomatis di sisi backend melalui variabel lingkungan{' '}
                <code className="font-mono">AI_ENHANCE_API_KEY</code> tanpa pernah dicatat ke log.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Mesin Super-Resolution (Upscaler AI)
                </label>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200/50 dark:border-emerald-800/40">
                  {aiSrModel === 'ultrasharp' ? 'Super Ajib' : 'Standar'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAiSrModel('ultrasharp')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-left flex flex-col gap-0.5 ${
                    aiSrModel === 'ultrasharp'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-emerald-500/40'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    4x-UltraSharp
                    <span className="text-[10px] font-normal px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      Rekomendasi
                    </span>
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Detail mikro tajam, anti-blur &amp; tekstur super ajib
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiSrModel('realesrgan')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-left flex flex-col gap-0.5 ${
                    aiSrModel === 'realesrgan'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-400/40 dark:border-zinc-700'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Real-ESRGAN x4plus
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Mesin standar Xinntao untuk perbesaran umum
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Model Restorasi Wajah Utama
                </label>
                <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setAiFaceModel('codeformer')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      aiFaceModel === 'codeformer'
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    CodeFormer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiFaceModel('gfpgan')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      aiFaceModel === 'gfpgan'
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    GFPGAN v1.4
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Skala Upscale Bawaan ({prefix}hd &amp; {prefix}upscale)
                </label>
                <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setAiDefaultScale(2)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap ${
                      aiDefaultScale === 2
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Real-ESRGAN 2×
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiDefaultScale(4)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap ${
                      aiDefaultScale === 4
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Real-ESRGAN 4×
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Kontrol Fidelity Identitas Wajah (w)
                </label>
                <span className="text-xs font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {Number(aiFidelity).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.02}
                value={aiFidelity}
                onChange={(e) => setAiFidelity(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>0.10 (Restorasi Kuat)</span>
                <span>0.72 (Natural &amp; Identitas Terjaga)</span>
                <span>0.95 (Mirip Asli Maksimal)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Proses Paralel
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={aiMaxConcurrent}
                  onChange={(e) => setAiMaxConcurrent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Batas Antrean
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={aiMaxQueue}
                  onChange={(e) => setAiMaxQueue(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Timeout (Detik)
                </label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={aiTimeoutSec}
                  onChange={(e) => setAiTimeoutSec(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Maks File (MB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={aiMaxFileMb}
                  onChange={(e) => setAiMaxFileMb(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Right 5 cols: Adaptive Stage Switches */}
          <div className="md:col-span-5 divide-y divide-zinc-200/70 dark:divide-zinc-800 md:border-l md:border-zinc-200/70 md:dark:border-zinc-800 md:pl-6">
            <div className="py-3 first:pt-0 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Denoising Adaptif (SCUNet / NAFNet)
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Aktif hanya ketika detektor mendapati tingkat noise atau artefak JPEG tinggi
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    aiEnhance: {
                      ...aiCfg,
                      autoDenoise: !aiCfg.autoDenoise,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  aiCfg.autoDenoise
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {aiCfg.autoDenoise ? 'Adaptif' : 'Nonaktif'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Deblurring Adaptif (NAFNet)
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Pulihkan ketajaman tepi hanya bila skor ketajaman Laplacian di bawah ambang blur
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    aiEnhance: {
                      ...aiCfg,
                      autoDeblur: !aiCfg.autoDeblur,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  aiCfg.autoDeblur
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {aiCfg.autoDeblur ? 'Adaptif' : 'Nonaktif'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Notifikasi Status Pemrosesan WhatsApp
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Kirim pesan status saat foto masuk antrean atau sedang diproses GPU
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateConfig({
                    aiEnhance: {
                      ...aiCfg,
                      sendProgressNotice: !aiCfg.sendProgressNotice,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  aiCfg.sendProgressNotice
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {aiCfg.sendProgressNotice ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            <div className="pt-4 space-y-1.5">
              <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                Privasi &amp; Keamanan Penyimpanan Sementara
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Seluruh foto pengguna diproses di direktori sementara terisolasi dan langsung dihapus otomatis setelah hasil dikirim ke WhatsApp tanpa penyimpanan permanen.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-zinc-200/70 dark:border-zinc-800">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Pengguna juga dapat menyertakan override fidelity langsung di chat, misalnya{' '}
            <code className="font-mono">{prefix}remini 0.80</code> atau{' '}
            <code className="font-mono">{prefix}hd gfpgan</code>.
          </span>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {aiSavedNotice ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Tersimpan
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Simpan Pengaturan AI
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
