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
              Jalankan Bot 24/7 Nonstop di Wispbyte (Murni Gratis &amp; Tanpa Kartu Kredit)
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Project ini sudah dilengkapi <code className="font-mono">index.js</code> otomatis, FFmpeg bawaan, serta fitur <strong>Direct Console Pairing</strong>. Kamu cukup daftar pakai Discord/Email di Wispbyte (tanpa kartu kredit/debit sama sekali, tanpa klik renew harian, tanpa nonton iklan), lalu ketik nomor WA langsung di Console—bot langsung jalan 24/7 penuh selama 2 minggu nonstop.
            </p>
          </div>

          <a
            href="https://wispbyte.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start"
          >
            <Globe className="w-3.5 h-3.5" />
            Buka Wispbyte.com
          </a>
        </div>

        {/* 3 Zero-Hassle Cardless Steps */}
        <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          <div className="space-y-1.5">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              01. Buat Server Node.js Gratis (0 Kartu)
            </div>
            <p>
              Login ke <strong className="text-zinc-800 dark:text-zinc-200">wispbyte.com</strong> memakai akun Discord atau Email (murni gratis tanpa kartu kredit). Klik <strong>Create Server &rarr; Free Tier (24/7, 512MB) &rarr; Node.js</strong> (pilih Node 20/22).
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              02. Clone dari GitHub &amp; Klik Start
            </div>
            <p>
              Di menu kiri server Wispbyte, buka tab <strong>GitHub</strong>, tempel link repo GitHub project ini lalu klik <strong>Clone</strong>. Setelah itu buka tab <strong>Console</strong> dan klik tombol <strong>Start</strong> (tidak perlu ubah setting/env apa pun).
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              03. Ketik Nomor WA di Console &amp; Tinggal!
            </div>
            <p>
              Begitu muncul tulisan <em>Mesin Aktif</em>, ketik nomor WA bot (misal <code className="font-mono">6281234567890</code>) langsung di kotak <strong>Type a command...</strong> bawah Console lalu Enter. Masukkan 8 kode Pairing yang muncul ke HP, lalu tutup browser—server jalan 24/7 sendiri (cukup login ke panel 14 hari sekali).
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
        </div>

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
