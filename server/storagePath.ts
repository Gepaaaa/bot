import fs from 'node:fs';

export function resolveDataDir(): string {
  const explicit = (process.env.DATA_DIR || '').trim();
  if (explicit) {
    try {
      fs.mkdirSync(explicit, { recursive: true });
      return explicit;
    } catch {
      // Fall back if explicit path cannot be created
    }
  }

  // Auto-detect Fly.io / Docker persistent volume mounted at /data
  try {
    if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) {
      fs.accessSync('/data', fs.constants.W_OK);
      return '/data';
    }
  } catch {
    // /data not mounted or not writable; use working directory
  }

  return process.cwd();
}
