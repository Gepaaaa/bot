import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function shouldForceSsl(connectionString: string): boolean {
  const lower = connectionString.toLowerCase();
  return (
    lower.includes('sslmode=require') ||
    lower.includes('.render.com') ||
    lower.includes('.neon.tech') ||
    lower.includes('.supabase.co') ||
    lower.includes('.aivencloud.com') ||
    lower.includes('.cockroachlabs.cloud')
  );
}

class CloudSessionSync {
  private pool: pg.Pool | null = null;
  private ready = false;
  private lastSyncedAuth = new Map<string, string>();
  private lastSyncedState = '';
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStateJson: string | null = null;
  private activeAuthSync: Promise<void> = Promise.resolve();

  public isEnabled(): boolean {
    return this.ready && this.pool !== null;
  }

  private async connectPool(connectionString: string): Promise<pg.Pool | null> {
    const preferSsl = shouldForceSsl(connectionString);
    const candidates = preferSsl
      ? [{ rejectUnauthorized: false }, false]
      : [false, { rejectUnauthorized: false }];

    for (const sslOption of candidates) {
      const candidatePool = new Pool({
        connectionString,
        ssl: sslOption,
        max: 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000,
      });

      candidatePool.on('error', (err) => {
        console.warn('[CloudSync] Idle PostgreSQL client notice:', err.message);
      });

      try {
        await candidatePool.query(`
          CREATE TABLE IF NOT EXISTS wabot_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at BIGINT NOT NULL
          )
        `);
        return candidatePool;
      } catch (err) {
        try {
          await candidatePool.end();
        } catch {
          // Ignore pool close error
        }
        console.warn(
          `[CloudSync] Connection attempt (ssl=${Boolean(sslOption)}) failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return null;
  }

  public async initAndRestore(dataDir: string): Promise<void> {
    const dbUrl = (process.env.DATABASE_URL || '').trim();
    if (!dbUrl) {
      return;
    }

    const connected = await this.connectPool(dbUrl);
    if (!connected) {
      console.warn(
        '[CloudSync] DATABASE_URL ditemukan namun gagal terhubung; menggunakan penyimpanan lokal.'
      );
      return;
    }

    this.pool = connected;
    this.ready = true;

    try {
      const { rows } = await this.pool.query<{ key: string; value: string }>(
        'SELECT key, value FROM wabot_kv'
      );

      const authDir = path.join(dataDir, '.baileys_auth');
      await fs.mkdir(authDir, { recursive: true });

      let restoredAuthFiles = 0;

      for (const row of rows) {
        if (row.key === 'state:bot-state.json') {
          const statePath = path.join(dataDir, '.bot-state.json');
          await fs.writeFile(statePath, row.value, 'utf-8');
          this.lastSyncedState = row.value;
        } else if (row.key.startsWith('auth:')) {
          const rawName = row.key.slice('auth:'.length);
          const safeName = path.basename(rawName);
          if (!safeName || safeName !== rawName) continue;
          const filePath = path.join(authDir, safeName);
          await fs.writeFile(filePath, row.value, 'utf-8');
          this.lastSyncedAuth.set(safeName, row.value);
          restoredAuthFiles += 1;
        }
      }

      console.log(
        `[CloudSync] Aktif — berhasil memulihkan ${restoredAuthFiles} berkas sesi WhatsApp dari PostgreSQL.`
      );
    } catch (err) {
      console.error('[CloudSync] Gagal memulihkan sesi dari PostgreSQL:', err);
    }
  }

  public scheduleAuthSync(authDir: string): void {
    if (!this.isEnabled()) return;
    if (this.authTimer) {
      clearTimeout(this.authTimer);
    }
    this.authTimer = setTimeout(() => {
      this.authTimer = null;
      void this.flushAuthNow(authDir);
    }, 750);
    this.authTimer.unref();
  }

  public flushAuthNow(authDir: string): Promise<void> {
    if (!this.isEnabled() || !this.pool) return Promise.resolve();
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }

    const run = async () => {
      const pool = this.pool;
      if (!pool) return;

      let entries: string[] = [];
      try {
        entries = await fs.readdir(authDir);
      } catch {
        return;
      }

      const currentFiles = new Set<string>();
      const upserts: Array<{ key: string; value: string }> = [];

      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        currentFiles.add(name);
        try {
          const content = await fs.readFile(path.join(authDir, name), 'utf-8');
          if (this.lastSyncedAuth.get(name) !== content) {
            upserts.push({ key: `auth:${name}`, value: content });
          }
        } catch {
          // File may have been rotated concurrently
        }
      }

      const removedNames: string[] = [];
      for (const prevName of this.lastSyncedAuth.keys()) {
        if (!currentFiles.has(prevName)) {
          removedNames.push(prevName);
        }
      }

      const now = Date.now();
      for (const item of upserts) {
        try {
          await pool.query(
            `INSERT INTO wabot_kv (key, value, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            [item.key, item.value, now]
          );
          this.lastSyncedAuth.set(item.key.slice('auth:'.length), item.value);
        } catch (err) {
          console.warn('[CloudSync] Gagal menyimpan berkas auth:', err);
        }
      }

      for (const gone of removedNames) {
        try {
          await pool.query('DELETE FROM wabot_kv WHERE key = $1', [
            `auth:${gone}`,
          ]);
          this.lastSyncedAuth.delete(gone);
        } catch {
          // Ignore delete failure
        }
      }
    };

    const next = this.activeAuthSync.then(run, run);
    this.activeAuthSync = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  public scheduleStateSync(stateJson: string): void {
    if (!this.isEnabled()) return;
    if (stateJson === this.lastSyncedState) return;
    this.pendingStateJson = stateJson;

    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
    }
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      void this.flushStateNow();
    }, 1000);
    this.stateTimer.unref();
  }

  public async flushStateNow(explicitJson?: string): Promise<void> {
    if (!this.isEnabled() || !this.pool) return;
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }

    const payload = explicitJson ?? this.pendingStateJson;
    this.pendingStateJson = null;
    if (!payload || payload === this.lastSyncedState) return;

    try {
      await this.pool.query(
        `INSERT INTO wabot_kv (key, value, updated_at)
         VALUES ('state:bot-state.json', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [payload, Date.now()]
      );
      this.lastSyncedState = payload;
    } catch (err) {
      console.warn('[CloudSync] Gagal menyimpan state bot:', err);
    }
  }

  public async clearAuth(): Promise<void> {
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
    this.lastSyncedAuth.clear();
    if (!this.isEnabled() || !this.pool) return;

    try {
      await this.pool.query("DELETE FROM wabot_kv WHERE key LIKE 'auth:%'");
    } catch (err) {
      console.warn('[CloudSync] Gagal membersihkan sesi auth di cloud:', err);
    }
  }

  public async flushAllNow(authDir: string): Promise<void> {
    await Promise.allSettled([
      this.flushAuthNow(authDir),
      this.flushStateNow(),
    ]);
  }
}

export const cloudSync = new CloudSessionSync();
