import React, { useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  KeyRound,
  LogOut,
  QrCode,
  RefreshCw,
  Server,
  Smartphone,
  Wifi,
} from 'lucide-react';
import type { BotConfig, WAConnectionState } from '../shared/types.ts';

interface ConnectionViewProps {
  waState: WAConnectionState;
  config: BotConfig;
  socketConnected?: boolean;
  backendUrl?: string;
  backendUnreachable?: boolean;
  isStaticHost?: boolean;
  onUpdateBackendUrl?: (url: string) => void;
  onConnectQR: () => Promise<void>;
  onConnectPairing: (phone: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
}

export function ConnectionView({
  waState,
  config,
  socketConnected = false,
  backendUrl = '',
  backendUnreachable = false,
  isStaticHost = false,
  onUpdateBackendUrl,
  onConnectQR,
  onConnectPairing,
  onDisconnect,
  onUpdateConfig,
}: ConnectionViewProps) {
  const [method, setMethod] = useState<'qr' | 'pairing'>('pairing');
  const [phoneInput, setPhoneInput] = useState('628');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPing, setCopiedPing] = useState(false);
  const [copiedTermux, setCopiedTermux] = useState(false);
  const [hostGuideMode, setHostGuideMode] = useState<
    'termux' | 'koyeb_render' | 'huggingface' | 'oracle'
  >('termux');

  const [serverInput, setServerInput] = useState(backendUrl);
  const [probingServer, setProbingServer] = useState(false);
  const [serverFeedback, setServerFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleStartQR = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      await onConnectQR();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal membuat QR.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      await onConnectPairing(phoneInput);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Gagal meminta Pairing Code.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!waState.pairingCode) return;
    try {
      await navigator.clipboard.writeText(waState.pairingCode.replace('-', ''));
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleSaveBackendServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateBackendUrl) return;
    const raw = serverInput.trim().replace(/\/+$/, '');
    if (!raw) {
      onUpdateBackendUrl('');
      setServerFeedback({
        ok: true,
        message: 'Kembali memakai server bawaan (origin saat ini).',
      });
      return;
    }

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setProbingServer(true);
    setServerFeedback(null);
    try {
      const res = await fetch(`${normalized}/api/health`);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        throw new Error(
          'Endpoint /api/health tidak mengembalikan JSON Server Bot. Pastikan server Node.js (npm start) sedang berjalan di URL tersebut.'
        );
      }
      onUpdateBackendUrl(normalized);
      setServerInput(normalized);
      setServerFeedback({
        ok: true,
        message: `Berhasil terhubung ke Server Bot: ${normalized}`,
      });
    } catch (err) {
      setServerFeedback({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'Gagal menghubungi URL Server Bot tersebut.',
      });
    } finally {
      setProbingServer(false);
    }
  };

  const handleResetBackendServer = () => {
    if (!onUpdateBackendUrl) return;
    setServerInput('');
    onUpdateBackendUrl('');
    setServerFeedback({
      ok: true,
      message: 'URL eksternal dihapus. Menggunakan server bawaan halaman ini.',
    });
  };

  const isConnected = waState.status === 'connected';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Connection Card */}
        <div className="lg:col-span-7 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Tautkan Perangkat WhatsApp
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Hubungkan nomor WhatsApp kamu menggunakan Scan QR atau Pairing Code 8
                digit tanpa perlu aplikasi tambahan.
              </p>
            </div>

            {!isConnected && (
              <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setMethod('pairing')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    method === 'pairing'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Pairing Code
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('qr')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    method === 'qr'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Scan QR
                </button>
              </div>
            )}
          </div>

          {(localError || waState.lastError) && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
              {localError || waState.lastError}
            </div>
          )}

          {/* Connected Active View */}
          {isConnected ? (
            <div className="pt-2 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Wifi className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {waState.connectedUser?.name || config.botName}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                      <span>+{waState.connectedUser?.phone}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-sans font-medium">
                        Sesi Multi-Device Aktif
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void onDisconnect()}
                  className="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 text-rose-700 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Putuskan Sesi
                </button>
              </div>

              <div className="pt-4 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    Izinkan Perintah dari Nomor Bot Sendiri (Self-Mode)
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Aktifkan agar kamu bisa mengetes {config.prefix}menu atau{' '}
                    {config.prefix}hdsw langsung dari chat Pesan Tersimpan di HP kamu.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateConfig({ selfMode: !config.selfMode })
                  }
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                    config.selfMode
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  {config.selfMode ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>
            </div>
          ) : method === 'pairing' ? (
            /* Pairing Code Flow */
            <div className="space-y-5">
              <form onSubmit={handleStartPairing} className="space-y-3">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Nomor WhatsApp (awalan kode negara 62 atau 08)
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="6281234567890"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono tabular-nums text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || waState.status === 'connecting'}
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <Smartphone className="w-4 h-4" />
                    {waState.status === 'connecting'
                      ? 'Meminta Kode...'
                      : 'Dapatkan Pairing Code'}
                  </button>
                </div>
              </form>

              {waState.status === 'connecting' && waState.statusMessage && (
                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{waState.statusMessage}</span>
                </div>
              )}

              {waState.pairingCode && (
                <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 text-center space-y-3">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Masukkan kode 8 karakter ini di WhatsApp untuk nomor +
                    {waState.pairingPhone}:
                  </div>
                  <div className="text-3xl sm:text-4xl font-mono font-semibold tracking-widest text-zinc-900 dark:text-zinc-100 tabular-nums select-all">
                    {waState.pairingCode}
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleCopyCode()}
                      className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salin Kode
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDisconnect()}
                      className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 whitespace-nowrap"
                    >
                      Batalkan
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* QR Code Flow */
            <div className="pt-2 flex flex-col items-center text-center space-y-4">
              {waState.qrDataUrl ? (
                <>
                  <div className="p-3 bg-white rounded-2xl border border-zinc-200">
                    <img
                      src={waState.qrDataUrl}
                      alt="QR Code WhatsApp Multi-Device"
                      referrerPolicy="no-referrer"
                      className="w-60 h-60 object-contain"
                    />
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm">
                    Arahkan kamera WhatsApp kamu ke kode QR di atas. Kode diperbarui
                    otomatis secara real-time hingga tertaut.
                  </p>
                  <button
                    type="button"
                    onClick={() => void onDisconnect()}
                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Hentikan Pemindaian QR
                  </button>
                </>
              ) : (
                <div className="py-6 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mx-auto">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {waState.status === 'connecting'
                        ? waState.statusMessage || 'Menyiapkan Kode QR WhatsApp...'
                        : 'Siap Menampilkan QR Multi-Device'}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Klik tombol di bawah untuk membuat sesi QR baru dan pindai
                      langsung dari ponsel kamu.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || waState.status === 'connecting'}
                    onClick={() => void handleStartQR()}
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        waState.status === 'connecting' ? 'animate-spin' : ''
                      }`}
                    />
                    {waState.status === 'connecting'
                      ? 'Menghubungkan...'
                      : 'Tampilkan QR Code'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Clear Pairing Steps */}
        <div className="lg:col-span-5 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Cara Menautkan ke WhatsApp
          </h3>

          <ol className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-3">
              <span className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-zinc-100 pt-0.5 shrink-0">
                01.
              </span>
              <span>
                Buka aplikasi <strong className="text-zinc-900 dark:text-zinc-200">WhatsApp</strong> di
                HP kamu, lalu ketuk menu titik tiga di kanan atas (atau Pengaturan di
                iOS) dan pilih <strong className="text-zinc-900 dark:text-zinc-200">Perangkat Tertaut</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-zinc-100 pt-0.5 shrink-0">
                02.
              </span>
              <span>
                Ketuk <strong className="text-zinc-900 dark:text-zinc-200">Tautkan Perangkat</strong>. Jika
                memakai Pairing Code, pilih opsi{' '}
                <strong className="text-zinc-900 dark:text-zinc-200">
                  Tautkan dengan nomor telepon saja
                </strong>{' '}
                di bagian bawah layar kamera.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-zinc-100 pt-0.5 shrink-0">
                03.
              </span>
              <span>
                Masukkan kode 8 karakter yang muncul di panel kiri atau arahkan
                kamera ke QR Code. Begitu terhubung, setiap chat berawalan{' '}
                <code className="font-mono text-emerald-700 dark:text-emerald-400">
                  {config.prefix}
                </code>{' '}
                otomatis dijawab oleh {config.botName}.
              </span>
            </li>
          </ol>

          <div className="pt-4 border-t border-zinc-200/70 dark:border-zinc-800 space-y-2.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              Aturan Aman &amp; Pemulihan Akun WhatsApp
            </div>
            <p>
              <strong className="text-zinc-800 dark:text-zinc-200">
                Wajib Nomor Kedua:
              </strong>{' '}
              Gunakan nomor kedua yang sudah aktif minimal beberapa hari sebagai nomor bot, jangan nomor pribadi utama.
            </p>
            <p className="text-zinc-500 dark:text-zinc-400">
              Proteksi aktif: <code className="font-mono">{config.prefix}hdsw</code> kini membalas langsung di Grup tanpa cold-DM ke nomor asing, sementara <code className="font-mono">{config.prefix}add</code>,{' '}
              <code className="font-mono">{config.prefix}hidetag</code>, &amp;{' '}
              <code className="font-mono">{config.prefix}tagall</code> tetap dikunci aman.
            </p>
          </div>
        </div>
      </div>

      {/* Pure Free 24/7 Zero-Credit-Card Hosting Section */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Server className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>100% Pure Gratis · Tanpa Kartu Kredit · Tanpa Buka Web</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  socketConnected
                    ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                    : 'text-amber-700 dark:text-amber-400 font-medium'
                }
              >
                {socketConnected
                  ? 'WebSocket Server Terhubung'
                  : backendUnreachable || isStaticHost
                  ? 'Menunggu Koneksi Server Bot 24/7'
                  : 'Menyambungkan...'}
              </span>
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {hostGuideMode === 'termux' &&
                'Server Pribadi 24/7 Pakai HP Android Nganggur (Termux — Bebas Biaya & Paling Anti-Ban)'}
              {hostGuideMode === 'koyeb_render' &&
                'Cloud Container Gratis: Koyeb / Render (+ Auto Keep-Alive /ping)'}
              {hostGuideMode === 'huggingface' &&
                'Hugging Face Spaces: Docker Container 24/7 Gratis (16GB RAM, Tanpa Kartu Kredit)'}
              {hostGuideMode === 'oracle' &&
                'Oracle Cloud Always Free: VPS Ubuntu 24/7 (4 Core, 24GB RAM, IP Publik Sendiri)'}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {hostGuideMode === 'termux' && (
                <>
                  Punya HP Android yang tidak terpakai? Jadikan server bot pribadi 24/7 selamanya memakai skrip otomatis <code className="font-mono">termux.sh</code>. Memakai IP WiFi rumah (jauh lebih aman dari banned WA), RAM jauh lebih lega, sesi tersimpan permanen di memori HP, dan layar HP dimatikan pun bot tetap aktif nonstop.
                </>
              )}
              {hostGuideMode === 'koyeb_render' && (
                <>
                  WhatsApp Baileys membutuhkan koneksi WebSocket yang terus menyala (tidak bisa di Vercel/serverless). Di Koyeb atau Render, jalankan service Node.js dan pasang URL <code className="font-mono">/ping</code> ke <strong>cron-job.org</strong> atau <strong>UptimeRobot</strong> setiap 10 menit agar server tidak pernah sleep/mati.
                </>
              )}
              {hostGuideMode === 'huggingface' && (
                <>
                  Hugging Face Spaces menyediakan container Docker gratis dengan spesifikasi 2 vCPU dan 16GB RAM yang berjalan nonstop 24/7 tanpa membutuhkan kartu kredit sama sekali. Cukup fork repo ke Space bertipe Docker.
                </>
              )}
              {hostGuideMode === 'oracle' && (
                <>
                  Opsi cloud gratis terbaik di dunia: Oracle Cloud Always Free memberikan VPS compute ARM (Ampere A1) gratis selamanya dengan 4 OCPU, 24GB RAM, OS Ubuntu, dan IP statis murni. Bot tidak akan pernah tertidur atau dimatikan pihak ketiga.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 shrink-0 self-start">
            <button
              type="button"
              onClick={() => setHostGuideMode('termux')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                hostGuideMode === 'termux'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              HP Nganggur (Termux)
            </button>
            <button
              type="button"
              onClick={() => setHostGuideMode('koyeb_render')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                hostGuideMode === 'koyeb_render'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Koyeb / Render
            </button>
            <button
              type="button"
              onClick={() => setHostGuideMode('huggingface')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                hostGuideMode === 'huggingface'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Hugging Face (Docker)
            </button>
            <button
              type="button"
              onClick={() => setHostGuideMode('oracle')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                hostGuideMode === 'oracle'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Oracle VPS (Always Free)
            </button>
          </div>
        </div>

        {hostGuideMode === 'termux' && (
          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                01. Install Termux Resmi (F-Droid)
              </div>
              <p>
                Di HP Android nganggur, unduh APK <strong>Termux</strong> dari <strong className="text-zinc-800 dark:text-zinc-200">f-droid.org</strong> (jangan versi Play Store lama). Di Pengaturan HP &rarr; Aplikasi &rarr; Termux &rarr; Baterai, pilih <strong>Tidak Dibatasi</strong>.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                02. Tempel 1 Perintah Otomatis
              </div>
              <p>
                Buka Termux, ganti <code className="font-mono">LINK_GITHUB_KAMU</code> dengan URL repo GitHub kamu lalu jalankan. Skrip <code className="font-mono">termux.sh</code> otomatis mengunci <em>WakeLock</em>, menginstal Node 22 + FFmpeg, dan menyalakan bot.
              </p>
              <button
                type="button"
                onClick={async () => {
                  const cmd =
                    'pkg update -y && pkg install git -y && git clone LINK_GITHUB_KAMU wabot && cd wabot && bash termux.sh';
                  try {
                    await navigator.clipboard.writeText(cmd);
                    setCopiedTermux(true);
                    setTimeout(() => setCopiedTermux(false), 2000);
                  } catch {
                    // Ignore clipboard restrictions
                  }
                }}
                className="mt-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium inline-flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {copiedTermux ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Perintah Termux Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Salin Perintah Termux
                  </>
                )}
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                03. Ketik Nomor WA &amp; Matikan Layar
              </div>
              <p>
                Ketik nomor WA bot (<code className="font-mono">628...</code>) langsung di layar Termux, masukkan 8 digit Pairing Code ke WA, lalu matikan layar HP sambil dicolok charger. Kalau nanti HP sempat mati, cukup buka Termux &amp; ketik <code className="font-mono">bot</code>.
              </p>
            </div>
          </div>
        )}

        {hostGuideMode === 'koyeb_render' && (
          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                01. Hubungkan Repo ke Koyeb / Render
              </div>
              <p>
                Daftar akun di <strong className="text-zinc-800 dark:text-zinc-200">koyeb.com</strong> atau <strong className="text-zinc-800 dark:text-zinc-200">render.com</strong>. Buat Web Service baru, pilih repository GitHub bot kamu, set build command <code className="font-mono">npm install &amp;&amp; npm run build</code> dan start command <code className="font-mono">npm start</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                02. Set Variabel Lingkungan &amp; Salin /ping
              </div>
              <p>
                Tambahkan Env Var <code className="font-mono">PORT=3000</code> dan <code className="font-mono">DATA_DIR=/tmp</code>. Setelah deploy aktif, bot sudah memiliki endpoint ringan <code className="font-mono">/ping</code> yang siap dipanggil.
              </p>
              <button
                type="button"
                onClick={async () => {
                  const base = (
                    backendUrl ||
                    (typeof window !== 'undefined' ? window.location.origin : '')
                  ).replace(/\/+$/, '');
                  const pingUrl = `${base}/ping`;
                  try {
                    await navigator.clipboard.writeText(pingUrl);
                    setCopiedPing(true);
                    setTimeout(() => setCopiedPing(false), 2000);
                  } catch {
                    // Ignore clipboard restrictions
                  }
                }}
                className="mt-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium inline-flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {copiedPing ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    URL /ping Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Salin Endpoint /ping
                  </>
                )}
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                03. Pasang Keep-Alive di cron-job.org
              </div>
              <p>
                Buka <strong className="text-zinc-800 dark:text-zinc-200">cron-job.org</strong> (100% gratis), buat cron baru yang memanggil URL <code className="font-mono">https://nama-app.koyeb.app/ping</code> setiap <strong>10 menit</strong>. Ini menjaga WebSocket Baileys tetap ON 24/7 tanpa idle sleep!
              </p>
            </div>
          </div>
        )}

        {hostGuideMode === 'huggingface' && (
          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                01. Buat Hugging Face Space (Docker)
              </div>
              <p>
                Daftar gratis di <strong className="text-zinc-800 dark:text-zinc-200">huggingface.co</strong>. Klik profile &rarr; <strong>New Space</strong>. Pilih SDK <strong>Docker &rarr; Blank</strong>, beri nama repo, dan pilih lisensi open-source.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                02. Masukkan Dockerfile Ringan
              </div>
              <p>
                Pakai image resmi <code className="font-mono">node:20-bookworm-slim</code> dengan FFmpeg. Container Hugging Face tidak memiliki batas idle sleep selama service web port 7860/3000 mengekspos respons HTTP.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                03. Buka Logs &amp; Tautkan Nomor
              </div>
              <p>
                Buka tab <strong>Logs / App</strong> pada Space kamu. Masukkan Pairing Code 8 digit yang muncul ke WhatsApp di HP kamu. Bot langsung on 24/7 dengan jatah 16GB RAM gratis!
              </p>
            </div>
          </div>
        )}

        {hostGuideMode === 'oracle' && (
          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                01. Buat Akun Oracle Cloud Always Free
              </div>
              <p>
                Buka <strong className="text-zinc-800 dark:text-zinc-200">cloud.oracle.com</strong> dan daftar Always Free. Buat Compute Instance ARM Ampere A1 (Ubuntu 22.04 LTS atau 24.04 LTS). Gratis 4 core dan 24GB RAM selamanya.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                02. Jalankan dengan PM2 (Auto-Restart)
              </div>
              <p>
                SSH ke VPS kamu, install Node.js dan PM2: <code className="font-mono">sudo apt update &amp;&amp; sudo apt install -y nodejs npm ffmpeg &amp;&amp; sudo npm i -g pm2</code>. Clone repo kamu lalu jalankan <code className="font-mono">pm2 start server.ts --name wabot --interpreter tsx</code> dan <code className="font-mono">pm2 startup</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                03. Bot Aktif Selamanya (Tanpa Sleep)
              </div>
              <p>
                Karena berupa dedicated VPS Linux murni, koneksi WebSocket TCP ke server WhatsApp tidak pernah terputus, memori sesi permanen di SSD, dan kamu bisa menutup terminal SSH tanpa khawatir bot mati.
              </p>
            </div>
          </div>
        )}

        {/* Optional External Bot Server Connector Form */}
        <form
          onSubmit={handleSaveBackendServer}
          className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              Opsional: Hubungkan ke URL Server Bot Eksternal (Jika Ingin Mengontrol dari Web Ini)
            </label>
            {backendUrl && (
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                Aktif: {backendUrl}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="Contoh: https://url-server-bot-kamu.app"
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={probingServer}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {probingServer ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Menguji Server...
                </>
              ) : (
                'Uji & Simpan URL Server'
              )}
            </button>
            {backendUrl && (
              <button
                type="button"
                onClick={handleResetBackendServer}
                className="px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
              >
                Reset Default
              </button>
            )}
          </div>

          {serverFeedback && (
            <div
              className={`text-xs font-medium ${
                serverFeedback.ok
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {serverFeedback.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
