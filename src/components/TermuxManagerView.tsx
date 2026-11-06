import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  Globe,
  KeyRound,
  Lock,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Smartphone,
  Terminal,
} from 'lucide-react';
import type { BotConfig, WAConnectionState } from '../shared/types.ts';

interface TermuxManagerViewProps {
  waState: WAConnectionState;
  config: BotConfig;
  onNavigateToConnection?: () => void;
  onNavigateToCatalog?: () => void;
  onNavigateToTemplates?: () => void;
  onNavigateToSettings?: () => void;
}

interface NetworkInfoSnapshot {
  port: number;
  localhostUrl: string;
  lanUrls: string[];
  arch: string;
  platform: string;
  nodeVersion: string;
  imageBackend: string;
  memoryRssMb: number;
}

interface RemoteTunnelInfo {
  ok: boolean;
  status: 'stopped' | 'starting' | 'online' | 'error';
  provider: 'cloudflared' | 'ssh-localhost-run' | null;
  publicUrl: string | null;
  magicUrl: string | null;
  lanUrls: string[];
  localhostUrl: string;
  accessKey: string;
  autoStartTunnel: boolean;
  cloudflaredInstalled: boolean;
  lastError: string | null;
}

export function TermuxManagerView({
  waState,
  config,
  onNavigateToConnection,
  onNavigateToCatalog,
  onNavigateToTemplates,
  onNavigateToSettings,
}: TermuxManagerViewProps) {
  const [targetDevice, setTargetDevice] = useState<'reno5' | 'redmi9c'>('reno5');
  const [installMode, setInstallMode] = useState<'bundle' | 'git'>('git');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [netInfo, setNetInfo] = useState<NetworkInfoSnapshot | null>(null);
  const [remoteInfo, setRemoteInfo] = useState<RemoteTunnelInfo | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [isLocalNetworkHost, setIsLocalNetworkHost] = useState(false);

  const refreshRemoteInfo = async () => {
    try {
      const r = await fetch('/api/remote-tunnel');
      if (r.ok) {
        const data = (await r.json()) as RemoteTunnelInfo;
        setRemoteInfo(data);
      }
    } catch {
      // Ignore network hiccups
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      setIsLocalNetworkHost(
        h === 'localhost' ||
          h === '127.0.0.1' ||
          h.startsWith('192.168.') ||
          h.startsWith('10.') ||
          h.startsWith('172.') ||
          h.startsWith('100.')
      );
    }

    let cancelled = false;
    fetch('/api/network-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok) {
          setNetInfo(data as NetworkInfoSnapshot);
        }
      })
      .catch(() => {
        // Ignore when unreachable
      });

    void refreshRemoteInfo();
    const poll = setInterval(() => {
      void refreshRemoteInfo();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  const handleStartRemoteTunnel = async () => {
    setTunnelBusy(true);
    try {
      const r = await fetch('/api/remote-tunnel/start', { method: 'POST' });
      if (r.ok) {
        setRemoteInfo((await r.json()) as RemoteTunnelInfo);
      }
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopRemoteTunnel = async () => {
    setTunnelBusy(true);
    try {
      const r = await fetch('/api/remote-tunnel/stop', { method: 'POST' });
      if (r.ok) {
        setRemoteInfo((await r.json()) as RemoteTunnelInfo);
      }
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleRotateAccessKey = async () => {
    setTunnelBusy(true);
    try {
      const r = await fetch('/api/remote-tunnel/rotate-key', { method: 'POST' });
      if (r.ok) {
        setRemoteInfo((await r.json()) as RemoteTunnelInfo);
      }
    } finally {
      setTunnelBusy(false);
    }
  };

  const copyText = (key: string, value: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    }
  };

  const storageSetupCmd = 'termux-setup-storage';
  const bundleExtractRunCmd =
    'mkdir -p ~/wabot && tar -xzf ~/storage/downloads/wabot-redmi9c-ready.tar.gz -C ~/wabot && cd ~/wabot && bash termux.sh';

  const cleanRepoUrl =
    gitRepoUrl.trim() || 'https://github.com/USERNAME_KAMU/NAMA_REPO_BOT.git';
  const gitCloneRunCmd = `pkg update -y && pkg install -y git && rm -rf ~/wabot && git clone ${cleanRepoUrl} ~/wabot && cd ~/wabot && bash termux.sh ${targetDevice}`;
  const curlFastRunCmd = `curl -sL https://ais-pre-ytvmm2cbyqkygpp3brixzw-140858000053.asia-northeast1.run.app/termux-${targetDevice}.sh | bash`;
  const gitUpdateCmd =
    'cd ~/wabot && git pull && pm2 restart wabot';

  const lanExampleUrl =
    netInfo?.lanUrls && netInfo.lanUrls.length > 0
      ? netInfo.lanUrls[0]
      : 'http://192.168.1.X:3000';

  const cliShortcuts = [
    {
      cmd: 'bot',
      label: 'Menu Interaktif Lengkap',
      desc: 'Buka menu pilih angka (1-5) untuk cek IP WiFi, minta Pairing Code, ubah prefix, atau restart bot.',
    },
    {
      cmd: 'bot pair 6281234567890',
      label: 'Pairing WA Langsung',
      desc: 'Ganti ujungnya dengan nomor WA bot kamu untuk langsung mencetak 8-digit Pairing Code di layar Termux.',
    },
    {
      cmd: 'bot status',
      label: 'Cek Status, RAM & IP WiFi',
      desc: 'Menampilkan status tautan WA, konsumsi RAM Redmi 9C, dan alamat IP WiFi untuk dibuka dari HP utama.',
    },
    {
      cmd: `bot prefix ${config.prefix}`,
      label: 'Ubah Prefix Cepat',
      desc: 'Mengubah awalan perintah bot (. / ! / #) langsung dari terminal tanpa perlu membuka browser.',
    },
    {
      cmd: 'bot logs',
      label: 'Pantau Chat Masuk',
      desc: 'Melihat aktivitas pesan dan pembuatan stiker secara real-time (tekan CTRL + C untuk menutup tampilan log).',
    },
    {
      cmd: 'bot remote',
      label: 'Link Panel Luar Rumah (4G/5G)',
      desc: 'Mengaktifkan Cloudflare Tunnel di Redmi 9C agar Web Panel bisa dibuka dari HP kedua saat kamu pergi keluar rumah.',
    },
    {
      cmd: `bot owner ${config.antiBan?.ownerNumber || '6289673533963'}`,
      label: 'Daftarkan Nomor WA HP Kedua',
      desc: 'Agar kamu cukup kirim chat pribadi .panel dari HP utamamu ke bot untuk menerima tautan login otomatis.',
    },
    {
      cmd: 'bot restart',
      label: 'Muat Ulang Mesin Bot',
      desc: 'Merestart proses PM2 dengan batas aman memori 256 MB tanpa memutus sesi WhatsApp yang tersimpan.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section 1: Header & Hardware Audit Summary for Redmi 9C 3/32 */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Target Teruji: Xiaomi Redmi 9C (3GB RAM / 32GB ROM)</span>
              <span aria-hidden="true">·</span>
              <span>32-Bit ARMv7 &amp; 64-Bit Ready</span>
              {netInfo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    RAM Server {netInfo.memoryRssMb} MB ({netInfo.arch})
                  </span>
                </>
              )}
            </div>
            <h2 className="text-lg font-display font-bold text-zinc-900 dark:text-zinc-100">
              Instalasi Server Pribadi Termux 24/7 &amp; Pusat Kontrol Localhost
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Rancangan kode ini sudah diaudit khusus untuk arsitektur Android 32-bit (<code className="font-mono">armv7l</code>) pada MIUI 12 Redmi 9C: menggunakan engine stiker WebAssembly (<code className="font-mono">@resvg/resvg-wasm</code> + <code className="font-mono">ffmpeg</code>) tanpa modul C++ berat yang sering gagal install, serta batas memori hemat <code className="font-mono tabular-nums">256 MB</code> di PM2.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href="/api/termux-bundle.tar.gz"
              download="wabot-redmi9c-ready.tar.gz"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Unduh Paket Redmi 9C (.tar.gz)
            </a>
            {isLocalNetworkHost && onNavigateToConnection && (
              <button
                type="button"
                onClick={onNavigateToConnection}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                <Smartphone className="w-4 h-4" />
                {waState.status === 'connected'
                  ? 'Cek Sesi WA Aktif'
                  : 'Tautkan WA Sekarang'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section 1B: Dedicated Second-Phone Remote Access Control (Home Wi-Fi + Anywhere 4G/5G + .panel) */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Akses Web Panel dari HP Kedua / HP Utama (Tanpa Bawa-Bawa Redmi 9C)
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Tinggalkan Redmi 9C tetap tercolok charger di rumah. Kamu tetap bisa membuka seluruh menu panel, mengubah template grup, mematikan fitur, hingga cek status WA langsung dari browser HP utamamu — baik saat satu Wi-Fi di rumah maupun saat sedang di luar rumah pakai kuota 4G/5G.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {remoteInfo?.status === 'online' ? (
              <button
                type="button"
                disabled={tunnelBusy}
                onClick={handleStopRemoteTunnel}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <Power className="w-3.5 h-3.5 text-rose-500" />
                {tunnelBusy ? 'Memproses...' : 'Matikan Link Luar Rumah'}
              </button>
            ) : (
              <button
                type="button"
                disabled={tunnelBusy}
                onClick={handleStartRemoteTunnel}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5" />
                {tunnelBusy
                  ? 'Membuka Jalur Tunnel...'
                  : 'Aktifkan Link Luar Rumah (4G/5G)'}
              </button>
            )}
            <button
              type="button"
              disabled={tunnelBusy}
              onClick={handleRotateAccessKey}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              title="Ganti kunci rahasia agar link lama hangus"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset Kunci
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
          {/* Mode 1: Outside the house (4G/5G Anywhere via Cloudflare + .panel WA command) */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                1. Saat di Luar Rumah (4G/5G Mana Saja)
              </span>
              {remoteInfo?.magicUrl && (
                <button
                  type="button"
                  onClick={() => copyText('magicUrl', remoteInfo.magicUrl || '')}
                  className="text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  {copiedKey === 'magicUrl' ? (
                    <>
                      <Check className="w-3 h-3" /> Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Salin Link
                    </>
                  )}
                </button>
              )}
            </div>

            {remoteInfo?.magicUrl ? (
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-emerald-500/40 font-mono text-xs text-emerald-700 dark:text-emerald-300 break-all select-all">
                {remoteInfo.magicUrl}
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-600 dark:text-zinc-400 break-words">
                {remoteInfo?.lastError
                  ? remoteInfo.lastError
                  : 'Ketik "bot remote" di Termux Redmi 9C atau kirim ".panel" dari WA Owner ke bot'}
              </div>
            )}

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Dilengkapi <strong>Kunci Rahasia Owner</strong> agar orang asing tidak bisa membuka panelmu. Kalau link berubah saat mati lampu, cukup <strong>chat pribadi <code className="font-mono">{config.prefix}panel</code> dari WA HP utamamu ke nomor bot</strong> — bot otomatis membalas link login terbaru!
            </p>

            {remoteInfo?.accessKey && (
              <div className="flex items-center justify-between gap-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200/70 dark:border-zinc-800">
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" />
                  Kunci Owner: <code className="font-mono text-zinc-800 dark:text-zinc-200">{remoteInfo.accessKey}</code>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      'cfInstall',
                      'pkg install -y cloudflared && bot remote'
                    )
                  }
                  className="font-mono text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {copiedKey === 'cfInstall'
                    ? 'Tersalin'
                    : 'Salin cmd Termux'}
                </button>
              </div>
            )}
          </div>

          {/* Mode 2: Inside the house (Same Wi-Fi) */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  2. Saat di Dalam Rumah (Satu Wi-Fi)
                </span>
                <button
                  type="button"
                  onClick={() => copyText('lanCard', lanExampleUrl)}
                  className="text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  {copiedKey === 'lanCard' ? (
                    <>
                      <Check className="w-3 h-3" /> Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Salin IP
                    </>
                  )}
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-900 dark:text-emerald-300 select-all">
                {lanExampleUrl}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Selama HP keduamu dan Redmi 9C tersambung ke Wi-Fi rumah yang sama, langsung ketik alamat IP lokal di atas pada Chrome/Safari HP keduamu. Super cepat dan tanpa kuota internet sama sekali.
              </p>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
              Cek IP kapan saja via chat WA: {config.prefix}panel
            </div>
          </div>

          {/* Mode 3: Optional Fixed Private IP via Tailscale */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  3. Opsi IP Pribadi Permanen (Tailscale)
                </span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-900 dark:text-emerald-300">
                http://100.x.x.x:3000
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Mau alamat IP yang tidak pernah berubah selamanya tanpa ketik <code className="font-mono">{config.prefix}panel</code>? Instal aplikasi gratis <strong>Tailscale</strong> dari Play Store di Redmi 9C &amp; HP utamamu dengan akun Google yang sama, lalu buka IP <code className="font-mono">100.x.x.x:3000</code> dari mana saja.
              </p>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
              100% gratis tanpa kartu kredit &amp; privat
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Answering "Terus Nanti Kontrolnya di Mana? Menu, Template, dll Itu?" */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Setelah Bot Jalan di Redmi 9C, Kontrol Menu &amp; Template-nya di Mana?
          </h3>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
            Begitu PM2 menyala di Termux, HP Redmi 9C kamu otomatis menjalankan <strong>Web Control Panel yang persis sama dengan halaman ini</strong> di port <span className="font-mono tabular-nums">3000</span>. Kamu punya 3 cara mengelolanya kapan saja:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
          {/* Control Option 1: Chrome on Redmi 9C */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  1. Browser Chrome di Redmi 9C
                </span>
                <button
                  type="button"
                  onClick={() => copyText('localhost', 'http://localhost:3000')}
                  className="text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  {copiedKey === 'localhost' ? (
                    <>
                      <Check className="w-3 h-3" /> Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Salin
                    </>
                  )}
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-900 dark:text-emerald-300 select-all">
                http://localhost:3000
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Buka Chrome di HP Redmi 9C lalu ketik alamat di atas. Semua tab <strong>Menu &amp; Fitur</strong>, <strong>Template Balasan Chat</strong>, <strong>Prefix</strong>, dan <strong>Pairing WA</strong> langsung terbuka tanpa kuota internet luar.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {onNavigateToCatalog && (
                <button
                  type="button"
                  onClick={onNavigateToCatalog}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors inline-flex items-center gap-1"
                >
                  <Sliders className="w-3 h-3" />
                  Menu &amp; Fitur
                </button>
              )}
              {onNavigateToTemplates && (
                <button
                  type="button"
                  onClick={onNavigateToTemplates}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Template Balasan
                </button>
              )}
            </div>
          </div>

          {/* Control Option 2: Main Phone / Laptop over WiFi */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  2. Dari HP Utama / Laptop (Satu WiFi)
                </span>
                {netInfo?.lanUrls?.[0] && (
                  <button
                    type="button"
                    onClick={() => copyText('lan', netInfo.lanUrls[0])}
                    className="text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    {copiedKey === 'lan' ? (
                      <>
                        <Check className="w-3 h-3" /> Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Salin
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-900 dark:text-emerald-300 select-all">
                {lanExampleUrl}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Taruh Redmi 9C di pojok rumah, lalu buka alamat IP WiFi Redmi 9C (muncul otomatis saat ketik <code className="font-mono">bot status</code> di Termux) dari browser HP utamamu untuk mengedit menu &amp; template dari jarak dekat.
              </p>
            </div>

            {onNavigateToSettings && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onNavigateToSettings}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  Pengaturan Owner &amp; Prefix
                </button>
              </div>
            )}
          </div>

          {/* Control Option 3: Termux 'bot' CLI */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  3. Perintah Cepat di Termux
                </span>
                <button
                  type="button"
                  onClick={() => copyText('botcli', 'bot')}
                  className="text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  {copiedKey === 'botcli' ? (
                    <>
                      <Check className="w-3 h-3" /> Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Salin
                    </>
                  )}
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-900 dark:text-emerald-300 select-all">
                bot
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Malas buka browser? Cukup ketik <code className="font-mono">bot</code> di Termux untuk memunculkan menu interaktif angka: minta Pairing Code 8 digit, ganti prefix, cek pemakaian RAM, atau restart bot.
              </p>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              Data tersimpan permanen di ~/wabot
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Step-by-Step Installation (Both Pre-built Package & Git Clone) */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
        {/* Device Profile Switcher */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Pilih Target Perangkat HP yang Akan Menjalankan Bot:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTargetDevice('reno5')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                targetDevice === 'reno5'
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span>🚀</span> Oppo Reno 5
                </span>
                {targetDevice === 'reno5' && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white font-medium">Aktif</span>}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Snapdragon 720G · RAM 8GB · <strong>Fitur AI HD Image Aktif Penuh</strong> (4x-UltraSharp &amp; Real-ESRGAN) + WABot 24/7 Pure di HP.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setTargetDevice('redmi9c')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                targetDevice === 'redmi9c'
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span>📱</span> Xiaomi Redmi 9C
                </span>
                {targetDevice === 'redmi9c' && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white font-medium">Aktif</span>}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Helio G35 · RAM 3GB · <strong>Fitur HD Image Ditiadakan</strong> (Bebas Lag &amp; Anti Force-Close). Pure Stiker WASM, Downloader &amp; Status HD.
              </p>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Perintah Pasang untuk {targetDevice === 'reno5' ? 'Oppo Reno 5' : 'Xiaomi Redmi 9C'}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Bot dapat dijalankan mandiri di HP ini. Jika HP satunya rusak, bot di HP ini langsung jadi cadangan.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 w-fit max-w-full overflow-x-auto shrink-0 self-start">
            <button
              type="button"
              onClick={() => setInstallMode('bundle')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                installMode === 'bundle'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Cara A: Paket Siap Pakai (.tar.gz)
            </button>
            <button
              type="button"
              onClick={() => setInstallMode('git')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                installMode === 'git'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Cara B: Git Clone (Repo GitHub)
            </button>
          </div>
        </div>

        {installMode === 'bundle' ? (
          <div className="space-y-5 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {/* Step 1 */}
              <div className="space-y-2.5">
                <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  LANGKAH 01 — Unduh Paket ke HP
                </div>
                <p>
                  Unduh paket <code className="font-mono">wabot-redmi9c-ready.tar.gz</code> dan pastikan filenya berada di folder <strong>Download</strong> pada HP Redmi 9C kamu (bisa unduh langsung di Redmi 9C atau kirim lewat WhatsApp/ShareIt lalu simpan ke Download).
                </p>
                <a
                  href="/api/termux-bundle.tar.gz"
                  download="wabot-redmi9c-ready.tar.gz"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh wabot-redmi9c-ready.tar.gz
                </a>
              </div>

              {/* Step 2 */}
              <div className="space-y-2.5">
                <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  LANGKAH 02 — Izinkan Folder Download
                </div>
                <p>
                  Buka aplikasi Termux di Redmi 9C, ketik perintah ini sekali saja, lalu ketuk <strong>Izinkan (Allow)</strong> saat muncul pop-up akses penyimpanan:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-emerald-300 select-all">
                    {storageSetupCmd}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText('storage', storageSetupCmd)}
                    className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shrink-0"
                  >
                    {copiedKey === 'storage' ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-2.5">
                <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  LANGKAH 03 — Ekstrak &amp; Nyalakan 24/7
                </div>
                <p>
                  Salin &amp; tempel perintah 1-baris di bawah ini ke Termux. Seluruh tampilan Web Panel penuh + mesin bot otomatis terpasang dan langsung jalan di PM2:
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <pre className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all select-all leading-relaxed">
                {bundleExtractRunCmd}
              </pre>
              <button
                type="button"
                onClick={() => copyText('bundleRun', bundleExtractRunCmd)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity"
              >
                {copiedKey === 'bundleRun' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Perintah Ekstrak &amp; Jalan Berhasil Disalin
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Salin Perintah Ekstrak &amp; Jalankan Otomatis
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
            <div className="space-y-2 max-w-2xl">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Masukkan URL Repository GitHub Milikmu Sendiri (setelah kamu Export/Push project ini ke GitHub):
              </label>
              <input
                type="url"
                value={gitRepoUrl}
                onChange={(e) => setGitRepoUrl(e.target.value)}
                placeholder="https://github.com/username-kamu/wabot-multi-feature.git"
                className="w-full px-4 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Pada metode Git Clone maupun <code className="font-mono">bot update</code>, bundel antarmuka <code className="font-mono">dist/</code> dan mesin <code className="font-mono">server.bundle.mjs</code> sudah disertakan siap pakai — sehingga saat kamu membuka <code className="font-mono">http://localhost:3000</code> atau tautan <code className="font-mono">{config.prefix}panel</code>, tampilannya <strong>100% identik dengan Preview Dashboard ini</strong> tanpa membebani RAM Redmi 9C.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Perintah 1-Baris Git Clone &amp; Jalankan di Termux:
              </div>
              <pre className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all select-all leading-relaxed">
                {gitCloneRunCmd}
              </pre>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => copyText('gitRun', gitCloneRunCmd)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  {copiedKey === 'gitRun' ? (
                    <>
                      <Check className="w-4 h-4" />
                      Perintah Git Clone Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Salin Perintah Git Clone ({targetDevice === 'reno5' ? 'Reno 5' : 'Redmi 9C'})
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => copyText('curlRun', curlFastRunCmd)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                >
                  {copiedKey === 'curlRun' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Perintah Langsung Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin Perintah Langsung Sekali Jalan (Tanpa Git)
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => copyText('gitUpdate', gitUpdateCmd)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  {copiedKey === 'gitUpdate' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Perintah Update Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin Perintah Update Repo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Termux CLI Command Reference */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Daftar Perintah Terminal Termux (Klik untuk Menyalin)
          </h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Bisa diketik kapan saja saat membuka aplikasi Termux
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {cliShortcuts.map((item) => {
            const isCopied = copiedKey === item.cmd;
            return (
              <button
                key={item.cmd}
                type="button"
                onClick={() => copyText(item.cmd, item.cmd)}
                className="text-left p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 hover:border-emerald-500/60 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {item.cmd}
                  </code>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
                    {isCopied ? 'Tersalin' : 'Salin'}
                  </span>
                </div>
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-200">
                  {item.label}
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {item.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 5: Specific Xiaomi Redmi 9C (MIUI 12, 3GB RAM) Anti-Kill Checklist */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              3 Setelan Wajib MIUI di Xiaomi Redmi 9C (3/32) Agar Bot Anti-Mati Seminggu Penuh
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              MIUI pada Redmi 9C memiliki penghemat RAM 3GB yang agresif. Lakukan 3 pengaturan ini sekali saja supaya Termux tidak pernah ditutup paksa saat layar HP mati:
            </p>
          </div>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          <li className="space-y-1.5">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              01. Aktifkan Mulai Otomatis (Autostart)
            </div>
            <p>
              Buka <strong>Setelan Redmi 9C &rarr; Aplikasi &rarr; Kelola aplikasi &rarr; cari Termux</strong>, lalu nyalakan saklar <strong>Mulai otomatis (Autostart)</strong> dan izinkan notifikasi Termux tetap tampil.
            </p>
          </li>
          <li className="space-y-1.5">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              02. Matikan Pembatasan Baterai MIUI
            </div>
            <p>
              Masih di halaman info aplikasi Termux, ketuk menu <strong>Penghemat baterai (Battery saver)</strong> lalu ubah dari <em>Penghemat baterai MIUI</em> menjadi <strong>Tidak ada pembatasan (No restrictions)</strong>.
            </p>
          </li>
          <li className="space-y-1.5">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              03. Kunci Gembok di Recent Apps
            </div>
            <p>
              Tekan tombol kotak (Recent Apps) di bawah layar Redmi 9C, <strong>tekan dan tahan kartu aplikasi Termux</strong> selama 1 detik, lalu ketuk ikon <strong>Gembok</strong> sampai muncul tanda terkunci di atas kartu Termux.
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
