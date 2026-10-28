import type { AnyMessageContent } from '@whiskeysockets/baileys';
import type { GatewayJob, GatewayStats } from '../src/shared/types.ts';
import { botStore } from './stateStore.ts';

export interface EnqueuedOutboundMessage {
  id: string;
  jid: string;
  content: AnyMessageContent;
  options?: any;
  jobType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'poll';
  summaryText?: string;
  onSuccess?: () => void;
  onError?: (err: any) => void;
  isPriority?: boolean;
}

class PacedOutboundQueue {
  private queue: EnqueuedOutboundMessage[] = [];
  private isProcessing = false;
  private isPaused = false;
  private recentJobs: GatewayJob[] = [];
  private stats: GatewayStats = {
    totalSent: 0,
    queuedNow: 0,
    failedCount: 0,
    webhooksDelivered: 0,
  };

  // Socket provider reference set by baileysManager
  private socketProvider: (() => any) | null = null;

  public setSocketProvider(provider: () => any): void {
    this.socketProvider = provider;
  }

  public enqueue(item: EnqueuedOutboundMessage): string {
    const job: GatewayJob = {
      id: item.id,
      to: item.jid,
      type: item.jobType || 'text',
      text: item.summaryText || 'Pesan WhatsApp',
      status: 'queued',
      createdAt: Date.now(),
    };

    this.addJobRecord(job);

    if (item.isPriority) {
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }

    this.updateStats();
    this.processNext();
    return item.id;
  }

  public getStats(): GatewayStats {
    return {
      ...this.stats,
      queuedNow: this.queue.length,
    };
  }

  public getRecentJobs(): GatewayJob[] {
    return [...this.recentJobs];
  }

  public clearQueue(): void {
    this.queue = [];
    this.updateStats();
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (!paused) {
      this.processNext();
    }
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  private addJobRecord(job: GatewayJob): void {
    this.recentJobs = [job, ...this.recentJobs.filter((j) => j.id !== job.id)].slice(0, 50);
    botStore.broadcast('gateway:jobs', this.recentJobs);
  }

  private updateJobStatus(
    id: string,
    status: GatewayJob['status'],
    error?: string
  ): void {
    const target = this.recentJobs.find((j) => j.id === id);
    if (target) {
      target.status = status;
      if (status === 'sent') {
        target.sentAt = Date.now();
      }
      if (error) {
        target.error = error;
      }
      botStore.broadcast('gateway:jobs', this.recentJobs);
    }
  }

  private updateStats(): void {
    this.stats.queuedNow = this.queue.length;
    botStore.broadcast('gateway:stats', this.getStats());
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.isPaused || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.isProcessing = true;
    this.updateStats();

    try {
      this.updateJobStatus(item.id, 'composing');

      const antiBan = botStore.config.antiBan;
      const sock = this.socketProvider ? this.socketProvider() : null;

      // 1. Calculate Humanized Delay + Gaussian Jitter
      let minDelay = antiBan?.minTypingDelayMs || 1800;
      let maxDelay = antiBan?.maxTypingDelayMs || 3500;
      if (antiBan?.warmUpMode) {
        minDelay = Math.max(minDelay, 2500);
        maxDelay = Math.max(maxDelay, 4200);
      }

      const randomJitter = Math.floor(Math.random() * (maxDelay - minDelay));
      const totalWaitMs = minDelay + randomJitter;

      // 2. Simulate Typing Indicator (Presence Composing)
      if (sock && antiBan?.humanizeTyping && item.jid.includes('@')) {
        try {
          await sock.sendPresenceUpdate('composing', item.jid);
        } catch {
          // Ignore presence errors gracefully
        }
      }

      // Wait the calculated humanized jitter delay
      await new Promise((resolve) => setTimeout(resolve, totalWaitMs));

      // 3. Dispatch actual message to WhatsApp Socket
      if (sock) {
        await sock.sendMessage(item.jid, item.content, item.options);
        // Clear composing presence
        try {
          await sock.sendPresenceUpdate('paused', item.jid);
        } catch {
          // ignore
        }
      } else {
        // In simulator / offline mode, still resolve gracefully
        console.log(`[QueueEngine] Mock dispatch to ${item.jid}:`, item.summaryText);
      }

      this.stats.totalSent += 1;
      this.updateJobStatus(item.id, 'sent');
      item.onSuccess?.();
    } catch (err: any) {
      console.error(`[QueueEngine] Failed to dispatch message ${item.id}:`, err?.message || err);
      this.stats.failedCount += 1;
      this.updateJobStatus(item.id, 'failed', err?.message || 'Gagal mengirim pesan ke socket WA');
      item.onError?.(err);
    } finally {
      this.isProcessing = false;
      this.updateStats();

      // Small resting interval before picking next item from queue (Gaussian gap)
      const restGap = 400 + Math.floor(Math.random() * 600);
      setTimeout(() => {
        this.processNext();
      }, restGap);
    }
  }
}

export const queueEngine = new PacedOutboundQueue();
