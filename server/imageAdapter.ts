import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import WebP from 'node-webpmux';
import { getFfmpegBin } from './ffmpegBin.ts';

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(import.meta.url);

export type ImageFilterKind =
  | 'hitamkan'
  | 'grayscale'
  | 'invert'
  | 'blur'
  | 'mirror'
  | 'flip'
  | 'sepia';

type SharpFn = (
  input?: Buffer | Uint8Array | string,
  options?: Record<string, unknown>
) => any;

let cachedSharp: SharpFn | null | undefined;

function getOptionalSharp(): SharpFn | null {
  if (cachedSharp !== undefined) return cachedSharp;
  try {
    const mod = nodeRequire('sharp');
    const fn = (mod?.default || mod) as SharpFn;
    if (typeof fn === 'function') {
      cachedSharp = fn;
      return cachedSharp;
    }
  } catch {
    // 32-bit Android ARMv7 (e.g., Redmi 9C MIUI) or --no-optional install: fall back to WASM + FFmpeg
  }
  cachedSharp = null;
  return null;
}

export function getActiveImageBackend(): 'sharp-native' | 'resvg-wasm+ffmpeg' {
  return getOptionalSharp() ? 'sharp-native' : 'resvg-wasm+ffmpeg';
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wabot-img-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

let wasmInitPromise: Promise<void> | null = null;
let cachedFontsPromise: Promise<{
  buffers: Uint8Array[];
  family: string;
}> | null = null;

async function ensureResvgInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      let wasmPath = path.join(
        process.cwd(),
        'node_modules',
        '@resvg',
        'resvg-wasm',
        'index_bg.wasm'
      );
      try {
        const entryPath = nodeRequire.resolve('@resvg/resvg-wasm');
        wasmPath = path.join(path.dirname(entryPath), 'index_bg.wasm');
      } catch {
        // Use cwd node_modules fallback
      }
      const wasmBytes = await fs.readFile(wasmPath);
      await initWasm(wasmBytes);
    })().catch((err) => {
      wasmInitPromise = null;
      throw err;
    });
  }
  return wasmInitPromise;
}

async function loadFontBuffersOnce(): Promise<{
  buffers: Uint8Array[];
  family: string;
}> {
  if (!cachedFontsPromise) {
    cachedFontsPromise = (async () => {
      const fontGroups: Array<{ family: string; files: string[] }> = [
        {
          family: 'Roboto',
          files: [
            '/system/fonts/Roboto-Regular.ttf',
            '/system/fonts/Roboto-Bold.ttf',
            '/system/fonts/DroidSans.ttf',
          ],
        },
        {
          family: 'DejaVu Sans',
          files: [
            '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans.ttf',
            '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
          ],
        },
        {
          family: 'Liberation Sans',
          files: [
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
          ],
        },
      ];

      for (const group of fontGroups) {
        const loaded: Uint8Array[] = [];
        for (const fpath of group.files) {
          try {
            const buf = await fs.readFile(fpath);
            loaded.push(new Uint8Array(buf));
            if (loaded.length >= 2) break;
          } catch {
            // Try next candidate path
          }
        }
        if (loaded.length > 0) {
          return { buffers: loaded, family: group.family };
        }
      }

      return { buffers: [], family: 'sans-serif' };
    })();
  }
  return cachedFontsPromise;
}

async function renderSvgViaResvgWasm(svg: string): Promise<Buffer> {
  await ensureResvgInitialized();
  const fonts = await loadFontBuffersOnce();

  // Normalize SVG font-family attributes to include the loaded Android/Linux font family so bold & regular weights match cleanly
  const normalizedSvg =
    fonts.buffers.length > 0
      ? svg.replace(
          /font-family="([^"]*)"/g,
          (_m, existing) => `font-family="${fonts.family}, ${existing}"`
        )
      : svg;

  const resvg = new Resvg(normalizedSvg, {
    font:
      fonts.buffers.length > 0
        ? {
            fontBuffers: fonts.buffers,
            defaultFontFamily: fonts.family,
            sansSerifFamily: fonts.family,
          }
        : {
            loadSystemFonts: true,
          },
  });

  try {
    const rendered = resvg.render();
    try {
      return Buffer.from(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}

export function sniffImageMetadata(buf: Buffer): {
  format: 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';
  width?: number;
  height?: number;
} {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      format: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return {
      format: 'gif',
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }

  if (
    buf.length >= 30 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buf.length >= 30) {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { format: 'webp', width: w, height: h };
    }
    if (chunk === 'VP8 ' && buf.length >= 30) {
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      return { format: 'webp', width: w, height: h };
    }
    if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { format: 'webp', width: w, height: h };
    }
    return { format: 'webp' };
  }

  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segLen = buf.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const h = buf.readUInt16BE(offset + 5);
        const w = buf.readUInt16BE(offset + 7);
        return { format: 'jpeg', width: w, height: h };
      }
      offset += 2 + segLen;
    }
    return { format: 'jpeg' };
  }

  return { format: 'unknown' };
}

export async function renderSvgToPng(svg: string): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  return renderSvgViaResvgWasm(svg);
}

export async function pngBufferToWebp(
  pngBuffer: Buffer,
  quality = 88
): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(pngBuffer).webp({ quality }).toBuffer();
  }
  return withTempDir(async (dir) => {
    const inPng = path.join(dir, 'in.png');
    const outWebp = path.join(dir, 'out.webp');
    await fs.writeFile(inPng, pngBuffer);
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        inPng,
        '-vcodec',
        'libwebp',
        '-lossless',
        '0',
        '-compression_level',
        '4',
        '-q:v',
        String(quality),
        '-an',
        outWebp,
      ],
      { timeout: 20000 }
    );
    return fs.readFile(outWebp);
  });
}

export async function renderSvgToWebp(
  svg: string,
  quality = 90
): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(Buffer.from(svg)).webp({ quality }).toBuffer();
  }
  const pngBuf = await renderSvgViaResvgWasm(svg);
  return pngBufferToWebp(pngBuf, quality);
}

export async function renderBratFramePngAdapter(svg: string): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    const lowFiPng = await sharp(Buffer.from(svg))
      .resize(330, 330)
      .blur(1.15)
      .png()
      .toBuffer();
    return sharp(lowFiPng).resize(512, 512, { kernel: 'linear' }).png().toBuffer();
  }

  const basePng = await renderSvgViaResvgWasm(svg);
  return withTempDir(async (dir) => {
    const inPng = path.join(dir, 'brat_in.png');
    const outPng = path.join(dir, 'brat_out.png');
    await fs.writeFile(inPng, basePng);
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        inPng,
        '-vf',
        'scale=330:330:flags=bilinear,gblur=sigma=1.15,scale=512:512:flags=bilinear',
        '-frames:v',
        '1',
        outPng,
      ],
      { timeout: 20000 }
    );
    return fs.readFile(outPng);
  });
}

export async function imageBufferToStickerWebp(
  imageBuffer: Buffer
): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(imageBuffer, { animated: true })
      .rotate()
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 84 })
      .toBuffer();
  }

  const meta = sniffImageMetadata(imageBuffer);

  // If already an animated WebP, preserve animation directly
  if (meta.format === 'webp') {
    try {
      const wimg = new WebP.Image();
      await wimg.load(imageBuffer);
      if (wimg.hasAnim) {
        return imageBuffer;
      }
    } catch {
      // Fall through to FFmpeg conversion
    }
  }

  return withTempDir(async (dir) => {
    const ext =
      meta.format === 'png'
        ? 'png'
        : meta.format === 'gif'
        ? 'gif'
        : meta.format === 'webp'
        ? 'webp'
        : 'jpg';
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, 'out.webp');
    await fs.writeFile(inPath, imageBuffer);

    if (meta.format === 'gif') {
      await execFileAsync(
        getFfmpegBin(),
        [
          '-y',
          '-i',
          inPath,
          '-t',
          '7',
          '-vf',
          'fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
          '-vcodec',
          'libwebp',
          '-lossless',
          '0',
          '-compression_level',
          '4',
          '-q:v',
          '75',
          '-loop',
          '0',
          '-an',
          '-vsync',
          '0',
          outPath,
        ],
        { timeout: 25000 }
      );
    } else {
      await execFileAsync(
        getFfmpegBin(),
        [
          '-y',
          '-i',
          inPath,
          '-vf',
          'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
          '-vcodec',
          'libwebp',
          '-lossless',
          '0',
          '-compression_level',
          '4',
          '-q:v',
          '84',
          '-an',
          outPath,
        ],
        { timeout: 20000 }
      );
    }

    return fs.readFile(outPath);
  });
}

export async function webpBufferToPng(webpBuffer: Buffer): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(webpBuffer, { animated: false }).png().toBuffer();
  }

  return withTempDir(async (dir) => {
    let staticFrameBuf = webpBuffer;
    try {
      const wimg = new WebP.Image();
      await wimg.load(webpBuffer);
      if (wimg.hasAnim) {
        const demuxed = await wimg.demux({ buffers: true, frame: 0 });
        if (demuxed && demuxed[0]) {
          staticFrameBuf = Buffer.from(demuxed[0]);
        }
      }
    } catch {
      // Proceed with original buffer
    }

    const inPath = path.join(dir, 'in.webp');
    const outPath = path.join(dir, 'out.png');
    await fs.writeFile(inPath, staticFrameBuf);
    await execFileAsync(
      getFfmpegBin(),
      ['-y', '-i', inPath, '-frames:v', '1', outPath],
      { timeout: 20000 }
    );
    return fs.readFile(outPath);
  });
}

export async function webpStickerToMp4Buffer(
  webpBuffer: Buffer
): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return withTempDir(async (dir) => {
      const meta = await sharp(webpBuffer, { animated: true }).metadata();
      const pages = Math.min(meta.pages || 1, 90);
      const pageHeight =
        meta.pageHeight ||
        (meta.height && meta.pages
          ? Math.floor(meta.height / meta.pages)
          : meta.height || 512);
      const width = meta.width || 512;

      if (pages <= 1) {
        const singlePng = path.join(dir, 'frame.png');
        const outMp4 = path.join(dir, 'out.mp4');
        await sharp(webpBuffer)
          .flatten({ background: '#111114' })
          .resize(512, 512, { fit: 'contain', background: '#111114' })
          .png()
          .toFile(singlePng);

        await execFileAsync(
          getFfmpegBin(),
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

      const delays: number[] = meta.delay || [];
      const avgDelayMs =
        delays.length > 0
          ? Math.max(
              40,
              Math.round(
                delays.reduce((a: number, b: number) => a + b, 0) /
                  delays.length
              )
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
        getFfmpegBin(),
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

  // Pure JS WebP demux (node-webpmux) + FFmpeg fallback for 32-bit ARMv7 Android
  return withTempDir(async (dir) => {
    const wimg = new WebP.Image();
    await wimg.load(webpBuffer);

    if (!wimg.hasAnim || !wimg.frames || wimg.frames.length <= 1) {
      const inPath = path.join(dir, 'single.webp');
      const outMp4 = path.join(dir, 'out.mp4');
      await fs.writeFile(inPath, webpBuffer);
      await execFileAsync(
        getFfmpegBin(),
        [
          '-y',
          '-loop',
          '1',
          '-i',
          inPath,
          '-t',
          '3',
          '-vf',
          'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#111114,format=yuv420p',
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
    }

    const totalFrames = Math.min(wimg.frames.length, 90);
    const demuxed =
      (await wimg.demux({ buffers: true, start: 0, end: totalFrames - 1 })) ||
      [];
    const delays = wimg.frames
      .slice(0, totalFrames)
      .map((f) => f.delay || 90);
    const avgDelayMs =
      delays.length > 0
        ? Math.max(
            40,
            Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
          )
        : 90;
    const fps = Math.max(4, Math.min(25, Math.round(1000 / avgDelayMs)));

    for (let i = 0; i < demuxed.length; i += 1) {
      await fs.writeFile(
        path.join(dir, `frame_${String(i).padStart(3, '0')}.webp`),
        Buffer.from(demuxed[i])
      );
    }

    const outMp4 = path.join(dir, 'out.mp4');
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        path.join(dir, 'frame_%03d.webp'),
        '-vf',
        'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#111114,format=yuv420p',
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

export async function compositeMemeToWebp(
  sourceBuffer: Buffer,
  overlaySvg: string
): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    return sharp(sourceBuffer)
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .webp({ quality: 88 })
      .toBuffer();
  }

  const overlayPng = await renderSvgViaResvgWasm(overlaySvg);
  return withTempDir(async (dir) => {
    const meta = sniffImageMetadata(sourceBuffer);
    const ext =
      meta.format === 'png' ? 'png' : meta.format === 'webp' ? 'webp' : 'jpg';
    const baseIn = path.join(dir, `base.${ext}`);
    const overIn = path.join(dir, 'overlay.png');
    const outWebp = path.join(dir, 'meme.webp');

    await fs.writeFile(baseIn, sourceBuffer);
    await fs.writeFile(overIn, overlayPng);

    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        baseIn,
        '-i',
        overIn,
        '-filter_complex',
        '[0:v]scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba[bg];[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto',
        '-vcodec',
        'libwebp',
        '-lossless',
        '0',
        '-compression_level',
        '4',
        '-q:v',
        '88',
        '-an',
        outWebp,
      ],
      { timeout: 25000 }
    );

    return fs.readFile(outWebp);
  });
}

export async function enhanceImageHdAdapter(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const sharp = getOptionalSharp();
  if (sharp) {
    const meta = await sharp(imageBuffer).metadata();
    const origW = meta.width || 600;
    const origH = meta.height || 600;
    const scaleFactor = Math.min(2, 2048 / Math.max(origW, origH, 1));
    const targetW = Math.max(
      origW,
      Math.round(origW * Math.max(1.25, scaleFactor))
    );
    const targetH = Math.max(
      origH,
      Math.round(origH * Math.max(1.25, scaleFactor))
    );

    const out = await sharp(imageBuffer)
      .rotate()
      .resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' })
      .modulate({ brightness: 1.02, saturation: 1.05 })
      .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.4 })
      .jpeg({ quality: 94, mozjpeg: true })
      .toBuffer();

    return { buffer: out, width: targetW, height: targetH };
  }

  const sniffed = sniffImageMetadata(imageBuffer);
  const origW = sniffed.width || 640;
  const origH = sniffed.height || 640;
  const scaleFactor = Math.min(2, 2048 / Math.max(origW, origH, 1));
  const targetW =
    Math.max(
      2,
      Math.round((origW * Math.max(1.25, scaleFactor)) / 2) * 2
    );
  const targetH =
    Math.max(
      2,
      Math.round((origH * Math.max(1.25, scaleFactor)) / 2) * 2
    );

  const outBuf = await withTempDir(async (dir) => {
    const ext =
      sniffed.format === 'png'
        ? 'png'
        : sniffed.format === 'webp'
        ? 'webp'
        : 'jpg';
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, 'hd.jpg');
    await fs.writeFile(inPath, imageBuffer);

    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        inPath,
        '-vf',
        `scale=${targetW}:${targetH}:flags=lanczos,eq=brightness=0.02:saturation=1.05,unsharp=5:5:0.9:5:5:0.0`,
        '-q:v',
        '2',
        '-frames:v',
        '1',
        outPath,
      ],
      { timeout: 25000 }
    );
    return fs.readFile(outPath);
  });

  const outMeta = sniffImageMetadata(outBuf);
  return {
    buffer: outBuf,
    width: outMeta.width || targetW,
    height: outMeta.height || targetH,
  };
}

export async function applyImageFilterAdapter(
  imageBuffer: Buffer,
  filter: ImageFilterKind
): Promise<Buffer> {
  const sharp = getOptionalSharp();
  if (sharp) {
    let pipeline = sharp(imageBuffer).rotate();
    switch (filter) {
      case 'hitamkan':
      case 'grayscale':
        pipeline = pipeline.grayscale().linear(1.12, -8);
        break;
      case 'invert':
        pipeline = pipeline.negate({ alpha: false });
        break;
      case 'blur':
        pipeline = pipeline.blur(8);
        break;
      case 'mirror':
        pipeline = pipeline.flop();
        break;
      case 'flip':
        pipeline = pipeline.flip();
        break;
      case 'sepia':
        pipeline = pipeline.recomb([
          [0.393, 0.769, 0.189],
          [0.349, 0.686, 0.168],
          [0.272, 0.534, 0.131],
        ]);
        break;
    }
    return pipeline.jpeg({ quality: 91 }).toBuffer();
  }

  let vf = 'hue=s=0,eq=contrast=1.12:brightness=-0.03';
  switch (filter) {
    case 'hitamkan':
    case 'grayscale':
      vf = 'hue=s=0,eq=contrast=1.12:brightness=-0.03';
      break;
    case 'invert':
      vf = 'negate';
      break;
    case 'blur':
      vf = 'gblur=sigma=8';
      break;
    case 'mirror':
      vf = 'hflip';
      break;
    case 'flip':
      vf = 'vflip';
      break;
    case 'sepia':
      vf =
        'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
      break;
  }

  return withTempDir(async (dir) => {
    const sniffed = sniffImageMetadata(imageBuffer);
    const ext =
      sniffed.format === 'png'
        ? 'png'
        : sniffed.format === 'webp'
        ? 'webp'
        : 'jpg';
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, 'filtered.jpg');
    await fs.writeFile(inPath, imageBuffer);

    await execFileAsync(
      getFfmpegBin(),
      ['-y', '-i', inPath, '-vf', vf, '-q:v', '3', '-frames:v', '1', outPath],
      { timeout: 25000 }
    );
    return fs.readFile(outPath);
  });
}

export async function prepareHdStatusImage(
  buffer: Buffer,
  mimeType: string,
  fallbackThumbBase64?: string
): Promise<{
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  jpegThumbnail?: string;
}> {
  const sharp = getOptionalSharp();
  if (sharp) {
    try {
      let finalBuffer = buffer;
      let finalMime = mimeType;
      const meta = await sharp(finalBuffer).metadata();
      const width = meta.width;
      const height = meta.height;

      if (
        meta.format === 'webp' ||
        finalMime.toLowerCase().includes('webp')
      ) {
        finalBuffer = await sharp(finalBuffer)
          .png({ compressionLevel: 0 })
          .toBuffer();
        finalMime = 'image/png';
      } else if (meta.format === 'png') {
        finalMime = 'image/png';
      } else {
        finalMime = 'image/jpeg';
      }

      const thumbBuf = await sharp(finalBuffer)
        .resize(72, 72, { fit: 'inside' })
        .jpeg({ quality: 65 })
        .toBuffer();

      return {
        buffer: finalBuffer,
        mimeType: finalMime,
        width,
        height,
        jpegThumbnail: thumbBuf.toString('base64'),
      };
    } catch {
      return {
        buffer,
        mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
        jpegThumbnail: fallbackThumbBase64,
      };
    }
  }

  try {
    let finalBuffer = buffer;
    let sniffed = sniffImageMetadata(finalBuffer);
    let finalMime = mimeType;

    if (
      sniffed.format === 'webp' ||
      finalMime.toLowerCase().includes('webp')
    ) {
      finalBuffer = await webpBufferToPng(finalBuffer);
      sniffed = sniffImageMetadata(finalBuffer);
      finalMime = 'image/png';
    } else if (sniffed.format === 'png') {
      finalMime = 'image/png';
    } else {
      finalMime = 'image/jpeg';
    }

    const thumbBase64 = await withTempDir(async (dir) => {
      const ext = finalMime === 'image/png' ? 'png' : 'jpg';
      const inPath = path.join(dir, `in.${ext}`);
      const thumbPath = path.join(dir, 'thumb.jpg');
      await fs.writeFile(inPath, finalBuffer);
      await execFileAsync(
        getFfmpegBin(),
        [
          '-y',
          '-i',
          inPath,
          '-vf',
          'scale=72:72:force_original_aspect_ratio=decrease',
          '-q:v',
          '6',
          '-frames:v',
          '1',
          thumbPath,
        ],
        { timeout: 15000 }
      );
      const tbuf = await fs.readFile(thumbPath);
      return tbuf.toString('base64');
    }).catch(() => fallbackThumbBase64);

    return {
      buffer: finalBuffer,
      mimeType: finalMime,
      width: sniffed.width,
      height: sniffed.height,
      jpegThumbnail: thumbBase64,
    };
  } catch {
    return {
      buffer,
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
      jpegThumbnail: fallbackThumbBase64,
    };
  }
}

export async function ensureWhatsappImageBuffer(
  buffer: Buffer,
  mimeType = 'image/jpeg'
): Promise<{ buffer: Buffer; mimeType: string }> {
  const sniffed = sniffImageMetadata(buffer);
  if (sniffed.format === 'jpeg') {
    return { buffer, mimeType: 'image/jpeg' };
  }
  if (sniffed.format === 'png') {
    return { buffer, mimeType: 'image/png' };
  }

  const sharp = getOptionalSharp();
  if (sharp) {
    try {
      const jpg = await sharp(buffer, { animated: false })
        .flatten({ background: '#000000' })
        .jpeg({ quality: 92 })
        .toBuffer();
      return { buffer: jpg, mimeType: 'image/jpeg' };
    } catch {
      // Fall back to FFmpeg conversion below
    }
  }

  try {
    const jpgBuf = await withTempDir(async (dir) => {
      const inPath = path.join(dir, 'slide.img');
      const outPath = path.join(dir, 'slide.jpg');
      await fs.writeFile(inPath, buffer);
      await execFileAsync(
        getFfmpegBin(),
        ['-y', '-i', inPath, '-frames:v', '1', '-q:v', '2', outPath],
        { timeout: 18000 }
      );
      return fs.readFile(outPath);
    });
    return { buffer: jpgBuf, mimeType: 'image/jpeg' };
  } catch {
    return {
      buffer,
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
    };
  }
}

