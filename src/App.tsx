import { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import {
  COMMAND_CATALOG,
  formatPhoneDisplay,
  OFFICIAL_OWNER_NUMBER,
} from './shared/commands.ts';
import { useBotRealtime } from './hooks/useBotRealtime.ts';
import { ChatSimulatorView } from './components/ChatSimulatorView.tsx';
import { ConnectionView } from './components/ConnectionView.tsx';
import { CommandCatalogView } from './components/CommandCatalogView.tsx';
import { ReplyTemplateEditorView } from './components/ReplyTemplateEditorView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { AntiBanView } from './components/AntiBanView.tsx';
import { GatewayWebhookView } from './components/GatewayWebhookView.tsx';

type ActiveWorkspace =
  | 'simulator'
  | 'catalog'
  | 'connection'
  | 'security'
  | 'settings';

export default function App() {
  const {
    waState,
    config,
    messages,
    logs,
    groupMembers,
    groupState,
    stats,
    webhookLogs,
    gatewayJobs,
    gatewayStats,
    socketConnected,
    backendUrl,
    backendUnreachable,
    isStaticHost,
    updateBackendUrl,
    connectQR,
    connectPairing,
    disconnectWA,
    updateConfig,
    sendSimulatorMessage,
    injectViewOnce,
    triggerGroupEvent,
    clearSimulator,
  } = useBotRealtime();

  const [activeTab, setActiveTab] = useState<ActiveWorkspace>('simulator');
  const [securitySubTab, setSecuritySubTab] = useState<'antiban' | 'gateway'>(
    'antiban'
  );
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'templates'>(
    'general'
  );
  const [prefillCommand, setPrefillCommand] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wabot_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('wabot_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage restrictions
    }
  }, [darkMode]);

  const lockedCount = COMMAND_CATALOG.filter((c) => c.suspensionRisk).length;
  const activeCommandCount =
    COMMAND_CATALOG.length - lockedCount - config.disabledCommands.length;

  const ownerDigits =
    (config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER).replace(
      /[^0-9]/g,
      ''
    ) || OFFICIAL_OWNER_NUMBER;
  const ownerDisplay = formatPhoneDisplay(ownerDigits);

  // Strict 5 single-line navigation links in Top Bar Contract
  const navItems: Array<{ id: ActiveWorkspace; label: string }> = [
    { id: 'simulator', label: 'Simulator' },
    { id: 'catalog', label: 'Menu & Fitur' },
    { id: 'connection', label: 'Koneksi WA' },
    { id: 'security', label: 'Keamanan & API' },
    { id: 'settings', label: 'Pengaturan' },
  ];

  const handleTryInSimulator = (fullCommand: string) => {
    setPrefillCommand(fullCommand);
    setActiveTab('simulator');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0C0C0E] text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-zinc-200/80 dark:border-zinc-800/90 bg-white/95 dark:bg-[#141417]/95 backdrop-blur-sm">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#simulator"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('simulator');
            }}
            className="text-lg font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0"
          >
            {config.botName}
          </a>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav
            aria-label="Navigasi Utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-400"
          >
            {navItems.map((item) => {
              const isCurrent = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'border-zinc-900 dark:border-emerald-500 text-zinc-900 dark:text-zinc-100'
                      : 'border-transparent hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('connection')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                waState.status === 'connected'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90'
              }`}
            >
              {waState.status === 'connected'
                ? `Terhubung (+${waState.connectedUser?.phone || 'WA'})`
                : 'Hubungkan WA'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        {/* Static Vercel / Unreachable Backend Notice */}
        {backendUnreachable && (
          <div className="bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <Server className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">
                  {isStaticHost
                    ? 'Halaman Statis Terdeteksi — Mesin Server Bot Belum Terhubung'
                    : 'Mesin Server Bot Belum Merespon'}
                </div>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  Pastikan mesin server 24/7 (Fly.io / VPS) aktif dan terhubung di menu Koneksi WA agar semua sesi serta perintah WhatsApp berjalan penuh.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('connection')}
              className="px-4 py-2 rounded-xl bg-amber-900 dark:bg-amber-500 text-white dark:text-zinc-950 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              Cek Koneksi Server
            </button>
          </div>
        )}

        {/* Clean Operational Overview Card */}
        <section className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Prefix {config.prefix}</span>
              <span aria-hidden="true">·</span>
              <span>Owner {ownerDisplay}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  socketConnected
                    ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                    : 'text-amber-700 dark:text-amber-400 font-medium'
                }
              >
                {socketConnected
                  ? backendUrl
                    ? 'Server 24/7 Aktif'
                    : 'Mesin Real-Time Aktif'
                  : 'Menyambungkan Server'}
              </span>
            </div>

            <h1
              className="text-xl sm:text-2xl font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
              style={{ textWrap: 'balance' }}
            >
              Panel Kontrol Multi-Fitur WhatsApp
            </h1>

            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Multi-downloader sosmed, studio stiker teks &amp; animasi, Status WA HD tanpa kompresi ({config.prefix}hdsw), efek audio studio, serta proteksi anti-ban otomatis.
            </p>
          </div>

          {/* Unboxed Tabular Summary Metrics (Zero-Pill Discipline) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-7 gap-y-3 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-zinc-200/80 dark:border-zinc-800 lg:pl-8 shrink-0">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Fitur Aktif
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {Math.max(0, activeCommandCount)}/{COMMAND_CATALOG.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Eksekusi
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.totalCommands}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Stiker
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.stickersCreated}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Media
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.mediaDownloaded}
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Navigation Bar (Visible below md breakpoint) */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-zinc-200/60 dark:bg-zinc-900 rounded-xl overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Active Workspace View */}
        {activeTab === 'simulator' && (
          <ChatSimulatorView
            config={config}
            messages={messages}
            logs={logs}
            groupMembers={groupMembers}
            groupState={groupState}
            prefillCommand={prefillCommand}
            onConsumePrefill={() => setPrefillCommand(null)}
            onSendMessage={sendSimulatorMessage}
            onInjectViewOnce={injectViewOnce}
            onTriggerGroupEvent={triggerGroupEvent}
            onClearMessages={clearSimulator}
          />
        )}

        {activeTab === 'catalog' && (
          <CommandCatalogView
            config={config}
            onUpdateConfig={updateConfig}
            onTryInSimulator={handleTryInSimulator}
          />
        )}

        {activeTab === 'connection' && (
          <ConnectionView
            waState={waState}
            config={config}
            socketConnected={socketConnected}
            backendUrl={backendUrl}
            backendUnreachable={backendUnreachable}
            isStaticHost={isStaticHost}
            onUpdateBackendUrl={updateBackendUrl}
            onConnectQR={connectQR}
            onConnectPairing={connectPairing}
            onDisconnect={disconnectWA}
            onUpdateConfig={updateConfig}
          />
        )}

        {activeTab === 'security' && (
          <div className="space-y-5">
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 max-w-fit">
              <button
                type="button"
                onClick={() => setSecuritySubTab('antiban')}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  securitySubTab === 'antiban'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Perisai Anti-Ban &amp; Cooldown
              </button>
              <button
                type="button"
                onClick={() => setSecuritySubTab('gateway')}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  securitySubTab === 'gateway'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                REST Gateway, Webhook &amp; Auto-Responder
              </button>
            </div>

            {securitySubTab === 'antiban' ? (
              <AntiBanView
                config={config}
                stats={stats}
                onUpdateConfig={updateConfig}
              />
            ) : (
              <GatewayWebhookView
                config={config}
                stats={stats}
                gatewayStats={gatewayStats}
                gatewayJobs={gatewayJobs}
                webhookLogs={webhookLogs}
                onUpdateConfig={updateConfig}
              />
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-5">
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 max-w-fit">
              <button
                type="button"
                onClick={() => setSettingsSubTab('general')}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settingsSubTab === 'general'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Identitas, Owner &amp; Moderasi
              </button>
              <button
                type="button"
                onClick={() => setSettingsSubTab('templates')}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settingsSubTab === 'templates'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Template Balasan Chat
              </button>
            </div>

            {settingsSubTab === 'general' ? (
              <SettingsView
                config={config}
                darkMode={darkMode}
                onToggleDarkMode={setDarkMode}
                onUpdateConfig={updateConfig}
              />
            ) : (
              <ReplyTemplateEditorView
                config={config}
                onUpdateConfig={updateConfig}
                onTryInSimulator={handleTryInSimulator}
              />
            )}
          </div>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-zinc-200/70 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span>{config.botName}</span>
          <span aria-hidden="true">·</span>
          <span>Owner: {ownerDisplay}</span>
        </div>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors whitespace-nowrap"
          >
            Menu &amp; Fitur ({config.prefix}menu)
          </button>
          <a
            href={`https://wa.me/${ownerDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors whitespace-nowrap"
          >
            wa.me/{ownerDigits}
          </a>
        </div>
      </footer>
    </div>
  );
}
