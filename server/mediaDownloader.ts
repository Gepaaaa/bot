import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
  fallbackVideoUrls?: string[];
  audioUrl?: string;
  fallbackAudioUrls?: string[];
  imageUrl?: string;
  slideImages?: string[];
  slideFallbackImageUrls?: string[][];
  fileUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  coverUrl?: string;
}

export interface ResolveSocialOptions {
  audioOnly?: boolean;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BOT_UA = 'TelegramBot (like TwitterBot)';
const TIKTOK_APP_UA =
  'com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)';
const TIOO_BASE = 'https://backend1.tioo.eu.org';
const TIOO_VERSION = '6.4.0';

function cleanExtractedUrl(raw: string): string {
  return raw.replace(/[),.;!?\]>]+$/g, '').trim();
}

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const fullMatch = text.match(/https?:\/\/[^\s<>"]+/i);
  if (fullMatch) {
    return cleanExtractedUrl(fullMatch[0]);
  }

  // Also support bare social media links sent without https://
  const bareMatch = text.match(
    /\b((?:www\.|vt\.|vm\.|m\.|mobile\.)?(?:tiktok\.com|instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.com|twitter\.com|x\.com|t\.co|pinterest\.[a-z.]+|pin\.it|capcut\.com|mediafire\.com|youtube\.com|youtu\.be)\/[^\s<>"]+)/i
  );
  if (bareMatch?.[1]) {
    return `https://${cleanExtractedUrl(bareMatch[1])}`;
  }

  return null;
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
    lower.includes('t.co/') ||
    lower.includes('fxtwitter.com') ||
    lower.includes('vxtwitter.com')
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

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
}

function unwrapProxyCdnUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  // Unwrap 3bic.com/api/cdn/<base64> wrapper to direct ByteDance CapCut VOD URL (avoids Cloudflare 403)
  const bicIdx = rawUrl.indexOf('/api/cdn/');
  if (bicIdx !== -1) {
    const b64 = rawUrl.slice(bicIdx + '/api/cdn/'.length).split(/[?&]/)[0];
    if (b64) {
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return decoded;
        }
      } catch {
        // Keep original URL if base64 fails
      }
    }
  }
  return rawUrl;
}

async function fetchTiooEndpoint(
  endpoint: string,
  urlOrQuery: string,
  timeoutMs = 14000
): Promise<Record<string, any> | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const target = new URL(`${TIOO_BASE}/${endpoint}`);
      target.searchParams.set('url', urlOrQuery);
      const res = await fetch(target, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `btch/${TIOO_VERSION}`,
          'X-Client-Version': TIOO_VERSION,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        continue;
      }
      const parsed = JSON.parse(text) as Record<string, any>;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  }
  return null;
}

async function resolveFinalUrl(url: string, timeoutMs = 8000): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    res.body?.cancel().catch(() => {});
    return res.url || url;
  } catch {
    return url;
  }
}

async function fetchOembedMetadata(
  url: string
): Promise<{ title?: string; author_name?: string; thumbnail_url?: string } | null> {
  try {
    const oembedEndpoint =
      url.includes('youtube.com') || url.includes('youtu.be')
        ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
        : `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedEndpoint, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
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
  }
}

// ============================================================================
// 1. TIKTOK (.tt, .ttslide, .mp3) — 4 Independent Live Providers (Up to 35 Ordered Slides)
// ============================================================================
function randomNumericDigits(len: number): string {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function randomHexChars(len: number): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += hex[Math.floor(Math.random() * hex.length)];
  }
  return out;
}

function extractAwemeIdFromTikTokUrl(rawUrl: string): string | null {
  const pathIdMatch = rawUrl.match(
    /(?:\/(?:video|photo|v|embed)\/|[?&](?:item_id|share_item_id)=)(\d{17,21})/i
  );
  if (pathIdMatch?.[1]) return pathIdMatch[1];
  const fallbackDigits = rawUrl.match(/\b(\d{18,21})\b/);
  return fallbackDigits?.[1] || null;
}

function decodeTikTokIoTokenTarget(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const token = parsed.searchParams.get('token');
    if (!token || token.length < 16) return '';
    // tiktokio wraps base64("https://...") by replacing leading "aHR0" with an 8-char prefix and appending "O0O0O"
    const cleanedB64 = ('aHR0' + token.slice(8)).replace(/(?:O0O0O)+$/g, '');
    return Buffer.from(cleanedB64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function isLikelyTikTokSlideAsset(rawUrl: string): boolean {
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(rawUrl)) return true;
  if (/photomode/i.test(rawUrl)) return true;
  const decoded = decodeTikTokIoTokenTarget(rawUrl);
  if (decoded) {
    if (/photomode/i.test(decoded)) return true;
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(decoded)) return true;
  }
  return false;
}

export async function downloadTikTokMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  let resolvedUrl = url;
  let awemeId = extractAwemeIdFromTikTokUrl(url);
  if (!awemeId || /\/\/(?:vt|vm|t)\.tiktok\.com\//i.test(url) || /tiktok\.com\/t\//i.test(url)) {
    resolvedUrl = await resolveFinalUrl(url, 8500);
    awemeId = extractAwemeIdFromTikTokUrl(resolvedUrl) || awemeId;
  }
  const urlIndicatesPhotoSlide = /\/photo\/\d+/i.test(resolvedUrl) || /\/photo\/\d+/i.test(url);

  // Provider 1: Official TikTok Android Feed API (tiktokv) — Zero Cloudflare 403, Native Ordered Slides (1..35) & 2K JPEG
  if (awemeId) {
    const feedHosts = [
      'https://api16-normal-useast5.tiktokv.us',
      'https://api16-normal-c-useast1a.tiktokv.com',
    ];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const host = feedHosts[attempt % feedHosts.length];
      try {
        const params = new URLSearchParams({
          aweme_id: awemeId,
          version_name: '1.1.9',
          version_code: '2018111632',
          build_number: '1.1.9',
          device_id: `73${randomNumericDigits(17)}`,
          iid: `73${randomNumericDigits(17)}`,
          manifest_version_code: '2018111632',
          update_version_code: '2018111632',
          openudid: randomHexChars(16),
          uuid: randomNumericDigits(16),
          _rticket: String(Date.now() * 1000),
          ts: String(Math.floor(Date.now() / 1000)),
          device_brand: 'Google',
          device_type: 'Pixel 4',
          device_platform: 'android',
          resolution: '1080*1920',
          dpi: '420',
          os_version: '10',
          os_api: '29',
          carrier_region: 'ID',
          sys_region: 'ID',
          region: 'ID',
          timezone_name: 'Asia/Jakarta',
          timezone_offset: '25200',
          channel: 'googleplay',
          ac: 'wifi',
          mcc_mnc: '51010',
          is_my_cn: '0',
          ssmix: 'a',
          as: 'a1qwert123',
          cp: 'cbfhckdckkde1',
        });

        const feedRes = await fetch(`${host}/aweme/v1/feed/?${params.toString()}`, {
          method: 'OPTIONS',
          headers: { 'User-Agent': TIKTOK_APP_UA },
          signal: AbortSignal.timeout(9000),
        });

        if (feedRes.ok) {
          const feedJson = (await feedRes.json()) as {
            status_code?: number;
            aweme_list?: Array<Record<string, any>>;
          };
          const content = feedJson?.aweme_list?.find(
            (item) => String(item?.aweme_id) === awemeId
          );

          if (content) {
            const authorHandle = content.author?.unique_id
              ? `@${content.author.unique_id}`
              : content.author?.nickname || 'Kreator TikTok';
            const musicUrls: string[] = Array.isArray(content.music?.play_url?.url_list)
              ? content.music.play_url.url_list.filter(
                  (u: unknown): u is string => typeof u === 'string' && u.startsWith('http')
                )
              : [];
            const descText =
              typeof content.desc === 'string' ? content.desc.trim() : '';

            // Exact TikTok Photo Slideshow array: content.image_post_info.images[0..N-1]
            const rawSlideItems: Array<Record<string, any>> | undefined =
              content.image_post_info?.images;
            if (Array.isArray(rawSlideItems) && rawSlideItems.length > 0) {
              const primarySlides: string[] = [];
              const fallbackSlides: string[][] = [];

              for (const slideObj of rawSlideItems.slice(0, 35)) {
                const cleanUrls: string[] = Array.isArray(
                  slideObj?.display_image?.url_list
                )
                  ? slideObj.display_image.url_list.filter(
                      (u: unknown): u is string =>
                        typeof u === 'string' && u.startsWith('http')
                    )
                  : [];
                const wmUrls: string[] = Array.isArray(
                  slideObj?.owner_watermark_image?.url_list
                )
                  ? slideObj.owner_watermark_image.url_list.filter(
                      (u: unknown): u is string =>
                        typeof u === 'string' && u.startsWith('http')
                    )
                  : [];
                const allForSlide = [...cleanUrls, ...wmUrls];
                if (allForSlide.length === 0) continue;

                // Prefer native JPEG/PNG URL directly from TikTok CDN before WebP so WhatsApp sends instantly without transcoding
                const preferredJpeg =
                  cleanUrls.find((u) => /\.jpe?g(\?|$)/i.test(u)) ||
                  cleanUrls.find((u) => /\.png(\?|$)/i.test(u)) ||
                  allForSlide[0];
                const backups = allForSlide.filter((u) => u !== preferredJpeg);
                primarySlides.push(preferredJpeg);
                fallbackSlides.push(backups);
              }

              if (primarySlides.length > 0) {
                return {
                  platform: 'tiktok',
                  title:
                    descText ||
                    `Album Slide Foto TikTok (${primarySlides.length} Foto)`,
                  author: authorHandle,
                  slideImages: primarySlides,
                  slideFallbackImageUrls: fallbackSlides,
                  audioUrl: musicUrls[0],
                  fallbackAudioUrls: musicUrls.slice(1),
                  coverUrl: primarySlides[0],
                };
              }
            }

            // Regular TikTok Video post
            const playUrls: string[] = Array.isArray(content.video?.play_addr?.url_list)
              ? content.video.play_addr.url_list.filter(
                  (u: unknown): u is string => typeof u === 'string' && u.startsWith('http')
                )
              : [];
            const dlUrls: string[] = Array.isArray(content.video?.download_addr?.url_list)
              ? content.video.download_addr.url_list.filter(
                  (u: unknown): u is string => typeof u === 'string' && u.startsWith('http')
                )
              : [];
            const allVideoCandidates = [...playUrls, ...dlUrls];
            if (allVideoCandidates.length > 0 && !urlIndicatesPhotoSlide) {
              return {
                platform: 'tiktok',
                title: descText || 'Video TikTok Tanpa Watermark',
                author: authorHandle,
                duration: content.video?.duration
                  ? Math.round(Number(content.video.duration) / 1000) ||
                    Number(content.video.duration)
                  : undefined,
                videoUrl: allVideoCandidates[0],
                fallbackVideoUrls: allVideoCandidates.slice(1),
                audioUrl: musicUrls[0],
                fallbackAudioUrls: musicUrls.slice(1),
                coverUrl: content.video?.cover?.url_list?.[0],
              };
            }
          }
        }
      } catch {
        // Proceed to next attempt / provider
      }
    }
  }

  // Provider 2: Tioo / TikTokIO Mirror (supports token-wrapped photo slides 1..35 + ISP block bypass)
  const tioo = await fetchTiooEndpoint('ttdl', resolvedUrl || url);
  if (tioo && tioo.status !== false) {
    const rawMediaEntries = Array.isArray(tioo.images) && tioo.images.length > 0
      ? tioo.images
      : Array.isArray(tioo.video)
      ? tioo.video
      : [tioo.video];

    const mediaUrls = rawMediaEntries
      .map((v: unknown) =>
        typeof v === 'string'
          ? v
          : typeof (v as { url?: string })?.url === 'string'
          ? (v as { url: string }).url
          : ''
      )
      .filter((v: string) => v.startsWith('http'));

    const audios = (Array.isArray(tioo.audio) ? tioo.audio : [tioo.audio])
      .map((a: unknown) =>
        typeof a === 'string'
          ? a
          : typeof (a as { url?: string })?.url === 'string'
          ? (a as { url: string }).url
          : ''
      )
      .filter((a: string) => a.startsWith('http'));

    const thumbIsPhotomode =
      typeof tioo.thumbnail === 'string' && /photomode/i.test(tioo.thumbnail);
    const slideDetected =
      Array.isArray(tioo.images) && tioo.images.length > 0
        ? true
        : urlIndicatesPhotoSlide ||
          thumbIsPhotomode ||
          (mediaUrls.length > 0 &&
            mediaUrls.every((u: string) => isLikelyTikTokSlideAsset(u))) ||
          (mediaUrls.length > 1 &&
            mediaUrls.some((u: string) => isLikelyTikTokSlideAsset(u)));

    if (slideDetected && mediaUrls.length > 0) {
      const orderedSlides = mediaUrls.slice(0, 35);
      return {
        platform: 'tiktok',
        title:
          (typeof tioo.title === 'string' && tioo.title.trim()) ||
          `Album Slide Foto TikTok (${orderedSlides.length} Foto)`,
        author: tioo.author || 'Kreator TikTok',
        slideImages: orderedSlides,
        audioUrl: audios[0],
        fallbackAudioUrls: audios.slice(1),
        coverUrl: tioo.thumbnail || orderedSlides[0],
      };
    }

    if (mediaUrls[0]) {
      return {
        platform: 'tiktok',
        title:
          (typeof tioo.title === 'string' && tioo.title.trim()) ||
          'Video TikTok Tanpa Watermark',
        author: tioo.author || 'Kreator TikTok',
        videoUrl: mediaUrls[0],
        fallbackVideoUrls: mediaUrls.slice(1),
        audioUrl: audios[0],
        fallbackAudioUrls: audios.slice(1),
        coverUrl: tioo.thumbnail,
      };
    }
  }

  // Provider 3: TikWM API (supports HD MP4, Ordered Photo Slides 1..35, and MP3)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const form = new URLSearchParams({ url: resolvedUrl || url, hd: '1' });
      const res = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://www.tikwm.com',
          Referer: 'https://www.tikwm.com/',
        },
        body: form,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
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

        if (payload.code === -1 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1150));
          continue;
        }

        if (payload.code === 0 && payload.data) {
          const d = payload.data;
          const slideImages = Array.isArray(d.images)
            ? d.images
                .map((img) => resolveTikwmUrl(img))
                .filter((u): u is string => Boolean(u))
                .slice(0, 35)
            : undefined;

          const playUrl = resolveTikwmUrl(d.play);
          const hdUrl = resolveTikwmUrl(d.hdplay);
          const wmUrl = resolveTikwmUrl(d.wmplay);
          const candidates = [playUrl, hdUrl, wmUrl].filter(
            (u): u is string => Boolean(u)
          );

          const videoUrl =
            slideImages && slideImages.length > 0 ? undefined : candidates[0];
          const audioUrl = resolveTikwmUrl(d.music || d.music_info?.play);

          if (videoUrl || (slideImages && slideImages.length > 0)) {
            return {
              platform: 'tiktok',
              title:
                d.title?.trim() ||
                (slideImages?.length
                  ? `Album Slide Foto TikTok (${slideImages.length} Foto)`
                  : 'Video TikTok Tanpa Watermark'),
              author: d.author?.unique_id
                ? `@${d.author.unique_id}`
                : d.author?.nickname || 'Kreator TikTok',
              duration: d.duration,
              videoUrl,
              fallbackVideoUrls: candidates.slice(1),
              audioUrl,
              slideImages,
              coverUrl: resolveTikwmUrl(d.cover),
            };
          }
        }
      }
      break;
    } catch {
      break;
    }
  }

  // Provider 4: vxTikTok / tnkTok Bot Meta Extractor (/video/ & /photo/)
  try {
    const pathMatch = resolvedUrl.match(
      /tiktok\.com\/(@[^/?#]+\/(?:video|photo)\/[0-9]+)/i
    );
    if (pathMatch?.[1]) {
      const vxRes = await fetch(`https://tnktok.com/${pathMatch[1]}`, {
        headers: { 'User-Agent': BOT_UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (vxRes.ok) {
        const html = await vxRes.text();
        const descMatch =
          html.match(
            /property=["']og:description["']\s+content=["']([^"']+)["']/i
          ) ||
          html.match(
            /content=["']([^"']+)["']\s+property=["']og:description/i
          );
        const authorTag = `@${pathMatch[1].split('/')[0].replace(/^@/, '')}`;

        if (urlIndicatesPhotoSlide) {
          const ogImgs = [
            ...html.matchAll(
              /property=["']og:image["']\s+content=["']([^"']+)["']|content=["']([^"']+)["']\s+property=["']og:image["']/gi
            ),
          ]
            .map((m) => decodeHtmlEntities(m[1] || m[2] || ''))
            .filter((u) => u.startsWith('http'));
          if (ogImgs.length > 0) {
            return {
              platform: 'tiktok',
              title: descMatch?.[1]
                ? decodeHtmlEntities(descMatch[1]).slice(0, 100)
                : `Album Slide Foto TikTok (${ogImgs.length} Foto)`,
              author: authorTag,
              slideImages: ogImgs.slice(0, 35),
            };
          }
        }

        const vidMatch =
          html.match(
            /property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i
          ) ||
          html.match(/content=["']([^"']+)["']\s+property=["']og:video/i);
        const rawVid = vidMatch?.[1]
          ? decodeHtmlEntities(vidMatch[1])
          : undefined;
        if (rawVid && rawVid.startsWith('http')) {
          return {
            platform: 'tiktok',
            title: descMatch?.[1]
              ? decodeHtmlEntities(descMatch[1]).slice(0, 100)
              : 'Video TikTok Tanpa Watermark',
            author: authorTag,
            videoUrl: rawVid,
          };
        }
      }
    }
  } catch {
    // Exhausted all 4 providers
  }

  throw new Error(
    'Tidak dapat mengambil media TikTok saat ini (pastikan tautan video/slide bersifat publik).'
  );
}

// ============================================================================
// 2. INSTAGRAM (.ig — Reels, Post, Carousel) — 3 Independent Live Providers
// ============================================================================
async function extractInstagramPath(
  rawUrl: string
): Promise<{ kind: 'p' | 'reel' | 'tv'; shortcode: string } | null> {
  const direct = rawUrl.match(
    /instagram\.com\/(?:[^/?#]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  if (direct) {
    const rawKind = direct[1].toLowerCase();
    const kind: 'p' | 'reel' | 'tv' =
      rawKind === 'reels' ? 'reel' : (rawKind as 'p' | 'reel' | 'tv');
    return { kind, shortcode: direct[2] };
  }

  // Follow /share/reel/... or instagr.am/... shortlinks
  const resolved = await resolveFinalUrl(rawUrl);
  const after = resolved.match(
    /instagram\.com\/(?:[^/?#]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  if (after) {
    const rawKind = after[1].toLowerCase();
    const kind: 'p' | 'reel' | 'tv' =
      rawKind === 'reels' ? 'reel' : (rawKind as 'p' | 'reel' | 'tv');
    return { kind, shortcode: after[2] };
  }
  return null;
}

async function downloadInstagramMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  const parsed = await extractInstagramPath(url);
  if (!parsed) {
    throw new Error(
      'Format tautan Instagram tidak dikenali. Gunakan tautan Reels atau Postingan publik.'
    );
  }

  const { kind, shortcode } = parsed;
  const igPath = `/${kind}/${shortcode}/`;

  // Query kkinstagram (direct Meta CDN 302), eeinstagram (caption + backup media), and vxinstagram in parallel
  const [kkSettled, eeSettled, vxSettled] = await Promise.allSettled([
    fetch(`https://kkinstagram.com${igPath}`, {
      headers: { 'User-Agent': BOT_UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`https://eeinstagram.com${igPath}`, {
      headers: { 'User-Agent': BOT_UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`https://vxinstagram.com${igPath}`, {
      headers: { 'User-Agent': BOT_UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  let caption = '';
  let author = 'Instagram';
  const videoCandidates: string[] = [];
  const imageCandidates: string[] = [];

  // Parse eeinstagram metadata + backup URLs
  if (eeSettled.status === 'fulfilled') {
    const res = eeSettled.value;
    const loc = res.headers.get('location');
    if (loc && loc.startsWith('http')) {
      if (loc.includes('.mp4') || kind === 'reel') videoCandidates.push(loc);
      else imageCandidates.push(loc);
    } else if (res.ok) {
      const html = await res.text();
      const descM =
        html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:description/i);
      const titleM =
        html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:title/i);
      if (descM?.[1]) caption = decodeHtmlEntities(descM[1]).trim();
      if (titleM?.[1] && !titleM[1].toLowerCase().includes('instagram')) {
        author = decodeHtmlEntities(titleM[1]).trim();
      }
      const vidM =
        html.match(/property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:video/i);
      if (vidM?.[1]) {
        const vUrl = vidM[1].startsWith('/')
          ? `https://eeinstagram.com${vidM[1]}`
          : decodeHtmlEntities(vidM[1]);
        if (vUrl.startsWith('http') && !vUrl.includes('/videos/' + shortcode)) {
          videoCandidates.push(vUrl);
        }
      }
    }
  }

  // Parse kkinstagram direct Meta CDN 302 redirect (fastest, highest-res direct CDN URL)
  if (kkSettled.status === 'fulfilled') {
    const res = kkSettled.value;
    const loc = res.headers.get('location');
    if (loc && loc.startsWith('http')) {
      const cleanLoc = decodeHtmlEntities(loc);
      const isVideoCdn =
        /\.mp4(\?|$)/i.test(cleanLoc) ||
        cleanLoc.includes('/o1/v/') ||
        cleanLoc.includes('video_dashinit');
      if (isVideoCdn) {
        videoCandidates.unshift(cleanLoc);
      } else {
        imageCandidates.unshift(cleanLoc);
      }
    } else if (res.ok) {
      const html = await res.text();
      const vidM = html.match(
        /property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i
      );
      if (vidM?.[1]?.startsWith('http')) {
        videoCandidates.push(decodeHtmlEntities(vidM[1]));
      }
      const imgs = [
        ...html.matchAll(
          /property=["']og:image["']\s+content=["']([^"']+)["']/gi
        ),
      ]
        .map((m) => decodeHtmlEntities(m[1]))
        .filter((u) => u.startsWith('http'));
      imageCandidates.push(...imgs);
    }
  }

  // Parse vxinstagram offload media URLs
  if (vxSettled.status === 'fulfilled') {
    const res = vxSettled.value;
    const loc = res.headers.get('location');
    if (loc && loc.startsWith('http')) {
      if (loc.includes('.mp4')) videoCandidates.push(loc);
      else imageCandidates.push(loc);
    } else if (res.ok) {
      const html = await res.text();
      const authorM = html.match(
        /name=["']twitter:title["']\s+content=["']([^"']+)["']/i
      );
      if (authorM?.[1] && author === 'Instagram') {
        author = decodeHtmlEntities(authorM[1]).trim();
      }
      const vidM =
        html.match(/property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:video/i);
      if (vidM?.[1]?.startsWith('http')) {
        const cleanV = decodeHtmlEntities(vidM[1]);
        if (cleanV.endsWith('.mp4') || kind === 'reel') {
          videoCandidates.push(cleanV);
        } else {
          imageCandidates.push(cleanV);
        }
      }
      const imgs = [
        ...html.matchAll(
          /property=["']og:image["']\s+content=["']([^"']+)["']/gi
        ),
      ]
        .map((m) => decodeHtmlEntities(m[1]))
        .filter((u) => u.startsWith('http') && !u.endsWith('.mp4'));
      imageCandidates.push(...imgs);
    }
  }

  const uniqueVideos = [...new Set(videoCandidates)];
  const uniqueImages = [...new Set(imageCandidates)];

  const cleanTitle =
    caption.split('\n')[0]?.slice(0, 100) ||
    (kind === 'reel' ? 'Instagram Reels' : 'Postingan Instagram');

  if (uniqueVideos.length > 0) {
    return {
      platform: 'instagram',
      title: cleanTitle,
      author,
      videoUrl: uniqueVideos[0],
      fallbackVideoUrls: uniqueVideos.slice(1),
    };
  }

  if (uniqueImages.length > 1) {
    return {
      platform: 'instagram',
      title: cleanTitle,
      author,
      slideImages: uniqueImages.slice(0, 8),
    };
  }

  if (uniqueImages.length === 1) {
    return {
      platform: 'instagram',
      title: cleanTitle,
      author,
      imageUrl: uniqueImages[0],
    };
  }

  throw new Error(
    'Tidak dapat mengekstrak media Instagram (pastikan akun/postingan bersifat publik dan tidak dibatasi usia).'
  );
}

// ============================================================================
// 3. FACEBOOK (.fb — Reels, Watch, Share Links) — 3 Independent Live Providers
// ============================================================================
async function downloadFacebookMedia(
  rawUrl: string
): Promise<DownloadedSocialMedia> {
  const canonicalUrl =
    rawUrl.includes('fb.watch') || rawUrl.includes('/share/')
      ? await resolveFinalUrl(rawUrl)
      : rawUrl;

  // Provider 1: Direct Facebook HTML Video Stream Extraction (zero 3rd-party dependency)
  try {
    const res = await fetch(canonicalUrl, {
      headers: {
        'User-Agent': UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const html = await res.text();
      const extractFbField = (patterns: RegExp[]): string | undefined => {
        for (const pat of patterns) {
          const m = html.match(pat);
          if (m?.[1]) {
            const decoded = decodeHtmlEntities(
              JSON.parse(`"${m[1].replace(/"/g, '\\"')}"`)
            );
            if (decoded.startsWith('http')) return decoded;
          }
        }
        return undefined;
      };

      const hdUrl = extractFbField([
        /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
        /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
        /hd_src\s*:\s*"([^"]+)"/,
      ]);
      const sdUrl = extractFbField([
        /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
        /"playable_url"\s*:\s*"([^"]+)"/,
        /sd_src\s*:\s*"([^"]+)"/,
      ]);
      const titleMatch =
        html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i);

      const candidates = [hdUrl, sdUrl].filter((u): u is string => Boolean(u));
      if (candidates.length > 0) {
        return {
          platform: 'facebook',
          title: titleMatch?.[1]
            ? decodeHtmlEntities(titleMatch[1]).slice(0, 100)
            : 'Video Facebook',
          author: 'Facebook Watch / Reels',
          videoUrl: candidates[0],
          fallbackVideoUrls: candidates.slice(1),
        };
      }
    }
  } catch {
    // Fall through to Provider 2
  }

  // Provider 2: Siputzx SnapCDN Facebook Extractor (parses data.downloads[] array)
  try {
    const res = await fetch(
      `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(
        canonicalUrl
      )}`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        status?: boolean;
        data?: {
          title?: string;
          thumbnail?: string;
          url?: string;
          downloads?: Array<{ quality?: string; url?: string }>;
        };
      };
      const downloads = (json.data?.downloads || [])
        .map((d) => d.url)
        .filter((u): u is string => Boolean(u && u.startsWith('http')));
      if (json.data?.url?.startsWith('http')) {
        downloads.push(json.data.url);
      }
      if (downloads.length > 0) {
        return {
          platform: 'facebook',
          title: json.data?.title || 'Video Facebook',
          author: 'Facebook',
          videoUrl: downloads[0],
          fallbackVideoUrls: downloads.slice(1),
          coverUrl: json.data?.thumbnail,
        };
      }
    }
  } catch {
    // Fall through to Provider 3
  }

  // Provider 3: Tioo fbdown mirror
  const tioo = await fetchTiooEndpoint('fbdown', canonicalUrl);
  if (tioo) {
    const candidates = [tioo.HD, tioo.Normal_video, tioo.url]
      .flat()
      .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    if (candidates.length > 0) {
      return {
        platform: 'facebook',
        title: tioo.title || 'Video Facebook',
        author: 'Facebook',
        videoUrl: candidates[0],
        fallbackVideoUrls: candidates.slice(1),
      };
    }
  }

  throw new Error(
    'Tidak dapat mengekstrak video Facebook (pastikan video/Reels bersifat publik).'
  );
}

// ============================================================================
// 4. X / TWITTER (.tw, .x) — 3 Independent Live Providers
// ============================================================================
async function downloadTwitterMedia(
  rawUrl: string
): Promise<DownloadedSocialMedia> {
  const targetUrl = rawUrl.includes('t.co/')
    ? await resolveFinalUrl(rawUrl)
    : rawUrl;

  const match = targetUrl.match(
    /(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com)\/(?:([^/?#]+)\/status|i\/web\/status|i\/status)\/([0-9]+)/i
  );
  if (!match) {
    throw new Error('Format tautan cuitan X/Twitter tidak valid.');
  }
  const user = match[1] || 'i';
  const statusId = match[2];

  // Provider 1: FixTweet Official API (api.fxtwitter.com — zero Cloudflare block, full HD MP4 & multi-photo support)
  try {
    const fxRes = await fetch(
      `https://api.fxtwitter.com/${user}/status/${statusId}`,
      {
        headers: { 'User-Agent': 'WABot/2.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (fxRes.ok) {
      const fx = (await fxRes.json()) as {
        code?: number;
        tweet?: {
          text?: string;
          author?: { name?: string; screen_name?: string };
          media?: {
            videos?: Array<{
              url?: string;
              duration?: number;
              thumbnail_url?: string;
              variants?: Array<{ bitrate?: number; url?: string; content_type?: string }>;
            }>;
            photos?: Array<{ url?: string }>;
            all?: Array<{ type?: string; url?: string }>;
          };
        };
      };
      const t = fx.tweet;
      if (t) {
        const vid = t.media?.videos?.[0];
        const sortedVariants = (vid?.variants || [])
          .filter(
            (v) =>
              v.url?.startsWith('http') &&
              (!v.content_type || v.content_type.includes('mp4'))
          )
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
          .map((v) => v.url!);
        const vidCandidates = [
          ...(vid?.url ? [vid.url] : []),
          ...sortedVariants,
        ].filter((u, idx, arr) => arr.indexOf(u) === idx);

        const photos = (t.media?.photos || [])
          .map((p) => p.url)
          .filter((u): u is string => Boolean(u && u.startsWith('http')));

        if (vidCandidates.length > 0 || photos.length > 0) {
          return {
            platform: 'twitter',
            title: t.text?.trim().slice(0, 100) || 'Media Cuitan X / Twitter',
            author: t.author?.screen_name
              ? `@${t.author.screen_name}`
              : t.author?.name || 'Pengguna X',
            duration: vid?.duration ? Math.round(vid.duration) : undefined,
            videoUrl: vidCandidates[0],
            fallbackVideoUrls: vidCandidates.slice(1),
            imageUrl:
              vidCandidates.length === 0 && photos.length === 1
                ? photos[0]
                : undefined,
            slideImages:
              vidCandidates.length === 0 && photos.length > 1
                ? photos.slice(0, 8)
                : undefined,
            coverUrl: vid?.thumbnail_url,
          };
        }
      }
    }
  } catch {
    // Fall through to Provider 2
  }

  // Provider 2: Tioo Twitter Extractor
  const tioo = await fetchTiooEndpoint('twitter', targetUrl);
  if (tioo && Array.isArray(tioo.url) && tioo.url.length > 0) {
    const urls: string[] = [];
    for (const item of tioo.url) {
      if (typeof item === 'string' && item.startsWith('http')) {
        urls.push(item);
      } else if (item && typeof item === 'object') {
        const candidate = item.hd || item.sd || item.url || item.image;
        if (typeof candidate === 'string' && candidate.startsWith('http')) {
          urls.push(candidate);
        }
      }
    }
    if (urls.length > 0) {
      const isImg = /\.(jpe?g|png|webp)(\?|$)/i.test(urls[0]);
      return {
        platform: 'twitter',
        title: tioo.title?.slice(0, 100) || 'Media Cuitan X / Twitter',
        author: user !== 'i' ? `@${user}` : 'Pengguna X',
        videoUrl: isImg ? undefined : urls[0],
        fallbackVideoUrls: isImg ? undefined : urls.slice(1),
        imageUrl: isImg && urls.length === 1 ? urls[0] : undefined,
        slideImages: isImg && urls.length > 1 ? urls.slice(0, 8) : undefined,
      };
    }
  }

  throw new Error(
    'Tidak dapat mengambil media dari cuitan X/Twitter tersebut (pastikan cuitan berisi foto/video publik).'
  );
}

// ============================================================================
// 5. YOUTUBE (.yt, .mp3, .play) — NoTube Multi-Mirror + InnerTube Search + yt-dlp
// ============================================================================
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function convertViaNoTube(
  canonicalYtUrl: string,
  format: 'mp4' | 'mp3'
): Promise<{ downloadUrl: string; title?: string } | null> {
  const mirrors = ['s64.notube.net', 's62.notube.net', 's65.notube.net'];

  for (const mirror of mirrors) {
    try {
      const step1 = await fetch(`https://${mirror}/recover_weight.php`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://notube.net',
          Referer: 'https://notube.net/',
        },
        body: new URLSearchParams({
          url: canonicalYtUrl,
          format,
          lang: 'en',
          subscribed: 'false',
        }),
        signal: AbortSignal.timeout(14000),
      });
      if (!step1.ok) continue;

      const j1 = (await step1.json()) as {
        token?: string;
        name_mp4?: string;
        titre_mp4?: string;
        url_mp4_youtube?: string;
      };
      if (!j1.token) continue;

      // Trigger server-side remux/conversion
      await fetch(`https://${mirror}/recover_file.php?lang=en`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://notube.net',
          Referer: 'https://notube.net/',
        },
        body: new URLSearchParams({
          url: canonicalYtUrl,
          format,
          name_mp4: j1.name_mp4 || '',
          lang: 'en',
          token: j1.token,
          subscribed: 'false',
          playlist: 'false',
          adblock: 'false',
        }),
        signal: AbortSignal.timeout(22000),
      }).catch(() => {});

      const step3 = await fetch(
        `https://notube.net/en/download?token=${encodeURIComponent(j1.token)}`,
        {
          headers: { 'User-Agent': UA, Referer: 'https://notube.net/' },
          signal: AbortSignal.timeout(12000),
        }
      );
      if (!step3.ok) continue;

      const html = await step3.text();
      const dlMatch =
        html.match(
          /href=["'](https?:\/\/s[0-9]+\.notube\.net\/download\.php\?token=[^"']+)["']/i
        ) ||
        html.match(
          /https?:\/\/s[0-9]+\.notube\.net\/download\.php\?[^\s"'<>]+/i
        );
      const dlUrl = dlMatch ? dlMatch[1] || dlMatch[0] : null;
      if (dlUrl) {
        const cleanTitle = j1.titre_mp4
          ? decodeURIComponent(j1.titre_mp4.replace(/\+/g, ' '))
          : undefined;
        return { downloadUrl: decodeHtmlEntities(dlUrl), title: cleanTitle };
      }
    } catch {
      // Try next mirror
    }
  }
  return null;
}

async function tryLocalYtDlpUrl(
  canonicalYtUrl: string,
  audioOnly: boolean
): Promise<{ url: string; title?: string; uploader?: string; duration?: number } | null> {
  try {
    const fmt = audioOnly
      ? 'bestaudio[filesize<30M]/best[filesize<30M]/bestaudio'
      : 'best[ext=mp4][height<=720][filesize<32M]/best[ext=mp4]/best';
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['--no-playlist', '--no-warnings', '-f', fmt, '-j', canonicalYtUrl],
      { timeout: 18000, maxBuffer: 4 * 1024 * 1024 }
    );
    const info = JSON.parse(stdout.trim().split('\n')[0]) as {
      url?: string;
      title?: string;
      uploader?: string;
      duration?: number;
    };
    if (info?.url?.startsWith('http')) {
      return {
        url: info.url,
        title: info.title,
        uploader: info.uploader,
        duration: info.duration,
      };
    }
  } catch {
    // yt-dlp is optional; silently skip when not installed
  }
  return null;
}

export async function downloadYouTubeMedia(
  rawUrl: string,
  options?: ResolveSocialOptions
): Promise<DownloadedSocialMedia> {
  const videoId = extractYouTubeVideoId(rawUrl);
  const canonicalUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrl;
  const wantAudioOnly = Boolean(options?.audioOnly);

  const [oembed, notube] = await Promise.all([
    fetchOembedMetadata(canonicalUrl),
    convertViaNoTube(canonicalUrl, wantAudioOnly ? 'mp3' : 'mp4'),
  ]);

  if (notube?.downloadUrl) {
    return {
      platform: 'youtube',
      title: oembed?.title || notube.title || 'Video YouTube',
      author: oembed?.author_name || 'YouTube',
      videoUrl: wantAudioOnly ? undefined : notube.downloadUrl,
      audioUrl: wantAudioOnly ? notube.downloadUrl : undefined,
      coverUrl:
        oembed?.thumbnail_url ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined),
    };
  }

  // Optional local yt-dlp fallback (if installed on Termux/Linux)
  const ytdlp = await tryLocalYtDlpUrl(canonicalUrl, wantAudioOnly);
  if (ytdlp) {
    return {
      platform: 'youtube',
      title: ytdlp.title || oembed?.title || 'Media YouTube',
      author: ytdlp.uploader || oembed?.author_name || 'YouTube',
      duration: ytdlp.duration,
      videoUrl: wantAudioOnly ? undefined : ytdlp.url,
      audioUrl: wantAudioOnly ? ytdlp.url : undefined,
    };
  }

  throw new Error(
    'Server pengunduh YouTube sedang sibuk atau durasi video terlalu panjang (gunakan video publik berdurasi wajar).'
  );
}

// ============================================================================
// 6. PINTEREST (.pin) — Direct Scrape + Tioo Fallback
// ============================================================================
async function downloadPinterestMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  // Provider 1: Tioo Pinterest API (handles pin.it shortlinks & video/orig image cleanly)
  const tioo = await fetchTiooEndpoint('pinterest', url);
  if (tioo?.result) {
    const r = tioo.result;
    const vidUrl =
      r.video_url ||
      r.videos?.video_list?.V_720P?.url ||
      r.videos?.video_list?.V_HLSV4?.url;
    const imgUrl =
      r.images?.orig?.url ||
      r.image ||
      (Array.isArray(r.images) ? r.images[0] : undefined);

    if (
      (typeof vidUrl === 'string' && vidUrl.startsWith('http')) ||
      (typeof imgUrl === 'string' && imgUrl.startsWith('http'))
    ) {
      return {
        platform: 'pinterest',
        title:
          r.title?.trim() ||
          r.description?.trim().slice(0, 90) ||
          'Pin Kreatif Pinterest',
        author: r.uploader?.full_name || r.pinner?.full_name || 'Pinterest',
        videoUrl:
          typeof vidUrl === 'string' && vidUrl.endsWith('.mp4')
            ? vidUrl
            : undefined,
        imageUrl: typeof imgUrl === 'string' ? imgUrl : undefined,
      };
    }
  }

  // Provider 2: Direct Pinterest HTML Scrape
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
    html.match(
      /https:\/\/i\.pinimg\.com\/originals\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/i
    ) ||
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );

  const videoUrl = videoMatch ? videoMatch[1] || videoMatch[0] : undefined;
  const imageUrl =
    !videoUrl && imgMatch ? imgMatch[1] || imgMatch[0] : undefined;

  if (!videoUrl && !imageUrl) {
    throw new Error('Media publik tidak ditemukan pada tautan Pinterest ini.');
  }

  return {
    platform: 'pinterest',
    title: titleMatch?.[1]
      ? decodeHtmlEntities(titleMatch[1])
      : 'Pin Kreatif Pinterest',
    author: 'Pinterest',
    videoUrl,
    imageUrl,
  };
}

// ============================================================================
// 7. MEDIAFIRE (.mf) — Direct Scrape (incl. Scrambled Base64) + Tioo Fallback
// ============================================================================
async function downloadMediaFireFile(
  url: string
): Promise<DownloadedSocialMedia> {
  // Provider 1: Direct MediaFire HTML + Scrambled Base64 Link Extractor
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const html = await res.text();
      let directUrl =
        html.match(
          /href=["'](https?:\/\/download[0-9]*\.mediafire\.com\/[^"']+)["']/i
        )?.[1] || '';

      if (!directUrl) {
        const scrambled = html.match(/data-scrambled-url=["']([^"']+)["']/i)?.[1];
        if (scrambled) {
          const decoded = Buffer.from(scrambled, 'base64').toString('utf8');
          if (decoded.startsWith('http')) directUrl = decoded;
        }
      }

      if (directUrl) {
        const decodedName = decodeURIComponent(
          directUrl.split('/').pop()?.split('?')[0] || 'mediafire-file'
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
    }
  } catch {
    // Fall through to Provider 2
  }

  // Provider 2: Tioo MediaFire Extractor
  const tioo = await fetchTiooEndpoint('mediafire', url);
  const directUrl = tioo?.url || tioo?.result?.url;
  if (typeof directUrl === 'string' && directUrl.startsWith('http')) {
    const fname =
      tioo?.filename ||
      decodeURIComponent(directUrl.split('/').pop() || 'mediafire-file');
    return {
      platform: 'mediafire',
      title: fname,
      author: tioo?.owner || 'MediaFire Cloud',
      fileUrl: directUrl,
      fileName: fname,
      fileMimeType: tioo?.mimetype || 'application/octet-stream',
    };
  }

  throw new Error(
    'Tautan unduhan langsung MediaFire tidak ditemukan (pastikan file bersifat publik dan belum dihapus).'
  );
}

// ============================================================================
// 8. CAPCUT (.capcut) — Unwrapped ByteDance VOD CDN + Direct SSR Scrape
// ============================================================================
async function downloadCapCutMedia(
  url: string
): Promise<DownloadedSocialMedia> {
  // Provider 1: Tioo CapCut Extractor (unwrapping 3bic /api/cdn/<base64> to direct ByteDance VOD URL)
  const tioo = await fetchTiooEndpoint('capcut', url);
  if (tioo) {
    const rawVid =
      tioo.originalVideoUrl ||
      tioo.videoUrl ||
      tioo.contentUrl ||
      tioo.data?.originalVideoUrl;
    const unwrapped = unwrapProxyCdnUrl(rawVid);
    if (unwrapped && unwrapped.startsWith('http')) {
      return {
        platform: 'capcut',
        title: tioo.title?.trim() || 'Template CapCut Tanpa Watermark',
        author: tioo.author?.name || tioo.author || 'Kreator CapCut',
        videoUrl: unwrapped,
        coverUrl: unwrapProxyCdnUrl(tioo.coverUrl),
      };
    }
  }

  // Provider 2: Direct CapCut SSR Page Scrape
  const page = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (page.ok) {
    const html = await page.text();
    const ssrVid =
      html.match(/"video_url"\s*:\s*"(https?:[^"]+)"/i)?.[1] ||
      html.match(/https?:\/\/[^\s"'<>]+capcutvod[^\s"'<>]+/i)?.[0] ||
      html.match(/https?:\/\/[^\s"'<>]+capcut[^\s"'<>]+\.mp4[^\s"'<>]*/i)?.[0];
    if (ssrVid) {
      const cleanVid = decodeHtmlEntities(ssrVid);
      const titleMatch = html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      );
      return {
        platform: 'capcut',
        title: titleMatch?.[1]
          ? decodeHtmlEntities(titleMatch[1])
          : 'Template CapCut Tanpa Watermark',
        author: 'CapCut',
        videoUrl: cleanVid,
      };
    }
  }

  throw new Error(
    'Tidak dapat mengekstrak video dari tautan template CapCut tersebut.'
  );
}

// ============================================================================
// UNIFIED DISPATCHER (.aio, .tt, .ig, .fb, .tw, .pin, .capcut, .mf, .yt, .mp3)
// ============================================================================
export async function resolveSocialMedia(
  url: string,
  preferredPlatform?: SupportedPlatform | 'auto',
  options?: ResolveSocialOptions
): Promise<DownloadedSocialMedia> {
  const detected =
    preferredPlatform && preferredPlatform !== 'auto'
      ? preferredPlatform
      : detectPlatformFromUrl(url);

  if (detected === 'tiktok') {
    return downloadTikTokMedia(url);
  }
  if (detected === 'instagram') {
    return downloadInstagramMedia(url);
  }
  if (detected === 'facebook') {
    return downloadFacebookMedia(url);
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
  if (detected === 'youtube') {
    return downloadYouTubeMedia(url, options);
  }

  // Generic All-in-One fallback for unrecognized shortlinks: resolve redirect first and re-detect!
  const redirected = await resolveFinalUrl(url);
  const redetected = detectPlatformFromUrl(redirected);
  if (redetected !== 'social') {
    return resolveSocialMedia(redirected, redetected, options);
  }

  throw new Error(
    'Tautan tidak dikenali atau platform belum didukung. Gunakan tautan publik TikTok, Instagram, Facebook, X/Twitter, YouTube, Pinterest, CapCut, atau MediaFire.'
  );
}

// ============================================================================
// PLAY / SONG SEARCH (.play <judul lagu>) — Full YouTube Song + iTunes/TikWM Fallback
// ============================================================================
async function searchYouTubeTopVideo(
  query: string
): Promise<{ videoId: string; title?: string; author?: string } | null> {
  try {
    const res = await fetch(
      'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20250101.00.00',
              hl: 'id',
              gl: 'ID',
            },
          },
          query,
        }),
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const idMatch = text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!idMatch?.[1]) return null;
    return { videoId: idMatch[1] };
  } catch {
    return null;
  }
}

export async function searchAndDownloadPlay(
  query: string
): Promise<DownloadedSocialMedia> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('Masukkan judul lagu atau nama penyanyi.');
  }

  // Run YouTube Lyric Track Search + iTunes Music Search in parallel so fallbackAudioUrls is always populated
  const [ytTask, itunesTask] = await Promise.allSettled([
    (async () => {
      const ytHit = await searchYouTubeTopVideo(`${cleanQuery} lyrics`);
      if (!ytHit?.videoId) return null;
      const ytUrl = `https://www.youtube.com/watch?v=${ytHit.videoId}`;
      const [oembed, notube] = await Promise.all([
        fetchOembedMetadata(ytUrl),
        convertViaNoTube(ytUrl, 'mp3'),
      ]);
      if (!notube?.downloadUrl) return null;
      return {
        title: oembed?.title || notube.title || cleanQuery,
        author: oembed?.author_name || 'YouTube Music',
        audioUrl: notube.downloadUrl,
        coverUrl:
          oembed?.thumbnail_url ||
          `https://i.ytimg.com/vi/${ytHit.videoId}/hqdefault.jpg`,
      };
    })(),
    (async () => {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        cleanQuery
      )}&media=music&entity=song&limit=1`;
      const res = await fetch(itunesUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        results?: Array<{
          trackName?: string;
          artistName?: string;
          previewUrl?: string;
          artworkUrl100?: string;
        }>;
      };
      const hit = json.results?.[0];
      if (!hit?.previewUrl) return null;
      return {
        title: hit.trackName || cleanQuery,
        author: hit.artistName || 'Artis Musik',
        duration: 30,
        audioUrl: hit.previewUrl,
        coverUrl: hit.artworkUrl100?.replace('100x100', '600x600'),
      };
    })(),
  ]);

  const ytResult = ytTask.status === 'fulfilled' ? ytTask.value : null;
  const itunesResult =
    itunesTask.status === 'fulfilled' ? itunesTask.value : null;

  const audioCandidates = [ytResult?.audioUrl, itunesResult?.audioUrl].filter(
    (u): u is string => Boolean(u)
  );

  if (audioCandidates.length > 0) {
    const metaTitle = itunesResult?.title || ytResult?.title || cleanQuery;
    const metaAuthor =
      itunesResult?.author || ytResult?.author || 'Artis Musik';
    return {
      platform: 'youtube',
      title: metaTitle,
      author: metaAuthor,
      duration: ytResult ? undefined : itunesResult?.duration,
      audioUrl: audioCandidates[0],
      fallbackAudioUrls: audioCandidates.slice(1),
      coverUrl: itunesResult?.coverUrl || ytResult?.coverUrl,
    };
  }

  // Tertiary fallback: TikWM Music/Audio feed search
  try {
    const tikSearch = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(
      cleanQuery
    )}&count=3`;
    const res = await fetch(tikSearch, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
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
  } catch {
    // Exhausted all 3 music providers
  }

  throw new Error(`Lagu dengan kata kunci "${cleanQuery}" tidak ditemukan.`);
}

// ============================================================================
// BINARY STREAM DOWNLOADER WITH SMART CDN HEADERS & FALLBACK RETRY
// ============================================================================
export function buildCdnRequestHeaders(targetUrl: string): Record<string, string> {
  const lower = targetUrl.toLowerCase();
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: '*/*',
  };

  if (lower.includes('tikwm.com')) {
    headers.Referer = 'https://www.tikwm.com/';
  } else if (lower.includes('notube.net')) {
    headers.Referer = 'https://notube.net/';
  } else if (lower.includes('tiktokio.com')) {
    headers.Referer = 'https://tiktokio.com/';
  } else if (lower.includes('snapcdn.app')) {
    headers.Referer = 'https://snapsave.app/';
  }
  // Intentionally omit Referer on cdninstagram.com, fbcdn.net, capcutvod.com, twimg.com, pinimg.com
  // because sending the asset URL itself as Referer triggers HTTP 403 on Meta/ByteDance CDNs.
  return headers;
}

export async function fetchRemoteBuffer(
  url: string,
  maxBytes = 35 * 1024 * 1024,
  fallbackUrls: string[] = []
): Promise<{ buffer: Buffer; contentType: string }> {
  const candidates = [url, ...fallbackUrls]
    .map((u) => unwrapProxyCdnUrl(u) || u)
    .filter((u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx);

  let lastError: Error | null = null;

  for (const candidateUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);
    try {
      const res = await fetch(candidateUrl, {
        headers: buildCdnRequestHeaders(candidateUrl),
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Gagal mengunduh media (HTTP ${res.status})`);
      }

      const contentType = (
        res.headers.get('content-type') || 'application/octet-stream'
      ).toLowerCase();

      // Guard against login walls / Cloudflare pages masquerading as HTTP 200 media
      if (contentType.includes('text/html')) {
        throw new Error(
          'Sumber media mengembalikan halaman proteksi HTML, bukan berkas media.'
        );
      }

      const contentLength = Number(res.headers.get('content-length') || '0');
      if (contentLength > maxBytes) {
        throw new Error(
          'Ukuran file media melebihi batas pengiriman aman Anti-Ban bot (35 MB).'
        );
      }

      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength < 256) {
        throw new Error('Berkas media dari server sumber kosong atau rusak.');
      }
      if (arrayBuf.byteLength > maxBytes) {
        throw new Error(
          'Ukuran file media melebihi batas pengiriman aman Anti-Ban bot (35 MB).'
        );
      }

      return {
        buffer: Buffer.from(arrayBuf),
        contentType,
      };
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error('Gagal mengunduh berkas media.');
      // Do not retry other mirrors if the file genuinely exceeds the 35 MB safety limit
      if (lastError.message.includes('35 MB')) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Gagal mengunduh media dari server sumber.');
}
