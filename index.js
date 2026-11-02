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
const majorNode = Number(process.versions.node.split('.')[0] || 0);

function isSourceNewerThanBundle(bundlePath) {
  try {
    const bundleMtime = fs.statSync(bundlePath).mtimeMs;
    const watchPaths = [
      path.join(rootDir, 'server.ts'),
      path.join(rootDir, 'server'),
      path.join(rootDir, 'src', 'shared'),
    ];
    for (const target of watchPaths) {
      if (!fs.existsSync(target)) continue;
      const stat = fs.statSync(target);
      if (stat.isFile() && stat.mtimeMs > bundleMtime + 1000) {
        return true;
      }
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(target)) {
          const child = path.join(target, entry);
          const childStat = fs.statSync(child);
          if (childStat.isFile() && childStat.mtimeMs > bundleMtime + 1000) {
            return true;
          }
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

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

// 2. Run in-process (zero duplicate child Node processes, low RAM footprint for 3GB phones).
//    If source .ts files were updated via `git pull` more recently than `server.bundle.mjs`,
//    rebuild `server.bundle.mjs` (on 64-bit) or run `server.ts` natively on Node 22+!
const bundleExists = fs.existsSync(prebuiltServerBundle);
const bundleFresh = bundleExists && !isSourceNewerThanBundle(prebuiltServerBundle);

if (bundleFresh) {
  console.log('[WABot Bootstrap] Menjalankan paket server siap pakai (server.bundle.mjs)...');
  await import(pathToFileURL(prebuiltServerBundle).href);
} else {
  let bundledReady = false;
  if (!isArm32) {
    try {
      const { build } = await import('esbuild');
      console.log('[WABot Bootstrap] Mengompilasi ulang mesin bot terbaru (server.bundle.mjs)...');
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
  } else if (majorNode >= 22 && fs.existsSync(path.join(rootDir, 'server.ts'))) {
    // Delete stale bundle if present so Node 22+ always executes the freshly updated .ts source
    if (bundleExists && !bundleFresh) {
      try {
        fs.unlinkSync(prebuiltServerBundle);
      } catch {
        // Ignore
      }
    }
    console.log(
      `[WABot Bootstrap] Menjalankan server.ts terbaru secara in-process (Node ${process.version}, arch=${process.arch})...`
    );
    await import(pathToFileURL(path.join(rootDir, 'server.ts')).href);
  } else if (bundleExists) {
    await import(pathToFileURL(prebuiltServerBundle).href);
  } else {
    throw new Error(
      `Node.js ${process.version} terdeteksi tanpa server.bundle.mjs. Jalankan 'pkg install nodejs-lts' (Node 22+) di Termux atau gunakan paket siap pakai (.tar.gz).`
    );
  }
}
