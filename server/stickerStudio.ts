import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import WebP from 'node-webpmux';

const execFileAsync = promisify(execFile);

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wabot-stk-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function injectWhatsAppExif(
  webpBuffer: Buffer,
  packName: string,
  author: string
): Promise<Buffer> {
  try {
    const img = new WebP.Image();
    await img.load(webpBuffer);

    const jsonPayload = JSON.stringify({
      'sticker-pack-id': 'com.wabot.sticker.pack',
      'sticker-pack-name': packName || 'WA Sticker',
      'sticker-pack-publisher': author || '6289673533963',
      emojis: ['✨', '🔥'],
    });

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuffer = Buffer.from(jsonPayload, 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    img.exif = exif;
    const muxed = await img.save(null);
    return Buffer.from(muxed);
  } catch {
    return webpBuffer;
  }
}

export async function rewriteStickerExif(
  stickerBuffer: Buffer,
  packName: string,
  author: string
): Promise<Buffer> {
  return injectWhatsAppExif(stickerBuffer, packName, author);
}

export async function imageToStickerWebp(
  imageBuffer: Buffer,
  packName: string,
  author: string
): Promise<Buffer> {
  const rawWebp = await sharp(imageBuffer, { animated: true })
    .rotate()
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 84 })
    .toBuffer();

  return injectWhatsAppExif(rawWebp, packName, author);
}

export async function videoToAnimatedStickerWebp(
  videoBuffer: Buffer,
  packName: string,
  author: string
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, 'input.mp4');
    const outPath = path.join(dir, 'output.webp');
    await fs.writeFile(inPath, videoBuffer);

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inPath,
        '-t',
        '7',
        '-vf',
        'fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-vcodec',
        'libwebp',
        '-lossless',
        '0',
        '-compression_level',
        '4',
        '-q:v',
        '65',
        '-loop',
        '0',
        '-preset',
        'default',
        '-an',
        '-vsync',
        '0',
        outPath,
      ],
      { timeout: 25000 }
    );

    const webpBuf = await fs.readFile(outPath);
    return injectWhatsAppExif(webpBuf, packName, author);
  });
}

export async function stickerWebpToPng(webpBuffer: Buffer): Promise<Buffer> {
  return sharp(webpBuffer, { animated: false }).png().toBuffer();
}

export async function animatedWebpToMp4(webpBuffer: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const meta = await sharp(webpBuffer, { animated: true }).metadata();
    const pages = Math.min(meta.pages || 1, 90);
    const pageHeight =
      meta.pageHeight ||
      (meta.height && meta.pages ? Math.floor(meta.height / meta.pages) : meta.height || 512);
    const width = meta.width || 512;

    if (pages <= 1) {
      // Static sticker -> 3-second clean MP4 loop
      const singlePng = path.join(dir, 'frame.png');
      const outMp4 = path.join(dir, 'out.mp4');
      await sharp(webpBuffer)
        .flatten({ background: '#111114' })
        .resize(512, 512, { fit: 'contain', background: '#111114' })
        .png()
        .toFile(singlePng);

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-loop',
          '1',
          '-i',
          singlePng,
          '-t',
          '3',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          outMp4,
        ],
        { timeout: 20000 }
      );
      return fs.readFile(outMp4);
    }

    // Extract frames from animated WebP tall strip
    const delays = meta.delay || [];
    const avgDelayMs =
      delays.length > 0
        ? Math.max(
            40,
            Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
          )
        : 90;
    const fps = Math.max(4, Math.min(25, Math.round(1000 / avgDelayMs)));

    const stripPng = await sharp(webpBuffer, { animated: true })
      .flatten({ background: '#111114' })
      .png()
      .toBuffer();

    for (let i = 0; i < pages; i += 1) {
      const framePath = path.join(
        dir,
        `frame_${String(i).padStart(3, '0')}.png`
      );
      await sharp(stripPng)
        .extract({
          left: 0,
          top: i * pageHeight,
          width,
          height: pageHeight,
        })
        .resize(512, 512, { fit: 'contain', background: '#111114' })
        .png()
        .toFile(framePath);
    }

    const outMp4 = path.join(dir, 'out.mp4');
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        path.join(dir, 'frame_%03d.png'),
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outMp4,
      ],
      { timeout: 25000 }
    );

    return fs.readFile(outMp4);
  });
}

function wrapTextLines(
  text: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['santai'];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const chunkedWord =
      word.length > maxCharsPerLine ? word.slice(0, maxCharsPerLine) : word;
    if (!current) {
      current = chunkedWord;
    } else if ((current + ' ' + chunkedWord).length <= maxCharsPerLine) {
      current += ' ' + chunkedWord;
    } else {
      lines.push(current);
      current = chunkedWord;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

export type BratColorTheme = {
  bg: string;
  fg: string;
};

const BRAT_COLOR_PALETTE: Record<string, BratColorTheme> = {
  lime: { bg: '#8ACE00', fg: '#0A0A0A' },
  hijau: { bg: '#8ACE00', fg: '#0A0A0A' },
  green: { bg: '#8ACE00', fg: '#0A0A0A' },
  white: { bg: '#FFFFFF', fg: '#0A0A0A' },
  putih: { bg: '#FFFFFF', fg: '#0A0A0A' },
  pink: { bg: '#FF77B4', fg: '#0A0A0A' },
  merahmuda: { bg: '#FF77B4', fg: '#0A0A0A' },
  biru: { bg: '#5CB8FF', fg: '#0A0A0A' },
  blue: { bg: '#5CB8FF', fg: '#0A0A0A' },
  merah: { bg: '#FF4D4D', fg: '#0A0A0A' },
  red: { bg: '#FF4D4D', fg: '#0A0A0A' },
  ungu: { bg: '#B983FF', fg: '#0A0A0A' },
  purple: { bg: '#B983FF', fg: '#0A0A0A' },
  kuning: { bg: '#FFE600', fg: '#0A0A0A' },
  yellow: { bg: '#FFE600', fg: '#0A0A0A' },
  oranye: { bg: '#FF922B', fg: '#0A0A0A' },
  orange: { bg: '#FF922B', fg: '#0A0A0A' },
  cyan: { bg: '#3AE3D6', fg: '#0A0A0A' },
  tosca: { bg: '#3AE3D6', fg: '#0A0A0A' },
  hitam: { bg: '#111113', fg: '#F4F4F5' },
  black: { bg: '#111113', fg: '#F4F4F5' },
};

async function renderBratFramePng(
  rawText: string,
  colorKey: string
): Promise<Buffer> {
  const cleanText = rawText.trim().toLowerCase() || 'santai dulu';
  const charCount = cleanText.length;

  let fontSize = 84;
  let maxChars = 10;
  if (charCount > 60) {
    fontSize = 44;
    maxChars = 18;
  } else if (charCount > 32) {
    fontSize = 54;
    maxChars = 15;
  } else if (charCount > 16) {
    fontSize = 68;
    maxChars = 12;
  }

  const lines = wrapTextLines(cleanText, maxChars, 7);
  const theme =
    BRAT_COLOR_PALETTE[colorKey.toLowerCase()] || BRAT_COLOR_PALETTE.lime;
  const lineHeight = Math.round(fontSize * 1.14);
  const totalBlockHeight = lines.length * lineHeight;
  const startY = Math.max(
    fontSize + 28,
    Math.round((512 - totalBlockHeight) / 2) + Math.round(fontSize * 0.8)
  );

  const svgTextElements = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<text x="44" y="${y}" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="500" fill="${theme.fg}" letter-spacing="-1.5" transform="scale(0.92, 1.05)">${escapeXml(
        line
      )}</text>`;
    })
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="20" fill="${theme.bg}" />
    ${svgTextElements}
  </svg>`;

  const lowFiPng = await sharp(Buffer.from(svg))
    .resize(330, 330)
    .blur(1.15)
    .png()
    .toBuffer();

  return sharp(lowFiPng).resize(512, 512, { kernel: 'linear' }).png().toBuffer();
}

export async function createBratSticker(
  rawText: string,
  colorKey: string,
  packName: string,
  author: string
): Promise<Buffer> {
  const pngBuf = await renderBratFramePng(rawText, colorKey);
  const finalWebp = await sharp(pngBuf).webp({ quality: 84 }).toBuffer();
  return injectWhatsAppExif(finalWebp, packName, author);
}

export async function createBratAnimatedSticker(
  rawText: string,
  packName: string,
  author: string
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const words = rawText
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 12);
    const steps = words.length > 1 ? words : [rawText.trim() || 'santai', `${rawText.trim() || 'santai'}!`];

    const frames: Buffer[] = [];
    for (let i = 0; i < steps.length; i += 1) {
      const partial = steps.slice(0, i + 1).join(' ');
      frames.push(await renderBratFramePng(partial, 'lime'));
    }
    // Hold final frame slightly longer
    frames.push(frames[frames.length - 1]);
    frames.push(frames[frames.length - 1]);

    for (let idx = 0; idx < frames.length; idx += 1) {
      await fs.writeFile(
        path.join(dir, `frame_${String(idx).padStart(3, '0')}.png`),
        frames[idx]
      );
    }

    const outPath = path.join(dir, 'bratvid.webp');
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        '2.4',
        '-i',
        path.join(dir, 'frame_%03d.png'),
        '-vcodec',
        'libwebp',
        '-lossless',
        '0',
        '-q:v',
        '75',
        '-loop',
        '0',
        '-an',
        outPath,
      ],
      { timeout: 20000 }
    );

    const webpBuf = await fs.readFile(outPath);
    return injectWhatsAppExif(webpBuf, packName, author);
  });
}

function buildTtpSvg(text: string, fillHex: string, strokeHex = '#000000'): string {
  const clean = text.trim() || 'STIKER';
  const len = clean.length;
  const fontSize = len > 45 ? 48 : len > 24 ? 62 : len > 12 ? 78 : 96;
  const maxChars = len > 45 ? 16 : len > 24 ? 12 : 10;
  const lines = wrapTextLines(clean, maxChars, 6);
  const lineHeight = Math.round(fontSize * 1.15);
  const blockH = lines.length * lineHeight;
  const startY = Math.round((512 - blockH) / 2 + fontSize * 0.82);

  const nodes = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" fill="${fillHex}" stroke="${strokeHex}" stroke-width="12" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
        line
      )}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${nodes}</svg>`;
}

export async function createTtpSticker(
  rawText: string,
  packName: string,
  author: string
): Promise<Buffer> {
  const svg = buildTtpSvg(rawText, '#FFFFFF', '#09090B');
  const webp = await sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
  return injectWhatsAppExif(webp, packName, author);
}

export async function createAttpSticker(
  rawText: string,
  packName: string,
  author: string
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const colors = [
      '#FF3B30',
      '#FF9500',
      '#FFCC00',
      '#34C759',
      '#00C7BE',
      '#32ADE6',
      '#AF52DE',
      '#FF2D55',
    ];
    for (let i = 0; i < colors.length; i += 1) {
      const svg = buildTtpSvg(rawText, colors[i], '#09090B');
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      await fs.writeFile(
        path.join(dir, `frame_${String(i).padStart(3, '0')}.png`),
        png
      );
    }

    const outPath = path.join(dir, 'attp.webp');
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        '7',
        '-i',
        path.join(dir, 'frame_%03d.png'),
        '-vcodec',
        'libwebp',
        '-lossless',
        '0',
        '-q:v',
        '80',
        '-loop',
        '0',
        '-an',
        outPath,
      ],
      { timeout: 20000 }
    );

    const webpBuf = await fs.readFile(outPath);
    return injectWhatsAppExif(webpBuf, packName, author);
  });
}

export interface QuoteChatOptions {
  text: string;
  senderName: string;
  style: 'wa' | 'ios';
  packName: string;
  author: string;
}

const QC_NAME_COLORS = [
  '#10B981',
  '#38BDF8',
  '#F472B6',
  '#FBBF24',
  '#A78BFA',
  '#FB7185',
];

function pickNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return QC_NAME_COLORS[hash % QC_NAME_COLORS.length];
}

export async function createQuoteChatSticker(
  opts: QuoteChatOptions
): Promise<Buffer> {
  const cleanName = (opts.senderName || 'Pengguna').slice(0, 26);
  const cleanText = (opts.text || 'Halo!').trim().slice(0, 220);
  const initials = cleanName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('') || 'WA';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const accent = pickNameColor(cleanName);
  const wrapped = wrapTextLines(cleanText, 26, 7);
  const lineH = 29;
  const textBlockH = wrapped.length * lineH;

  let svg: string;
  if (opts.style === 'ios') {
    const bubbleH = Math.max(88, 56 + textBlockH);
    const topY = Math.round((512 - (bubbleH + 34)) / 2);
    const textSvg = wrapped
      .map(
        (ln, i) =>
          `<text x="114" y="${
            topY + 62 + i * lineH
          }" font-family="-apple-system, Helvetica Neue, Arial, DejaVu Sans, sans-serif" font-size="23" font-weight="400" fill="#FFFFFF">${escapeXml(
            ln
          )}</text>`
      )
      .join('\n');

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <text x="98" y="${topY + 14}" font-family="-apple-system, Helvetica Neue, Arial, sans-serif" font-size="16" font-weight="500" fill="#8E8E93">${escapeXml(
        cleanName
      )} · iMessage · ${escapeXml(timeStr)}</text>
      <circle cx="48" cy="${topY + 26 + bubbleH - 28}" r="30" fill="#2C2C2E" />
      <text x="48" y="${
        topY + 26 + bubbleH - 19
      }" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">${escapeXml(
      initials
    )}</text>
      <rect x="92" y="${topY + 26}" width="396" height="${bubbleH}" rx="28" fill="#0A84FF" />
      ${textSvg}
    </svg>`;
  } else {
    const bubbleH = Math.max(108, 72 + textBlockH);
    const topY = Math.round((512 - bubbleH) / 2);
    const textSvg = wrapped
      .map(
        (ln, i) =>
          `<text x="114" y="${
            topY + 66 + i * lineH
          }" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="22" fill="#F4F4F5">${escapeXml(
            ln
          )}</text>`
      )
      .join('\n');

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <circle cx="46" cy="${topY + 34}" r="32" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="2" />
      <text x="46" y="${
        topY + 42
      }" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${accent}">${escapeXml(
      initials
    )}</text>
      <path d="M84 ${topY + 18} L98 ${topY + 18} L98 ${topY + 34} Z" fill="#1F2C34" />
      <rect x="94" y="${topY}" width="402" height="${bubbleH}" rx="22" fill="#1F2C34" />
      <text x="114" y="${
        topY + 32
      }" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="20" font-weight="700" fill="${accent}">${escapeXml(
      cleanName
    )}</text>
      ${textSvg}
      <text x="476" y="${
        topY + bubbleH - 14
      }" text-anchor="end" font-family="Arial, sans-serif" font-size="15" fill="#8696A0">${escapeXml(
      timeStr
    )}</text>
    </svg>`;
  }

  const webp = await sharp(Buffer.from(svg)).webp({ quality: 92 }).toBuffer();
  return injectWhatsAppExif(webp, opts.packName, opts.author);
}

function emojiToCodepointHex(emoji: string): string {
  const codepoints: string[] = [];
  for (const ch of Array.from(emoji.trim())) {
    const cp = ch.codePointAt(0);
    if (cp && cp !== 0xfe0f) {
      codepoints.push(cp.toString(16).toLowerCase());
    }
  }
  // Emoji Kitchen keeps fe0f in some older dates, so we return normalized hex
  return codepoints.join('-u');
}

function emojiToCodepointWithFe0f(emoji: string): string {
  const codepoints: string[] = [];
  for (const ch of Array.from(emoji.trim())) {
    const cp = ch.codePointAt(0);
    if (cp) codepoints.push(cp.toString(16).toLowerCase());
  }
  return codepoints.join('-u');
}

const EMOJI_KITCHEN_DATES = [
  '20240206',
  '20231113',
  '20230418',
  '20220815',
  '20210831',
  '20201001',
];

export async function createEmojiMixSticker(
  rawInput: string,
  packName: string,
  author: string
): Promise<Buffer> {
  const parts = rawInput.includes('+')
    ? rawInput.split('+')
    : rawInput.includes('|')
    ? rawInput.split('|')
    : Array.from(Intl.Segmenter ? new Intl.Segmenter().segment(rawInput.replace(/\s+/g, '')) : [])
        .map((s) => s.segment);

  const e1 = (parts[0] || '').trim();
  const e2 = (parts[1] || '').trim();
  if (!e1 || !e2) {
    throw new Error('Masukkan 2 emoji dipisah tanda tambah, contoh: *.emojimix 😀+😎*');
  }

  const candidates = [
    [emojiToCodepointHex(e1), emojiToCodepointHex(e2)],
    [emojiToCodepointHex(e2), emojiToCodepointHex(e1)],
    [emojiToCodepointWithFe0f(e1), emojiToCodepointWithFe0f(e2)],
    [emojiToCodepointWithFe0f(e2), emojiToCodepointWithFe0f(e1)],
  ];

  for (const date of EMOJI_KITCHEN_DATES) {
    for (const [ left, right ] of candidates) {
      if (!left || !right) continue;
      const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${left}/u${left}_u${right}.png`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const arr = await res.arrayBuffer();
          return imageToStickerWebp(Buffer.from(arr), packName, author);
        }
      } catch {
        // Try next date/order
      }
    }
  }

  // Clean vector fusion fallback when rare emoji combination is not in gstatic
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="220" fill="#18181B" stroke="#10B981" stroke-width="8"/>
    <text x="185" y="295" text-anchor="middle" font-size="165">${escapeXml(e1)}</text>
    <text x="330" y="315" text-anchor="middle" font-size="165">${escapeXml(e2)}</text>
  </svg>`;
  const webp = await sharp(Buffer.from(fallbackSvg)).webp({ quality: 90 }).toBuffer();
  return injectWhatsAppExif(webp, packName, author);
}

async function getFallbackMemeBackground(): Promise<Buffer> {
  const sampleImagePath = path.join(
    process.cwd(),
    'src',
    'assets',
    'images',
    'sample_sticker_cat_1793095457845.jpg'
  );
  try {
    return await fs.readFile(sampleImagePath);
  } catch {
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#18181B"/>
          <stop offset="100%" stop-color="#27272A"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill="url(#g)"/>
    </svg>`;
    return sharp(Buffer.from(fallbackSvg)).png().toBuffer();
  }
}

export async function createMemeSticker(
  topText: string,
  bottomText: string,
  baseImageBuffer: Buffer | null,
  packName: string,
  author: string
): Promise<Buffer> {
  const sourceBuffer = baseImageBuffer ?? (await getFallbackMemeBackground());

  const topLines = topText.trim()
    ? wrapTextLines(topText.trim().toUpperCase(), 18, 2)
    : [];
  const bottomLines = bottomText.trim()
    ? wrapTextLines(bottomText.trim().toUpperCase(), 18, 2)
    : [];

  const fontSize = 44;
  const lineHeight = 48;

  const topSvg = topLines
    .map((line, idx) => {
      const y = 54 + idx * lineHeight;
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
        line
      )}</text>`;
    })
    .join('\n');

  const bottomStartY = 512 - 24 - (bottomLines.length - 1) * lineHeight;
  const bottomSvg = bottomLines
    .map((line, idx) => {
      const y = bottomStartY + idx * lineHeight;
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
        line
      )}</text>`;
    })
    .join('\n');

  const overlaySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${topSvg}
      ${bottomSvg}
    </svg>`
  );

  const webpBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize(512, 512, { fit: 'cover' })
    .composite([{ input: overlaySvg, top: 0, left: 0 }])
    .webp({ quality: 88 })
    .toBuffer();

  return injectWhatsAppExif(webpBuffer, packName, author);
}
