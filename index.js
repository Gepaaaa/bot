import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(rootDir);

// Always run in lightweight production mode when launched via index.js (e.g. Wispbyte / Pterodactyl)
process.env.NODE_ENV = 'production';

// 1. Build frontend dist/ once if missing so Web Control Panel also works over HTTP
const distIndex = path.join(rootDir, 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
  console.log('[WABot Bootstrap] Menyiapkan aset Web Control Panel (sekali saja)...');
  const viteBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  );
  if (fs.existsSync(viteBin)) {
    const res = spawnSync(viteBin, ['build'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
    if (res.status !== 0) {
      console.warn(
        '[WABot Bootstrap] Build tampilan web dilewati, mesin WhatsApp Bot tetap dijalankan penuh.'
      );
    }
  }
}

// 2. Bundle server.ts -> server.mjs via esbuild so Node 20/22 runs with minimal RAM (<110MB on 512MB free hosts)
const outServerMjs = path.join(rootDir, 'server.mjs');
console.log('[WABot Bootstrap] Mengompilasi mesin bot ringan (hemat RAM)...');

const { build } = await import('esbuild');
await build({
  entryPoints: [path.join(rootDir, 'server.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: outServerMjs,
  logLevel: 'warning',
});

// 3. Launch server.mjs with capped V8 heap (safe for 512 MB RAM containers like Wispbyte)
const child = spawn(
  process.execPath,
  ['--max-old-space-size=384', outServerMjs, ...process.argv.slice(2)],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  }
);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!child.killed) {
      child.kill(sig);
    }
  });
}

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
