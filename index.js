import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(rootDir);

// Always run in lightweight production mode when launched via index.js (Wispbyte / Termux)
process.env.NODE_ENV = 'production';

// 1. Build frontend dist/ once if missing so Web Control Panel also works over local WiFi / HTTP
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

// 2. Bundle server.ts -> server.mjs via esbuild if available; otherwise fall back to native Node 22+ TypeScript or tsx
const outServerMjs = path.join(rootDir, 'server.mjs');
let launchArgs = ['--max-old-space-size=384', outServerMjs, ...process.argv.slice(2)];
let launchCmd = process.execPath;

try {
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
} catch {
  const tsxBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const majorNode = Number(process.versions.node.split('.')[0] || 0);
  if (majorNode >= 22) {
    console.log('[WABot Bootstrap] Menjalankan server.ts langsung dengan Node.js native...');
    launchArgs = ['--max-old-space-size=384', path.join(rootDir, 'server.ts'), ...process.argv.slice(2)];
  } else if (fs.existsSync(tsxBin)) {
    launchCmd = tsxBin;
    launchArgs = [path.join(rootDir, 'server.ts'), ...process.argv.slice(2)];
  } else {
    throw new Error('Membutuhkan Node.js v22+ atau paket esbuild terinstal.');
  }
}

const child = spawn(launchCmd, launchArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

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
