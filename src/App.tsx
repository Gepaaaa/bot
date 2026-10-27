import { useEffect, useState } from 'react';
import { COMMAND_CATALOG } from './shared/commands.ts';
import { useBotRealtime } from './hooks/useBotRealtime.ts';
import { GepaCreatorAvatar } from './components/GepaAvatar.tsx';
import { ChatSimulatorView } from './components/ChatSimulatorView.tsx';
import { ConnectionView } from './components/ConnectionView.tsx';
import { CommandCatalogView } from './components/CommandCatalogView.tsx';
import { ReplyTemplateEditorView } from './components/ReplyTemplateEditorView.tsx';
import { SettingsView } from './components/SettingsView.tsx';

type ActiveTab =
  | 'simulator'
  | 'connection'
  | 'catalog'
  | 'templates'
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
    socketConnected,
    connectQR,
    connectPairing,
    disconnectWA,
    updateConfig,
    sendSimulatorMessage,
    triggerGroupEvent,
    clearSimulator,
  } = useBotRealtime();

  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [prefillCommand, setPrefillCommand] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gepabot_theme') === 'dark';
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
      localStorage.setItem('gepabot_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage restrictions
    }
  }, [darkMode]);

  const activeCommandCount =
    COMMAND_CATALOG.length - config.disabledCommands.length;

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'simulator', label: 'Simulator Chat' },
    { id: 'connection', label: 'Koneksi WA' },
    { id: 'catalog', label: 'Katalog Command' },
    { id: 'templates', label: 'Template Chat' },
    { id: 'settings', label: 'Pengaturan' },
  ];

  const handleTryInSimulator = (fullCommand: string) => {
    setPrefillCommand(fullCommand);
    setActiveTab('simulator');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0C0C0E] text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-zinc-200/80 dark:border-zinc-800/90 bg-white/90 dark:bg-[#141417]/90 backdrop-blur-sm">
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
            className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400"
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

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Gepa — Personal Corner Identity Strip */}
        <section className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            <GepaCreatorAvatar className="w-16 h-16" />
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{config.ownerName}</span>
                <span aria-hidden="true">·</span>
                <span>{config.ownerWebsite}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      socketConnected ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {socketConnected
                      ? 'Mesin Real-Time Terhubung'
                      : 'Menyambungkan Mesin...'}
                  </span>
                </span>
              </div>

              <h1
                className="text-xl sm:text-2xl font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
                style={{ textWrap: 'balance' }}
              >
                Bot WhatsApp Serbaguna Cukup Ketik Satu Titik ({config.prefix})
              </h1>

              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                Download video TikTok ({config.prefix}tt), kirim Status WA HD
                tanpa kompresi dari Dokumen ({config.prefix}hdsw), stiker instan (
                {config.prefix}s &amp; {config.prefix}brat), reaksi status otomatis (
                {config.reactions.pending} {config.reactions.error}{' '}
                {config.reactions.success}), serta admin &amp; kustomisasi grup (
                {config.prefix}setwelcome, {config.prefix}setout, {config.prefix}kick).
              </p>
            </div>
          </div>

          {/* Unboxed Tabular Summary Metrics (Zero-Pill Discipline) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-x-8 gap-y-4 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-zinc-200/80 dark:border-zinc-800 lg:pl-8 shrink-0">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Fitur Aktif
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {activeCommandCount}/{COMMAND_CATALOG.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Total Eksekusi
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.totalCommands}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Stiker Dibuat
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.stickersCreated}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Media Diunduh
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.mediaDownloaded}
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Tab Switcher (Visible below md breakpoint, non-sticky) */}
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
            onTriggerGroupEvent={triggerGroupEvent}
            onClearMessages={clearSimulator}
          />
        )}

        {activeTab === 'connection' && (
          <ConnectionView
            waState={waState}
            config={config}
            onConnectQR={connectQR}
            onConnectPairing={connectPairing}
            onDisconnect={disconnectWA}
            onUpdateConfig={updateConfig}
          />
        )}

        {activeTab === 'catalog' && (
          <CommandCatalogView
            config={config}
            onUpdateConfig={updateConfig}
            onTryInSimulator={handleTryInSimulator}
          />
        )}

        {activeTab === 'templates' && (
          <ReplyTemplateEditorView
            config={config}
            onUpdateConfig={updateConfig}
            onTryInSimulator={handleTryInSimulator}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            config={config}
            darkMode={darkMode}
            onToggleDarkMode={setDarkMode}
            onUpdateConfig={updateConfig}
          />
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-zinc-200/70 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span>{config.botName}</span>
          <span aria-hidden="true">·</span>
          <span>Gepa — Personal Corner</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors whitespace-nowrap"
          >
            Daftar Command ({config.prefix})
          </button>
          <a
            href="https://gepacorner.my.id"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors whitespace-nowrap"
          >
            gepacorner.my.id
          </a>
        </div>
      </footer>
    </div>
  );
}
