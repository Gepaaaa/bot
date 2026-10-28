const STORAGE_KEY = 'wabot_backend_url';

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getEnvBackendUrl(): string {
  const envVal = (import.meta.env.VITE_BACKEND_URL as string | undefined) || '';
  return normalizeBaseUrl(envVal);
}

export function getStoredBackendUrl(): string {
  try {
    return normalizeBaseUrl(localStorage.getItem(STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

const DEFAULT_FLY_BACKEND_URL = 'https://bot--ztdpa.fly.dev';

export function getActiveBackendBaseUrl(): string {
  const explicit = getStoredBackendUrl() || getEnvBackendUrl();
  if (explicit) return explicit;
  if (isLikelyStaticFrontendHost()) return DEFAULT_FLY_BACKEND_URL;
  return '';
}

export function setStoredBackendUrl(url: string): string {
  const normalized = normalizeBaseUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage error
  }
  return normalized;
}

export function buildApiUrl(path: string): string {
  const base = getActiveBackendBaseUrl();
  if (!path.startsWith('/')) return path;
  return base ? `${base}${path}` : path;
}

export function resolveBackendMediaUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  if (
    rawUrl.startsWith('data:') ||
    rawUrl.startsWith('blob:') ||
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://')
  ) {
    return rawUrl;
  }
  if (rawUrl.startsWith('/api/')) {
    return buildApiUrl(rawUrl);
  }
  return rawUrl;
}

export function buildRealtimeWsUrl(): string {
  const base = getActiveBackendBaseUrl();
  if (base) {
    const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    return `${wsBase}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function isLikelyStaticFrontendHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.vercel.app') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.github.io')
  );
}
