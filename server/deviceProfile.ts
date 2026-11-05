/**
 * Device Profile & Capabilities Detector
 *
 * Mendeteksi profil perangkat yang menjalankan bot:
 * - 'redmi9c': Xiaomi Redmi 9C (32-bit ARMv7l, Helio G35, RAM 3GB)
 *   -> Fitur AI HD image (4x-UltraSharp, Real-ESRGAN, CodeFormer, GFPGAN)
 *      DINONAKTIFKAN secara otomatis karena arsitektur 32-bit & keterbatasan RAM/SoC.
 *      Tetap mendukung penuh stiker WASM (.s, .qc, .brat), downloader sosmed (.tt, .mp3),
 *      dan status HD (.hdsw).
 * - 'reno5': Oppo Reno 5 (64-bit aarch64, Snapdragon 720G, RAM 8GB)
 *   -> Fitur AI HD image AKTIF PENUH melalui node GPU/PyTorch ai_service.
 * - 'generic': Server Node.js / Cloud / PC lainnya.
 */

export type DeviceProfileType = 'redmi9c' | 'reno5' | 'generic';

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
  // Jalur Redmi 9C tidak menggunakan fitur AI HD image
  if (isRedmi9cProfile()) {
    return false;
  }
  return true;
}

export const REDMI9C_AI_HD_NOTICE =
  '*Fitur AI HD Tidak Tersedia di Redmi 9C*\n' +
  'Jalur Xiaomi Redmi 9C (3/32GB ARMv7) difokuskan khusus untuk stabilitas 24/7 (Stiker WASM, Downloader Sosmed, Status HD .hdsw & Gateway Antrean).\n\n' +
  '💡 *Ingin pakai AI Super-Resolution 4x-UltraSharp / Real-ESRGAN?*\n' +
  'Jalankan AI di HP Oppo Reno 5 kamu (buka tab *Termux* > *Oppo Reno 5* > jalankan `bash setup_reno5.sh`).';
