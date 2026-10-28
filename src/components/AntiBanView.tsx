import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Flame,
  Info,
  Lock,
  PhoneOff,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react';
import type { AntiBanConfig, BotConfig, BrowserProfileType } from '../shared/types.ts';

interface AntiBanViewProps {
  config: BotConfig;
  stats?: {
    totalCommands: number;
    stickersCreated: number;
    mediaDownloaded: number;
    linksModerated: number;
    antiBan?: {
      throttledSpams: number;
      callsDeclined: number;
      hidetagProtected: number;
    };
  };
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
}

export function AntiBanView({ config, stats, onUpdateConfig }: AntiBanViewProps) {
  const antiBan = config.antiBan;

  const [copiedAppeal, setCopiedAppeal] = useState<string | null>(null);
  const [savingNotice, setSavingNotice] = useState(false);

  // Form local state
  const [enabled, setEnabled] = useState(antiBan?.enabled ?? true);
  const [warmUpMode, setWarmUpMode] = useState(antiBan?.warmUpMode ?? true);
  const [humanizeTyping, setHumanizeTyping] = useState(antiBan?.humanizeTyping ?? true);
  const [minDelay, setMinDelay] = useState(antiBan?.minTypingDelayMs ?? 1800);
  const [maxDelay, setMaxDelay] = useState(antiBan?.maxTypingDelayMs ?? 3800);
  const [userCooldown, setUserCooldown] = useState(antiBan?.userCooldownSeconds ?? 6);
  const [maxCmdPerMin, setMaxCmdPerMin] = useState(antiBan?.maxCommandsPerMinutePerUser ?? 4);
  const [hidetagCooldown, setHidetagCooldown] = useState(antiBan?.hidetagCooldownSeconds ?? 45);
  const [hidetagAdminOnly, setHidetagAdminOnly] = useState(antiBan?.hidetagAdminOnly ?? true);
  const [maxMentions, setMaxMentions] = useState(antiBan?.maxMentionsLimit ?? 40);
  const [autoRejectCalls, setAutoRejectCalls] = useState(antiBan?.autoRejectCalls ?? true);
  const [callNotice, setCallNotice] = useState(
    antiBan?.callRejectNotice ??
      'Maaf, bot ini berjalan secara otomatis dan tidak menerima panggilan telepon atau video WhatsApp.'
  );
  const [ownerOnlyMode, setOwnerOnlyMode] = useState(antiBan?.ownerOnlyMode ?? false);
  const [ownerNumber, setOwnerNumber] = useState(antiBan?.ownerNumber ?? '');
  const [browserProfile, setBrowserProfile] = useState<BrowserProfileType>(
    antiBan?.browserProfile ?? 'windows_chrome'
  );
  const [lockSettingsManualOnly, setLockSettingsManualOnly] = useState(
    config.lockSettingsManualOnly ?? true
  );

  // Sync when config changes
  React.useEffect(() => {
    setLockSettingsManualOnly(config.lockSettingsManualOnly ?? true);
    if (config.antiBan) {
      setEnabled(config.antiBan.enabled);
      setWarmUpMode(config.antiBan.warmUpMode);
      setHumanizeTyping(config.antiBan.humanizeTyping);
      setMinDelay(config.antiBan.minTypingDelayMs);
      setMaxDelay(config.antiBan.maxTypingDelayMs);
      setUserCooldown(config.antiBan.userCooldownSeconds);
      setMaxCmdPerMin(config.antiBan.maxCommandsPerMinutePerUser);
      setHidetagCooldown(config.antiBan.hidetagCooldownSeconds);
      setHidetagAdminOnly(config.antiBan.hidetagAdminOnly);
      setMaxMentions(config.antiBan.maxMentionsLimit);
      setAutoRejectCalls(config.antiBan.autoRejectCalls);
      setCallNotice(config.antiBan.callRejectNotice);
      setOwnerOnlyMode(config.antiBan.ownerOnlyMode);
      setOwnerNumber(config.antiBan.ownerNumber);
      setBrowserProfile(config.antiBan.browserProfile);
    }
  }, [config.antiBan, config.lockSettingsManualOnly]);

  // Risk calculation
  const calculateRisk = () => {
    if (!enabled) return { level: 'high', label: 'Risiko Sangat Tinggi', color: 'text-rose-500' };
    let score = 0;
    if (warmUpMode) score += 3;
    if (lockSettingsManualOnly) score += 2;
    if (humanizeTyping && minDelay >= 1500) score += 2;
    if (userCooldown >= 5) score += 2;
    if (hidetagAdminOnly && hidetagCooldown >= 30) score += 2;
    if (autoRejectCalls) score += 1;
    if (browserProfile !== 'ubuntu_chrome') score += 1;
    if (ownerOnlyMode) score += 3;

    if (score >= 9) return { level: 'low', label: 'Tingkat Risiko Rendah (Aman)', color: 'text-emerald-500' };
    if (score >= 5) return { level: 'medium', label: 'Tingkat Risiko Sedang (Waspada)', color: 'text-amber-500' };
    return { level: 'high', label: 'Tingkat Risiko Tinggi (Rawan Banned)', color: 'text-rose-500' };
  };

  const risk = calculateRisk();

  const handleApplyPreset = async (preset: 'warmup' | 'balanced' | 'stealth') => {
    let patch: Partial<AntiBanConfig> = {};
    if (preset === 'warmup') {
      patch = {
        enabled: true,
        warmUpMode: true,
        humanizeTyping: true,
        minTypingDelayMs: 2200,
        maxTypingDelayMs: 4400,
        userCooldownSeconds: 8,
        maxCommandsPerMinutePerUser: 3,
        hidetagCooldownSeconds: 60,
        hidetagAdminOnly: true,
        maxMentionsLimit: 30,
        autoRejectCalls: true,
        browserProfile: 'windows_chrome',
        ownerOnlyMode: false,
      };
    } else if (preset === 'balanced') {
      patch = {
        enabled: true,
        warmUpMode: false,
        humanizeTyping: true,
        minTypingDelayMs: 1400,
        maxTypingDelayMs: 3000,
        userCooldownSeconds: 5,
        maxCommandsPerMinutePerUser: 5,
        hidetagCooldownSeconds: 35,
        hidetagAdminOnly: true,
        maxMentionsLimit: 45,
        autoRejectCalls: true,
        browserProfile: 'windows_chrome',
        ownerOnlyMode: false,
      };
    } else if (preset === 'stealth') {
      patch = {
        enabled: true,
        warmUpMode: true,
        humanizeTyping: true,
        minTypingDelayMs: 2500,
        maxTypingDelayMs: 5000,
        userCooldownSeconds: 10,
        maxCommandsPerMinutePerUser: 3,
        hidetagCooldownSeconds: 60,
        hidetagAdminOnly: true,
        maxMentionsLimit: 25,
        autoRejectCalls: true,
        browserProfile: 'macos_safari',
        ownerOnlyMode: true,
      };
    }

    await onUpdateConfig({
      antiBan: {
        ...antiBan,
        ...patch,
      },
    });

    setSavingNotice(true);
    setTimeout(() => setSavingNotice(false), 2000);
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      lockSettingsManualOnly,
      antiBan: {
        enabled,
        warmUpMode,
        humanizeTyping,
        minTypingDelayMs: Number(minDelay),
        maxTypingDelayMs: Math.max(Number(maxDelay), Number(minDelay) + 400),
        userCooldownSeconds: Number(userCooldown),
        maxCommandsPerMinutePerUser: Number(maxCmdPerMin),
        hidetagCooldownSeconds: Number(hidetagCooldown),
        hidetagAdminOnly,
        maxMentionsLimit: Number(maxMentions),
        autoRejectCalls,
        callRejectNotice: callNotice.trim(),
        ownerOnlyMode,
        ownerNumber: ownerNumber.trim(),
        browserProfile,
      },
    });
    setSavingNotice(true);
    setTimeout(() => setSavingNotice(false), 2000);
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedAppeal(id);
    setTimeout(() => setCopiedAppeal(null), 2500);
  };

  const idAppealText = `Kepada Tim Dukungan WhatsApp,

Saya memohon peninjauan ulang terhadap pemblokiran nomor WhatsApp saya: +[NOMOR_ANDA].
Nomor ini saya gunakan untuk keperluan komunikasi komunitas dan kegiatan sehari-hari. Saya tidak bermaksud melakukan spam ataupun melanggar Ketentuan Layanan WhatsApp.

Apabila terdapat aktivitas otomatis atau pesan berulang dari perangkat saya yang memicu filter sistem, saya meminta maaf sebesar-besarnya dan memastikan hal tersebut tidak akan terulang kembali. Saya sangat bergantung pada nomor ini untuk terhubung dengan keluarga dan rekan kerja.

Mohon bantuannya untuk mengaktifkan kembali akun WhatsApp saya. Terima kasih atas perhatian dan bantuannya.

Hormat saya,
[NAMA LENGKAP ANDA]`;

  const enAppealText = `Dear WhatsApp Support Team,

I kindly request a review of the ban on my WhatsApp phone number: +[YOUR_PHONE_NUMBER].
This number is my primary personal line used for staying in touch with family, friends, and community members. I did not intentionally violate the WhatsApp Terms of Service or engage in spamming.

If automated activity from my device inadvertently triggered your security filters, I sincerely apologize and assure you that all guidelines will be strictly adhered to moving forward. 

I kindly request your assistance in unbanning my account. Thank you very much for your time and understanding.

Sincerely,
[YOUR FULL NAME]`;

  return (
    <div className="space-y-8">
      {/* Top Banner: Status & Risk Assessment */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                risk.level === 'low'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : risk.level === 'medium'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              }`}
            >
              {risk.level === 'low' ? (
                <ShieldCheck className="w-8 h-8" />
              ) : risk.level === 'medium' ? (
                <Shield className="w-8 h-8" />
              ) : (
                <ShieldAlert className="w-8 h-8" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Perisai Anti-Ban WhatsApp
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {enabled ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-zinc-900 dark:text-zinc-100">
                Pusat Keamanan &amp; Perlindungan Nomor WA
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                Mencegah nomor bot terkena pemblokiran (banned) dengan sistem delay alami manusia, batas antrean anti-spam, proteksi hidetag grup, penolakan panggilan otomatis, dan mode pemanasan khusus nomor baru.
              </p>
            </div>
          </div>

          {/* Risk Level Badge */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 min-w-[220px]">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Status Keamanan Akun</div>
              <div className={`text-base font-semibold flex items-center gap-2 mt-0.5 ${risk.color}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
                {risk.label}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {warmUpMode ? 'Mode Pemanasan Aktif (+Delay)' : 'Mode Standar'}
              </div>
            </div>
          </div>
        </div>

        {/* 1-Click Fast Presets */}
        <div className="mt-8 pt-6 border-t border-zinc-200/80 dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
            Pilih Profil Keamanan Cepat (1-Klik)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleApplyPreset('warmup')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                warmUpMode && !ownerOnlyMode
                  ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Mode Pemanasan (Nomor Baru)
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                <strong className="text-emerald-600 dark:text-emerald-400">Sangat Direkomendasikan</strong> untuk nomor baru atau yang pernah terkena banned. Delay ekstra 2.2s - 4.4s.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleApplyPreset('balanced')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                !warmUpMode && !ownerOnlyMode
                  ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Mode Standar Seimbang
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                Untuk nomor yang sudah berumur &gt; 30 hari. Delay 1.4s - 3.0s, respon cepat namun tetap aman dari deteksi burst robot.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleApplyPreset('stealth')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                ownerOnlyMode
                  ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Mode Stealth (Owner Saja)
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                Hanya merespon pesan dari Anda (Owner). Orang lain di grup diabaikan tanpa respon. Sangat aman saat uji coba bot.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Security Counter Metrics (Zero-Pill Tabular Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Spam Dibendung</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {stats?.antiBan?.throttledSpams ?? 0}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Pesan cepat berulang dari pengguna yang berhasil diredam agar WhatsApp tidak menandai bot sebagai spammer.
          </p>
        </div>

        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Panggilan WA Ditolak</span>
            <PhoneOff className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {stats?.antiBan?.callsDeclined ?? 0}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Panggilan telepon &amp; video masuk yang otomatis ditolak halus agar tidak mengacaukan koneksi Baileys socket.
          </p>
        </div>

        <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Hidetag Massal Diamankan</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {stats?.antiBan?.hidetagProtected ?? 0}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Jumlah hidetag yang telah dibatasi jeda dan kuota mention-nya agar tidak memicu deteksi spam broadcast WhatsApp.
          </p>
        </div>
      </div>

      {/* Configuration Form & Educational Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Detailed Anti-Ban Settings */}
        <form
          onSubmit={handleSaveAll}
          className="lg:col-span-7 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100">
                Pengaturan Presisi Keamanan
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sesuaikan parameter proteksi sesuai usia nomor dan kebutuhan grup Anda.
              </p>
            </div>
            {savingNotice && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Tersimpan
              </span>
            )}
          </div>

          {/* Master Switch */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900 flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer">
                Aktifkan Perisai Anti-Ban (Master Switch)
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Wajib aktif untuk menerapkan seluruh lapisan perlindungan di bawah.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800 cursor-pointer"
            />
          </div>

          {/* Warm-Up Mode Switch */}
          <div className="p-4 rounded-xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-500/5 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer">
                  Mode Pemanasan (Warm-Up Mode)
                </label>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <strong>Wajib untuk nomor yang berumur di bawah 14-30 hari</strong> atau nomor yang baru saja didaftarkan. Menambahkan jeda waktu ekstra pada setiap balasan pesan dan stiker sehingga menyerupai interaksi manusia asli.
              </p>
            </div>
            <input
              type="checkbox"
              checked={warmUpMode}
              onChange={(e) => setWarmUpMode(e.target.checked)}
              className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500 dark:bg-zinc-800 cursor-pointer shrink-0 mt-0.5"
            />
          </div>

          {/* Lock Settings Manual Only Mode Switch */}
          <div className="p-4 rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-500/5 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer">
                  Kunci Pengaturan: Hanya Manual via Web Panel
                </label>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Mencegah bot mengubah setelan grup (buka/tutup chat grup, ganti nama/deskripsi grup, reset tautan undangan, antilink, welcome, template) via chat WhatsApp. Seluruh setelan <strong>HANYA bisa diubah secara manual melalui Dashboard ini</strong> demi menjaga keamanan akun dan grup.
              </p>
            </div>
            <input
              type="checkbox"
              checked={lockSettingsManualOnly}
              onChange={(e) => setLockSettingsManualOnly(e.target.checked)}
              className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800 cursor-pointer shrink-0 mt-0.5"
            />
          </div>

          {/* Browser Profile Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Identitas Peramban (Browser Profile / Client Signature)
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Server WhatsApp memeriksa apakah koneksi berasal dari Chrome/Edge resmi. Menggunakan signature Linux bot default Baileys rentan dicurigai.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {[
                { id: 'windows_chrome', label: 'Windows 11 — Google Chrome', desc: 'Paling umum & paling dipercaya' },
                { id: 'macos_safari', label: 'macOS Sequoia — Apple Safari', desc: 'Sangat aman & organik' },
                { id: 'windows_edge', label: 'Windows 11 — Microsoft Edge', desc: 'Identitas desktop terpercaya' },
                { id: 'ubuntu_chrome', label: 'Ubuntu Linux — Chrome (Bawaan)', desc: 'Sering dicurigai jika nomor baru' },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBrowserProfile(b.id as BrowserProfileType)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    browserProfile === b.id
                      ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{b.label}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Humanized Delays */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Simulasi Mengetik &amp; Jeda Alami (Humanized Delay)
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Mengirim status &quot;sedang mengetik...&quot; (typing) atau &quot;merekam audio...&quot; sebelum mengirim pesan.
                </p>
              </div>
              <input
                type="checkbox"
                checked={humanizeTyping}
                onChange={(e) => setHumanizeTyping(e.target.checked)}
                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Jeda Minimal (Milidetik)</span>
                <input
                  type="number"
                  min={800}
                  max={6000}
                  step={100}
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-[11px] text-zinc-400 mt-1 block">Rekomendasi: 1500 - 2000 ms</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Jeda Maksimal (Milidetik)</span>
                <input
                  type="number"
                  min={1200}
                  max={10000}
                  step={100}
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-[11px] text-zinc-400 mt-1 block">Rekomendasi: 3000 - 4500 ms</span>
              </div>
            </div>
          </div>

          {/* Rate Limiting per User */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              Batas Spam Per Pengirim (Anti-Flood Cooldown)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Cooldown Perintah (Detik)</span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={userCooldown}
                  onChange={(e) => setUserCooldown(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-[11px] text-zinc-400 mt-1 block">Jeda antar command dari 1 orang</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Maksimal Command / Menit</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={maxCmdPerMin}
                  onChange={(e) => setMaxCmdPerMin(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-[11px] text-zinc-400 mt-1 block">Rekomendasi nomor baru: 3-4</span>
              </div>
            </div>
          </div>

          {/* Group & Hidetag Security */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              Keamanan Grup &amp; Pembatasan Hidetag
            </label>
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Hidetag Khusus Admin Grup Asli (Cegah Member Iseng)
                </span>
                <input
                  type="checkbox"
                  checked={hidetagAdminOnly}
                  onChange={(e) => setHidetagAdminOnly(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800"
                />
              </label>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Cooldown Hidetag (Detik)</span>
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={hidetagCooldown}
                    onChange={(e) => setHidetagCooldown(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-mono"
                  />
                </div>
                <div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Batas Maks Mention</span>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={maxMentions}
                    onChange={(e) => setMaxMentions(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Auto Reject WhatsApp Calls */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Tolak Otomatis Panggilan Telepon / Video WA
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Menghindari panggilan iseng yang memutus koneksi server socket Baileys.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoRejectCalls}
                onChange={(e) => setAutoRejectCalls(e.target.checked)}
                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800 cursor-pointer"
              />
            </div>
            {autoRejectCalls && (
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Pesan Ramah Penolakan Panggilan</span>
                <input
                  type="text"
                  value={callNotice}
                  onChange={(e) => setCallNotice(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>
            )}
          </div>

          {/* Owner Only Mode */}
          <div className="space-y-3 pt-2">
            <div className="p-4 rounded-xl border border-purple-200/70 dark:border-purple-900/40 bg-purple-500/5 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    Mode Khusus Owner (Self-Only / Single User)
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                    Saat aktif, bot HANYA menjawab perintah dari nomor WhatsApp Anda sendiri. Pesan dari orang lain diabaikan diam-diam.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={ownerOnlyMode}
                  onChange={(e) => setOwnerOnlyMode(e.target.checked)}
                  className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 dark:bg-zinc-800 cursor-pointer shrink-0"
                />
              </label>

              {ownerOnlyMode && (
                <div>
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Nomor WhatsApp Pemilik (Owner)
                  </span>
                  <input
                    type="text"
                    placeholder="Contoh: 6281234567890"
                    value={ownerNumber}
                    onChange={(e) => setOwnerNumber(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                  />
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                    Gunakan kode negara (awalan 62). Bot juga selalu menerima perintah dari nomor HP yang discan sendiri.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Konfigurasi tersimpan otomatis ke file konfigurasi server.
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white font-medium text-xs hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Simpan Pengaturan Keamanan
            </button>
          </div>
        </form>

        {/* Right 5 Cols: Educational SOP & Banned Recovery Guide */}
        <div className="lg:col-span-5 space-y-6">
          {/* Why Was My Number Banned Box */}
          <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold uppercase tracking-wider font-display">
                Kenapa 2 Nomor Sebelumnya Kebanned?
              </h4>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Algoritma AI WhatsApp mendeteksi bot melalui 4 pemicu utama (bukan sekadar karena Baileys):
            </p>

            <ul className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                  1
                </span>
                <div>
                  <strong className="text-zinc-900 dark:text-zinc-100">Nomor Baru Belum Memiliki Reputasi:</strong>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Nomor berumur &lt; 14 hari yang langsung mengirim media/stiker ke banyak orang tanpa ada riwayat obrolan timbal balik akan langsung diblokir sistem otomatis.
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                  2
                </span>
                <div>
                  <strong className="text-zinc-900 dark:text-zinc-100">Spam Hidetag &amp; Mention Massal:</strong>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Men-tag 50-200 orang di grup dalam hitungan detik memicu sensor broadcast spam WhatsApp server-side seketika.
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                  3
                </span>
                <div>
                  <strong className="text-zinc-900 dark:text-zinc-100">Laporan Tombol &quot;Laporkan Spam&quot;:</strong>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Jika bot dimasukkan ke grup orang asing dan mereka menekan tombol &quot;Report / Laporkan Spam&quot;, cukup 3 laporan untuk membuat nomor dibanned permanen.
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                  4
                </span>
                <div>
                  <strong className="text-zinc-900 dark:text-zinc-100">Kecepatan Respons Instan Robot:</strong>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Manusia membutuhkan waktu 1-3 detik untuk mengetik. Bot tanpa jeda mengetik (composing delay) mudah teridentifikasi mesin deteksi spam.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Golden Rules Checklist */}
          <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold uppercase tracking-wider font-display">
                Checklist 7 Hari Pertama Nomor Bot
              </h4>
            </div>

            <div className="space-y-2.5 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Gunakan nomor yang <strong>sudah disimpan saling kontak</strong> dengan minimal 5 nomor teman/keluarga.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Pasang Foto Profil, Nama Akun, dan Bio WhatsApp di aplikasi HP asli sebelum melakukan scan.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Nyalakan <strong>Mode Pemanasan</strong> selama minimal 14 hari pertama.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Jangan langsung masukkan bot ke lebih dari 1 grup di 3 hari pertama.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Jangan spam command <code>.hidetag</code> atau <code>.antilink</code> beruntun.</span>
              </div>
            </div>
          </div>

          {/* Banned Appeal Letter Templates */}
          <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <Info className="w-5 h-5 text-blue-500 shrink-0" />
              <h4 className="text-sm font-bold font-display">
                Template Surat Banding Unban Resmi
              </h4>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Jika nomor Anda baru saja terblokir (&quot;Akun ini tidak diizinkan menggunakan WhatsApp&quot;), kirim email ke{' '}
              <strong className="text-zinc-800 dark:text-zinc-200 font-mono">support@whatsapp.com</strong> atau ajukan tinjauan langsung di aplikasi WhatsApp menggunakan template berikut:
            </p>

            <div className="space-y-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Template Bahasa Indonesia (Banding Resmi)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(idAppealText, 'id')}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {copiedAppeal === 'id' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Tersalin!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Salin Teks
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                  {idAppealText}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Template Bahasa Inggris (Proses Cepat Global)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(enAppealText, 'en')}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {copiedAppeal === 'en' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Tersalin!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Salin Teks
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                  {enAppealText}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
