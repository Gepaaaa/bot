import crypto from 'crypto';
import type { WebhookDeliveryLog } from '../src/shared/types.ts';
import { botStore } from './stateStore.ts';

class WebhookDispatcher {
  private deliveryLogs: WebhookDeliveryLog[] = [];

  public getDeliveryLogs(): WebhookDeliveryLog[] {
    return [...this.deliveryLogs];
  }

  public async dispatch(
    event: 'message.received' | 'message.sent' | 'session.status' | 'group.participant_update',
    data: any
  ): Promise<void> {
    const { webhook } = botStore.config;
    if (!webhook || !webhook.enabled || !webhook.url) {
      return;
    }

    // Check if event is subscribed
    if (webhook.events && webhook.events.length > 0 && !webhook.events.includes(event)) {
      return;
    }

    const payload = {
      event,
      timestamp: Date.now(),
      session: 'default',
      data,
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'GepaBot-OpenWA-Gateway/1.0',
    };

    if (webhook.secret) {
      const hmac = crypto
        .createHmac('sha256', webhook.secret)
        .update(payloadString)
        .digest('hex');
      headers['X-OpenWA-Signature'] = `sha256=${hmac}`;
    }

    const startTime = Date.now();
    const logId = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;

      const log: WebhookDeliveryLog = {
        id: logId,
        timestamp: Date.now(),
        event,
        url: webhook.url,
        statusCode: res.status,
        success: res.ok,
        durationMs,
      };

      this.addLog(log);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const log: WebhookDeliveryLog = {
        id: logId,
        timestamp: Date.now(),
        event,
        url: webhook.url,
        statusCode: 0,
        success: false,
        durationMs,
        error: err?.message || 'Gagal mengirim webhook (Network/Timeout)',
      };
      this.addLog(log);
    }
  }

  public async testPing(
    url: string,
    secret?: string
  ): Promise<{ success: boolean; statusCode: number; durationMs: number; error?: string }> {
    const payload = {
      event: 'session.status',
      timestamp: Date.now(),
      session: 'default',
      data: {
        status: botStore.waState.status,
        botName: botStore.config.botName,
        ping: 'test-verification',
      },
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'GepaBot-OpenWA-Gateway/1.0',
    };

    if (secret) {
      const hmac = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
      headers['X-OpenWA-Signature'] = `sha256=${hmac}`;
    }

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;

      return {
        success: res.ok,
        statusCode: res.status,
        durationMs,
        error: res.ok ? undefined : `Server merespon dengan HTTP ${res.status}`,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        statusCode: 0,
        durationMs,
        error: err?.message || 'Koneksi gagal atau waktu habis (timeout)',
      };
    }
  }

  private addLog(log: WebhookDeliveryLog): void {
    this.deliveryLogs = [log, ...this.deliveryLogs].slice(0, 30);
    botStore.broadcast('webhook:logs', this.deliveryLogs);
  }
}

export const webhookDispatcher = new WebhookDispatcher();
