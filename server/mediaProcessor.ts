import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { getFfmpegBin } from './ffmpegBin.ts';

const execFileAsync = promisify(execFile);

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wabot-media-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export type ImageFilterMode =
  | 'hitamkan'
  | 'grayscale'
  | 'invert'
  | 'blur'
  | 'mirror'
  | 'flip'
  | 'sepia';

export type AudioEffectMode =
  | 'bass'
  | 'nightcore'
  | 'slow'
  | 'fast'
  | 'robot'
  | 'reverse';

export async function enhanceImageHd(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width || 600;
  const origH = meta.height || 600;
  const scaleFactor = Math.min(2, 2048 / Math.max(origW, origH, 1));
  const targetW = Math.max(origW, Math.round(origW * Math.max(1.25, scaleFactor)));
  const targetH = Math.max(origH, Math.round(origH * Math.max(1.25, scaleFactor)));

  const out = await sharp(imageBuffer)
    .rotate()
    .resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' })
    .modulate({ brightness: 1.02, saturation: 1.05 })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.4 })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  return { buffer: out, width: targetW, height: targetH };
}

export async function applyImageFilter(
  imageBuffer: Buffer,
  filter: ImageFilterMode
): Promise<Buffer> {
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

export async function convertVideoToPtv(videoBuffer: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, 'input.mp4');
    const outPath = path.join(dir, 'ptv.mp4');
    await fs.writeFile(inPath, videoBuffer);

    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        inPath,
        '-t',
        '20',
        '-vf',
        "crop='min(iw,ih):min(iw,ih)',scale=480:480",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '26',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        '+faststart',
        outPath,
      ],
      { timeout: 25000 }
    );

    return fs.readFile(outPath);
  });
}

export async function extractOrConvertAudio(
  inputBuffer: Buffer,
  target: 'mp3' | 'vn'
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, 'input.media');
    await fs.writeFile(inPath, inputBuffer);

    if (target === 'vn') {
      const outPath = path.join(dir, 'out.ogg');
      await execFileAsync(
        getFfmpegBin(),
        [
          '-y',
          '-i',
          inPath,
          '-vn',
          '-c:a',
          'libopus',
          '-b:a',
          '64k',
          '-vbr',
          'on',
          '-application',
          'voip',
          outPath,
        ],
        { timeout: 25000 }
      );
      return {
        buffer: await fs.readFile(outPath),
        mimeType: 'audio/ogg; codecs=opus',
        ext: 'ogg',
      };
    }

    const outPath = path.join(dir, 'out.mp3');
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        inPath,
        '-vn',
        '-ac',
        '2',
        '-ar',
        '44100',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        outPath,
      ],
      { timeout: 25000 }
    );
    return {
      buffer: await fs.readFile(outPath),
      mimeType: 'audio/mpeg',
      ext: 'mp3',
    };
  });
}

export async function applyAudioEffect(
  inputBuffer: Buffer,
  effect: AudioEffectMode
): Promise<{ buffer: Buffer; mimeType: string }> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, 'input.media');
    const outPath = path.join(dir, 'effect.mp3');
    await fs.writeFile(inPath, inputBuffer);

    let af = 'volume=1.0';
    switch (effect) {
      case 'bass':
        af = 'equalizer=f=75:width_type=o:width=2:g=14,volume=1.1';
        break;
      case 'nightcore':
        af = 'asetrate=44100*1.25,aresample=44100,atempo=1.05';
        break;
      case 'slow':
        af = 'asetrate=44100*0.84,aresample=44100,aecho=0.8:0.88:45:0.25';
        break;
      case 'fast':
        af = 'atempo=1.45';
        break;
      case 'robot':
        af =
          "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75";
        break;
      case 'reverse':
        af = 'areverse';
        break;
    }

    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-i',
        inPath,
        '-vn',
        '-af',
        af,
        '-ar',
        '44100',
        '-ac',
        '2',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        outPath,
      ],
      { timeout: 25000 }
    );

    return {
      buffer: await fs.readFile(outPath),
      mimeType: 'audio/mpeg',
    };
  });
}

export async function generateQrImage(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text.trim(), {
    width: 600,
    margin: 2,
    color: {
      dark: '#111114',
      light: '#FFFFFF',
    },
  });
}

export async function uploadBufferToPublicUrl(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  // 1. Try Catbox Litterbox (72h reliable public hosting)
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', '72h');
    form.append(
      'fileToUpload',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      fileName
    );
    const res = await fetch(
      'https://litterbox.catbox.moe/resources/internals/api.php',
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(12000),
      }
    );
    if (res.ok) {
      const txt = (await res.text()).trim();
      if (txt.startsWith('https://')) return txt;
    }
  } catch {
    // Fall through to secondary uploader
  }

  // 2. Try tmpfiles.org public API
  try {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      fileName
    );
    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: { url?: string } };
      if (json.data?.url) {
        return json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      }
    }
  } catch {
    // Fall back to local server endpoint
  }

  return null;
}

let cachedSampleVideo: Buffer | null = null;
let cachedSampleAudio: Buffer | null = null;

export async function getOrCreateSampleVideoBuffer(): Promise<Buffer> {
  if (cachedSampleVideo) return cachedSampleVideo;
  cachedSampleVideo = await withTempDir(async (dir) => {
    const out = path.join(dir, 'sample.mp4');
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=2.5:size=480x480:rate=15',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=523.25:duration=2.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        '+faststart',
        out,
      ],
      { timeout: 15000 }
    );
    return fs.readFile(out);
  });
  return cachedSampleVideo;
}

export async function getOrCreateSampleAudioBuffer(): Promise<Buffer> {
  if (cachedSampleAudio) return cachedSampleAudio;
  cachedSampleAudio = await withTempDir(async (dir) => {
    const out = path.join(dir, 'sample.mp3');
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:beep_factor=2:duration=3',
        '-af',
        'aecho=0.8:0.88:60:0.4',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        out,
      ],
      { timeout: 15000 }
    );
    return fs.readFile(out);
  });
  return cachedSampleAudio;
}
