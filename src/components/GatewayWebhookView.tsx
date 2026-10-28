import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  ListPlus,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';
import { OFFICIAL_OWNER_NUMBER } from '../shared/commands.ts';
import { buildApiUrl, getActiveBackendBaseUrl } from '../lib/apiBase.ts';
import type {
  AutoResponderRule,
  BotConfig,
  GatewayJob,
  GatewayStats,
  WebhookConfig,
  WebhookDeliveryLog,
} from '../shared/types.ts';

interface GatewayWebhookViewProps {
  config: BotConfig;
  stats: any;
  gatewayStats?: GatewayStats;
  gatewayJobs?: GatewayJob[];
  webhookLogs?: WebhookDeliveryLog[];
  onUpdateConfig: (patch: Partial<BotConfig>) => Promise<void>;
}

type GatewaySubTab = 'console' | 'webhook' | 'autoresponder';

export function GatewayWebhookView({
  config,
  stats,
  gatewayStats = { totalSent: 0, queuedNow: 0, failedCount: 0, webhooksDelivered: 0 },
  gatewayJobs = [],
  webhookLogs = [],
  onUpdateConfig,
}: GatewayWebhookViewProps) {
  const [activeTab, setActiveTab] = useState<GatewaySubTab>('console');

  // Sub-Tab 1: API Console State
  const [consoleEndpoint, setConsoleEndpoint] = useState<
    'send-text' | 'send-media' | 'send-poll' | 'check-number'
  >('send-text');
  const [targetPhone, setTargetPhone] = useState(
    config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
  );
  const [messageText, setMessageText] = useState(
    'Halo! Ini adalah pesan otomatis yang dikirim via OpenWA REST API Gateway.'
  );
  const [mediaUrl, setMediaUrl] = useState(() => {
    const base =
      getActiveBackendBaseUrl() ||
      (typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000');
    return `${base}/api/sample-cat.jpg`;
  });
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  const [mediaCaption, setMediaCaption] = useState('Gambar dikirim via OpenWA API');
  const [pollTitle, setPollTitle] = useState('Apakah sistem anti-ban OpenWA ini sangat membantu?');
  const [pollOptions, setPollOptions] = useState(['Sangat Membantu 👍', 'Keren Banget 🔥', 'Cukup']);
  const [checkNumberInput, setCheckNumberInput] = useState(
    config.antiBan?.ownerNumber || OFFICIAL_OWNER_NUMBER
  );

  const [apiLoading, setApiLoading] = useState(false);
  const [apiResponse, setApiResponse] = useState<any | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Sub-Tab 2: Webhook Settings State
  const [webhookUrl, setWebhookUrl] = useState(config.webhook?.url || '');
  const [webhookSecret, setWebhookSecret] = useState(config.webhook?.secret || '');
  const [webhookEnabled, setWebhookEnabled] = useState(config.webhook?.enabled || false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    config.webhook?.events || ['message.received', 'message.sent', 'session.status']
  );
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{
    ok: boolean;
    statusCode: number;
    durationMs: number;
    error?: string;
  } | null>(null);
  const [webhookSavedNotice, setWebhookSavedNotice] = useState(false);

  // Sub-Tab 3: Auto-Responder Modal / Form State
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleTrigger, setRuleTrigger] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'exact' | 'contains' | 'regex'>('contains');
  const [ruleScope, setRuleScope] = useState<'all' | 'private_only' | 'group_only'>('all');
  const [ruleReplyText, setRuleReplyText] = useState('');
  const [ruleSaving, setRuleSaving] = useState(false);

  // --- Handlers: API Console ---
  const handleSendApi = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiLoading(true);
    setApiResponse(null);

    let url = '/api/gateway/send-text';
    let body: any = {};

    if (consoleEndpoint === 'send-text') {
      url = '/api/gateway/send-text';
      body = { to: targetPhone, text: messageText };
    } else if (consoleEndpoint === 'send-media') {
      url = '/api/gateway/send-media';
      body = {
        to: targetPhone,
        mediaUrl,
        mediaType,
        caption: mediaCaption,
      };
    } else if (consoleEndpoint === 'send-poll') {
      url = '/api/gateway/send-poll';
      body = {
        to: targetPhone,
        name: pollTitle,
        values: pollOptions.filter(Boolean),
      };
    } else if (consoleEndpoint === 'check-number') {
      url = '/api/gateway/check-number';
      body = { phone: checkNumberInput };
    }

    try {
      const res = await fetch(buildApiUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setApiResponse({ status: res.status, ok: res.ok, data });
    } catch (err: any) {
      setApiResponse({ status: 0, ok: false, error: err?.message || 'Gagal menghubungi gateway' });
    } finally {
      setApiLoading(false);
    }
  };

  const getCurlSnippet = () => {
    const origin =
      getActiveBackendBaseUrl() ||
      (typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000');
    if (consoleEndpoint === 'send-text') {
      return `curl -X POST ${origin}/api/gateway/send-text \\
  -H "Content-Type: application/json" \\
  -d '{"to": "${targetPhone}", "text": "${messageText.replace(/'/g, "\\'")}"}'`;
    }
    if (consoleEndpoint === 'send-media') {
      return `curl -X POST ${origin}/api/gateway/send-media \\
  -H "Content-Type: application/json" \\
  -d '{"to": "${targetPhone}", "mediaUrl": "${mediaUrl}", "mediaType": "${mediaType}", "caption": "${mediaCaption}"}'`;
    }
    if (consoleEndpoint === 'send-poll') {
      return `curl -X POST ${origin}/api/gateway/send-poll \\
  -H "Content-Type: application/json" \\
  -d '{"to": "${targetPhone}", "name": "${pollTitle}", "values": ${JSON.stringify(
        pollOptions
      )}}'`;
    }
    return `curl -X POST ${origin}/api/gateway/check-number \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "${checkNumberInput}"}'`;
  };

  const copyCurlToClipboard = () => {
    void navigator.clipboard.writeText(getCurlSnippet());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  // --- Handlers: Webhook Settings ---
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      webhook: {
        enabled: webhookEnabled,
        url: webhookUrl.trim(),
        secret: webhookSecret.trim(),
        events: selectedEvents,
      },
    });
    setWebhookSavedNotice(true);
    setTimeout(() => setWebhookSavedNotice(false), 2200);
  };

  const handleTestPing = async () => {
    if (!webhookUrl.trim()) return;
    setPingLoading(true);
    setPingResult(null);
    try {
      const res = await fetch(buildApiUrl('/api/gateway/test-webhook'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl.trim(),
          secret: webhookSecret.trim(),
        }),
      });
      const data = await res.json();
      setPingResult(data);
    } catch (err: any) {
      setPingResult({
        ok: false,
        statusCode: 0,
        durationMs: 0,
        error: err?.message || 'Gagal mengirim ping test',
      });
    } finally {
      setPingLoading(false);
    }
  };

  const generateRandomSecret = () => {
    const chars = 'abcdef0123456789';
    let s = 'whsec_';
    for (let i = 0; i < 28; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setWebhookSecret(s);
  };

  // --- Handlers: Auto-Responder ---
  const openNewRuleModal = () => {
    setEditingRuleId(null);
    setRuleTrigger('');
    setRuleMatchType('contains');
    setRuleScope('all');
    setRuleReplyText('');
    setShowRuleModal(true);
  };

  const openEditRuleModal = (rule: AutoResponderRule) => {
    setEditingRuleId(rule.id);
    setRuleTrigger(rule.trigger);
    setRuleMatchType(rule.matchType);
    setRuleScope(rule.scope);
    setRuleReplyText(rule.replyText);
    setShowRuleModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTrigger.trim() || !ruleReplyText.trim()) return;
    setRuleSaving(true);
    try {
      if (editingRuleId) {
        await fetch(buildApiUrl(`/api/gateway/auto-responder/${editingRuleId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: ruleTrigger.trim(),
            matchType: ruleMatchType,
            scope: ruleScope,
            replyText: ruleReplyText.trim(),
          }),
        });
      } else {
        await fetch(buildApiUrl('/api/gateway/auto-responder/add'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: ruleTrigger.trim(),
            matchType: ruleMatchType,
            scope: ruleScope,
            replyText: ruleReplyText.trim(),
            enabled: true,
          }),
        });
      }
      setShowRuleModal(false);
    } finally {
      setRuleSaving(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    await fetch(buildApiUrl(`/api/gateway/auto-responder/${id}`), {
      method: 'DELETE',
    });
  };

  const handleToggleRule = async (rule: AutoResponderRule) => {
    await fetch(buildApiUrl(`/api/gateway/auto-responder/${rule.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
  };

  const autoResponderList = config.autoResponder || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>OpenWA REST Gateway &amp; Webhook Engine</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Antrean Paced FIFO Aktif
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-zinc-900 dark:text-zinc-100">
                Pusat Gateway, Webhook &amp; Auto-Responder
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                Adopsi arsitektur <strong>rmyndharis/OpenWA</strong> untuk mengirim pesan via HTTP API,
                meneruskan event chat masuk ke Webhook eksternal (n8n/Make/Zapier) dengan HMAC SHA-256,
                dan mengelola aturan auto-reply kata kunci tanpa koding.
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 min-w-[120px]">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Terkirim via Antrean</div>
              <div className="text-lg font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
                {gatewayStats.totalSent}
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 min-w-[120px]">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Dalam Antrean</div>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                {gatewayStats.queuedNow}
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 min-w-[120px] col-span-2 sm:col-span-1">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Aturan Auto-Reply</div>
              <div className="text-lg font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
                {autoResponderList.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Segmented Sub-Tab Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 max-w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('console')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'console'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          REST API Console &amp; Tester
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('webhook')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'webhook'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Webhook className="w-3.5 h-3.5" />
          Webhook Dispatcher &amp; Log
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('autoresponder')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'autoresponder'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Auto-Responder Kata Kunci
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: REST API CONSOLE */}
      {/* ========================================================================= */}
      {activeTab === 'console' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Endpoint Form */}
          <div className="lg:col-span-7 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Uji Coba Pengiriman Endpoint HTTP
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Setiap pesan yang dikirim lewat endpoint ini otomatis masuk ke antrean <strong>OpenWA Paced Queue</strong> dengan jeda acak manusiawi.
              </p>
            </div>

            {/* Endpoint Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {[
                { id: 'send-text', label: 'Kirim Teks' },
                { id: 'send-media', label: 'Kirim Media' },
                { id: 'send-poll', label: 'Buat Polling' },
                { id: 'check-number', label: 'Cek Nomor WA' },
              ].map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setConsoleEndpoint(ep.id as any)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-medium border text-center transition-all ${
                    consoleEndpoint === ep.id
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                  }`}
                >
                  {ep.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendApi} className="space-y-4 pt-2">
              {consoleEndpoint !== 'check-number' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Nomor Tujuan / ID Grup (To)
                  </label>
                  <input
                    type="text"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    placeholder="Contoh: 6281234567890 atau 120363xxx@g.us"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <p className="text-[11px] text-zinc-500">
                    Gunakan format nomor internasional dengan kode negara tanpa tanda plus (+).
                  </p>
                </div>
              )}

              {consoleEndpoint === 'send-text' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Isi Pesan Teks
                  </label>
                  <textarea
                    rows={4}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Tulis pesan..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              )}

              {consoleEndpoint === 'send-media' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Tipe Media
                      </label>
                      <select
                        value={mediaType}
                        onChange={(e) => setMediaType(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="image">Gambar (Foto / Banner)</option>
                        <option value="video">Video MP4</option>
                        <option value="audio">Audio MP3 / Voice Note</option>
                        <option value="document">Dokumen PDF / File</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Caption / Teks Penyerta
                      </label>
                      <input
                        type="text"
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        placeholder="Caption media..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Tautan URL Media Langsung
                    </label>
                    <input
                      type="url"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="https://domain.com/gambar.jpg"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </>
              )}

              {consoleEndpoint === 'send-poll' && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Judul / Pertanyaan Polling
                    </label>
                    <input
                      type="text"
                      value={pollTitle}
                      onChange={(e) => setPollTitle(e.target.value)}
                      placeholder="Judul voting..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Opsi Pilihan (Pisahkan dengan baris baru)
                    </label>
                    <textarea
                      rows={3}
                      value={pollOptions.join('\n')}
                      onChange={(e) => setPollOptions(e.target.value.split('\n'))}
                      placeholder="Pilihan 1&#10;Pilihan 2"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </>
              )}

              {consoleEndpoint === 'check-number' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Nomor WhatsApp yang Ingin Diperiksa
                  </label>
                  <input
                    type="text"
                    value={checkNumberInput}
                    onChange={(e) => setCheckNumberInput(e.target.value)}
                    placeholder="Contoh: 6281234567890"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <p className="text-[11px] text-zinc-500">
                    Memeriksa ke server WhatsApp apakah nomor terdaftar dan mendapatkan format JID resminya.
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {consoleEndpoint === 'check-number'
                    ? 'Verifikasi live onWhatsApp'
                    : 'Pesan akan masuk antrean FIFO aman'}
                </span>
                <button
                  type="submit"
                  disabled={apiLoading}
                  className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {apiLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      {consoleEndpoint === 'check-number' ? 'Cek Status Nomor' : 'Eksekusi API'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right 5 Columns: Response Box & cURL Generator */}
          <div className="lg:col-span-5 space-y-5">
            {/* Live cURL Generator */}
            <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-emerald-600" />
                  Salin Contoh Perintah cURL
                </span>
                <button
                  type="button"
                  onClick={copyCurlToClipboard}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  {copiedCurl ? (
                    <>
                      <Check className="w-3 h-3" /> Tersalin!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Salin cURL
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-[11px] font-mono text-zinc-800 dark:text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {getCurlSnippet()}
              </pre>
            </div>

            {/* Live API Response Display */}
            <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-zinc-500" />
                  Hasil Respon Server (HTTP Response)
                </span>
                {apiResponse && (
                  <span
                    className={`text-xs font-mono tabular-nums font-semibold ${
                      apiResponse.ok
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    HTTP {apiResponse.status}
                  </span>
                )}
              </div>
              {apiResponse ? (
                <pre className="p-3 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-56 leading-relaxed">
                  {JSON.stringify(apiResponse.data || apiResponse, null, 2)}
                </pre>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
                  Tekan "Eksekusi API" di sebelah kiri untuk melihat balasan JSON dari gateway.
                </div>
              )}
            </div>

            {/* Recent Queue Jobs Strip */}
            <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Riwayat Antrean Job Terbaru
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  {gatewayJobs.length} Job
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {gatewayJobs.length === 0 ? (
                  <div className="text-center py-4 text-xs text-zinc-400">
                    Belum ada pesan yang mengantre.
                  </div>
                ) : (
                  gatewayJobs.slice(0, 5).map((job) => (
                    <div
                      key={job.id}
                      className="p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/80 bg-[#FAF9F6] dark:bg-zinc-900/60 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5 truncate pr-2">
                        <div className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold truncate">
                          {job.to}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">{job.text}</div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 font-mono ${
                          job.status === 'sent'
                            ? 'text-emerald-600'
                            : job.status === 'composing'
                            ? 'text-amber-600'
                            : job.status === 'failed'
                            ? 'text-rose-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: WEBHOOK DISPATCHER */}
      {/* ========================================================================= */}
      {activeTab === 'webhook' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Webhook Configuration */}
          <form
            onSubmit={handleSaveWebhook}
            className="lg:col-span-7 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-6"
          >
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Konfigurasi Webhook Keluar (Outbound Webhooks)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Teruskan setiap chat masuk di WhatsApp, pembaruan grup, dan status koneksi secara otomatis ke endpoint backend atau automasi Anda (n8n, Make, Flowise).
              </p>
            </div>

            {/* Master Switch */}
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900 flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer">
                  Aktifkan Pengiriman Webhook Realtime
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Kirim HTTP POST setiap kali ada aktivitas WhatsApp yang cocok.
                </p>
              </div>
              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={(e) => setWebhookEnabled(e.target.checked)}
                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800 cursor-pointer"
              />
            </div>

            {/* Webhook URL Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Target Endpoint URL (HTTP POST)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://webhook.site/xxx atau https://n8n.domain.com/webhook/xxx"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  required={webhookEnabled}
                />
                <button
                  type="button"
                  onClick={handleTestPing}
                  disabled={pingLoading || !webhookUrl.trim()}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {pingLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin inline mr-1" />
                      Testing...
                    </>
                  ) : (
                    'Test Ping'
                  )}
                </button>
              </div>
              {pingResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
                    pingResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                  }`}
                >
                  <span className="font-semibold">
                    {pingResult.ok
                      ? `✓ Terhubung Sukses (HTTP ${pingResult.statusCode} dalam ${pingResult.durationMs}ms)`
                      : `✕ Gagal: ${pingResult.error || 'Server tidak merespon'}`}
                  </span>
                </div>
              )}
            </div>

            {/* HMAC Secret Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Kunci Rahasia HMAC SHA-256 (Secret Key)
                </label>
                <button
                  type="button"
                  onClick={generateRandomSecret}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Acak Kunci Baru
                </button>
              </div>
              <input
                type="text"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="whsec_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-zinc-500">
                Disertakan di header <code>X-OpenWA-Signature: sha256=&lt;hash&gt;</code> untuk memvalidasi bahwa payload benar-benar berasal dari bot Anda.
              </p>
            </div>

            {/* Event Checkboxes */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Pilih Event yang Diteruskan
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { id: 'message.received', label: 'Pesan Masuk (Chat & Media)', desc: 'Saat ada user/grup mengirim chat' },
                  { id: 'message.sent', label: 'Pesan Keluar Terkirim', desc: 'Konfirmasi bot selesai mengirim' },
                  { id: 'session.status', label: 'Perubahan Status Sesi WA', desc: 'Saat tersambung, putus, atau QR baru' },
                  { id: 'group.participant_update', label: 'Aktivitas Grup (Join/Leave)', desc: 'Saat ada member baru atau keluar' },
                ].map((ev) => {
                  const checked = selectedEvents.includes(ev.id);
                  return (
                    <label
                      key={ev.id}
                      className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                        checked
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEvents([...selectedEvents, ev.id]);
                          } else {
                            setSelectedEvents(selectedEvents.filter((x) => x !== ev.id));
                          }
                        }}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {ev.label}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {ev.desc}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-500">
                Format payload kompatibel dengan spesifikasi webhook OpenWA.
              </span>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
              >
                {webhookSavedNotice ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Tersimpan
                  </>
                ) : (
                  'Simpan Pengaturan Webhook'
                )}
              </button>
            </div>
          </form>

          {/* Right 5 Columns: Delivery Logs Table */}
          <div className="lg:col-span-5 bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Log Pengiriman Webhook
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Riwayat 20 pemanggilan HTTP webhook terakhir.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                {webhookLogs.length} Terkirim
              </span>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
              {webhookLogs.length === 0 ? (
                <div className="text-center py-10 text-xs text-zinc-400">
                  Belum ada log aktivitas webhook. Aktifkan webhook dan lakukan Test Ping atau kirim pesan di WhatsApp.
                </div>
              ) : (
                webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-zinc-900/60 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {log.event}
                      </span>
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${
                          log.success
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {log.statusCode ? `HTTP ${log.statusCode}` : 'Timeout'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">{log.url}</div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                      <span>{new Date(log.timestamp).toLocaleTimeString('id-ID')}</span>
                      <span>{log.durationMs}ms</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: AUTO-RESPONDER RULES */}
      {/* ========================================================================= */}
      {activeTab === 'autoresponder' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Aturan Respon Otomatis (Auto-Responder Rule Engine)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Konfigurasikan kata kunci otomatis (FAQ, info harga, link sosmed, sambutan) agar bot langsung membalas chat tanpa perlu mengetik awalan titik.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewRuleModal}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Aturan Kata Kunci
            </button>
          </div>

          {/* Rules Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {autoResponderList.length === 0 ? (
              <div className="col-span-full bg-white dark:bg-[#141417] border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-xs text-zinc-400">
                Belum ada aturan kata kunci yang dibuat. Klik tombol "+ Tambah Aturan Kata Kunci" untuk memulai.
              </div>
            ) : (
              autoResponderList.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-white dark:bg-[#141417] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          &ldquo;{rule.trigger}&rdquo;
                        </span>
                        <span aria-hidden="true" className="text-zinc-400">
                          ·
                        </span>
                        <span className="font-mono text-zinc-500 dark:text-zinc-400">
                          {rule.matchType}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${
                          rule.enabled
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500'
                        }`}
                      >
                        {rule.enabled ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>

                    <div className="text-xs text-zinc-600 dark:text-zinc-300 bg-[#FAF9F6] dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 leading-relaxed font-sans">
                      {rule.replyText}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      <span>
                        Cakupan:{' '}
                        <strong>
                          {rule.scope === 'all'
                            ? 'Semua Obrolan'
                            : rule.scope === 'private_only'
                            ? 'Khusus Chat Pribadi'
                            : 'Khusus Grup'}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        Terpicu: <strong>{rule.hitCount || 0} kali</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => openEditRuleModal(rule)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Ubah Teks
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal Dialog: Add/Edit Auto-Responder Rule */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {editingRuleId ? 'Ubah Aturan Respon Otomatis' : 'Tambah Aturan Kata Kunci Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRuleModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Kata Kunci / Trigger
                </label>
                <input
                  type="text"
                  value={ruleTrigger}
                  onChange={(e) => setRuleTrigger(e.target.value)}
                  placeholder="Contoh: harga, rules, link website"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Tipe Pencocokan
                  </label>
                  <select
                    value={ruleMatchType}
                    onChange={(e) => setRuleMatchType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="contains">Contains (Mengandung Kata)</option>
                    <option value="exact">Exact (Tepat Sama Persis)</option>
                    <option value="regex">Regex (Regular Expression)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Cakupan Chat
                  </label>
                  <select
                    value={ruleScope}
                    onChange={(e) => setRuleScope(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">Semua (Pribadi &amp; Grup)</option>
                    <option value="private_only">Hanya Chat Pribadi</option>
                    <option value="group_only">Hanya Obrolan Grup</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Teks Balasan Otomatis
                </label>
                <textarea
                  rows={4}
                  value={ruleReplyText}
                  onChange={(e) => setRuleReplyText(e.target.value)}
                  placeholder="Halo {sender}, terima kasih sudah menghubungi..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  required
                />
                <div className="text-[11px] text-zinc-500">
                  Variabel otomatis: <code>{'{sender}'}</code>, <code>{'{time}'}</code>, <code>{'{botName}'}</code>, <code>{'{groupName}'}</code>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ruleSaving}
                  className="px-5 py-2 rounded-xl bg-zinc-900 dark:bg-emerald-600 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {ruleSaving ? 'Menyimpan...' : 'Simpan Aturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
