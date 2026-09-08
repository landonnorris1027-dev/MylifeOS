import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import type { PomodoroTimerData, PomodoroUpdateData } from './electronIPC';

const STORAGE_KEY = 'mylifeos_native_pomodoro_timers';
const NOTIFICATION_CHANNEL_ID = 'mylifeos-focus';
const TICK_INTERVAL_MS = 250;

interface NativeTimerState extends PomodoroTimerData {
  endTime: number;
  remaining: number;
  isActive: boolean;
  notificationId: number;
}

type TimerUpdateListener = (data: PomodoroUpdateData) => void;

function notificationIdFor(timerId: string): number {
  let hash = 0;
  for (let index = 0; index < timerId.length; index += 1) {
    hash = (Math.imul(31, hash) + timerId.charCodeAt(index)) | 0;
  }
  return Math.max(1, hash & 0x7fffffff);
}

function isStoredTimer(value: unknown): value is NativeTimerState {
  if (!value || typeof value !== 'object') return false;
  const timer = value as Partial<NativeTimerState>;
  return (
    typeof timer.timerId === 'string' &&
    timer.timerId.length > 0 &&
    typeof timer.duration === 'number' &&
    timer.duration > 0 &&
    typeof timer.endTime === 'number' &&
    Number.isFinite(timer.endTime) &&
    typeof timer.remaining === 'number' &&
    Number.isFinite(timer.remaining) &&
    typeof timer.isActive === 'boolean' &&
    typeof timer.isFocusMode === 'boolean' &&
    typeof timer.notificationId === 'number'
  );
}

export class NativePomodoroManager {
  private timers = new Map<string, NativeTimerState>();
  private loadPromise: Promise<void> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private appStateListener: Promise<PluginListenerHandle>;
  private channelReady: Promise<void> | null = null;
  private updateConsumerAvailable = false;

  constructor(private readonly onUpdate: TimerUpdateListener) {
    this.appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void this.reconcileTimers();
      }
    });
  }

  async start(timerData: PomodoroTimerData): Promise<PomodoroUpdateData> {
    await this.ensureLoaded();
    const existing = this.timers.get(timerData.timerId);
    if (existing) await this.cancelNotification(existing.notificationId);

    const durationMs = timerData.duration * 1000;
    const timer: NativeTimerState = {
      ...timerData,
      notificationsEnabled: timerData.notificationsEnabled !== false,
      endTime: Date.now() + durationMs,
      remaining: durationMs,
      isActive: true,
      notificationId: notificationIdFor(timerData.timerId),
    };

    this.timers.set(timer.timerId, timer);
    await this.persist();
    await this.scheduleNotification(timer);
    this.ensureTicker();

    const update = this.toUpdate(timer, false);
    this.onUpdate(update);
    return update;
  }

  async toggle(timerId: string): Promise<void> {
    await this.ensureLoaded();
    const timer = this.timers.get(timerId);
    if (!timer) return;

    if (timer.isActive) {
      timer.remaining = Math.max(0, timer.endTime - Date.now());
      timer.isActive = false;
      await this.cancelNotification(timer.notificationId);
    } else if (timer.remaining > 0) {
      timer.endTime = Date.now() + timer.remaining;
      timer.isActive = true;
      await this.scheduleNotification(timer);
    }

    await this.persist();
    this.ensureTicker();
    this.onUpdate(this.toUpdate(timer, timer.remaining <= 0));
  }

  async stop(timerId: string): Promise<void> {
    await this.ensureLoaded();
    const timer = this.timers.get(timerId);
    if (!timer) return;

    this.timers.delete(timerId);
    await Promise.all([this.persist(), this.cancelNotification(timer.notificationId)]);
    this.stopTickerIfIdle();
    this.onUpdate({
      timerId,
      duration: 0,
      remaining: 0,
      endTime: Date.now(),
      elapsed: 0,
      isFinished: false,
      isActive: false,
      stopped: true,
    });
  }

  async getActiveTimers(): Promise<PomodoroUpdateData[]> {
    await this.ensureLoaded();
    this.refreshRemaining();
    this.ensureTicker();

    // An expired timer is deliberately returned once. This lets the restored UI
    // mount before the ticker emits its completion event and starts the break.
    return Array.from(this.timers.values()).map((timer) => this.toUpdate(timer, false));
  }

  setUpdateConsumerAvailable(available: boolean): void {
    this.updateConsumerAvailable = available;
    if (available) {
      void this.reconcileTimers();
    } else {
      this.clearTicker();
    }
  }

  async dispose(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    const listener = await this.appStateListener;
    await listener.remove();
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const { value } = await Preferences.get({ key: STORAGE_KEY });
          const parsed: unknown = value ? JSON.parse(value) : [];
          if (!Array.isArray(parsed)) return;
          parsed.filter(isStoredTimer).forEach((timer) => this.timers.set(timer.timerId, timer));
        } catch (error) {
          console.warn('Failed to restore native Pomodoro timers:', error);
        }
      })();
    }
    await this.loadPromise;
  }

  private ensureTicker(): void {
    if (
      !this.updateConsumerAvailable ||
      this.intervalId ||
      !Array.from(this.timers.values()).some((timer) => timer.isActive)
    ) return;
    this.intervalId = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
  }

  private clearTicker(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private stopTickerIfIdle(): void {
    if (Array.from(this.timers.values()).some((timer) => timer.isActive)) return;
    this.clearTicker();
  }

  private refreshRemaining(): void {
    const now = Date.now();
    this.timers.forEach((timer) => {
      if (timer.isActive) timer.remaining = Math.max(0, timer.endTime - now);
    });
  }

  private async reconcileTimers(): Promise<void> {
    await this.ensureLoaded();
    if (!this.updateConsumerAvailable) {
      this.refreshRemaining();
      return;
    }
    await this.tick();
    this.ensureTicker();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const finished: NativeTimerState[] = [];

    this.timers.forEach((timer) => {
      if (!timer.isActive) return;
      timer.remaining = Math.max(0, timer.endTime - now);
      const isFinished = timer.remaining <= 0;
      this.onUpdate(this.toUpdate(timer, isFinished));
      if (isFinished) finished.push(timer);
    });

    if (finished.length > 0) {
      finished.forEach((timer) => this.timers.delete(timer.timerId));
      await this.persist();
    }
    this.stopTickerIfIdle();
  }

  private toUpdate(timer: NativeTimerState, isFinished: boolean): PomodoroUpdateData {
    return {
      timerId: timer.timerId,
      duration: timer.duration,
      remaining: timer.remaining,
      endTime: timer.endTime,
      elapsed: Math.max(0, timer.duration * 1000 - timer.remaining),
      isFinished,
      isActive: timer.isActive,
      isFocusMode: timer.isFocusMode,
      notificationsEnabled: timer.notificationsEnabled !== false,
      breakDurationSeconds: timer.breakDurationSeconds || null,
      taskId: timer.taskId || null,
      taskHabitId: timer.taskHabitId || null,
      taskName: timer.taskName || null,
      taskDate: timer.taskDate || null,
      taskPriority: timer.taskPriority || null,
      taskDurationMinutes: timer.taskDurationMinutes || null,
      notificationMessages: timer.notificationMessages || null,
    };
  }

  private async persist(): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify(Array.from(this.timers.values())),
      });
    } catch (error) {
      console.warn('Failed to persist native Pomodoro timers:', error);
    }
  }

  private async prepareNotificationChannel(): Promise<void> {
    if (!this.channelReady) {
      const request = LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: 'Focus timer',
        description: 'Focus and break completion alerts',
        importance: 4,
        visibility: 1,
        vibration: true,
      }).then(() => undefined);
      this.channelReady = request;
      request.catch(() => {
        if (this.channelReady === request) this.channelReady = null;
      });
    }
    await this.channelReady;
  }

  private async scheduleNotification(timer: NativeTimerState): Promise<void> {
    if (timer.notificationsEnabled === false || timer.remaining <= 0) return;
    try {
      await this.prepareNotificationChannel();
      const messages = timer.notificationMessages;
      const title = timer.isFocusMode
        ? messages?.focusCompleteTitle || 'Focus complete'
        : messages?.breakFinishedTitle || 'Break finished';
      const body = timer.isFocusMode
        ? messages?.focusCompleteBody || 'Time for a short break.'
        : messages?.breakFinishedBody || 'Ready for the next focus session?';

      await LocalNotifications.schedule({
        notifications: [{
          id: timer.notificationId,
          title,
          body,
          channelId: NOTIFICATION_CHANNEL_ID,
          smallIcon: 'ic_mylifeos_foreground',
          iconColor: '#FF2F78',
          schedule: { at: new Date(timer.endTime), allowWhileIdle: true },
          isExactNotification: true,
          isExactMandatory: false,
        }],
      });
    } catch (error) {
      // Timing remains correct from the persisted end time even when the user
      // declines notification or exact-alarm permission.
      console.warn('Failed to schedule Pomodoro notification:', error);
    }
  }

  private async cancelNotification(notificationId: number): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
    } catch (error) {
      console.warn('Failed to cancel Pomodoro notification:', error);
    }
  }
}
