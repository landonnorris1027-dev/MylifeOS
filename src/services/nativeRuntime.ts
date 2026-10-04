import { registerPlugin } from '@capacitor/core';
import type { StorageStatus } from '../main/storage-contract';
import type { PomodoroTimerData } from './electronIPC';

export interface NativeSession extends PomodoroTimerData {
  remaining: number;
  endTime: number;
  isActive: boolean;
  notificationId: number;
  state: 'running' | 'paused' | 'completed';
  actualFocusMinutes?: number;
}
export interface NativeSnapshot {
  revision: number;
  entries: Record<string, string>;
  sessions: NativeSession[];
  reminderError?: string;
}
export interface NativeStoragePlugin {
  load(options: { legacy?: Record<string, string>; dirty?: string[] }): Promise<NativeSnapshot>;
  write(options: { entries: Record<string, string>; expectedRevision: number; replace?: boolean; recover?: boolean }): Promise<NativeSnapshot>;
  timer(options: NativeTimerRequest): Promise<NativeSnapshot>;
  timers(options?: { rearm: boolean }): Promise<NativeSnapshot>;
  stopForRecovery(): Promise<NativeSnapshot | { recoveryStopped: boolean }>;
  saveDocument(options: { content: string; filename: string }): Promise<{ canceled: boolean; uri?: string }>;
}
interface NativeTimerRequest { action: 'start' | 'toggle' | 'pause' | 'resume' | 'stop' | 'complete'; timerId: string; data?: PomodoroTimerData; }

export const NativeStorage = registerPlugin<NativeStoragePlugin>('NativeStorage');
let snapshot: NativeSnapshot = { revision: 0, entries: {}, sessions: [] };
let draft: Record<string, string> = {};
let candidate: Record<string, string> | null = null;
let candidateReplace = false;
let timerCandidate: NativeTimerRequest | null = null;
let queue: Promise<void> = Promise.resolve();
let status: StorageStatus = { state: 'saving', hasPending: false };
const listeners = new Set<(status: StorageStatus) => void>();
let initialized = false;
let replacementPending = 0;
const publish = (next: StorageStatus) => {
  status = { ...next, transaction: replacementPending > 0 };
  listeners.forEach(listener => listener(status));
};
const blocked = () => status.state === 'error' || status.state === 'recovery';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const operation = queue.then(action);
  const tail = operation.then(() => undefined, () => undefined);
  queue = tail;
  tail.then(() => {
    if (queue !== tail || blocked()) return;
    const changed = draft.mylifeos_daily_logs !== snapshot.entries.mylifeos_daily_logs;
    draft = { ...snapshot.entries }; candidate = null; candidateReplace = false;
    publish({ state: 'saved', hasPending: false });
    if (changed) window.dispatchEvent(new Event('mylifeos-storage-restored'));
  });
  void operation.catch(() => undefined);
  return operation;
}

function accept(next: NativeSnapshot) {
  if (!next || !Number.isInteger(next.revision) || !next.entries || !Array.isArray(next.sessions)) throw new Error('Invalid native snapshot');
  snapshot = next;
}

export async function bootstrapNativeStorage(keys: readonly string[]): Promise<void> {
  const legacy: Record<string, string> = {};
  const dirty: string[] = [];
  try {
    const raw = localStorage.getItem('mylifeos_business_snapshot');
    let browser: Record<string, unknown> = {};
    // A damaged WebView cache must not hide an intact authoritative native file.
    // Keep the raw legacy source untouched; individual keys remain migration inputs.
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) browser = parsed;
      } catch { /* Native load validates whichever legacy values it actually needs. */ }
    }
    keys.forEach(key => {
      const value = browser[key] ?? localStorage.getItem(key);
      if (typeof value === 'string') legacy[key] = value;
      if (localStorage.getItem(`mylifeos_native_dirty:${key}`) !== null) dirty.push(key);
    });
    accept(await NativeStorage.load({ legacy, dirty }));
    if (snapshot.reminderError) window.dispatchEvent(new CustomEvent('mylifeos-reminder-error', { detail: snapshot.reminderError }));
    draft = { ...snapshot.entries };
    candidate = null; candidateReplace = false;
    publish({ state: 'saved', hasPending: false });
  } catch (error) {
    candidate = Object.keys(legacy).length ? legacy : null;
    publish({ state: 'recovery', hasPending: Boolean(candidate), error: message(error) });
  } finally { initialized = true; }
}
export const isNativeStorageReady = () => initialized;
export const getCompletedNativeFocus = () => snapshot.sessions.filter(session => session.state === 'completed' && session.isFocusMode)
  .filter(session => !snapshot.sessions.some(other => other.timerId === `${session.timerId}_break`));

export const getNativeItem = (key: string): string | null => (blocked() ? snapshot.entries : draft)[key] ?? null;
export const getNativeStatus = () => status;
export const getNativePending = () => ({ ...(candidate || draft) });
export const getNativeTimerPending = () => timerCandidate;
export const subscribeNativeStatus = (listener: (status: StorageStatus) => void) => {
  listeners.add(listener); listener(status);
  return () => { listeners.delete(listener); };
};

export function setNativeItem(key: string, value: string): Promise<void> {
  if (blocked()) throw new Error('Storage is read-only until retry or recovery succeeds');
  if (replacementPending) throw new Error('Wait for the whole-data transaction to finish before editing');
  draft = { ...draft, [key]: value };
  candidate = { ...draft };
  publish({ state: 'saving', hasPending: true });
  return enqueue(async () => {
    if (blocked()) throw new Error(status.error || 'Native storage blocked');
    try {
      accept(await NativeStorage.write({ entries: { [key]: value }, expectedRevision: snapshot.revision }));
    } catch (error) {
      publish({ state: 'error', hasPending: true, error: message(error) });
      throw error;
    }
  });
}

export async function flushNativeWrites(): Promise<void> {
  await queue;
  if (blocked()) throw new Error(status.error || 'Native storage blocked');
}

export async function commitNativeEntries(entries: Record<string, string>, recover = false): Promise<void> {
  replacementPending++;
  publish({ ...status, state: recover ? 'recovery' : blocked() ? status.state : 'saving' });
  return enqueue(async () => {
    try {
      if (!recover && blocked()) throw new Error(status.error || 'Native storage blocked');
      draft = { ...snapshot.entries, ...entries };
      candidate = { ...draft }; candidateReplace = true;
      publish({ state: recover ? 'recovery' : 'saving', hasPending: true });
      accept(await NativeStorage.write({ entries, expectedRevision: snapshot.revision, replace: true, recover }));
      // Publish saved and reconcile the cache only when the shared queue is idle.
      if (recover) publish({ state: 'saving', hasPending: true });
    } catch (error) {
      publish({ state: recover ? 'recovery' : 'error', hasPending: true, error: message(error) }); throw error;
    } finally {
      replacementPending--;
      // Failed transactions must release their UI lock while retaining the error.
      if (blocked()) publish(status);
    }
  });
}

export async function retryNativeWrites(): Promise<void> {
  if (status.state === 'recovery') throw new Error('Choose a validated backup to recover unreadable data');
  const replacing = candidateReplace;
  if (replacing) { replacementPending++; publish(status); }
  return enqueue(async () => {
    const pending = candidate || draft;
    publish({ state: 'saving', hasPending: true });
    try {
      accept(await NativeStorage.load({}));
      accept(await NativeStorage.write({ entries: pending, expectedRevision: snapshot.revision, replace: candidateReplace }));
      if (timerCandidate) {
        accept(await NativeStorage.timer(timerCandidate)); timerCandidate = null;
        window.dispatchEvent(new Event('mylifeos-storage-restored'));
      }
    } catch (error) {
      publish({ state: 'error', hasPending: true, error: message(error) }); throw error;
    } finally {
      if (replacing) replacementPending--;
      if (blocked()) publish(status);
    }
  });
}

export async function nativeTimerOperation(action: 'start' | 'toggle' | 'stop' | 'complete', timerId: string, data?: PomodoroTimerData): Promise<NativeSession[]> {
  if (replacementPending) throw new Error('Wait for the whole-data transaction to finish before changing sessions');
  return enqueue(async () => {
    if (blocked() && action !== 'stop') throw new Error(status.error || 'Native storage blocked');
    const wasRecovery = status.state === 'recovery';
    const actualAction = action === 'toggle' ? (snapshot.sessions.find(session => session.timerId === timerId)?.isActive ? 'pause' : 'resume') : action;
    const request: NativeTimerRequest = { action: actualAction, timerId, data };
    if (!blocked()) publish({ state: 'saving', hasPending: true });
    try {
      const next = await NativeStorage.timer(request);
      accept(next);
      if (timerCandidate?.timerId === timerId || action !== 'stop') timerCandidate = null;
      window.dispatchEvent(new Event('mylifeos-storage-restored'));
      if (next.reminderError) window.dispatchEvent(new CustomEvent('mylifeos-reminder-error', { detail: next.reminderError }));
      return next.sessions;
    } catch (error) {
      timerCandidate = request;
      candidate = candidate || { ...snapshot.entries };
      publish({ state: wasRecovery ? 'recovery' : 'error', hasPending: true, error: message(error) });
      throw error;
    }
  });
}

export async function refreshNativeTimers(allowBlocked = false, rearm = false): Promise<NativeSession[]> {
  return enqueue(async () => {
    if (!initialized) throw new Error('Native storage is still initializing');
    if (blocked() && !allowBlocked) throw new Error(status.error || 'Native storage blocked');
    const wasRecovery = status.state === 'recovery';
    try {
      const previousLogs = snapshot.entries.mylifeos_daily_logs;
      accept(await NativeStorage.timers({ rearm }));
      if (snapshot.reminderError) window.dispatchEvent(new CustomEvent('mylifeos-reminder-error', { detail: snapshot.reminderError }));
      if (snapshot.entries.mylifeos_daily_logs !== previousLogs) window.dispatchEvent(new Event('mylifeos-storage-restored'));
      if (snapshot.entries.mylifeos_daily_logs !== previousLogs) window.dispatchEvent(new Event('mylifeos-focus-completed'));
      return snapshot.sessions;
    } catch (error) {
      candidate = candidate || { ...snapshot.entries };
      publish({ state: wasRecovery ? 'recovery' : 'error', hasPending: true, error: message(error) }); throw error;
    }
  });
}

export async function stopNativeForRecovery(): Promise<void> {
  return enqueue(async () => {
    const result = await NativeStorage.stopForRecovery();
    if ('revision' in result) accept(result);
    timerCandidate = null;
  });
}
