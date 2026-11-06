/**
 * Device Profile & Capabilities Detector
 *
 * Mendeteksi profil perangkat yang menjalankan bot:
 * - 'redmi9c': Xiaomi Redmi 9C (32-bit ARMv7l, Helio G35, RAM 3GB)
 *   -> Fitur AI HD image (.hd, .remini, .upscale, .hd2, .hd4) DIHAPUS / DINONAKTIFKAN
 *      sepenuhnya agar bot berjalan 100% mulus, hemat RAM, dan anti force-close di Termux.
 *      Fitur media lainnya seperti Stiker WASM (.s, .qc, .brat), Downloader (.tt, .mp3),
 *      Status HD (.hdsw), dan filter gambar (.hitamkan) tetap aktif penuh.
 * - 'reno5': Oppo Reno 5 (64-bit aarch64, Snapdragon 720G, RAM 8GB)
 *   -> Fitur AI HD image AKTIF PENUH melalui node AI microservice bawaan (Real-ESRGAN & 4x-UltraSharp).
 * - 'generic': Server / Simulator / PC.
 */

export type DeviceProfileType = 'redmi9c' | 'reno5' | 'generic';

export const AI_HD_IMAGE_COMMANDS = ['hd', 'remini', 'upscale', 'hd2', 'hd4'] as const;

export function getDeviceProfile(): DeviceProfileType {
  const envProfile = (process.env.DEVICE_PROFILE || '').trim().toLowerCase();
  if (envProfile === 'redmi9c' || envProfile === 'redmi' || envProfile === 'redmi_9c') {
    return 'redmi9c';
  }
  if (envProfile === 'reno5' || envProfile === 'reno_5' || envProfile === 'oppo') {
    return 'reno5';
  }

  // Deteksi otomatis arsitektur 32-bit ARM (ciri khas Redmi 9C di Termux)
  if (process.arch === 'arm') {
    return 'redmi9c';
  }

  return 'generic';
}

export function isRedmi9cProfile(): boolean {
  return getDeviceProfile() === 'redmi9c';
}

export function isAiHdSupportedOnDevice(): boolean {
  // Jalur Redmi 9C menghapus fitur AI HD image
  if (isRedmi9cProfile()) {
    return false;
  }
  return true;
}

export function getExcludedCommandsForDevice(): string[] {
  if (isRedmi9cProfile()) {
    return [...AI_HD_IMAGE_COMMANDS];
  }
  return [];
}

export const REDMI9C_AI_HD_NOTICE =
  '*Fitur AI HD Ditiadakan Khusus Redmi 9C*\n' +
  'Sesuai pengaturan jalur Xiaomi Redmi 9C (3/32GB ARMv7), fitur AI HD image dihilangkan agar performa bot di Termux tetap enteng dan bebas force-close RAM.\n\n' +
  '💡 *Ingin pakai fitur HD Image Super Ajib (4x-UltraSharp / Real-ESRGAN)?*\n' +
  'Jalankan di HP Oppo Reno 5 kamu dengan mengetik `bash termux-reno5.sh` di Termux Reno 5.';
