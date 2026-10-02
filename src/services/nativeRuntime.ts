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
  timer(options: { action: 'start' | 'toggle' | 'stop' | 'complete'; timerId: string; data?: PomodoroTimerData }): Promise<NativeSnapshot>;
  timers(options?: { rearm: boolean }): Promise<NativeSnapshot>;
  saveDocument(options: { content: string; filename: string }): Promise<{ canceled: boolean; uri?: string }>;
}

export const NativeStorage = registerPlugin<NativeStoragePlugin>('NativeStorage');
let snapshot: NativeSnapshot = { revision: 0, entries: {}, sessions: [] };
let draft: Record<string, string> = {};
let candidate: Record<string, string> | null = null;
let queue: Promise<void> = Promise.resolve();
let status: StorageStatus = { state: 'saving', hasPending: false };
const listeners = new Set<(status: StorageStatus) => void>();
let initialized = false;
const publish = (next: StorageStatus) => { status = next; listeners.forEach(listener => listener(next)); };
const blocked = () => status.state === 'error' || status.state === 'recovery';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function accept(next: NativeSnapshot) {
  if (!next || !Number.isInteger(next.revision) || !next.entries || !Array.isArray(next.sessions)) throw new Error('Invalid native snapshot');
  snapshot = next;
}

export async function bootstrapNativeStorage(keys: readonly string[]): Promise<void> {
  const legacy: Record<string, string> = {};
  const dirty: string[] = [];
  try {
    const raw = localStorage.getItem('mylifeos_business_snapshot');
    const browser = raw ? JSON.parse(raw) : {};
    keys.forEach(key => {
      const value = browser[key] ?? localStorage.getItem(key);
      if (typeof value === 'string') legacy[key] = value;
      if (localStorage.getItem(`mylifeos_native_dirty:${key}`) !== null) dirty.push(key);
    });
    accept(await NativeStorage.load({ legacy, dirty }));
    if (snapshot.reminderError) window.dispatchEvent(new CustomEvent('mylifeos-reminder-error', { detail: snapshot.reminderError }));
    draft = { ...snapshot.entries };
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
export const subscribeNativeStatus = (listener: (status: StorageStatus) => void) => {
  listeners.add(listener); listener(status);
  return () => { listeners.delete(listener); };
};

export function setNativeItem(key: string, value: string): Promise<void> {
  if (blocked()) throw new Error('Storage is read-only until retry or recovery succeeds');
  draft = { ...draft, [key]: value };
  candidate = { ...draft };
  publish({ state: 'saving', hasPending: true });
  const operation = queue.then(async () => {
    if (blocked()) throw new Error(status.error || 'Native storage blocked');
    try {
      accept(await NativeStorage.write({ entries: { [key]: value }, expectedRevision: snapshot.revision }));
    } catch (error) {
      publish({ state: 'error', hasPending: true, error: message(error) });
      throw error;
    }
  });
  // The queue remains drainable; the state carries failures to synchronous
  // repository callers and flushNativeWrites rejects until recovery succeeds.
  queue = operation.catch(() => undefined);
  queue.then(() => {
    if (queue === tail && !blocked()) {
      draft = { ...snapshot.entries }; candidate = null;
      publish({ state: 'saved', hasPending: false });
    }
  });
  const tail = queue;
  void operation.catch(() => undefined);
  return operation;
}

export async function flushNativeWrites(): Promise<void> {
  await queue;
  if (blocked()) throw new Error(status.error || 'Native storage blocked');
}

export async function commitNativeEntries(entries: Record<string, string>, recover = false): Promise<void> {
  await queue;
  if (!recover) await flushNativeWrites();
  candidate = { ...snapshot.entries, ...entries };
  publish({ state: recover ? 'recovery' : 'saving', hasPending: true });
  try {
    accept(await NativeStorage.write({ entries, expectedRevision: snapshot.revision, replace: true, recover }));
    draft = { ...snapshot.entries }; candidate = null;
    publish({ state: 'saved', hasPending: false });
  } catch (error) {
    publish({ state: recover ? 'recovery' : 'error', hasPending: true, error: message(error) });
    throw error;
  }
}

export async function retryNativeWrites(): Promise<void> {
  await queue;
  if (status.state === 'recovery') throw new Error('Choose a validated backup to recover unreadable data');
  const pending = candidate || draft;
  publish({ state: 'saving', hasPending: true });
  try {
    accept(await NativeStorage.load({}));
    accept(await NativeStorage.write({ entries: pending, expectedRevision: snapshot.revision }));
    draft = { ...snapshot.entries }; candidate = null;
    publish({ state: 'saved', hasPending: false });
  } catch (error) {
    publish({ state: 'error', hasPending: true, error: message(error) }); throw error;
  }
}

export async function nativeTimerOperation(action: 'start' | 'toggle' | 'stop' | 'complete', timerId: string, data?: PomodoroTimerData): Promise<NativeSession[]> {
  const operation = queue.then(async () => {
    if (blocked() && action !== 'stop') throw new Error(status.error || 'Native storage blocked');
    try {
    const next = await NativeStorage.timer({ action, timerId, data });
    accept(next);
    if (!blocked()) draft = { ...snapshot.entries };
    window.dispatchEvent(new Event('mylifeos-storage-restored'));
    if (next.reminderError) window.dispatchEvent(new CustomEvent('mylifeos-reminder-error', { detail: next.reminderError }));
    return next.sessions;
    } catch (error) {
    candidate = candidate || { ...snapshot.entries };
    publish({ state: 'error', hasPending: true, error: message(error) });
    throw error;
    }
  });
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function refreshNativeTimers(allowBlocked = false, rearm = false): Promise<NativeSession[]> {
  const operation = queue.then(async () => {
    if (!initialized) throw new Error('Native storage is still initializing');
    if (blocked() && !allowBlocked) throw new Error(status.error || 'Native storage blocked');
    try {
    const previousLogs = snapshot.entries.mylifeos_daily_logs;
    accept(await NativeStorage.timers({ rearm }));
    if (snapshot.reminderError) window.dispatchEvent(new CustomEvent('mylifeos-reminder-error', { detail: snapshot.reminderError }));
    if (!blocked()) draft = { ...snapshot.entries };
    if (snapshot.entries.mylifeos_daily_logs !== previousLogs) window.dispatchEvent(new Event('mylifeos-storage-restored'));
    if (snapshot.entries.mylifeos_daily_logs !== previousLogs) window.dispatchEvent(new Event('mylifeos-focus-completed'));
    return snapshot.sessions;
    } catch (error) {
    candidate = candidate || { ...snapshot.entries };
    publish({ state: 'error', hasPending: true, error: message(error) }); throw error;
    }
  });
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}
