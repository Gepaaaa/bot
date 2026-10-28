import type { GroupMetadata } from '@whiskeysockets/baileys';

interface CachedGroup {
  metadata: GroupMetadata;
  cachedAt: number;
}

class GroupMetadataCache {
  private cache = new Map<string, CachedGroup>();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  public get(groupId: string): GroupMetadata | null {
    const item = this.cache.get(groupId);
    if (!item) return null;
    if (Date.now() - item.cachedAt > this.TTL_MS) {
      this.cache.delete(groupId);
      return null;
    }
    return item.metadata;
  }

  public set(groupId: string, metadata: GroupMetadata): void {
    this.cache.set(groupId, {
      metadata,
      cachedAt: Date.now(),
    });
  }

  public invalidate(groupId: string): void {
    this.cache.delete(groupId);
  }

  public updateParticipants(
    groupId: string,
    action: 'add' | 'remove' | 'promote' | 'demote' | 'modify' | string,
    participants: (string | { id: string })[]
  ): void {
    const cached = this.get(groupId);
    if (!cached) return;

    const ids = participants.map((p) => (typeof p === 'string' ? p : p.id)).filter(Boolean);

    if (action === 'remove') {
      cached.participants = cached.participants.filter(
        (p) => !ids.includes(p.id)
      );
    } else if (action === 'promote') {
      for (const p of cached.participants) {
        if (ids.includes(p.id)) {
          p.admin = 'admin';
        }
      }
    } else if (action === 'demote') {
      for (const p of cached.participants) {
        if (ids.includes(p.id)) {
          p.admin = null;
        }
      }
    }
    this.set(groupId, cached);
  }

  public size(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const groupCache = new GroupMetadataCache();
