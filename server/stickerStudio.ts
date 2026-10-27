import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import WebP from 'node-webpmux';

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
      'sticker-pack-id': 'id.my.gepacorner.gepabot',
      'sticker-pack-name': packName || 'Gepa Corner',
      'sticker-pack-publisher': author || 'gepacorner.my.id',
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

export async function imageToStickerWebp(
  imageBuffer: Buffer,
  packName: string,
  author: string
): Promise<Buffer> {
  const rawWebp = await sharp(imageBuffer)
    .rotate()
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 86 })
    .toBuffer();

  return injectWhatsAppExif(rawWebp, packName, author);
}

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['brat'];

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

export async function createBratSticker(
  rawText: string,
  variant: 'lime' | 'white',
  packName: string,
  author: string
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
  const bgColor = variant === 'lime' ? '#8ACE00' : '#FFFFFF';
  const lineHeight = Math.round(fontSize * 1.14);
  const totalBlockHeight = lines.length * lineHeight;
  const startY = Math.max(
    fontSize + 28,
    Math.round((512 - totalBlockHeight) / 2) + Math.round(fontSize * 0.8)
  );

  const svgTextElements = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<text x="44" y="${y}" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="500" fill="#0A0A0A" letter-spacing="-1.5" transform="scale(0.92, 1.05)">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="20" fill="${bgColor}" />
    ${svgTextElements}
  </svg>`;

  const lowFiPng = await sharp(Buffer.from(svg))
    .resize(330, 330)
    .blur(1.15)
    .png()
    .toBuffer();

  const finalWebp = await sharp(lowFiPng)
    .resize(512, 512, { kernel: 'linear' })
    .webp({ quality: 84 })
    .toBuffer();

  return injectWhatsAppExif(finalWebp, packName, author);
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
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const bottomStartY = 512 - 24 - (bottomLines.length - 1) * lineHeight;
  const bottomSvg = bottomLines
    .map((line, idx) => {
      const y = bottomStartY + idx * lineHeight;
      return `<text x="256" y="${y}" text-anchor="middle" font-family="Impact, Arial Black, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(line)}</text>`;
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
