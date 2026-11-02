import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(rootDir);

// Single-process production entrypoint for Termux (Redmi 9C 32-bit ARMv7 & 64-bit) and Node hosts
process.env.NODE_ENV = 'production';

const prebuiltServerBundle = path.join(rootDir, 'server.bundle.mjs');
const distIndex = path.join(rootDir, 'dist', 'index.html');
const isArm32 = process.arch === 'arm';

// 1. Build frontend dist/ once only if missing AND vite is available on 64-bit hosts
if (!fs.existsSync(distIndex) && !isArm32) {
  const viteBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  );
  if (fs.existsSync(viteBin)) {
    console.log('[WABot Bootstrap] Menyiapkan aset Web Control Panel (sekali saja)...');
    const res = spawnSync(viteBin, ['build'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
    if (res.status !== 0) {
      console.warn(
        '[WABot Bootstrap] Build tampilan web dilewati, panel kontrol ringan tetap aktif di port 3000.'
      );
    }
  }
}

// 2. Run in-process (zero duplicate child Node processes, low RAM footprint for 3GB phones)
if (fs.existsSync(prebuiltServerBundle)) {
  console.log('[WABot Bootstrap] Menjalankan paket server siap pakai (server.bundle.mjs)...');
  await import(pathToFileURL(prebuiltServerBundle).href);
} else {
  let bundledReady = false;
  if (!isArm32) {
    try {
      const { build } = await import('esbuild');
      console.log('[WABot Bootstrap] Mengompilasi mesin bot ringan (server.bundle.mjs)...');
      await build({
        entryPoints: [path.join(rootDir, 'server.ts')],
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        outfile: prebuiltServerBundle,
        logLevel: 'warning',
      });
      bundledReady = fs.existsSync(prebuiltServerBundle);
    } catch {
      bundledReady = false;
    }
  }

  if (bundledReady) {
    await import(pathToFileURL(prebuiltServerBundle).href);
  } else {
    const majorNode = Number(process.versions.node.split('.')[0] || 0);
    if (majorNode >= 22) {
      console.log(
        `[WABot Bootstrap] Menjalankan server.ts langsung secara in-process (Node ${process.version}, arch=${process.arch})...`
      );
      await import(pathToFileURL(path.join(rootDir, 'server.ts')).href);
    } else {
      throw new Error(
        `Node.js ${process.version} terdeteksi tanpa server.bundle.mjs. Jalankan 'pkg install nodejs-lts' (Node 22+) di Termux atau gunakan paket siap pakai (.tar.gz).`
      );
    }
  }
}
