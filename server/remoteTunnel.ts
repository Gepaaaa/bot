import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { resolveDataDir } from './storagePath.ts';

export type TunnelStatus = 'stopped' | 'starting' | 'online' | 'error';
export type TunnelProvider = 'cloudflared' | 'ssh-localhost-run' | null;

export interface RemoteAccessSnapshot {
  ok: true;
  status: TunnelStatus;
  provider: TunnelProvider;
  publicUrl: string | null;
  magicUrl: string | null;
  lanUrls: string[];
  localhostUrl: string;
  accessKey: string;
  autoStartTunnel: boolean;
  cloudflaredInstalled: boolean;
  lastError: string | null;
}

interface PersistedRemoteConfig {
  accessKey: string;
  autoStartTunnel: boolean;
}

function getLocalLanUrls(port: number): string[] {
  const urls: string[] = [];
  try {
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const net of entries) {
        const fam = String(net.family);
        if ((fam === 'IPv4' || fam === '4') && !net.internal && net.address) {
          const url = `http://${net.address}:${port}`;
          if (!urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }
  } catch {
    // Ignore SELinux interface restrictions on Android 11+
  }
  return urls;
}

function detectBinaryAvailable(binName: string): boolean {
  try {
    execFileSync(binName, ['--version'], {
      stdio: 'ignore',
      timeout: 3000,
    });
    return true;
  } catch {
    const termuxPath = `/data/data/com.termux/files/usr/bin/${binName}`;
    return fs.existsSync(termuxPath);
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function isTrustedLocalOrPreviewHost(rawHost?: string): boolean {
  if (!rawHost) return true;
  const host = rawHost.split(':')[0].trim().toLowerCase();
  if (!host) return true;

  // Local loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  // Private Wi-Fi / LAN & Tailscale CGNAT ranges
  if (
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.ts.net')
  ) {
    return true;
  }

  // AI Studio & Cloud Run preview environments (already authenticated by Google AI Studio)
  if (
    host.endsWith('.run.app') ||
    host.endsWith('.googleusercontent.com') ||
    host.endsWith('.google.com') ||
    host.endsWith('.goog') ||
    host.endsWith('.cloudworkstations.dev') ||
    host.endsWith('.web.app')
  ) {
    return true;
  }

  return false;
}

function isRequestFromPublicTunnel(
  headers: http.IncomingHttpHeaders,
  activePublicUrl?: string | null
): boolean {
  const forwardedHost = Array.isArray(headers['x-forwarded-host'])
    ? headers['x-forwarded-host'][0]
    : headers['x-forwarded-host'];
  const effectiveHost = (forwardedHost || headers.host || '')
    .split(',')[0]
    .split(':')[0]
    .trim()
    .toLowerCase();

  if (isTrustedLocalOrPreviewHost(effectiveHost)) {
    return false;
  }

  if (
    effectiveHost.endsWith('.trycloudflare.com') ||
    effectiveHost.endsWith('.lhr.life')
  ) {
    return true;
  }

  if (activePublicUrl) {
    try {
      const tunnelHost = new URL(activePublicUrl).hostname.toLowerCase();
      if (effectiveHost === tunnelHost) {
        return true;
      }
    } catch {
      // Ignore malformed tunnel URL
    }
    if (headers['cf-ray'] || headers['cf-connecting-ip']) {
      return true;
    }
  }

  return false;
}

class RemoteTunnelManager {
  private configFile: string;
  private accessKey: string;
  private autoStartTunnel = false;
  private status: TunnelStatus = 'stopped';
  private provider: TunnelProvider = null;
  private publicUrl: string | null = null;
  private lastError: string | null = null;
  private child: ChildProcess | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private activePort = 3000;
  private intentionalStop = false;

  constructor() {
    this.configFile = path.join(resolveDataDir(), '.remote-access.json');
    const loaded = this.loadConfig();
    this.accessKey = loaded.accessKey;
    this.autoStartTunnel = loaded.autoStartTunnel;
  }

  private generateKey(): string {
    return crypto.randomBytes(9).toString('base64url');
  }

  private loadConfig(): PersistedRemoteConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = JSON.parse(
          fs.readFileSync(this.configFile, 'utf-8')
        ) as Partial<PersistedRemoteConfig>;
        if (raw.accessKey && raw.accessKey.length >= 8) {
          return {
            accessKey: raw.accessKey,
            autoStartTunnel: Boolean(raw.autoStartTunnel),
          };
        }
      }
    } catch {
      // Ignore corrupt config
    }
    const fresh: PersistedRemoteConfig = {
      accessKey: this.generateKey(),
      autoStartTunnel: false,
    };
    this.saveConfig(fresh);
    return fresh;
  }

  private saveConfig(cfg?: PersistedRemoteConfig): void {
    const payload = cfg || {
      accessKey: this.accessKey,
      autoStartTunnel: this.autoStartTunnel,
    };
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(payload, null, 2));
    } catch {
      // Ignore read-only fs errors
    }
  }

  public setPort(port: number): void {
    if (port > 0) this.activePort = port;
  }

  public getPort(): number {
    return this.activePort;
  }

  public rotateAccessKey(): string {
    this.accessKey = this.generateKey();
    this.saveConfig();
    return this.accessKey;
  }

  public getSnapshot(portOverride?: number): RemoteAccessSnapshot {
    const port = portOverride || this.activePort;
    const magicUrl = this.publicUrl
      ? `${this.publicUrl}/?key=${encodeURIComponent(this.accessKey)}`
      : null;

    return {
      ok: true,
      status: this.status,
      provider: this.provider,
      publicUrl: this.publicUrl,
      magicUrl,
      lanUrls: getLocalLanUrls(port),
      localhostUrl: `http://localhost:${port}`,
      accessKey: this.accessKey,
      autoStartTunnel: this.autoStartTunnel,
      cloudflaredInstalled: detectBinaryAvailable('cloudflared'),
      lastError: this.lastError,
    };
  }

  public async autoResumeIfEnabled(port: number): Promise<void> {
    this.setPort(port);
    if (this.autoStartTunnel) {
      await this.startTunnel(port, 4000).catch(() => {});
    }
  }

  public async startTunnel(
    portOverride?: number,
    waitReadyMs = 9500
  ): Promise<RemoteAccessSnapshot> {
    if (portOverride && portOverride > 0) {
      this.activePort = portOverride;
    }

    this.intentionalStop = false;
    this.autoStartTunnel = true;
    this.saveConfig();

    if (this.status === 'online' && this.publicUrl && this.child) {
      return this.getSnapshot();
    }

    this.killExistingProcess();
    this.status = 'starting';
    this.publicUrl = null;
    this.lastError = null;

    const hasCloudflared = detectBinaryAvailable('cloudflared');
    const hasSsh = detectBinaryAvailable('ssh');

    if (!hasCloudflared && !hasSsh) {
      this.status = 'error';
      this.provider = null;
      this.lastError =
        'Paket cloudflared belum terpasang di Termux. Jalankan: pkg install -y cloudflared';
      return this.getSnapshot();
    }

    const targetLocal = `http://127.0.0.1:${this.activePort}`;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };

      const timer = setTimeout(finish, waitReadyMs);

      const handleOutputChunk = (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const cfMatch = text.match(
          /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i
        );
        const lhrMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/i);
        const foundUrl = cfMatch?.[0] || lhrMatch?.[0];

        if (foundUrl) {
          this.publicUrl = foundUrl.replace(/\/+$/, '');
          this.status = 'online';
          this.lastError = null;
          finish();
        }
      };

      if (hasCloudflared) {
        this.provider = 'cloudflared';
        const cfBin = fs.existsSync(
          '/data/data/com.termux/files/usr/bin/cloudflared'
        )
          ? '/data/data/com.termux/files/usr/bin/cloudflared'
          : 'cloudflared';

        // --protocol http2 is mandatory on Android/ARMv7 mobile networks that block UDP QUIC
        const proc = spawn(
          cfBin,
          [
            'tunnel',
            '--protocol',
            'http2',
            '--edge-ip-version',
            '4',
            '--no-autoupdate',
            '--url',
            targetLocal,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        this.child = proc;
        proc.stdout?.on('data', handleOutputChunk);
        proc.stderr?.on('data', handleOutputChunk);
        proc.on('error', (err) => {
          this.status = 'error';
          this.lastError = `Gagal menjalankan cloudflared: ${err.message}`;
          finish();
        });
        proc.on('exit', () => {
          if (this.child === proc) {
            this.child = null;
            if (!this.intentionalStop && this.autoStartTunnel) {
              this.status = 'starting';
              this.scheduleReconnect();
            } else {
              this.status = 'stopped';
              this.publicUrl = null;
            }
          }
          finish();
        });
      } else {
        this.provider = 'ssh-localhost-run';
        const proc = spawn(
          'ssh',
          [
            '-o',
            'StrictHostKeyChecking=no',
            '-o',
            'UserKnownHostsFile=/dev/null',
            '-o',
            'ServerAliveInterval=30',
            '-o',
            'ExitOnForwardFailure=yes',
            '-R',
            `80:127.0.0.1:${this.activePort}`,
            'nokey@localhost.run',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        this.child = proc;
        proc.stdout?.on('data', handleOutputChunk);
        proc.stderr?.on('data', handleOutputChunk);
        proc.on('error', (err) => {
          this.status = 'error';
          this.lastError = `Gagal membuka tunnel SSH: ${err.message}`;
          finish();
        });
        proc.on('exit', () => {
          if (this.child === proc) {
            this.child = null;
            if (!this.intentionalStop && this.autoStartTunnel) {
              this.status = 'starting';
              this.scheduleReconnect();
            } else {
              this.status = 'stopped';
              this.publicUrl = null;
            }
          }
          finish();
        });
      }
    });

    return this.getSnapshot();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionalStop || !this.autoStartTunnel) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalStop && this.autoStartTunnel) {
        this.startTunnel(this.activePort, 8000).catch(() => {});
      }
    }, 6000);
    this.reconnectTimer.unref?.();
  }

  private killExistingProcess(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.child) {
      const old = this.child;
      this.child = null;
      try {
        old.kill('SIGTERM');
      } catch {
        // Ignore
      }
    }
  }

  public stopTunnel(): RemoteAccessSnapshot {
    this.intentionalStop = true;
    this.autoStartTunnel = false;
    this.saveConfig();
    this.killExistingProcess();
    this.status = 'stopped';
    this.provider = null;
    this.publicUrl = null;
    this.lastError = null;
    return this.getSnapshot();
  }

  public isAuthorizedWsUpgrade(req: http.IncomingMessage): boolean {
    const host = req.headers.host;
    if (!isRequestFromPublicTunnel(req.headers, this.publicUrl)) {
      return true;
    }
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.wabot_owner_key === this.accessKey) {
      return true;
    }
    try {
      const parsed = new URL(req.url || '/', `http://${host || 'localhost'}`);
      if (parsed.searchParams.get('key') === this.accessKey) {
        return true;
      }
    } catch {
      // Ignore invalid URL
    }
    return false;
  }

  public expressMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    // Lightweight health checks stay open
    if (req.path === '/ping' || req.path === '/api/health') {
      next();
      return;
    }

    if (!isRequestFromPublicTunnel(req.headers, this.publicUrl)) {
      next();
      return;
    }

    // Allow key submission via POST /api/remote-auth
    if (req.path === '/api/remote-auth' && req.method === 'POST') {
      const submitted = String(req.body?.key || '').trim();
      if (submitted && submitted === this.accessKey) {
        const secureFlag =
          req.secure || req.headers['x-forwarded-proto'] === 'https'
            ? '; Secure'
            : '';
        res.setHeader(
          'Set-Cookie',
          `wabot_owner_key=${encodeURIComponent(
            this.accessKey
          )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`
        );
        res.json({ ok: true });
      } else {
        res
          .status(401)
          .json({ ok: false, error: 'Kunci Akses Owner tidak sesuai.' });
      }
      return;
    }

    // Magic Link (?key=...) automatic cookie login for Owner's 2nd phone
    const queryKey =
      typeof req.query.key === 'string' ? req.query.key.trim() : '';
    if (queryKey && queryKey === this.accessKey) {
      const secureFlag =
        req.secure || req.headers['x-forwarded-proto'] === 'https'
          ? '; Secure'
          : '';
      res.setHeader(
        'Set-Cookie',
        `wabot_owner_key=${encodeURIComponent(
          this.accessKey
        )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`
      );
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.redirect(302, req.path || '/');
        return;
      }
      next();
      return;
    }

    // Cookie or X-Owner-Key header check
    const cookies = parseCookies(req.headers.cookie);
    const headerKey = String(req.headers['x-owner-key'] || '').trim();
    if (
      cookies.wabot_owner_key === this.accessKey ||
      (headerKey && headerKey === this.accessKey)
    ) {
      next();
      return;
    }

    if (req.path.startsWith('/api/')) {
      res.status(401).json({
        ok: false,
        error:
          'Akses jarak jauh terkunci. Buka tautan dari perintah .panel di WhatsApp Owner atau masukkan Kunci Akses.',
      });
      return;
    }

    res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kunci Akses Owner — WABot Control Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
  <script>
    (function() {
      try {
        if (localStorage.getItem('wabot_theme') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    })();
  </script>
  <style>
    :root {
      --bg: #FAF9F6;
      --surface: #FFFFFF;
      --surface-sub: #F4F4F5;
      --border: rgba(228, 228, 231, 0.85);
      --text: #18181B;
      --muted: #52525B;
      --subtle: #71717A;
      --btn-bg: #18181B;
      --btn-fg: #FFFFFF;
      --accent: #059669;
      --danger: #E11D48;
    }
    html.dark {
      --bg: #0C0C0E;
      --surface: #141417;
      --surface-sub: #09090B;
      --border: #27272A;
      --text: #F4F4F5;
      --muted: #A1A1AA;
      --subtle: #71717A;
      --btn-bg: #059669;
      --btn-fg: #FFFFFF;
      --accent: #34D399;
      --danger: #FB7185;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      color: var(--text);
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    header {
      height: 64px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
    }
    .brand {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .theme-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 7px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .box {
      width: 100%;
      max-width: 420px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
    }
    .meta {
      font-size: 12px;
      color: var(--subtle);
      margin-bottom: 6px;
    }
    h1 {
      margin: 0 0 8px;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0 0 20px;
      font-size: 13.5px;
      color: var(--muted);
      line-height: 1.55;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--text);
      margin-bottom: 6px;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 11px 14px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface-sub);
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      margin-bottom: 12px;
      outline: none;
    }
    input:focus { border-color: #10B981; }
    button.primary {
      width: 100%;
      padding: 11px 16px;
      border-radius: 12px;
      border: none;
      background: var(--btn-bg);
      color: var(--btn-fg);
      font-weight: 600;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
    }
    button.primary:hover { opacity: 0.92; }
    .err {
      color: var(--danger);
      font-size: 12px;
      margin-top: 10px;
      min-height: 16px;
    }
    .hint {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
      line-height: 1.55;
    }
    code {
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">WABot</div>
    <button type="button" class="theme-btn" id="tbtn">Tema Gelap / Terang</button>
  </header>
  <main>
    <div class="box">
      <div class="meta">Keamanan Akses Jarak Jauh · Termux 24/7</div>
      <h1>Verifikasi Kunci Akses Owner</h1>
      <p>Masukkan kunci akses untuk membuka penuh Web Control Panel, Simulator, dan Pengaturan WhatsApp Bot kamu.</p>
      <form id="f">
        <label for="k">Kunci Akses Owner</label>
        <input id="k" type="password" placeholder="Masukkan kunci akses..." autocomplete="off" required />
        <button type="submit" class="primary">Buka Dashboard Panel</button>
        <div id="err" class="err"></div>
      </form>
      <div class="hint">
        Lupa kunci akses? Kirim chat pribadi <code>.panel</code> dari nomor WhatsApp Owner ke nomor bot untuk menerima tautan masuk otomatis.
      </div>
    </div>
  </main>
  <script>
    document.getElementById('tbtn').addEventListener('click', function () {
      const isDark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('wabot_theme', isDark ? 'dark' : 'light'); } catch (e) {}
    });
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('err');
      err.textContent = '';
      const key = document.getElementById('k').value.trim();
      const res = await fetch('/api/remote-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      if (res.ok) location.reload();
      else err.textContent = 'Kunci akses tidak sesuai.';
    });
  </script>
</body>
</html>`);
  };
}

export const remoteTunnel = new RemoteTunnelManager();
