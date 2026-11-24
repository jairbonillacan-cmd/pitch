import fs from "node:fs";

export interface MtimeCacheEntry<T> {
  readonly stamp: string;
  readonly value: T;
}

export class BoundedStampCache<T> {
  private readonly entries = new Map<string, MtimeCacheEntry<T>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 256) {
    this.maxEntries = maxEntries > 0 ? Math.trunc(maxEntries) : 64;
  }

  get(key: string, stamp: string): T | undefined {
    const existing = this.entries.get(key);
    if (!existing || existing.stamp !== stamp) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, existing);
    return existing.value;
  }

  getAny(key: string): MtimeCacheEntry<T> | undefined {
    return this.entries.get(key);
  }

  set(key: string, stamp: string, value: T): T {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, { stamp, value });
    return value;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

export function safeStatMtimeMs(filePath: string): number {
  if (!filePath) return 0;
  try {
    const stat = fs.statSync(filePath, { throwIfNoEntry: false });
    return stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0;
  } catch {
    return 0;
  }
}

export interface EntityLookupIndex<T> {
  readonly byId: ReadonlyMap<string, T>;
  readonly byKey: ReadonlyMap<string, T>;
  getById(id: string): T | undefined;
  getByKey(key: string): T | undefined;
}

export function buildEntityLookupIndex<T extends { readonly id: string }>(
  items: readonly T[],
  extractExtraKeys?: (item: T) => readonly string[],
): EntityLookupIndex<T> {
  const byId = new Map<string, T>();
  const byKey = new Map<string, T>();
  for (const item of items) {
    if (item.id) {
      byId.set(item.id, item);
      byKey.set(item.id.toLowerCase(), item);
    }
    if (extractExtraKeys) {
      for (const extra of extractExtraKeys(item)) {
        const normalized = extra.trim().toLowerCase();
        if (normalized && !byKey.has(normalized)) {
          byKey.set(normalized, item);
        }
      }
    }
  }
  return {
    byId,
    byKey,
    getById(id: string) {
      return byId.get(id);
    },
    getByKey(key: string) {
      return byKey.get(key.trim().toLowerCase());
    },
  };
}

export interface ServerTimingEntry {
  readonly stage: string;
  readonly durationMs: number;
}

const SAFE_SERVER_TIMING_STAGE_RE = /^[a-z0-9_-]{1,32}$/;

export function sanitizeServerTimingStage(stage: string): string | null {
  const trimmed = stage.trim().toLowerCase();
  if (!SAFE_SERVER_TIMING_STAGE_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function nowPerfMs(): number {
  return performance.now();
}

export function buildServerTimingHeader(entries: readonly ServerTimingEntry[]): string {
  const parts: string[] = [];
  for (const entry of entries) {
    const safeStage = sanitizeServerTimingStage(entry.stage);
    if (!safeStage) continue;
    const duration =
      Number.isFinite(entry.durationMs) && entry.durationMs >= 0 ? entry.durationMs : 0;
    parts.push(`${safeStage};dur=${duration.toFixed(1)}`);
  }
  return parts.join(", ");
}

export async function measureServerStage<T>(
  stage: string,
  sink: ServerTimingEntry[],
  run: () => Promise<T> | T,
): Promise<T> {
  const startedAt = nowPerfMs();
  try {
    return await run();
  } finally {
    const safeStage = sanitizeServerTimingStage(stage);
    if (safeStage) {
      sink.push({ stage: safeStage, durationMs: Math.max(0, nowPerfMs() - startedAt) });
    }
  }
}
