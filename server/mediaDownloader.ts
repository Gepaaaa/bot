export type SupportedPlatform =
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'pinterest'
  | 'capcut'
  | 'mediafire'
  | 'youtube'
  | 'social';

export interface DownloadedSocialMedia {
  platform: SupportedPlatform;
  title: string;
  author: string;
  duration?: number;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  slideImages?: string[];
  fileUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  coverUrl?: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

export function detectPlatformFromUrl(url: string): SupportedPlatform {
  const lower = url.toLowerCase();
  if (
    lower.includes('tiktok.com') ||
    lower.includes('vt.tiktok') ||
    lower.includes('vm.tiktok')
  ) {
    return 'tiktok';
  }
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
    return 'instagram';
  }
  if (
    lower.includes('facebook.com') ||
    lower.includes('fb.watch') ||
    lower.includes('fb.com')
  ) {
    return 'facebook';
  }
  if (
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('t.co/')
  ) {
    return 'twitter';
  }
  if (lower.includes('pinterest.') || lower.includes('pin.it')) {
    return 'pinterest';
  }
  if (lower.includes('capcut.com')) {
    return 'capcut';
  }
  if (lower.includes('mediafire.com')) {
    return 'mediafire';
  }
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'youtube';
  }
  return 'social';
}

export async function downloadTikTokMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(
    url
  )}&hd=1`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(14000),
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
      images?: string[];
      music?: string;
      cover?: string;
      music_info?: { play?: string; title?: string };
      author?: { unique_id?: string; nickname?: string };
    };
  };

  if (payload.code !== 0 || !payload.data) {
    throw new Error(
      payload.msg || 'Tautan TikTok tidak ditemukan atau bersifat privat.'
    );
  }

  const d = payload.data;
  const slideImages = Array.isArray(d.images)
    ? d.images
        .map((img) => resolveTikwmUrl(img))
        .filter((u): u is string => Boolean(u))
        .slice(0, 8)
    : undefined;
  const videoUrl =
    slideImages && slideImages.length > 0
      ? undefined
      : resolveTikwmUrl(d.play || d.hdplay || d.wmplay);
  const audioUrl = resolveTikwmUrl(d.music || d.music_info?.play);

  return {
    platform: 'tiktok',
    title:
      d.title?.trim() ||
      (slideImages?.length
        ? `Album Slide Foto TikTok (${slideImages.length} Slide)`
        : 'Video TikTok Tanpa Watermark'),
    author: d.author?.unique_id
      ? `@${d.author.unique_id}`
      : d.author?.nickname || 'Kreator TikTok',
    duration: d.duration,
    videoUrl,
    audioUrl,
    slideImages,
    coverUrl: resolveTikwmUrl(d.cover),
  };
}

async function downloadTwitterMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  const match = url.match(
    /(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/([0-9]+)/i
  );
  if (!match) {
    throw new Error('Format tautan cuitan X/Twitter tidak valid.');
  }
  const [, user, statusId] = match;
  const apiUrl = `https://api.vxtwitter.com/${user}/status/${statusId}`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error('Gagal mengambil data cuitan dari X/Twitter.');
  }
  const data = (await res.json()) as {
    text?: string;
    user_name?: string;
    user_screen_name?: string;
    media_extended?: Array<{
      type?: string;
      url?: string;
      duration_millis?: number;
      thumbnail_url?: string;
    }>;
  };

  const mediaList = data.media_extended || [];
  const vid = mediaList.find(
    (m) => m.type === 'video' || m.type === 'gif'
  );
  const imgs = mediaList
    .filter((m) => m.type === 'image' && m.url)
    .map((m) => m.url!);

  if (!vid?.url && imgs.length === 0) {
    throw new Error('Cuitan tersebut tidak mengandung lampiran video atau gambar.');
  }

  return {
    platform: 'twitter',
    title: data.text?.slice(0, 90) || 'Media Cuitan X / Twitter',
    author: data.user_screen_name
      ? `@${data.user_screen_name}`
      : data.user_name || 'Pengguna X',
    duration: vid?.duration_millis
      ? Math.round(vid.duration_millis / 1000)
      : undefined,
    videoUrl: vid?.url,
    imageUrl: imgs.length === 1 ? imgs[0] : undefined,
    slideImages: imgs.length > 1 ? imgs.slice(0, 8) : undefined,
    coverUrl: vid?.thumbnail_url,
  };
}

async function downloadPinterestMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error('Tidak dapat membuka halaman Pinterest tersebut.');
  }
  const html = await res.text();
  const titleMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );
  const videoMatch =
    html.match(/https:\/\/v1\.pinimg\.com\/videos\/[^\s"'<>]+\.mp4/i) ||
    html.match(
      /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+\.mp4[^"']*)["']/i
    );
  const imgMatch =
    html.match(/https:\/\/i\.pinimg\.com\/originals\/[^\s"'<>]+\.(?:jpg|png|webp)/i) ||
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );

  const videoUrl = videoMatch ? videoMatch[1] || videoMatch[0] : undefined;
  const imageUrl = !videoUrl && imgMatch ? imgMatch[1] || imgMatch[0] : undefined;

  if (!videoUrl && !imageUrl) {
    throw new Error('Media publik tidak ditemukan pada tautan Pinterest ini.');
  }

  return {
    platform: 'pinterest',
    title: titleMatch?.[1] || 'Pin Kreatif Pinterest',
    author: 'Pinterest',
    videoUrl,
    imageUrl,
  };
}

async function downloadMediaFireFile(
  url: string
): Promise<DownloadedSocialMedia> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error('Halaman MediaFire tidak dapat diakses.');
  }
  const html = await res.text();
  const directMatch = html.match(
    /href=["'](https?:\/\/download[0-9]*\.mediafire\.com\/[^"']+)["']/i
  );
  if (!directMatch?.[1]) {
    throw new Error(
      'Tautan unduhan langsung MediaFire tidak ditemukan (pastikan file bersifat publik).'
    );
  }
  const directUrl = directMatch[1];
  const decodedName = decodeURIComponent(
    directUrl.split('/').pop() || 'mediafire-file'
  );

  return {
    platform: 'mediafire',
    title: decodedName,
    author: 'MediaFire Cloud',
    fileUrl: directUrl,
    fileName: decodedName,
    fileMimeType: 'application/octet-stream',
  };
}

async function downloadCapCutMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  // Try Ryzendesu / Siputzx open CapCut extractors first, then page scrape
  const openEndpoints = [
    `https://api.siputzx.my.id/api/d/capcut?url=${encodeURIComponent(url)}`,
    `https://api.ryzendesu.vip/api/downloader/capcut?url=${encodeURIComponent(url)}`,
  ];

  for (const ep of openEndpoints) {
    try {
      const r = await fetch(ep, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as Record<string, any>;
      const d = j.data || j.result || j;
      const vUrl =
        d?.contentUrl || d?.videoUrl || d?.originalVideoUrl || d?.video || d?.url;
      if (typeof vUrl === 'string' && vUrl.startsWith('http')) {
        return {
          platform: 'capcut',
          title: d?.title || d?.description || 'Template CapCut Tanpa Watermark',
          author: d?.author?.name || d?.author || 'Kreator CapCut',
          videoUrl: vUrl,
        };
      }
    } catch {
      // Continue fallback
    }
  }

  const page = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });
  const html = await page.text();
  const vidMatch = html.match(/https?:\/\/[^\s"'<>]+capcut[^\s"'<>]+\.mp4[^\s"'<>]*/i);
  if (vidMatch?.[0]) {
    return {
      platform: 'capcut',
      title: 'Template CapCut',
      author: 'CapCut',
      videoUrl: vidMatch[0].replace(/\\u002F/g, '/'),
    };
  }
  throw new Error('Tidak dapat mengekstrak video dari tautan CapCut tersebut.');
}

async function tryOpenMultiExtractor(
  url: string,
  platform: SupportedPlatform
): Promise<DownloadedSocialMedia | null> {
  const candidates: string[] = [];

  if (platform === 'instagram') {
    candidates.push(
      `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`,
      `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`
    );
  } else if (platform === 'facebook') {
    candidates.push(
      `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`,
      `https://api.ryzendesu.vip/api/downloader/fbdl?url=${encodeURIComponent(url)}`
    );
  } else if (platform === 'youtube') {
    candidates.push(
      `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`,
      `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(url)}`
    );
  } else {
    candidates.push(
      `https://api.siputzx.my.id/api/d/aio?url=${encodeURIComponent(url)}`
    );
  }

  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, any>;
      const rawData = json.data ?? json.result ?? json;

      if (Array.isArray(rawData) && rawData.length > 0) {
        const first = rawData[0];
        const mediaUrl = first?.url || first?.download_url || first?.video;
        if (typeof mediaUrl === 'string' && mediaUrl.startsWith('http')) {
          const isImg = /\.(jpe?g|png|webp)(\?|$)/i.test(mediaUrl);
          return {
            platform,
            title: first?.title || `Media ${platform.toUpperCase()}`,
            author: first?.author || platform.toUpperCase(),
            videoUrl: isImg ? undefined : mediaUrl,
            imageUrl: isImg ? mediaUrl : undefined,
          };
        }
      } else if (rawData && typeof rawData === 'object') {
        const dlUrl =
          rawData.dl ||
          rawData.url ||
          rawData.video ||
          rawData.hd ||
          rawData.sd ||
          rawData.downloadUrl;
        if (typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
          return {
            platform,
            title: rawData.title || `Video ${platform.toUpperCase()}`,
            author: rawData.author || platform.toUpperCase(),
            videoUrl: dlUrl,
            audioUrl:
              typeof rawData.audio === 'string' ? rawData.audio : undefined,
          };
        }
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function fetchOembedMetadata(
  url: string
): Promise<{ title?: string; author_name?: string; thumbnail_url?: string } | null> {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(6000) }
    );
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
  }
}

export async function resolveSocialMedia(
  url: string,
  preferredPlatform?: SupportedPlatform | 'auto'
): Promise<DownloadedSocialMedia> {
  const detected =
    preferredPlatform && preferredPlatform !== 'auto'
      ? preferredPlatform
      : detectPlatformFromUrl(url);

  if (detected === 'tiktok') {
    return downloadTikTokMedia(url);
  }
  if (detected === 'twitter') {
    return downloadTwitterMedia(url);
  }
  if (detected === 'pinterest') {
    return downloadPinterestMedia(url);
  }
  if (detected === 'mediafire') {
    return downloadMediaFireFile(url);
  }
  if (detected === 'capcut') {
    return downloadCapCutMedia(url);
  }

  const extracted = await tryOpenMultiExtractor(url, detected);
  if (extracted) {
    return extracted;
  }

  const oembed = await fetchOembedMetadata(url);
  throw new Error(
    oembed?.title
      ? `Media terdeteksi: "${oembed.title}" oleh ${
          oembed.author_name || 'Kreator'
        }. Saat ini platform ${detected.toUpperCase()} membatasi pengunduhan langsung tanpa sesi login pada tautan tersebut.`
      : `Tidak dapat mengekstrak berkas langsung dari tautan ${detected.toUpperCase()} tersebut (pastikan tautan bersifat publik).`
  );
}

export async function searchAndDownloadPlay(
  query: string
): Promise<DownloadedSocialMedia> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('Masukkan judul lagu atau nama penyanyi.');
  }

  // 1. Try iTunes Music Search API (ultra-fast, high-clarity audio track + artist metadata)
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      cleanQuery
    )}&media=music&entity=song&limit=1`;
    const res = await fetch(itunesUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        results?: Array<{
          trackName?: string;
          artistName?: string;
          previewUrl?: string;
          trackTimeMillis?: number;
          artworkUrl100?: string;
        }>;
      };
      const hit = json.results?.[0];
      if (hit?.previewUrl) {
        return {
          platform: 'youtube',
          title: `${hit.trackName || cleanQuery}`,
          author: hit.artistName || 'Artis Musik',
          duration: 30,
          audioUrl: hit.previewUrl,
          coverUrl: hit.artworkUrl100?.replace('100x100', '600x600'),
        };
      }
    }
  } catch {
    // Fallback to TikWM music feed search
  }

  // 2. Fallback: TikWM Music/Audio feed search
  const tikSearch = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(
    cleanQuery
  )}&count=3`;
  const res = await fetch(tikSearch, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (res.ok) {
    const payload = (await res.json()) as {
      data?: {
        videos?: Array<{
          title?: string;
          duration?: number;
          music?: string;
          play?: string;
          author?: { nickname?: string; unique_id?: string };
          music_info?: { title?: string; author?: string; play?: string };
        }>;
      };
    };
    const item = payload.data?.videos?.[0];
    const audioUrl = resolveTikwmUrl(
      item?.music_info?.play || item?.music || item?.play
    );
    if (audioUrl) {
      return {
        platform: 'tiktok',
        title: item?.music_info?.title || item?.title || cleanQuery,
        author:
          item?.music_info?.author ||
          item?.author?.nickname ||
          'Pencarian Audio',
        duration: item?.duration,
        audioUrl,
      };
    }
  }

  throw new Error(`Lagu dengan kata kunci "${cleanQuery}" tidak ditemukan.`);
}

export async function fetchRemoteBuffer(
  url: string,
  maxBytes = 35 * 1024 * 1024
): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: url.includes('tikwm') ? 'https://www.tikwm.com/' : url,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Gagal mengunduh media (${res.status})`);
    }
    const contentLength = Number(res.headers.get('content-length') || '0');
    if (contentLength > maxBytes) {
      throw new Error(
        'Ukuran file media melebihi batas pengiriman aman Anti-Ban bot (35 MB).'
      );
    }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) {
      throw new Error(
        'Ukuran file media melebihi batas pengiriman aman Anti-Ban bot (35 MB).'
      );
    }
    return {
      buffer: Buffer.from(arrayBuf),
      contentType:
        res.headers.get('content-type') || 'application/octet-stream',
    };
  } finally {
    clearTimeout(timeout);
  }
}
