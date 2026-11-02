import { ensureWhatsappImageBuffer } from './imageAdapter.ts';
import { fetchRemoteBuffer } from './mediaDownloader.ts';

export interface FetchedMeme {
  title: string;
  source: string;
  url: string;
  buffer: Buffer;
  mimeType: string;
}

const FALLBACK_MEMES: Array<{ title: string; url: string; source: string }> = [
  {
    title: 'Ketika Niat Belajar Coding Tapi Malah Buka Sosmed',
    url: 'https://images.unsplash.com/photo-1534972195531-a756b1126f24?auto=format&fit=crop&w=720&q=80',
    source: 'Koleksi Humor Santai',
  },
  {
    title: 'Ekspektasi vs Realita Begadang',
    url: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=720&q=80',
    source: 'Koleksi Humor Santai',
  },
];

/**
 * Mengambil gambar meme lucu dari berbagai referensi web:
 * - candaan-api.vercel.app (Meme jokes bapak-bapak & humor Indonesia)
 * - meme-api.com (Meme komunitas Indonesia & trending global)
 * - cak.one / rest.cak.one (Endpoint meme referensi)
 */
export async function fetchMemeFromWeb(query?: string): Promise<FetchedMeme> {
  const cleanQ = (query || '').trim().toLowerCase();

  const fetchers: Array<() => Promise<{ url: string; title: string; source: string }>> = [];

  // Jika user menyertakan kata kunci pencarian/topik
  if (cleanQ) {
    let sub = cleanQ;
    if (sub.includes('indo')) sub = 'indonesia';
    else if (sub.includes('program') || sub.includes('koding') || sub.includes('it')) sub = 'programmerhumor';
    else if (sub.includes('kucing') || sub.includes('cat')) sub = 'catmemes';
    else if (sub.includes('lucu') || sub.includes('funny')) sub = 'wholesomememes';

    fetchers.push(async () => {
      const res = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(sub)}`, {
        signal: AbortSignal.timeout(6000),
      });
      const data = await res.json();
      if (data?.url && typeof data.url === 'string') {
        return {
          url: data.url,
          title: data.title || `Meme r/${sub}`,
          source: `Reddit r/${data.subreddit || sub}`,
        };
      }
      throw new Error('Meme API empty');
    });
  }

  // Provider 1: Candaan API (Jokes & meme gambar Indonesia)
  fetchers.push(async () => {
    const res = await fetch('https://candaan-api.vercel.app/api/image/random', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.data?.url && typeof data.data.url === 'string') {
      return {
        url: data.data.url,
        title: 'Meme Candaan & Jokes Lucu',
        source: 'Candaan Web API',
      };
    }
    throw new Error('Candaan API empty');
  });

  // Provider 2: Meme-API Indonesia
  fetchers.push(async () => {
    const res = await fetch('https://meme-api.com/gimme/indonesia', {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.url && typeof data.url === 'string') {
      return {
        url: data.url,
        title: data.title || 'Meme Komunitas Indonesia',
        source: 'r/indonesia Humor',
      };
    }
    throw new Error('Meme-API Indonesia empty');
  });

  // Provider 3: Cak.one REST API
  fetchers.push(async () => {
    const res = await fetch('https://rest.cak.one/api/random/meme', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    const targetUrl = data?.url || data?.result?.url || data?.image;
    if (targetUrl && typeof targetUrl === 'string') {
      return {
        url: targetUrl,
        title: data?.title || data?.caption || 'Meme Referensi Cak.one',
        source: 'Cak.one API',
      };
    }
    throw new Error('Cak.one empty');
  });

  // Provider 4: Meme-API Trending Global
  fetchers.push(async () => {
    const res = await fetch('https://meme-api.com/gimme', {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.url && typeof data.url === 'string') {
      return {
        url: data.url,
        title: data.title || 'Trending Meme',
        source: `Reddit r/${data.subreddit || 'dankmemes'}`,
      };
    }
    throw new Error('Meme-API Trending empty');
  });

  // Acak urutan jika query kosong agar tidak monoton
  if (!cleanQ) {
    fetchers.sort(() => Math.random() - 0.5);
  }

  for (const fn of fetchers) {
    try {
      const candidate = await fn();
      if (!candidate?.url) continue;

      const { buffer: rawBuf, contentType } = await fetchRemoteBuffer(
        candidate.url,
        15 * 1024 * 1024
      );

      const { buffer, mimeType } = await ensureWhatsappImageBuffer(rawBuf, contentType);
      if (buffer && buffer.length > 256) {
        return {
          title: candidate.title,
          source: candidate.source,
          url: candidate.url,
          buffer,
          mimeType,
        };
      }
    } catch {
      // Coba provider berikutnya jika gagal koneksi atau 403
    }
  }

  // Fallback aman jika semua provider web sedang offline
  const fallback = FALLBACK_MEMES[Math.floor(Math.random() * FALLBACK_MEMES.length)];
  const { buffer: rawBuf, contentType } = await fetchRemoteBuffer(
    fallback.url,
    15 * 1024 * 1024
  );
  const { buffer, mimeType } = await ensureWhatsappImageBuffer(rawBuf, contentType);

  return {
    title: fallback.title,
    source: fallback.source,
    url: fallback.url,
    buffer,
    mimeType,
  };
}
