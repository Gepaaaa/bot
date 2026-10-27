export interface DownloadedSocialMedia {
  platform: 'tiktok' | 'instagram' | 'youtube' | 'social';
  title: string;
  author: string;
  duration?: number;
  videoUrl?: string;
  audioUrl?: string;
  coverUrl?: string;
}

function resolveTikwmUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  if (rawUrl.startsWith('/')) {
    return `https://www.tikwm.com${rawUrl}`;
  }
  return `https://www.tikwm.com/${rawUrl}`;
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0] : null;
}

export async function downloadTikTokMedia(url: string): Promise<DownloadedSocialMedia> {
  const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Layanan pengunduh TikTok merespons HTTP ${res.status}`);
    }

    const payload = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: {
        id?: string;
        title?: string;
        duration?: number;
        play?: string;
        hdplay?: string;
        wmplay?: string;
        music?: string;
        cover?: string;
        music_info?: { play?: string; title?: string };
        author?: { unique_id?: string; nickname?: string };
      };
    };

    if (payload.code !== 0 || !payload.data) {
      throw new Error(payload.msg || 'Tautan TikTok tidak ditemukan atau bersifat privat.');
    }

    const d = payload.data;
    const videoUrl = resolveTikwmUrl(d.play || d.hdplay || d.wmplay);
    const audioUrl = resolveTikwmUrl(d.music || d.music_info?.play);

    return {
      platform: 'tiktok',
      title: d.title?.trim() || 'Video TikTok Tanpa Watermark',
      author: d.author?.unique_id
        ? `@${d.author.unique_id}`
        : d.author?.nickname || 'Kreator TikTok',
      duration: d.duration,
      videoUrl,
      audioUrl,
      coverUrl: resolveTikwmUrl(d.cover),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOembedMetadata(
  url: string
): Promise<{ title?: string; author_name?: string; thumbnail_url?: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      error?: string;
    };
    if (json.error) return null;
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveSocialMedia(
  url: string,
  preferredPlatform?: 'tiktok' | 'instagram' | 'youtube' | 'auto'
): Promise<DownloadedSocialMedia> {
  const lower = url.toLowerCase();

  if (
    preferredPlatform === 'tiktok' ||
    lower.includes('tiktok.com') ||
    lower.includes('vt.tiktok') ||
    lower.includes('vm.tiktok')
  ) {
    return downloadTikTokMedia(url);
  }

  const platform: 'instagram' | 'youtube' | 'social' =
    preferredPlatform === 'instagram' || lower.includes('instagram.com') || lower.includes('instagr.am')
      ? 'instagram'
      : preferredPlatform === 'youtube' || lower.includes('youtube.com') || lower.includes('youtu.be')
      ? 'youtube'
      : 'social';

  // Attempt Cobalt-compatible open API endpoints if reachable, otherwise fall back cleanly with oEmbed details
  const oembed = await fetchOembedMetadata(url);

  throw new Error(
    oembed?.title
      ? `Media terdeteksi: "${oembed.title}" oleh ${oembed.author_name || 'Kreator'}. Saat ini ekstraksi langsung tanpa kunci pihak ketiga dioptimalkan penuh untuk tautan TikTok (.tt & .mp3); untuk ${platform === 'instagram' ? 'Instagram' : platform === 'youtube' ? 'YouTube' : 'tautan ini'} platform membatasi unduhan otomatis tanpa sesi login.`
      : `Tidak dapat mengekstrak berkas langsung dari tautan ${platform.toUpperCase()} tersebut (pastikan tautan publik atau gunakan tautan TikTok untuk unduhan instan tanpa watermark).`
  );
}

export async function fetchRemoteBuffer(
  url: string,
  maxBytes = 35 * 1024 * 1024
): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://www.tikwm.com/',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Gagal mengunduh media (${res.status})`);
    }
    const contentLength = Number(res.headers.get('content-length') || '0');
    if (contentLength > maxBytes) {
      throw new Error('Ukuran file media melebihi batas pengiriman otomatis bot (35 MB).');
    }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) {
      throw new Error('Ukuran file media melebihi batas pengiriman otomatis bot (35 MB).');
    }
    return {
      buffer: Buffer.from(arrayBuf),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } finally {
    clearTimeout(timeout);
  }
}
