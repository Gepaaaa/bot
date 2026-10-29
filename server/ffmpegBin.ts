import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';

let cachedBin: string | null = null;

export function getFfmpegBin(): string {
  if (cachedBin) return cachedBin;

  // 1. Prefer system ffmpeg if installed (e.g. Docker / Debian / Ubuntu)
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

  // 2. Fall back to ffmpeg-static npm binary (works on non-root Node.js panels like Wispbyte)
  if (ffmpegStatic) {
    try {
      fs.chmodSync(ffmpegStatic, 0o755);
    } catch {
      // Ignore chmod error on read-only mounts
    }
    cachedBin = ffmpegStatic;
    return cachedBin;
  }

  cachedBin = 'ffmpeg';
  return cachedBin;
}
