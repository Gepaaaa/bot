import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import WebP from 'node-webpmux';
import { getFfmpegBin } from './ffmpegBin.ts';
import {
  compositeMemeToWebp,
  ensureWhatsappImageBuffer,
  imageBufferToStickerWebp,
  measureSvgTextWidth,
  pngBufferToWebp,
  renderBratFramePngAdapter,
  renderSvgConsistentToWebp,
  renderSvgToPng,
  renderSvgToWebp,
  webpBufferToPng,
  webpStickerToMp4Buffer,
} from './imageAdapter.ts';

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
      'sticker-pack-name': packName ?? '',
      'sticker-pack-publisher': author ?? '',
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
  const rawWebp = await imageBufferToStickerWebp(imageBuffer);
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
      getFfmpegBin(),
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
  return webpBufferToPng(webpBuffer);
}

export async function animatedWebpToMp4(webpBuffer: Buffer): Promise<Buffer> {
  return webpStickerToMp4Buffer(webpBuffer);
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

  return renderBratFramePngAdapter(svg);
}

export async function createBratSticker(
  rawText: string,
  colorKey: string,
  packName: string,
  author: string
): Promise<Buffer> {
  const pngBuf = await renderBratFramePng(rawText, colorKey);
  const finalWebp = await pngBufferToWebp(pngBuf, 84);
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
      getFfmpegBin(),
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
  const webp = await renderSvgToWebp(svg, 90);
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
      const png = await renderSvgToPng(svg);
      await fs.writeFile(
        path.join(dir, `frame_${String(i).padStart(3, '0')}.png`),
        png
      );
    }

    const outPath = path.join(dir, 'attp.webp');
    await execFileAsync(
      getFfmpegBin(),
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
  avatarBuffer?: Buffer | null;
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

async function splitLongWordByPixelWidth(
  word: string,
  maxLinePx: number,
  fontSize: number,
  fontWeight: number | string
): Promise<string[]> {
  const chars = Array.from(word);
  const chunks: string[] = [];
  let current = '';

  for (const ch of chars) {
    const candidate = current + ch;
    const width = await measureSvgTextWidth(candidate, fontSize, fontWeight);
    if (width <= maxLinePx || current.length === 0) {
      current = candidate;
    } else {
      chunks.push(current);
      current = ch;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

async function wrapTextByPixelWidth(
  rawText: string,
  maxLinePx: number,
  fontSize: number,
  maxLines: number,
  fontWeight: number | string = 400
): Promise<string[]> {
  const paragraphs = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((p) => p.trim())
    .filter((p, idx, arr) => p.length > 0 || (arr.length === 1 && idx === 0));

  const lines: string[] = [];

  for (const para of paragraphs) {
    if (lines.length >= maxLines) break;
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let current = '';
    for (const rawWord of words) {
      if (lines.length >= maxLines) break;

      const wordWidth = await measureSvgTextWidth(
        rawWord,
        fontSize,
        fontWeight
      );
      const segments =
        wordWidth > maxLinePx
          ? await splitLongWordByPixelWidth(
              rawWord,
              maxLinePx,
              fontSize,
              fontWeight
            )
          : [rawWord];

      for (const seg of segments) {
        if (lines.length >= maxLines) break;
        if (!current) {
          current = seg;
        } else {
          const candidate = `${current} ${seg}`;
          const candidateWidth = await measureSvgTextWidth(
            candidate,
            fontSize,
            fontWeight
          );
          if (candidateWidth <= maxLinePx) {
            current = candidate;
          } else {
            lines.push(current);
            current = seg;
            if (lines.length >= maxLines) {
              current = '';
              break;
            }
          }
        }
      }
    }

    if (current && lines.length < maxLines) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : ['Halo!'];
}

async function buildAvatarSvgMarkup(
  avatarBuffer: Buffer | null | undefined,
  cx: number,
  cy: number,
  r: number,
  accentColor: string
): Promise<{ defs: string; body: string }> {
  const clipId = 'qcAvatarClip';
  const defs = `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}" /></clipPath>`;

  if (avatarBuffer && avatarBuffer.length > 0) {
    try {
      const normalized = await ensureWhatsappImageBuffer(avatarBuffer);
      const b64 = normalized.buffer.toString('base64');
      const dataUri = `data:${normalized.mimeType};base64,${b64}`;
      const size = r * 2;
      const body = [
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1F2C34" />`,
        `<image href="${dataUri}" x="${cx - r}" y="${cy - r}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="1.5" />`,
      ].join('\n');
      return { defs, body };
    } catch {
      // Fall back to default silhouette avatar below
    }
  }

  // Authentic WhatsApp-style default contact silhouette when user has no profile photo
  const headR = Math.round(r * 0.34);
  const headCy = Math.round(cy - r * 0.16);
  const bodyRx = Math.round(r * 0.64);
  const bodyRy = Math.round(r * 0.52);
  const bodyCy = Math.round(cy + r * 0.68);
  const body = [
    `<g clip-path="url(#${clipId})">`,
    `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#2A3942" />`,
    `  <circle cx="${cx}" cy="${headCy}" r="${headR}" fill="#CFD8DC" />`,
    `  <ellipse cx="${cx}" cy="${bodyCy}" rx="${bodyRx}" ry="${bodyRy}" fill="#CFD8DC" />`,
    `</g>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="1.5" />`,
  ].join('\n');

  return { defs, body };
}

export async function createQuoteChatSticker(
  opts: QuoteChatOptions
): Promise<Buffer> {
  const cleanName = (opts.senderName || 'Pengguna').trim().slice(0, 25) || 'Pengguna';
  const cleanText = (opts.text || 'Halo!').trim().slice(0, 260) || 'Halo!';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const accent = pickNameColor(cleanName);

  let svg: string;
  if (opts.style === 'ios') {
    const avatarR = 30;
    const avatarCx = 32;
    const bubbleX = 76;
    const padX = 18;
    const maxBubbleW = 404;
    const maxContentW = maxBubbleW - padX * 2;
    const textFontSize = 23;
    const lineH = 29;

    const wrapped = await wrapTextByPixelWidth(
      cleanText,
      maxContentW,
      textFontSize,
      8,
      400
    );
    const lineWidths = await Promise.all(
      wrapped.map((ln) => measureSvgTextWidth(ln, textFontSize, 400))
    );
    const maxLinePx = Math.max(...lineWidths, 18);
    const contentW = Math.min(maxContentW, Math.ceil(maxLinePx));
    const bubbleW = Math.max(58, contentW + padX * 2);
    const bubbleH = Math.max(50, 24 + wrapped.length * lineH);

    const headerLabel = `${cleanName} · ${timeStr}`;
    const headerPx = await measureSvgTextWidth(headerLabel, 14, 500);
    const bubbleTopY = 22;
    const avatarCy = bubbleTopY + bubbleH - avatarR;
    const avatarMarkup = await buildAvatarSvgMarkup(
      opts.avatarBuffer,
      avatarCx,
      avatarCy,
      avatarR,
      '#0A84FF'
    );

    const textSvg = wrapped
      .map(
        (ln, i) =>
          `<text x="${bubbleX + padX}" y="${
            bubbleTopY + 31 + i * lineH
          }" xml:space="preserve" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${textFontSize}" font-weight="400" fill="#FFFFFF">${escapeXml(
            ln
          )}</text>`
      )
      .join('\n');

    const naturalW = Math.max(bubbleX + bubbleW, bubbleX + 8 + Math.ceil(headerPx));
    const naturalH = bubbleTopY + bubbleH + 4;
    const scale = Math.min(1.42, 484 / Math.max(naturalW, 1), 480 / Math.max(naturalH, 1));
    const tx = 14;
    const ty = Math.max(12, Math.round((512 - naturalH * scale) / 2));

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>${avatarMarkup.defs}</defs>
      <g transform="translate(${tx}, ${ty}) scale(${scale.toFixed(4)})">
        <text x="${bubbleX + 10}" y="14" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="14" font-weight="500" fill="#8E8E93">${escapeXml(
          headerLabel
        )}</text>
        ${avatarMarkup.body}
        <rect x="${bubbleX}" y="${bubbleTopY}" width="${bubbleW}" height="${bubbleH}" rx="24" fill="#0A84FF" />
        ${textSvg}
      </g>
    </svg>`;
  } else {
    const avatarR = 32;
    const avatarCx = 34;
    const avatarCy = 34;
    const bubbleX = 80;
    const padX = 16;
    const maxBubbleW = 404;
    const maxContentW = maxBubbleW - padX * 2;

    const nameFontSize = 16;
    const textFontSize = 24;
    const timeFontSize = 13;
    const lineH = 30;

    const wrapped = await wrapTextByPixelWidth(
      cleanText,
      maxContentW,
      textFontSize,
      8,
      400
    );

    const [namePx, timePx, ...lineWidths] = await Promise.all([
      measureSvgTextWidth(cleanName, nameFontSize, 700),
      measureSvgTextWidth(timeStr, timeFontSize, 400),
      ...wrapped.map((ln) => measureSvgTextWidth(ln, textFontSize, 400)),
    ]);

    const maxLinePx = Math.max(...lineWidths, 16);
    // Bubble content width strictly fits max(name, text) without adding extra horizontal width for timestamp
    const contentW = Math.min(
      maxContentW,
      Math.ceil(Math.max(namePx, maxLinePx, timePx))
    );
    const bubbleW = Math.max(66, contentW + padX * 2);

    const lastLinePx = lineWidths[lineWidths.length - 1] || 0;
    const inlineTimeFits = contentW - lastLinePx >= timePx + 12;

    const firstTextY = 54;
    const lastTextY = firstTextY + (wrapped.length - 1) * lineH;
    const timeY = inlineTimeFits ? lastTextY + 4 : lastTextY + 19;
    const bubbleH = inlineTimeFits ? lastTextY + 17 : timeY + 11;

    const avatarMarkup = await buildAvatarSvgMarkup(
      opts.avatarBuffer,
      avatarCx,
      avatarCy,
      avatarR,
      accent
    );

    const textSvg = wrapped
      .map(
        (ln, i) =>
          `<text x="${bubbleX + padX}" y="${
            firstTextY + i * lineH
          }" xml:space="preserve" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${textFontSize}" font-weight="400" fill="#F4F4F5">${escapeXml(
            ln
          )}</text>`
      )
      .join('\n');

    const naturalW = bubbleX + bubbleW;
    const naturalH = Math.max(avatarCy + avatarR + 4, bubbleH);
    const scale = Math.min(
      1.42,
      484 / Math.max(naturalW, 1),
      480 / Math.max(naturalH, 1)
    );
    const tx = 14;
    const ty = Math.max(12, Math.round((512 - naturalH * scale) / 2));

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>${avatarMarkup.defs}</defs>
      <g transform="translate(${tx}, ${ty}) scale(${scale.toFixed(4)})">
        ${avatarMarkup.body}
        <path d="M ${bubbleX - 10} 0 L ${bubbleX + 12} 0 L ${bubbleX + 4} 18 Z" fill="#1F2C34" />
        <rect x="${bubbleX}" y="0" width="${bubbleW}" height="${bubbleH}" rx="18" fill="#1F2C34" />
        <rect x="${bubbleX}" y="0" width="18" height="18" fill="#1F2C34" />
        <text x="${bubbleX + padX}" y="24" xml:space="preserve" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${nameFontSize}" font-weight="700" fill="${accent}">${escapeXml(
          cleanName
        )}</text>
        ${textSvg}
        <text x="${
          bubbleX + bubbleW - 13
        }" y="${timeY}" text-anchor="end" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${timeFontSize}" fill="#8696A0">${escapeXml(
          timeStr
        )}</text>
      </g>
    </svg>`;
  }

  const webp = await renderSvgConsistentToWebp(svg, 92);
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
  const webp = await renderSvgToWebp(fallbackSvg, 90);
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
    return renderSvgToPng(fallbackSvg);
  }
}

export async function createMemeSticker(
  topText: string,
  bottomText: string,
  baseImageBuffer: Buffer | null,
  packName: string,
  author: string
): Promise<Buffer> {
  let sourceBuffer = baseImageBuffer ?? (await getFallbackMemeBackground());

  // Dukung stiker WebP secara langsung sebagai bahan dasar meme
  if (
    sourceBuffer &&
    sourceBuffer.length >= 12 &&
    sourceBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    sourceBuffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    try {
      sourceBuffer = await stickerWebpToPng(sourceBuffer);
    } catch {
      // Fallback tetap gunakan sourceBuffer
    }
  }

  const cleanTop = topText.trim().toUpperCase();
  const cleanBottom = bottomText.trim().toUpperCase();

  // Bungkus teks ke maksimal 2 baris atas & 2 baris bawah
  const topLines = cleanTop ? wrapTextLines(cleanTop, 15, 2) : [];
  const bottomLines = cleanBottom ? wrapTextLines(cleanBottom, 15, 2) : [];

  const maxLen = Math.max(
    ...topLines.map((l) => l.length),
    ...bottomLines.map((l) => l.length),
    1
  );

  // Ukuran font dibuat dinamis jauh lebih besar & jelas di layar HP
  let fontSize = 58;
  let lineHeight = 64;
  let strokeWidth = 11;

  if (maxLen <= 8) {
    fontSize = 70;
    lineHeight = 76;
    strokeWidth = 12;
  } else if (maxLen <= 12) {
    fontSize = 62;
    lineHeight = 68;
    strokeWidth = 11;
  } else if (maxLen <= 16) {
    fontSize = 54;
    lineHeight = 60;
    strokeWidth = 10;
  } else {
    fontSize = 46;
    lineHeight = 52;
    strokeWidth = 9;
  }

  const topSvg = topLines
    .map((line, idx) => {
      const y = 32 + fontSize + idx * lineHeight;
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, Montserrat, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="1px" fill="#FFFFFF" stroke="#000000" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
        line
      )}</text>`;
    })
    .join('\n');

  const totalBottomHeight = (bottomLines.length - 1) * lineHeight;
  const bottomStartY = 512 - 24 - totalBottomHeight;
  const bottomSvg = bottomLines
    .map((line, idx) => {
      const y = bottomStartY + idx * lineHeight;
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, Montserrat, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="1px" fill="#FFFFFF" stroke="#000000" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(
        line
      )}</text>`;
    })
    .join('\n');

  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${topSvg}
      ${bottomSvg}
    </svg>`;

  const webpBuffer = await compositeMemeToWebp(sourceBuffer, overlaySvg);
  return injectWhatsAppExif(webpBuffer, packName, author);
}

