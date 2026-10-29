import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cachedBin: string | null = null;

export function getFfmpegBin(): string {
  if (cachedBin) return cachedBin;

  // 1. Prefer system ffmpeg if installed (Docker, Ubuntu, Termux pkg install ffmpeg)
  try {
    const check = spawnSync('ffmpeg', ['-version'], {
      stdio: 'ignore',
      timeout: 3000,
    });
    if (check.status === 0) {
      cachedBin = 'ffmpeg';
      return cachedBin;
    }
  } catch {
    // System ffmpeg not available; fall back to bundled static binary
  }

  // 2. Safely resolve optional ffmpeg-static binary (for non-root cloud panels like Wispbyte)
  try {
    const ffmpegStatic = require('ffmpeg-static') as string | null;
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      try {
        fs.chmodSync(ffmpegStatic, 0o755);
      } catch {
        // Ignore chmod error on read-only mounts
      }
      cachedBin = ffmpegStatic;
      return cachedBin;
    }
  } catch {
    // Optional dependency not installed on this platform (e.g. Android Termux)
  }

  cachedBin = 'ffmpeg';
  return cachedBin;
}
