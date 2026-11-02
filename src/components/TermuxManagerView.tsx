import { useState, useEffect } from 'react';
import {
  Smartphone,
  Copy,
  Check,
  Zap,
  Terminal,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Server,
  RefreshCw,
  Cpu,
  Layers,
  Globe,
  Radio,
} from 'lucide-react';
import type { WAConnectionState, BotConfig } from '../shared/types.ts';

interface TermuxManagerViewProps {
  waState: WAConnectionState;
  config: BotConfig;
  onNavigateToConnection?: () => void;
}

export function TermuxManagerView({
  waState,
  config,
  onNavigateToConnection,
}: TermuxManagerViewProps) {
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedGit, setCopiedGit] = useState(false);
  const [copiedSharpFix, setCopiedSharpFix] = useState(false);
  const [copiedLocalhost, setCopiedLocalhost] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const [isLocalhost, setIsLocalhost] = useState(false);
  const [currentHost, setCurrentHost] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      setCurrentHost(window.location.host);
      setIsLocalhost(
        h === 'localhost' ||
          h === '127.0.0.1' ||
          h.startsWith('192.168.') ||
          h.startsWith('10.') ||
          h.startsWith('172.')
      );
    }
  }, []);

  const curlCommand =
    'curl -sL https://raw.githubusercontent.com/Gepaaaa/panel-/main/termux.sh | bash';
  const gitCommand =
    'pkg update -y && pkg install -y git nodejs-lts && git clone https://github.com/Gepaaaa/panel-.git wabot && cd wabot && bash termux.sh';
  const sharpFixCommand =
    "mkdir -p dist && echo '<html><body>WABot</body></html>' > dist/index.html && npm install @img/sharp-wasm32 && node index.js";

  const handleCopy = (
    text: string,
    setter: (v: boolean) => void
  ) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      setter(true);
      setTimeout(() => setter(false), 2000);
    }
  };

  const handleCopyCmd = (cmd: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 2000);
    }
  };

  const pm2Commands = [
    {
      cmd: 'bot',
      desc: 'Shortcut instan membuka monitor log, status bot & kode pairing realtime.',
      category: 'Paling Sering Digunakan',
    },
    {
      cmd: 'pm2 status',
      desc: 'Cek apakah bot sedang aktif (online), uptime, dan konsumsi memori RAM HP.',
      category: 'Diagnostik',
    },
    {
      cmd: 'pm2 logs wabot',
      desc: 'Pantau pesan masuk, pembuatan stiker, download medsos, dan error realtime.',
      category: 'Diagnostik',
    },
    {
      cmd: 'pm2 restart wabot',
      desc: 'Mulai ulang engine bot seketika tanpa harus merestart HP Android kamu.',
      category: 'Kontrol',
    },
    {
      cmd: 'pm2 stop wabot',
      desc: 'Hentikan bot sementara waktu ketika ingin istirahat atau maintenance.',
      category: 'Kontrol',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-display font-bold text-zinc-900 dark:text-zinc-100">
                Termux 24/7 &amp; Localhost Management
              </h2>
              {isLocalhost ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  🟢 Terhubung via Localhost ({currentHost})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">
                  🌐 Mode Web Panel
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
              Jalankan bot langsung di memori HP Android menggunakan Termux + PM2 agar aktif 24/7 tanpa VPS, lalu kelola seluruh pengaturannya lewat browser di <code className="font-mono text-emerald-600 dark:text-emerald-400">http://localhost:3000</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all whitespace-nowrap"
          >
            <Globe className="w-4 h-4" />
            <span>Buka Localhost (3000)</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>
        </div>
      </div>

      {/* LOCALHOST ACCESS HERO FEATURE */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-zinc-900/90 to-zinc-950 border border-emerald-500/40 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold text-sm">
              🌐
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Akses &amp; Kelola Bot via Localhost di HP Kamu
              </h3>
              <p className="text-xs text-zinc-400">
                Tanpa internet kuota server, panel kontrol ini bisa dibuka langsung di browser HP
              </p>
            </div>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/40">
            PORT 3000 READY
          </span>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          Saat kamu menjalankan bot di Termux, server HTTP bawaan bot langsung mendengarkan di host <code className="font-mono text-emerald-300 bg-zinc-900 px-1.5 py-0.5 rounded">0.0.0.0:3000</code>. Kamu bisa membuka dan mengontrol seluruh fitur bot lewat Google Chrome di HP:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Box 1: Buka di HP Sendiri */}
          <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Di HP yang Menjalankan Termux
              </span>
              <button
                type="button"
                onClick={() =>
                  handleCopy('http://localhost:3000', setCopiedLocalhost)
                }
                className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                {copiedLocalhost ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Salin URL</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900 font-mono text-xs text-emerald-300 border border-zinc-800 break-all select-all">
              http://localhost:3000
            </div>
            <p className="text-[11px] text-zinc-400">
              Buka Google Chrome di HP kamu, ketik link di atas untuk scan QR, minta Pairing Code, tes simulator, atau atur prefix bot.
            </p>
          </div>

          {/* Box 2: Buka dari Laptop / PC satu WiFi */}
          <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-cyan-400" />
                Dari Laptop / PC (Satu WiFi / Hotspot)
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">LAN WiFi</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900 font-mono text-xs text-cyan-300 border border-zinc-800 break-all select-all">
              http://[IP-HP-KAMU]:3000
            </div>
            <p className="text-[11px] text-zinc-400">
              Ketik <code className="text-zinc-300 font-mono">ip -4 addr show wlan0</code> di Termux untuk cek IP HP kamu (contoh: <code className="text-zinc-300 font-mono">http://192.168.1.5:3000</code>).
            </p>
          </div>
        </div>
      </div>

      {/* 1-SHOT AUTO-INSTALLER HERO BOX (DARI REPO PANEL) */}
      <div className="p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-sm">
              ⚡
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">
                1-Baris Perintah Otomatis (Setelah Reinstall Termux)
              </h3>
              <p className="text-xs text-zinc-400">
                Otomatis: WakeLock ON + Node.js LTS + FFmpeg + Sharp WASM + PM2 + Web Panel Localhost
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/40">
            PASTI JALAN 100%
          </span>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          Setelah Termux di-reinstall atau di-clear data, cukup salin baris perintah ini lalu tekan <strong className="text-white">Enter</strong> di Termux. Bot akan menginstal semua library tanpa error kompilasi dan otomatis berjalan di background:
        </p>

        {/* Curl 1-line command */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Metode 1: Eksekusi Langsung Skrip Otomatis (Cepat)</span>
            <span className="font-mono text-[10px]">CURL + BASH</span>
          </div>
          <div className="relative">
            <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all select-all leading-relaxed">
              {curlCommand}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(curlCommand, setCopiedCurl)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-700/20 active:scale-95 transition-all"
          >
            {copiedCurl ? (
              <>
                <Check className="w-4 h-4" />
                <span>Perintah 1-Baris Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Salin Perintah 1-Baris Otomatis</span>
              </>
            )}
          </button>
        </div>

        {/* Git Clone Method */}
        <div className="pt-3 border-t border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Metode 2: Git Clone Manual ke Folder ~/wabot</span>
            <span className="font-mono text-[10px]">GIT CLONE</span>
          </div>
          <div className="relative">
            <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all select-all leading-relaxed">
              {gitCommand}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(gitCommand, setCopiedGit)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold active:scale-95 transition-all"
          >
            {copiedGit ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Perintah Git Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Salin Perintah Git Clone</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Troubleshooting Sharp / Android ARM (32-bit & 64-bit) */}
      <div className="p-5 rounded-2xl bg-cyan-950/40 border border-cyan-600/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
            <h4 className="text-xs sm:text-sm font-bold text-cyan-300">
              Solusi Error:{' '}
              <code className="font-mono text-zinc-200 bg-zinc-950 px-1.5 py-0.5 rounded text-[11px]">
                Could not load the "sharp" module using android-arm
              </code>
            </h4>
          </div>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-200 border border-cyan-700/60 font-mono">
            Fix Android 32-Bit ARMv7 &amp; 64-Bit
          </span>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          Penyebab: HP Android tipe tertentu (terutama 32-bit ARM atau arsitektur tanpa toolchain C++ lokal) membutuhkan library WebAssembly untuk pengolah gambar stiker. Di repo ini, paket <code className="text-cyan-300 font-mono">@img/sharp-wasm32</code> sudah terpasang. Jika masih mengalami kendala di folder <code className="text-cyan-300 font-mono">~/wabot</code>, cukup jalankan:
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <code className="flex-1 p-2.5 rounded-xl bg-zinc-950 text-xs font-mono text-cyan-300 border border-zinc-800 select-all overflow-x-auto whitespace-pre-wrap">
            {sharpFixCommand}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(sharpFixCommand, setCopiedSharpFix)}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-md shadow-cyan-800/20 shrink-0"
          >
            {copiedSharpFix ? 'Perintah Sharp Tersalin!' : 'Salin Perintah Fix Sharp'}
          </button>
        </div>
      </div>

      {/* Perintah Cepat PM2 di Termux */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm sm:text-base font-display font-bold text-zinc-900 dark:text-zinc-100">
              Pusat Kontrol Perintah Termux &amp; PM2
            </h3>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            Klik perintah untuk langsung menyalin
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pm2Commands.map((item) => {
            const isJustCopied = copiedCmd === item.cmd;
            return (
              <div
                key={item.cmd}
                onClick={() => handleCopyCmd(item.cmd)}
                className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 hover:border-emerald-500/50 cursor-pointer transition-all flex flex-col justify-between gap-2 group"
              >
                <div className="flex items-center justify-between">
                  <code className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 group-hover:underline">
                    {item.cmd}
                  </code>
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {isJustCopied ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Tersalin
                      </span>
                    ) : (
                      item.category
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guide Cards (3 Langkah Mudah) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
            <span className="w-6 h-6 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center font-mono">
              1
            </span>
            <span>Instal Termux Resmi (F-Droid)</span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Unduh aplikasi <strong>Termux</strong> dari <strong>f-droid.org</strong> (jangan dari Google Play Store karena versinya sudah usang/deprecated dan tidak bisa update repositori).
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-semibold text-xs">
            <span className="w-6 h-6 rounded-full bg-cyan-500/10 dark:bg-cyan-500/20 flex items-center justify-center font-mono">
              2
            </span>
            <span>Aktifkan Wake Lock</span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Perintah otomatis di atas sudah memasang <code className="text-cyan-600 dark:text-cyan-400 font-mono">termux-wake-lock</code> agar HP tidak menidurkan proses komputasi saat layar mati.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-xs">
            <span className="w-6 h-6 rounded-full bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center font-mono">
              3
            </span>
            <span>Jalankan dengan PM2</span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            PM2 secara otomatis merestart bot jika terjadi error atau koneksi WhatsApp terputus. Bot kamu akan aktif 24/7 non-stop tanpa takut tertutup!
          </p>
        </div>
      </div>

      {/* Tip for Battery Optimization */}
      <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-600/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1.5 leading-relaxed">
          <strong className="text-amber-950 dark:text-amber-100 text-sm">
            Tips Wajib Agar Bot Tidak Dimatikan Sistem HP (Xiaomi, Samsung, Oppo, Vivo, Infinix):
          </strong>
          <ul className="list-disc list-inside space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>
              Buka <strong>Pengaturan HP &rarr; Aplikasi &rarr; Termux &rarr; Penghemat Baterai (Battery Saver)</strong>: Ubah menjadi <strong>"Tidak ada pembatasan" (No Restrictions)</strong>.
            </li>
            <li>
              Aktifkan opsi <strong>"Mulai Otomatis" (Autostart)</strong> agar Termux dapat berjalan saat HP baru dinyalakan.
            </li>
            <li>
              Buka Recent Apps (aplikasi berjalan), lalu <strong>kunci ikon gembok</strong> pada Termux agar tidak terhapus saat kamu membersihkan RAM HP.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
