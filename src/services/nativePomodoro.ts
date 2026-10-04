import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { nativeTimerOperation, refreshNativeTimers, NativeSession, isNativeStorageReady } from './nativeRuntime';
import type { PomodoroTimerData, PomodoroUpdateData } from './electronIPC';

const update = (session: NativeSession): PomodoroUpdateData => ({
  ...session,
  remaining: session.isActive ? Math.max(0, session.endTime - Date.now()) : session.remaining,
  elapsed: session.state === 'completed' && session.actualFocusMinutes !== undefined
    ? session.actualFocusMinutes * 60000 : Math.max(0, session.duration * 1000 - (session.isActive ? Math.max(0, session.endTime - Date.now()) : session.remaining)),
  isFinished: session.state === 'completed',
  suppressCompletionAlert: true,
  completionPersisted: session.state === 'completed' && session.isFocusMode,
});

/** The native store owns timing/completion; this class only refreshes visible UI. */
export class NativePomodoroManager {
  private interval: ReturnType<typeof setInterval> | null = null;
  private active = true;
  private refreshing = false;
  private finished = new Set<string>();
  private listener: Promise<PluginListenerHandle>;
  constructor(private readonly onUpdate: (data: PomodoroUpdateData) => void) {
    this.listener = App.addListener('appStateChange', ({ isActive }) => {
      this.active = isActive;
      if (isActive) { this.ensureTicker(); void this.refresh(true).catch(() => undefined); }
      else this.clearTicker();
    });
    this.ensureTicker();
  }
  private notify(sessions: NativeSession[]) {
    sessions.forEach(session => {
      if (session.state === 'completed') {
        if (this.finished.has(session.timerId)) return;
        this.finished.add(session.timerId);
      }
      this.onUpdate(update(session));
    });
  }
  private ensureTicker() {
    if (!this.active || this.interval) return;
    this.interval = setInterval(() => { void this.refresh().catch(() => undefined); }, 1000);
  }
  private clearTicker() { if (this.interval) clearInterval(this.interval); this.interval = null; }
  private async refresh(rearm = false) {
    if (this.refreshing || !isNativeStorageReady()) return;
    this.refreshing = true;
    try { this.notify(await refreshNativeTimers(false, rearm)); } finally { this.refreshing = false; }
  }
  async start(data: PomodoroTimerData): Promise<PomodoroUpdateData> {
    if (data.notificationsEnabled !== false && this.active) {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
    }
    const sessions = await nativeTimerOperation('start', data.timerId, data);
    const session = sessions.find(value => value.timerId === data.timerId);
    if (!session) throw new Error('Native session was not persisted');
    this.finished.delete(data.timerId); this.ensureTicker(); this.onUpdate(update(session)); return update(session);
  }
  async toggle(timerId: string): Promise<void> { this.notify(await nativeTimerOperation('toggle', timerId)); }
  async complete(timerId: string): Promise<void> { this.notify(await nativeTimerOperation('complete', timerId)); }
  async stop(timerId: string): Promise<void> {
    await nativeTimerOperation('stop', timerId);
    this.onUpdate({ timerId, duration: 0, remaining: 0, endTime: Date.now(), elapsed: 0, isFinished: false, isActive: false, stopped: true });
  }
  async getActiveTimers(allowBlocked = false): Promise<PomodoroUpdateData[]> {
    const sessions = await refreshNativeTimers(allowBlocked); this.notify(sessions);
    return sessions.filter(session => session.state !== 'completed').map(update);
  }
  async dispose() { this.clearTicker(); (await this.listener).remove(); }
}
