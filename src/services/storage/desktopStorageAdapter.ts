import type { StorageAdapter } from '../platformAdapters';
import type { StorageResult, StorageStatus } from '../../main/storage-contract';
export interface DesktopSnapshot { revision: number; entries: Record<string, string>; }
export interface DesktopWrite { key: string; value: string; expectedValue: string | null; }
export interface DesktopBridge {
  read(): Promise<DesktopSnapshot>;
  write(input: DesktopWrite): Promise<StorageResult>;
  flush(): Promise<StorageResult & StorageStatus>;
  retry(): Promise<StorageResult & StorageStatus>;
  status(): Promise<StorageStatus>;
  subscribe(callback: (status: StorageStatus) => void): () => void;
  subscribeChanges(callback: () => void): () => void;
}
export class DesktopStorageAdapter implements StorageAdapter {
  private entries: Record<string, string> = {};
  private candidate: Record<string, string> | null = null;
  private writes: DesktopWrite[] = [];
  private tail: Promise<void> = Promise.resolve();
  private listeners = new Set<(status: StorageStatus) => void>();
  private failure: string | null = null;
  private server: StorageStatus = { state: 'saved', hasPending: false };
  private failing: Promise<void> | null = null;
  private localRevision = 0;
  private closing = false;
  ready = false;
  constructor(private readonly bridge: DesktopBridge) {}
  revision() { return this.localRevision; }
  get(key: string) { return this.entries[key] ?? null; }
  status(): StorageStatus {
    return this.failure ? { state: 'error', error: this.failure, hasPending: true }
      : this.server.state === 'error' || this.server.state === 'recovery' ? this.server
      : this.writes.length ? { state: 'saving', hasPending: true } : this.server;
  }
  subscribe(callback: (status: StorageStatus) => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
  private publish() { const status = this.status(); this.listeners.forEach(callback => callback(status)); }
  private async reload(durableOnly = false) {
    const snapshot = await this.bridge.read();
    if (!snapshot || !Number.isSafeInteger(snapshot.revision) || !snapshot.entries) throw Error('Invalid desktop snapshot');
    const next = { ...snapshot.entries };
    if (!durableOnly) for (const request of this.writes) next[request.key] = request.value;
    if (Object.keys(next).length !== Object.keys(this.entries).length
      || Object.keys(next).some(key => next[key] !== this.entries[key])) this.localRevision++;
    this.entries = next; this.ready = true;
  }
  async initialize() {
    try { await this.reload(); this.server = await this.bridge.status(); }
    catch (error) { this.server = { state: 'recovery', error: String(error), hasPending: false }; throw error; }
    this.bridge.subscribe(status => {
      this.server = status;
      if (status.state === 'error') void this.fail(status.error || 'Desktop save failed');
      else this.publish();
    });
    this.bridge.subscribeChanges(() => {
      if (this.writes.length || this.failure) return;
      void this.reload().then(() => {
        window.dispatchEvent(new Event('mylifeos-storage-restored'));
      }).catch(error => this.fail(String(error)));
    });
    this.publish();
  }
  private async fail(error: string) {
    if (this.failing) return this.failing;
    this.failure = error; this.candidate ||= { ...this.entries };
    this.failing = (async () => {
      try { await this.reload(true); } catch { /* Keep the previous cache for export. */ }
      this.publish();
    })();
    try { await this.failing; } finally { this.failing = null; }
  }
  set(key: string, value: string): Promise<void> {
    if (this.closing) throw Error('Application is closing');
    if (this.failure || ['error', 'recovery'].includes(this.server.state)) throw Error(this.failure || 'Desktop storage is read-only');
    const request = { key, value, expectedValue: this.get(key) };
    this.entries[key] = value; this.localRevision++; this.writes.push(request); this.publish();
    // Dispatch immediately: ordering belongs to the main queue, so native quit
    // never races an accepted edit waiting for a previous renderer reply.
    const operation = (async () => {
      const result = await this.bridge.write(request);
      if (!result.ok) throw Error(result.error || 'Desktop write rejected');
      this.writes = this.writes.filter(item => item !== request);
      this.server = { state: 'saving', hasPending: true }; this.publish();
    })();
    const acknowledged = operation.catch(async error => { await this.fail(error instanceof Error ? error.message : String(error)); });
    this.tail = Promise.all([this.tail, acknowledged]).then(() => undefined);
    // Many ordinary callers deliberately use delayed saving. Retain failures in status.
    void operation.catch(() => undefined);
    return operation;
  }
  async flush() {
    await this.tail;
    if (this.failure) throw Error(this.failure);
    const result = await this.bridge.flush();
    if (!result.ok) { await this.fail(result.error || 'Desktop flush failed'); throw Error(this.failure!); }
    this.server = result; await this.reload(); this.publish();
  }
  pending() { return { ...(this.candidate || this.entries) }; }
  pendingOverrides() {
    const overrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.candidate || {})) if (value !== this.entries[key]) overrides[key] = value;
    for (const request of this.writes) overrides[request.key] = request.value;
    return overrides;
  }
  async retry() {
    await this.tail;
    const result = await this.bridge.retry();
    if (!result.ok) throw Error(result.error || 'Desktop retry failed');
    await this.reload(true);
    for (const request of [...this.writes]) {
      if (this.get(request.key) === request.value) { this.writes.shift(); continue; }
      if (this.get(request.key) !== request.expectedValue) throw Error('Data changed during saving. Export pending changes or reload saved data.');
      const written = await this.bridge.write(request);
      if (!written.ok) throw Error(written.error || 'Desktop retry rejected');
      this.entries[request.key] = request.value; this.writes.shift();
    }
    const flushed = await this.bridge.flush();
    if (!flushed.ok) throw Error(flushed.error || 'Desktop flush failed');
    this.failure = null; this.candidate = null; this.server = flushed;
    await this.reload(); this.publish();
  }
  async settle() { await this.tail; }
  async prepareQuit(retry = false) {
    this.closing = true;
    if (retry) await this.retry(); else await this.flush();
  }
  cancelQuit() { this.closing = false; }
  async restoreCompleted() {
    await this.tail;
    this.failure = null; this.candidate = null; this.writes = []; this.server = await this.bridge.status();
    await this.reload(); this.publish();
  }
  async discardLocalCandidate() {
    await this.tail;
    const status = await this.bridge.status();
    if (status.state !== 'saved') throw Error('Retry the main-process save before discarding a local conflict.');
    this.server = status;
    this.writes = []; this.failure = null; this.candidate = null; await this.reload(); this.publish();
  }
}
let adapter: DesktopStorageAdapter | null = null;
export const getDesktopStorage = () => adapter;
export async function bootstrapDesktopStorage() {
  if (!window.electronAPI) return;
  const api = window.electronAPI;
  adapter = new DesktopStorageAdapter({
    read: () => api.invoke('storage-read-all'), write: input => api.invoke('storage-write', input),
    flush: () => api.invoke('storage-flush'), retry: () => api.invoke('storage-retry'), status: () => api.invoke('storage-status'),
    subscribe: callback => api.on('storage-status', callback), subscribeChanges: callback => api.on('storage-changed', callback),
  });
  await adapter.initialize();
  const initialized = adapter;
  api.on('storage-prepare-quit', (request: { requestId: number; retry: boolean }) => {
    void (async () => {
      let ok = false;
      try { await initialized.prepareQuit(request.retry); ok = true; } catch { /* Main keeps the window open for retry/export. */ }
      await api.invoke('storage-quit-ready', { requestId: request.requestId, ok });
    })().catch(() => initialized.cancelQuit());
  });
  api.on('storage-quit-cancelled', () => initialized.cancelQuit());
}
