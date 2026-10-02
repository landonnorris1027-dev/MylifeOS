import fs from 'fs';
import { randomUUID } from 'crypto';
import { AppDataStore } from './app-data-store';
import { readJsonWithBackup, writeTextAtomically } from './durable-file';
import { isPersistedTimerState } from './persisted-state-validation';
import { normalizePersistedTimerForRestore } from './electron-timer-restore';
import { FocusSession, FOCUS_SESSIONS_KEY, validateFocusSessions } from './focus-session';
import type { PomodoroTimerData, PomodoroRecoveryData, PomodoroRecoveryAction } from './types';
import type { StorageStatus } from './storage-contract';

export interface FocusTimer extends PomodoroTimerData {
  sessionId: string;
  startedAt: number;
  remaining: number;
  endTime: number;
  isActive: boolean;
  isFinished: boolean;
  completionPersisted?: boolean;
  actualFocusSeconds?: number;
  stopped?: boolean;
  elapsed: number;
}
interface FocusState {
  activeTimers: FocusTimer[];
  pendingRecoveries: PomodoroRecoveryData[];
  pendingCompletions: FocusSession[];
  completedChoices: FocusTimer[];
}
interface Options {
  filePath: string;
  store: AppDataStore;
  now?: () => number;
  onChange?: () => void;
  onUpdate?: (timer: FocusTimer) => void;
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const localDate = (timestamp: number) => {
  const d = new Date(timestamp);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
export function isFocusState(value: unknown): boolean {
  if (!isPersistedTimerState(value)) return false;
  if (Array.isArray(value)) return true;
  const state = value as Partial<FocusState>;
  try {
    if (state.pendingCompletions !== undefined) validateFocusSessions(state.pendingCompletions);
    return state.completedChoices === undefined || (Array.isArray(state.completedChoices)
      && state.completedChoices.every(t => t.completionPersisted === true && typeof t.timerId === 'string'));
  } catch { return false; }
}

/** Owns acknowledged timer transitions and the replayable completion outbox. */
export class DurableFocusRuntime {
  private state: FocusState = { activeTimers: [], pendingRecoveries: [], pendingCompletions: [], completedChoices: [] };
  private candidate: FocusState | null = null;
  private error: string | undefined;
  private recovery = false;
  private readonly now: () => number;
  constructor(private readonly options: Options) {
    this.now = options.now || Date.now;
    const result = readJsonWithBackup(options.filePath, fs, isFocusState);
    if (!result) {
      this.recovery = fs.existsSync(options.filePath) || fs.existsSync(options.filePath + '.bak');
      if (this.recovery) this.error = 'Timer state and backup are unreadable; preserve or restore timer state before continuing.';
      return;
    }
    const raw: Partial<FocusState> = Array.isArray(result.value) ? { activeTimers: result.value } : result.value as Partial<FocusState>;
    this.state.pendingRecoveries = copy(raw.pendingRecoveries || []);
    this.state.pendingCompletions = copy(raw.pendingCompletions || []);
    this.state.completedChoices = copy(raw.completedChoices || []);
    for (const old of raw.activeTimers || []) {
      const restore = normalizePersistedTimerForRestore(old, this.now());
      const t = { ...old, timerId: old.timerId || randomUUID(), sessionId: old.sessionId || randomUUID(),
        startedAt: old.startedAt || this.now(), ...restore, isFinished: false,
        elapsed: Math.max(0, old.duration * 1000 - restore.remaining) } as FocusTimer;
      if (restore.shouldRecover) {
        this.state.pendingRecoveries.push({ ...t, recoveryId: t.sessionId + '_recovery',
          mode: t.isFocusMode ? 'focus' : 'break', reason: 'expired_while_offline',
          originalDuration: t.duration, expiredAt: this.now() });
      } else this.state.activeTimers.push(t);
    }
    // Migration and replay happen explicitly after the main-process stores are ready.
  }
  initialize(): void {
    if (this.recovery) return;
    if (this.state.activeTimers.length || this.state.pendingRecoveries.length || this.state.pendingCompletions.length) {
      this.save(copy(this.state));
      this.replay();
    }
  }
  status(): StorageStatus {
    return { state: this.recovery ? 'recovery' : this.error ? 'error' : 'saved',
      hasPending: !!this.candidate || this.state.pendingCompletions.length > 0, error: this.error };
  }
  pending(): FocusState | null { return this.candidate ? copy(this.candidate) : this.state.pendingCompletions.length ? copy(this.state) : null; }
  active(): FocusTimer[] { return this.state.activeTimers.map(t => this.sample(t)); }
  recoveries(): PomodoroRecoveryData[] { return copy(this.state.pendingRecoveries); }
  completed(): FocusTimer[] { return copy(this.state.completedChoices); }
  private archiveUnreadableSources(): void {
    for (const source of [this.options.filePath, this.options.filePath + '.bak']) {
      if (!fs.existsSync(source)) continue;
      const archive = source + '.corrupt-' + randomUUID();
      fs.copyFileSync(source, archive);
      const descriptor = fs.openSync(archive, 'r+');
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    }
  }
  abandonForRestore(): void {
    // Explicit abandonment preserves every retry/replay input before clearing it.
    if (this.recovery) this.archiveUnreadableSources();
    const archive = this.options.filePath + '.abandoned-' + randomUUID();
    writeTextAtomically(archive, JSON.stringify(this.candidate || this.state), fs, isFocusState);
    this.save({ activeTimers: [], pendingRecoveries: [], pendingCompletions: [], completedChoices: [] });
    this.recovery = false;
    this.options.onChange?.();
  }
  prepareRestore(recover: boolean): void {
    if (this.blocksRestore()) throw new Error('End or resolve current sessions before restoring.');
    if (this.recovery) {
      if (!recover) throw new Error(this.error);
      this.archiveUnreadableSources();
    }
    const next = copy(this.state); next.completedChoices = [];
    this.save(next); this.recovery = false; this.options.onChange?.();
  }
  blocksRestore(): boolean { return this.state.activeTimers.length > 0 || this.state.pendingCompletions.length > 0 || this.state.pendingRecoveries.length > 0 || !!this.candidate; }
  private sample(t: FocusTimer): FocusTimer {
    const remaining = t.isActive ? Math.max(0, t.endTime - this.now()) : t.remaining;
    return { ...t, remaining, elapsed: Math.max(0, t.duration * 1000 - remaining) };
  }
  private freeze(state: FocusState): FocusState {
    return { ...state, activeTimers: state.activeTimers.map(t => ({ ...this.sample(t), isActive: false })) };
  }
  private save(next: FocusState): void {
    try {
      writeTextAtomically(this.options.filePath, JSON.stringify(next, null, 2), fs, isFocusState);
      this.state = next; this.candidate = null; this.error = undefined;
      this.options.onChange?.();
    } catch (e) {
      this.candidate = this.freeze(next);
      this.state = this.freeze(this.state);
      this.error = e instanceof Error ? e.message : String(e);
      this.options.onChange?.();
      throw new Error(this.error);
    }
  }
  private ensureWritable(): void {
    if (this.error || this.recovery || ['error', 'recovery'].includes(this.options.store.getStatus().state)) {
      throw new Error(this.error || 'Restore storage before changing a timer');
    }
  }
  start(data: PomodoroTimerData): FocusTimer {
    this.ensureWritable();
    if (!data || typeof data.timerId !== 'string' || !data.timerId || data.timerId.length > 240
      || !Number.isFinite(data.duration) || data.duration <= 0 || data.duration > 86400
      || typeof data.isFocusMode !== 'boolean') throw new Error('Invalid timer request');
    const existing = this.state.activeTimers.find(t => t.timerId === data.timerId);
    if (existing) return this.sample(existing);
    const t: FocusTimer = { ...copy(data), sessionId: randomUUID(), startedAt: this.now(),
      remaining: data.duration * 1000, endTime: this.now() + data.duration * 1000,
      isActive: true, isFinished: false, elapsed: 0 };
    const next = copy(this.state);
    next.activeTimers.push(t);
    next.completedChoices = next.completedChoices.filter(c => data.timerId !== c.timerId + '_break');
    this.save(next);
    this.options.onUpdate?.(t);
    return copy(t);
  }
  toggle(timerId: string): FocusTimer | undefined {
    this.ensureWritable();
    const next = copy(this.state), t = next.activeTimers.find(v => v.timerId === timerId);
    if (!t) return undefined;
    Object.assign(t, this.sample(t));
    t.isActive = !t.isActive;
    if (t.isActive) t.endTime = this.now() + t.remaining;
    this.save(next); this.options.onUpdate?.(copy(t)); return copy(t);
  }
  private session(t: FocusTimer, result: FocusSession['result']): FocusSession {
    const entries = this.options.store.snapshot();
    const logs = JSON.parse(entries.mylifeos_daily_logs || '{}');
    const task = logs[t.taskDate || '']?.tasks?.find((v: { id: string }) => v.id === t.taskId);
    return { id: t.sessionId, timerId: t.timerId, taskId: t.taskId || null,
      taskDate: t.taskDate || localDate(t.startedAt), taskName: t.taskName || null,
      taskHabitId: t.taskHabitId, goalId: task?.goalId,
      priority: t.taskPriority, notificationsEnabled: t.notificationsEnabled, plannedSeconds: t.duration,
      actualFocusSeconds: Math.min(t.duration, Math.max(0, this.sample(t).elapsed / 1000)),
      startedAt: t.startedAt, endedAt: Math.max(t.startedAt, this.now()), result, measurement: 'measured' };
  }
  complete(timerId: string, result: FocusSession['result'] = 'completed'): FocusTimer | undefined {
    this.ensureWritable();
    const t = this.state.activeTimers.find(v => v.timerId === timerId);
    if (!t) return this.state.completedChoices.find(v => v.timerId === timerId);
    const next = copy(this.state);
    next.activeTimers = next.activeTimers.filter(v => v.timerId !== timerId);
    if (t.isFocusMode) next.pendingCompletions.push(this.session(t, result));
    if (!t.isFocusMode) {
      this.save(next);
      const finished = { ...t, remaining: 0, isActive: false, isFinished: true };
      this.options.onUpdate?.(finished); return finished;
    }
    this.save(next);
    this.replay();
    return this.state.completedChoices.find(v => v.timerId === timerId);
  }
  stop(timerId: string): void {
    const active = this.state.activeTimers.find(t => t.timerId === timerId);
    if (active?.isFocusMode) { this.complete(timerId, 'stopped'); return; }
    this.ensureWritable();
    const next = copy(this.state);
    next.activeTimers = next.activeTimers.filter(t => t.timerId !== timerId);
    next.completedChoices = next.completedChoices.filter(t => t.timerId !== timerId);
    this.save(next);
    if (active) this.options.onUpdate?.({ ...this.sample(active), isActive: false, isFinished: false, stopped: true });
  }
  replay(): void {
    for (const session of [...this.state.pendingCompletions]) {
      const entries = this.options.store.snapshot();
      const sessions = validateFocusSessions(JSON.parse(entries[FOCUS_SESSIONS_KEY] || '[]'));
      if (!sessions.some(s => s.id === session.id)) {
        const logs = JSON.parse(entries.mylifeos_daily_logs || '{}');
        const task = logs[session.taskDate]?.tasks?.find((t: { id: string }) => t.id === session.taskId);
        if (task && session.result === 'completed') {
          task.status = 'completed';
          task.actualFocusMinutes = Math.max(1, Math.round(session.actualFocusSeconds / 60));
        }
        const committed = this.options.store.commit({
          ...entries, mylifeos_daily_logs: JSON.stringify(logs),
          [FOCUS_SESSIONS_KEY]: JSON.stringify([...sessions, session]),
        });
        if (!committed.ok) {
          this.error = committed.error || 'Focus completion could not be saved';
          this.options.onChange?.(); throw new Error(this.error);
        }
      }
      const next = copy(this.state);
      next.pendingCompletions = next.pendingCompletions.filter(s => s.id !== session.id);
      const finished: FocusTimer = { timerId: session.timerId, sessionId: session.id,
        duration: session.plannedSeconds, isFocusMode: true, remaining: 0, endTime: session.endedAt,
        startedAt: session.startedAt, elapsed: session.actualFocusSeconds * 1000,
        actualFocusSeconds: session.actualFocusSeconds, isActive: false,
        isFinished: session.result === 'completed', stopped: session.result === 'stopped',
        completionPersisted: true, notificationsEnabled: session.notificationsEnabled, taskId: session.taskId || undefined,
        taskDate: session.taskDate, taskName: session.taskName || undefined,
        taskHabitId: session.taskHabitId || undefined, taskPriority: session.priority,
        taskDurationMinutes: Math.max(1, Math.round(session.plannedSeconds / 60)) };
      if (session.result === 'completed') {
        next.completedChoices = [...next.completedChoices.filter(t => t.sessionId !== session.id), finished].slice(-10);
      }
      this.save(next);
      this.options.onUpdate?.(finished);
    }
  }
  retry(): void {
    if (this.recovery) throw new Error(this.error);
    if (this.candidate) this.save(copy(this.candidate));
    const result = this.options.store.flush();
    if (!result.ok) throw new Error(result.error);
    this.error = undefined;
    this.replay(); this.options.onChange?.();
  }
  pauseForStorageFailure(): void {
    if (!this.state.activeTimers.some(t => t.isActive)) return;
    try { this.save(this.freeze(copy(this.state))); } catch { /* Candidate retained by save. */ }
    this.state.activeTimers.forEach(t => this.options.onUpdate?.(copy(t)));
  }
  tick(): void {
    if (this.error || this.recovery) return;
    for (const t of [...this.state.activeTimers]) {
      if (!t.isActive) continue;
      if (this.sample(t).remaining <= 0) {
        try { this.complete(t.timerId); } catch { /* Retry/export is available through storage status. */ }
      } else this.options.onUpdate?.(this.sample(t));
    }
  }
  resolve(recoveryId: string, action: PomodoroRecoveryAction | 'complete'): { ok: boolean; resumedTimer?: FocusTimer } {
    this.ensureWritable();
    const recovery = this.state.pendingRecoveries.find(r => r.recoveryId === recoveryId);
    if (!recovery) return { ok: false };
    if ((action === 'complete' || action === 'resume-break') && recovery.mode === 'focus') {
      const entries = this.options.store.snapshot();
      const sessions = validateFocusSessions(JSON.parse(entries[FOCUS_SESSIONS_KEY] || '[]'));
      if (!sessions.some(s => s.id === recovery.recoveryId)) {
        const next = copy(this.state);
        const estimated: FocusTimer = { ...recovery, timerId: recovery.timerId,
          sessionId: recovery.recoveryId, duration: recovery.originalDuration || (recovery.taskDurationMinutes || 1) * 60,
          startedAt: recovery.expiredAt || this.now(), remaining: 0, endTime: this.now(),
          isFocusMode: true, isActive: false, isFinished: true, elapsed: 0 } as FocusTimer;
        if (!next.pendingCompletions.some(s => s.id === recovery.recoveryId)) {
          next.pendingCompletions.push({ ...this.session(estimated, 'completed'),
            actualFocusSeconds: estimated.duration, measurement: 'estimated' });
        }
        this.save(next);
        this.replay();
      }
    }
    // Consume recovery only in the same durable write as the resulting state.
    const next = copy(this.state);
    next.pendingRecoveries = next.pendingRecoveries.filter(r => r.recoveryId !== recoveryId);
    let resumedTimer: FocusTimer | undefined;
    if (action === 'resume-break' || action === 'restart-break') {
      const duration = recovery.breakDurationSeconds || 300;
      resumedTimer = { timerId: recovery.timerId.replace(/_break$/, '') + '_break',
        sessionId: randomUUID(), startedAt: this.now(), duration, isFocusMode: false,
        remaining: duration * 1000, endTime: this.now() + duration * 1000,
        isActive: true, isFinished: false, elapsed: 0,
        taskId: recovery.taskId || undefined, taskDate: recovery.taskDate || undefined,
        taskName: recovery.taskName || undefined, taskPriority: recovery.taskPriority as FocusTimer['taskPriority'] || undefined,
        taskDurationMinutes: recovery.taskDurationMinutes || undefined,
        notificationsEnabled: recovery.notificationsEnabled };
      next.activeTimers.push(resumedTimer);
      next.completedChoices = next.completedChoices.filter(t => t.timerId !== recovery.timerId);
    }
    this.save(next);
    if (resumedTimer) this.options.onUpdate?.(resumedTimer);
    return { ok: true, resumedTimer };
  }
}
