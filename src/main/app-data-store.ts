import fs from 'fs';
import path from 'path';

type FileSystemLike = Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'readFileSync' | 'writeFileSync'>;

export interface AppDataStoreOptions {
  filePath: string;
  flushDelayMs?: number;
  fileSystem?: FileSystemLike;
  logger?: Pick<Console, 'error'>;
  scheduleFlush?: (callback: () => void, delayMs: number) => unknown;
  cancelScheduledFlush?: (handle: unknown) => void;
}

export interface AppDataStoreFlushResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_FLUSH_DELAY_MS = 300;

/**
 * In-memory app data store with debounced writes.
 *
 * Reads are served from the cache without touching disk. Writes update the
 * cache immediately and are flushed to disk once after a short debounce
 * window. Callers must invoke `flush()` synchronously on shutdown to avoid
 * losing pending writes.
 */
export class AppDataStore {
  private readonly filePath: string;
  private readonly flushDelayMs: number;
  private readonly fs: FileSystemLike;
  private readonly logger: Pick<Console, 'error'>;
  private readonly scheduleFlush: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelScheduledFlush: (handle: unknown) => void;

  private cache = new Map<string, string>();
  private pendingFlushHandle: unknown = null;
  private dirty = false;

  constructor(options: AppDataStoreOptions) {
    this.filePath = options.filePath;
    this.flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;
    this.fs = options.fileSystem ?? fs;
    this.logger = options.logger ?? console;
    this.scheduleFlush = options.scheduleFlush ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelScheduledFlush = options.cancelScheduledFlush ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));

    this.loadFromDisk();
  }

  private ensureDirectoryForFile(): void {
    const dir = path.dirname(this.filePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    try {
      this.ensureDirectoryForFile();

      if (!this.fs.existsSync(this.filePath)) {
        return;
      }

      const raw = this.fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return;
      }

      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === 'string') {
          this.cache.set(key, value);
        }
      });
    } catch (error) {
      this.logger.error('[MyLifeOS] Failed to read app data store:', error);
    }
  }

  get(key: string): string | null {
    return this.cache.has(key) ? (this.cache.get(key) as string) : null;
  }

  set(key: string, value: string | null | undefined): { ok: true } {
    if (value === null || value === undefined) {
      this.cache.delete(key);
    } else {
      this.cache.set(key, String(value));
    }

    this.markDirtyAndSchedule();
    return { ok: true };
  }

  private markDirtyAndSchedule(): void {
    this.dirty = true;

    if (this.pendingFlushHandle !== null) {
      this.cancelScheduledFlush(this.pendingFlushHandle);
    }

    this.pendingFlushHandle = this.scheduleFlush(() => {
      this.pendingFlushHandle = null;
      this.flush();
    }, this.flushDelayMs);
  }

  /**
   * Synchronously writes pending changes to disk. On failure the cache is
   * rolled back to the on-disk state so reads keep returning durable data.
   */
  flush(): AppDataStoreFlushResult {
    if (this.pendingFlushHandle !== null) {
      this.cancelScheduledFlush(this.pendingFlushHandle);
      this.pendingFlushHandle = null;
    }

    if (!this.dirty) {
      return { ok: true };
    }

    try {
      this.ensureDirectoryForFile();
      this.fs.writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.cache), null, 2), 'utf8');
      this.dirty = false;
      return { ok: true };
    } catch (error) {
      this.logger.error('[MyLifeOS] Failed to write app data store:', error);
      this.rollbackToDiskState();
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to write app data store',
      };
    }
  }

  private rollbackToDiskState(): void {
    this.cache.clear();
    this.dirty = false;
    this.loadFromDisk();
  }

  get size(): number {
    return this.cache.size;
  }
}
