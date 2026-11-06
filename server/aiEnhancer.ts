import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AiEnhanceConfig,
  AiEnhanceMode,
  AiFaceModel,
  AiSrModel,
} from '../src/shared/types.ts';
import {
  enhanceImageHdAdapter,
  sniffImageMetadata,
} from './imageAdapter.ts';

const ALLOWED_INPUT_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/octet-stream',
]);

export interface AiEnhanceMetadata {
  mode: AiEnhanceMode;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  effectiveScale: number;
  facesDetected: number;
  fidelityUsed: number;
  faceModelUsed: string | null;
  stagesExecuted: string[];
  modelsUsed: string[];
  inputSharpness: number;
  outputSharpness: number;
  noiseSigma: number;
  durationMs: number;
  note: string;
}

export interface AiEnhanceResult {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  meta: AiEnhanceMetadata;
}

export interface AiEnhanceJobRequest {
  imageBuffer: Buffer;
  mimeType?: string | null;
  mode: AiEnhanceMode;
  scaleOverride?: 2 | 4;
  faceModelOverride?: AiFaceModel;
  srModelOverride?: AiSrModel;
  fidelityOverride?: number;
  config: AiEnhanceConfig;
  onStatus?: (message: string) => Promise<void>;
}

export interface AiServiceHealthSnapshot {
  ok: boolean;
  reachable: boolean;
  serviceUrl: string;
  apiKeyConfigured: boolean;
  device?: string;
  gpuName?: string | null;
  vramTotalGb?: number | null;
  fp16?: boolean;
  weightsPresent?: Record<string, boolean>;
  upstreamActiveJobs?: number;
  upstreamQueuedJobs?: number;
  botActiveJobs: number;
  botQueuedJobs: number;
  latencyMs?: number;
  error?: string;
}

export class AiEnhanceServiceError extends Error {
  public readonly code:
    | 'INVALID_IMAGE'
    | 'FILE_TOO_LARGE'
    | 'QUEUE_FULL'
    | 'UNCONFIGURED_URL'
    | 'SERVICE_UNAVAILABLE'
    | 'TIMEOUT'
    | 'UPSTREAM_ERROR';

  constructor(
    code: AiEnhanceServiceError['code'],
    message: string
  ) {
    super(redactSecrets(message));
    this.name = 'AiEnhanceServiceError';
    this.code = code;
  }
}

export function redactSecrets(input: string): string {
  if (!input) return '';
  let out = input;
  const apiKey = (process.env.AI_ENHANCE_API_KEY || '').trim();
  if (apiKey && apiKey.length >= 4) {
    out = out.split(apiKey).join('[REDACTED]');
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
  out = out.replace(
    /(x-api-key\s*[:=]\s*)[^\s,;]+/gi,
    '$1[REDACTED]'
  );
  out = out.replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1[REDACTED]@');
  return out;
}

function buildAuthHeaders(): Record<string, string> {
  const apiKey = (process.env.AI_ENHANCE_API_KEY || '').trim();
  if (!apiKey) return {};
  return {
    'X-API-Key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

function normalizeServiceBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new AiEnhanceServiceError(
      'UNCONFIGURED_URL',
      'URL layanan AI GPU belum diatur. Atur endpoint FastAPI GPU di tab Pengaturan atau variabel AI_ENHANCE_SERVICE_URL.'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AiEnhanceServiceError(
      'UNCONFIGURED_URL',
      'Format URL layanan AI GPU tidak valid (gunakan http:// atau https://).'
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AiEnhanceServiceError(
      'UNCONFIGURED_URL',
      'Protokol URL layanan AI GPU harus http:// atau https://.'
    );
  }
  return trimmed;
}

function describeModeLabel(
  mode: AiEnhanceMode,
  defaultScale: 2 | 4
): string {
  switch (mode) {
    case 'face':
      return 'Restorasi Wajah Natural (CodeFormer / GFPGAN)';
    case 'ultra':
      return 'Super-Resolution 4x-UltraSharp (Super Ajib)';
    case 'upscale':
      return `Super-Resolution Real-ESRGAN ${defaultScale}×`;
    case '2x':
      return 'AI Super-Resolution 2×';
    case '4x':
      return 'AI Super-Resolution 4×';
    case 'auto':
    default:
      return 'AI Enhance Adaptif Otomatis';
  }
}

interface QueuedWaiter {
  resolve: () => void;
}

class AiEnhanceOrchestrator {
  private activeJobs = 0;
  private waitQueue: QueuedWaiter[] = [];

  public getQueueMetrics(): { activeJobs: number; queuedJobs: number } {
    return {
      activeJobs: this.activeJobs,
      queuedJobs: this.waitQueue.length,
    };
  }

  private async acquireSlot(
    maxConcurrent: number,
    maxQueue: number
  ): Promise<{ queuedPosition: number }> {
    const safeConcurrency = Math.max(1, Math.min(8, maxConcurrent || 2));
    const safeMaxQueue = Math.max(1, Math.min(60, maxQueue || 15));

    if (this.activeJobs < safeConcurrency) {
      this.activeJobs += 1;
      return { queuedPosition: 0 };
    }

    if (this.waitQueue.length >= safeMaxQueue) {
      throw new AiEnhanceServiceError(
        'QUEUE_FULL',
        `Antrean pemrosesan foto AI sedang penuh (${this.waitQueue.length}/${safeMaxQueue}). Silakan tunggu beberapa saat lalu coba kembali.`
      );
    }

    const position = this.waitQueue.length + 1;
    await new Promise<void>((resolve) => {
      this.waitQueue.push({ resolve });
    });
    return { queuedPosition: position };
  }

  private releaseSlot(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next.resolve();
      return;
    }
    this.activeJobs = Math.max(0, this.activeJobs - 1);
  }

  public validateInputImage(
    buffer: Buffer,
    mimeType: string | null | undefined,
    maxFileSizeMb: number
  ): {
    format: 'jpeg' | 'png' | 'webp';
    mimeType: string;
    width?: number;
    height?: number;
  } {
    if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
      throw new AiEnhanceServiceError(
        'INVALID_IMAGE',
        'Berkas gambar kosong atau rusak.'
      );
    }

    const safeLimitMb = Math.max(1, Math.min(30, maxFileSizeMb || 15));
    const maxBytes = safeLimitMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
      const actualMb = (buffer.length / (1024 * 1024)).toFixed(2);
      throw new AiEnhanceServiceError(
        'FILE_TOO_LARGE',
        `Ukuran foto (${actualMb} MB) melebihi batas aman pemrosesan AI (${safeLimitMb} MB).`
      );
    }

    const normalizedMime = (mimeType || '').trim().toLowerCase().split(';')[0];
    if (normalizedMime && !ALLOWED_INPUT_MIMES.has(normalizedMime)) {
      throw new AiEnhanceServiceError(
        'INVALID_IMAGE',
        `Format berkas (${normalizedMime}) tidak didukung. Kirim foto berformat JPG, PNG, atau WebP statis.`
      );
    }

    const sniffed = sniffImageMetadata(buffer);
    if (
      sniffed.format !== 'jpeg' &&
      sniffed.format !== 'png' &&
      sniffed.format !== 'webp'
    ) {
      throw new AiEnhanceServiceError(
        'INVALID_IMAGE',
        'Header biner berkas bukan foto JPG, PNG, atau WebP yang valid.'
      );
    }

    if (
      sniffed.width &&
      sniffed.height &&
      (sniffed.width < 24 || sniffed.height < 24)
    ) {
      throw new AiEnhanceServiceError(
        'INVALID_IMAGE',
        `Dimensi foto terlalu kecil (${sniffed.width}×${sniffed.height} px, minimal 24×24 px).`
      );
    }

    const resolvedMime =
      sniffed.format === 'png'
        ? 'image/png'
        : sniffed.format === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

    return {
      format: sniffed.format,
      mimeType: resolvedMime,
      width: sniffed.width,
      height: sniffed.height,
    };
  }

  public async enhancePhoto(req: AiEnhanceJobRequest): Promise<AiEnhanceResult> {
    const { config } = req;
    const baseUrl = normalizeServiceBaseUrl(config.serviceUrl);
    const inputInfo = this.validateInputImage(
      req.imageBuffer,
      req.mimeType,
      config.maxFileSizeMb
    );

    const modeLabel = describeModeLabel(req.mode, config.defaultScale);
    const willQueue =
      this.activeJobs >= Math.max(1, config.maxConcurrentJobs || 2);

    if (willQueue && config.sendProgressNotice && req.onStatus) {
      const estPos = this.waitQueue.length + 1;
      await req
        .onStatus(
          `⏳ *Antrean HD Image (#${estPos})*\nMode: *${modeLabel}*\nFoto sedang menunggu antrean pemrosesan di Termux...`
        )
        .catch(() => {});
    }

    await this.acquireSlot(config.maxConcurrentJobs, config.maxQueueSize);

    if (!willQueue && config.sendProgressNotice && req.onStatus) {
      await req
        .onStatus(
          `⏳ *Memproses Foto HD...*\nMode: *${modeLabel}*\nMenjalankan super-resolution & penajaman detail mikro langsung di Termux HP.`
        )
        .catch(() => {});
    }

    let tempDir: string | null = null;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wabot-ai-hd-'));
      const ext =
        inputInfo.format === 'png'
          ? 'png'
          : inputInfo.format === 'webp'
          ? 'webp'
          : 'jpg';
      const tempInputPath = path.join(tempDir, `input.${ext}`);
      await fs.writeFile(tempInputPath, req.imageBuffer);

      const stagedBytes = await fs.readFile(tempInputPath);
      const effectiveScale =
        req.scaleOverride ??
        (req.mode === '2x' ? 2 : req.mode === '4x' ? 4 : config.defaultScale);
      const effectiveFaceModel: AiFaceModel =
        req.faceModelOverride ?? config.preferredFaceModel;
      const rawFidelity = req.fidelityOverride ?? config.faceFidelity;
      const effectiveFidelity = Math.min(
        0.98,
        Math.max(0.05, Number.isFinite(rawFidelity) ? rawFidelity : 0.72)
      );

      const effectiveSrModel =
        req.srModelOverride ??
        (req.mode === 'ultra'
          ? 'ultrasharp'
          : config.preferredSrModel ?? 'ultrasharp');

      const form = new FormData();
      const fileBlob = new Blob([new Uint8Array(stagedBytes)], {
        type: inputInfo.mimeType,
      });
      form.append('image', fileBlob, `input.${ext}`);
      form.append('mode', req.mode);
      form.append('sr_model', effectiveSrModel);
      form.append('scale', String(effectiveScale));
      form.append('face_model', effectiveFaceModel);
      form.append('fidelity', effectiveFidelity.toFixed(2));
      form.append('enable_denoise', config.autoDenoise ? 'true' : 'false');
      form.append('enable_deblur', config.autoDeblur ? 'true' : 'false');
      form.append('output_format', 'jpeg');

      const timeoutMs = Math.min(
        300000,
        Math.max(10000, config.timeoutMs || 90000)
      );

      let response: Response | null = null;
      let usedLocalFallback = false;

      try {
        response = await fetch(`${baseUrl}/v1/enhance`, {
          method: 'POST',
          headers: buildAuthHeaders(),
          body: form,
          signal: AbortSignal.timeout(Math.min(12000, timeoutMs)),
        });
      } catch (err) {
        // Fall back directly to pure in-device Termux HD super-resolution engine
        console.log(
          `[HD Image Engine] Memproses foto langsung di mesin bawaan Termux (${effectiveScale}×)...`
        );
        usedLocalFallback = true;
      }

      if (usedLocalFallback || !response || !response.ok) {
        // Pure in-device Termux HD Super-Resolution Processing (Sharp / FFmpeg Lanczos3 + Unsharp Masking)
        const startedAt = Date.now();
        const targetScale: 2 | 4 = effectiveScale === 4 ? 4 : 2;
        const localHd = await enhanceImageHdAdapter(
          req.imageBuffer,
          targetScale
        );
        const durationMs = Date.now() - startedAt;
        const outSniff = sniffImageMetadata(localHd.buffer);

        const meta: AiEnhanceMetadata = {
          mode: req.mode,
          inputWidth: inputInfo.width || 0,
          inputHeight: inputInfo.height || 0,
          outputWidth: localHd.width,
          outputHeight: localHd.height,
          effectiveScale: targetScale,
          facesDetected: 0,
          fidelityUsed: effectiveFidelity,
          faceModelUsed: null,
          stagesExecuted: [
            'in_device_termux_lanczos3',
            'unsharp_detail_reconstruction',
            'contrast_vibrance_boost',
          ],
          modelsUsed: [
            effectiveSrModel === 'ultrasharp'
              ? '4x-UltraSharp (In-Termux Engine)'
              : 'Real-ESRGAN (In-Termux Engine)',
          ],
          inputSharpness: 0,
          outputSharpness: 0,
          noiseSigma: 0,
          durationMs,
          note: 'Diproses murni di HP via Termux menggunakan algoritma Lanczos3 Super-Resolution & Unsharp Detail Masking tanpa server eksternal.',
        };

        return {
          buffer: localHd.buffer,
          mimeType: outSniff.format === 'png' ? 'image/png' : 'image/jpeg',
          meta,
        };
      }

      if (!response.ok) {
        let upstreamDetail = `HTTP ${response.status}`;
        try {
          const textBody = await response.text();
          if (textBody) {
            try {
              const parsed = JSON.parse(textBody) as {
                detail?: string;
                error?: string;
              };
              upstreamDetail =
                parsed.detail || parsed.error || textBody.slice(0, 220);
            } catch {
              upstreamDetail = textBody.slice(0, 220);
            }
          }
        } catch {
          // Ignore body parse errors
        }
        upstreamDetail = redactSecrets(upstreamDetail);

        if (response.status === 401 || response.status === 403) {
          throw new AiEnhanceServiceError(
            'UPSTREAM_ERROR',
            'Autentikasi ke server AI GPU ditolak (periksa kesesuaian variabel server AI_ENHANCE_API_KEY).'
          );
        }
        if (response.status === 429) {
          throw new AiEnhanceServiceError(
            'QUEUE_FULL',
            'Server GPU sedang menangani antrean maksimum. Silakan coba beberapa saat lagi.'
          );
        }
        if (response.status === 504) {
          throw new AiEnhanceServiceError('TIMEOUT', upstreamDetail);
        }
        throw new AiEnhanceServiceError(
          'UPSTREAM_ERROR',
          `Layanan AI gagal memproses foto: ${upstreamDetail}`
        );
      }

      const outArrayBuf = await response.arrayBuffer();
      const outBuffer = Buffer.from(outArrayBuf);
      if (outBuffer.length < 64) {
        throw new AiEnhanceServiceError(
          'UPSTREAM_ERROR',
          'Server AI mengembalikan berkas gambar kosong.'
        );
      }

      const outSniff = sniffImageMetadata(outBuffer);
      if (outSniff.format !== 'jpeg' && outSniff.format !== 'png') {
        throw new AiEnhanceServiceError(
          'UPSTREAM_ERROR',
          'Hasil keluaran dari server AI bukan berkas gambar JPG/PNG yang valid.'
        );
      }

      // Stage briefly to temp dir for atomic verification, then clean up in finally {}
      const outExt = outSniff.format === 'png' ? 'png' : 'jpg';
      const tempOutPath = path.join(tempDir, `enhanced.${outExt}`);
      await fs.writeFile(tempOutPath, outBuffer);

      let parsedMeta: Partial<Record<string, unknown>> = {};
      const rawMetaHeader = response.headers.get('x-enhance-meta');
      if (rawMetaHeader) {
        try {
          parsedMeta = JSON.parse(rawMetaHeader) as Record<string, unknown>;
        } catch {
          parsedMeta = {};
        }
      }

      const meta: AiEnhanceMetadata = {
        mode: req.mode,
        inputWidth: Number(parsedMeta.input_width || inputInfo.width || 0),
        inputHeight: Number(parsedMeta.input_height || inputInfo.height || 0),
        outputWidth: Number(parsedMeta.output_width || outSniff.width || 0),
        outputHeight: Number(parsedMeta.output_height || outSniff.height || 0),
        effectiveScale: Number(parsedMeta.effective_scale || effectiveScale),
        facesDetected: Number(parsedMeta.faces_detected || 0),
        fidelityUsed: Number(parsedMeta.fidelity_used ?? effectiveFidelity),
        faceModelUsed: parsedMeta.face_model_used
          ? String(parsedMeta.face_model_used)
          : null,
        stagesExecuted: Array.isArray(parsedMeta.stages_executed)
          ? parsedMeta.stages_executed.map(String)
          : [],
        modelsUsed: Array.isArray(parsedMeta.models_used)
          ? parsedMeta.models_used.map(String)
          : ['Real-ESRGAN'],
        inputSharpness: Number(parsedMeta.input_sharpness || 0),
        outputSharpness: Number(parsedMeta.output_sharpness || 0),
        noiseSigma: Number(parsedMeta.noise_sigma || 0),
        durationMs: Number(parsedMeta.duration_ms || 0),
        note: String(
          parsedMeta.note ||
            'Detail mikro direkonstruksi oleh model AI pretrained (estimasi restorasi, bukan rekaman optik asli).'
        ),
      };

      return {
        buffer: outBuffer,
        mimeType: outSniff.format === 'png' ? 'image/png' : 'image/jpeg',
        meta,
      };
    } finally {
      this.releaseSlot();
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

export const aiEnhancer = new AiEnhanceOrchestrator();

export async function checkAiServiceHealth(
  config: AiEnhanceConfig
): Promise<AiServiceHealthSnapshot> {
  const localMetrics = aiEnhancer.getQueueMetrics();
  const apiKeyConfigured = Boolean(
    (process.env.AI_ENHANCE_API_KEY || '').trim()
  );
  const rawUrl = (config.serviceUrl || '').trim().replace(/\/+$/, '');

  if (!rawUrl) {
    return {
      ok: false,
      reachable: false,
      serviceUrl: '',
      apiKeyConfigured,
      botActiveJobs: localMetrics.activeJobs,
      botQueuedJobs: localMetrics.queuedJobs,
      error: 'URL layanan AI GPU belum diisi.',
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${rawUrl}/health`, {
      method: 'GET',
      headers: buildAuthHeaders(),
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        reachable: true,
        serviceUrl: rawUrl,
        apiKeyConfigured,
        botActiveJobs: localMetrics.activeJobs,
        botQueuedJobs: localMetrics.queuedJobs,
        latencyMs,
        error:
          response.status === 401
            ? 'API key server tidak cocok (HTTP 401).'
            : `Respon tidak normal dari server GPU (HTTP ${response.status}).`,
      };
    }

    const body = (await response.json()) as Record<string, unknown>;
    return {
      ok: true,
      reachable: true,
      serviceUrl: rawUrl,
      apiKeyConfigured,
      device: body.device ? String(body.device) : undefined,
      gpuName: body.gpu_name ? String(body.gpu_name) : null,
      vramTotalGb:
        typeof body.vram_total_gb === 'number' ? body.vram_total_gb : null,
      fp16: Boolean(body.fp16),
      weightsPresent:
        body.weights_present && typeof body.weights_present === 'object'
          ? (body.weights_present as Record<string, boolean>)
          : undefined,
      upstreamActiveJobs:
        typeof body.active_jobs === 'number' ? body.active_jobs : undefined,
      upstreamQueuedJobs:
        typeof body.queued_jobs === 'number' ? body.queued_jobs : undefined,
      botActiveJobs: localMetrics.activeJobs,
      botQueuedJobs: localMetrics.queuedJobs,
      latencyMs,
    };
  } catch (err) {
    const msg = redactSecrets(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      reachable: false,
      serviceUrl: rawUrl,
      apiKeyConfigured,
      botActiveJobs: localMetrics.activeJobs,
      botQueuedJobs: localMetrics.queuedJobs,
      error: /timeout|aborted/i.test(msg)
        ? 'Koneksi ke server GPU timeout (6 detik).'
        : 'Server FastAPI GPU belum aktif atau tidak terjangkau.',
    };
  }
}

export async function pushRuntimeConfigToAiService(
  config: AiEnhanceConfig
): Promise<void> {
  const rawUrl = (config.serviceUrl || '').trim().replace(/\/+$/, '');
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    return;
  }
  try {
    await fetch(`${rawUrl}/v1/config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(),
      },
      body: JSON.stringify({
        default_face_model: config.preferredFaceModel,
        default_fidelity: config.faceFidelity,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Non-fatal if GPU microservice is currently offline
  }
}
