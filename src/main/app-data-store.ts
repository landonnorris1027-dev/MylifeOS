import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { StorageStatus } from './storage-contract';
import { DurableFileSystem, readJsonWithBackup, writeTextAtomically } from './durable-file';

type FileSystemLike = DurableFileSystem;

export interface AppDataStoreOptions {
  filePath: string;
  flushDelayMs?: number;
  fileSystem?: FileSystemLike;
  logger?: Pick<Console, 'error'>;
  onFlushError?: (result: AppDataStoreFlushResult) => void;
  onStatusChange?: () => void;
  scheduleFlush?: (callback: () => void, delayMs: number) => unknown;
  cancelScheduledFlush?: (handle: unknown) => void;
}

export interface AppDataStoreFlushResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_FLUSH_DELAY_MS = 300;

export const isAppDataRecord = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.values(value).some(entry => typeof entry !== 'string')) return false;
  const record = value as Record<string, string>;
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  const priority = (v: unknown) => v === 'P1' || v === 'P2' || v === 'P3';
  try {
    for (const key of ['mylifeos_goals', 'mylifeos_habits', 'mylifeos_recovery_points']) {
      if (record[key] === undefined) continue;
      const entries: unknown = JSON.parse(record[key]);
      if (!Array.isArray(entries) || entries.some(entry => !object(entry))) return false;
      if (key === 'mylifeos_goals' && entries.some(entry => !text(entry.id) || !text(entry.name))) return false;
      if (key === 'mylifeos_habits' && entries.some(entry => !text(entry.id) || !text(entry.name) || !priority(entry.priority)
        || !positive(entry.dailyQuota) || entry.dailyQuota > 1440 || !positive(entry.defaultDurationMinutes)
        || !['permanent', 'range'].includes(entry.effectiveType)
        || (entry.weekdays !== undefined && (!Array.isArray(entry.weekdays) || entry.weekdays.length === 0
          || new Set(entry.weekdays).size !== entry.weekdays.length
          || entry.weekdays.some((day: unknown) => !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6))))) return false;
      if (key === 'mylifeos_recovery_points' && entries.some(entry => !text(entry.id) || !text(entry.createdAt)
        || !text(entry.backupJson) || !['auto-daily', 'pre-import', 'pre-recovery-restore'].includes(entry.reason))) return false;
    }
    if (record.mylifeos_daily_logs !== undefined) {
      const logs: unknown = JSON.parse(record.mylifeos_daily_logs);
      if (!object(logs) || Object.values(logs).some(day => !object(day) || !Array.isArray(day.tasks)
        || typeof day.date !== 'string' || day.tasks.some(task => !object(task) || typeof task.name !== 'string'
          || !text(task.id) || !positive(task.durationMinutes) || !priority(task.priority)
          || !['inbox', 'scheduled', 'completed', 'deleted'].includes(String(task.status))
          || typeof task.date !== 'string' || (task.actualFocusMinutes !== undefined && (typeof task.actualFocusMinutes !== 'number' || !Number.isFinite(task.actualFocusMinutes) || task.actualFocusMinutes < 0))))) return false;
    }
    for (const key of ['mylifeos_focus_settings', 'mylifeos_profile_settings', 'mylifeos_planner_settings', 'mylifeos_desktop_settings']) {
      if (record[key] !== undefined && !object(JSON.parse(record[key]))) return false;
    }
    return true;
  } catch { return false; }
};

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
  private readonly onFlushError?: (result: AppDataStoreFlushResult) => void;
  private readonly scheduleFlush: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelScheduledFlush: (handle: unknown) => void;

  private cache = new Map<string, string>();
  private pendingFlushHandle: unknown = null;
  private dirty = false;
  private failedSnapshot: Map<string, string> | null = null;
  private recoveryRequired = false;
  private lastError: string | undefined;
  private readonly onStatusChange?: () => void;

  constructor(options: AppDataStoreOptions) {
    this.filePath = options.filePath;
    this.flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;
    this.fs = options.fileSystem ?? fs;
    this.logger = options.logger ?? console;
    this.onFlushError = options.onFlushError;
    this.onStatusChange = options.onStatusChange;
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
      const result = readJsonWithBackup(this.filePath, this.fs, isAppDataRecord);
      if (!result) {
        if (this.fs.existsSync(this.filePath) || this.fs.existsSync(`${this.filePath}.bak`)) {
          this.recoveryRequired = true;
          this.lastError = 'Data and backup are unreadable. Restore a verified backup to continue.';
          this.logger.error('[MyLifeOS] App data store and backup are unreadable.');
        }
        return;
      }
      if (result.recoveredFromBackup) {
        this.logger.error('[MyLifeOS] Recovered app data store from the last complete backup.');
      }
      if (!isAppDataRecord(result.value)) return;
      Object.entries(result.value).forEach(([key, value]) => {
        this.cache.set(key, value);
      });
    } catch (error) {
      this.recoveryRequired = true;
      this.lastError = error instanceof Error ? error.message : 'Cannot read data';
      this.logger.error('[MyLifeOS] Failed to read app data store:', error);
    }
  }

  get(key: string): string | null {
    return this.cache.has(key) ? (this.cache.get(key) as string) : null;
  }

  set(key: string, value: string | null | undefined): { ok: true } {
    if (this.recoveryRequired || this.failedSnapshot) {
      throw new Error(this.lastError || 'Retry or restore before editing data');
    }
    if (value != null && !isAppDataRecord({ [key]: String(value) })) throw new Error('Invalid storage value');
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
    this.onStatusChange?.();

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

    if (this.recoveryRequired && !this.failedSnapshot) return { ok: false, error: this.lastError };
    if (this.failedSnapshot) {
      this.recoveryRequired = false;
      this.cache = new Map(this.failedSnapshot);
      this.dirty = true;
    }
    if (!this.dirty) {
      return { ok: true };
    }

    try {
      this.ensureDirectoryForFile();
      writeTextAtomically(
        this.filePath,
        JSON.stringify(Object.fromEntries(this.cache), null, 2),
        this.fs,
        isAppDataRecord,
      );
      this.dirty = false;
      this.failedSnapshot = null;
      this.lastError = undefined;
      this.onStatusChange?.();
      return { ok: true };
    } catch (error) {
      this.logger.error('[MyLifeOS] Failed to write app data store:', error);
      this.failedSnapshot = new Map(this.cache);
      this.rollbackToDiskState();
      const result = {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to write app data store',
      } as const;
      this.lastError = result.error;
      this.onStatusChange?.();
      try {
        this.onFlushError?.(result);
      } catch (callbackError) {
        this.logger.error('[MyLifeOS] Failed to report app data store write failure:', callbackError);
      }
      return result;
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

  getStatus(): StorageStatus {
    return {
      state: this.failedSnapshot ? 'error' : this.recoveryRequired ? 'recovery' : this.dirty ? 'saving' : 'saved',
      error: this.lastError,
      hasPending: this.dirty || this.failedSnapshot !== null,
    };
  }

  snapshot(includePending = false): Record<string, string> {
    return Object.fromEntries(includePending && this.failedSnapshot ? this.failedSnapshot : this.cache);
  }

  /** Commit all business keys in one durable replacement, never one key at a time. */
  commit(entries: Record<string, string>, recover = false): AppDataStoreFlushResult {
    if (!isAppDataRecord(entries)) return { ok: false, error: 'Invalid snapshot content' };
    if (this.failedSnapshot) return { ok: false, error: 'Retry pending changes before importing' };
    if (this.recoveryRequired && !recover) return { ok: false, error: this.lastError };
    try {
      if (this.recoveryRequired) {
        // Preserve the original bytes before allowing an explicit recovery.
        const suffix = `.corrupt-${randomUUID()}`;
        for (const source of [this.filePath, `${this.filePath}.bak`]) {
          if (!this.fs.existsSync(source)) continue;
          const archive = `${source}${suffix}`;
          this.fs.copyFileSync(source, archive);
          const descriptor = this.fs.openSync(archive, 'r+');
          try { this.fs.fsyncSync(descriptor); } finally { this.fs.closeSync(descriptor); }
        }
        this.recoveryRequired = false;
      }
      Object.entries(entries).forEach(([key, value]) => this.cache.set(key, value));
      this.dirty = true;
      return this.flush();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Recovery archive failed' };
    }
  }
}
