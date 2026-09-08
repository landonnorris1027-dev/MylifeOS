import type { Priority } from '../types';

export interface PomodoroTimerData {
  timerId: string;
  duration: number;
  isFocusMode: boolean;
  notificationsEnabled?: boolean;
  breakDurationSeconds?: number;
  taskId?: string;
  taskHabitId?: string;
  taskName?: string;
  taskDate?: string;
  taskPriority?: Priority;
  taskDurationMinutes?: number;
  notificationMessages?: PomodoroNotificationMessages;
}

export interface PomodoroNotificationMessages {
  focusCompleteTitle: string;
  focusCompleteBody: string;
  breakFinishedTitle: string;
  breakFinishedBody: string;
}

export interface PomodoroUpdateData {
  timerId: string;
  duration: number;
  remaining: number;
  endTime: number;
  elapsed: number;
  isFinished: boolean;
  isActive?: boolean;
  stopped?: boolean;
  isFocusMode?: boolean;
  notificationsEnabled?: boolean;
  breakDurationSeconds?: number | null;
  taskId?: string | null;
  taskHabitId?: string | null;
  taskName?: string | null;
  taskDate?: string | null;
  taskPriority?: string | null;
  taskDurationMinutes?: number | null;
  notificationMessages?: PomodoroNotificationMessages | null;
}

export interface PomodoroRecoveryData {
  recoveryId: string;
  timerId: string;
  reason: string;
  mode: 'focus' | 'break';
  taskId?: string | null;
  taskHabitId?: string | null;
  taskName?: string | null;
  taskDate?: string | null;
  taskPriority?: string | null;
  taskDurationMinutes?: number | null;
  notificationMessages?: PomodoroNotificationMessages | null;
  originalDuration?: number;
  remaining?: number;
  expiredAt?: number;
}

export type PomodoroRecoveryAction = 'resume-break' | 'restart-break' | 'dismiss';

export interface PomodoroRecoveryResolution {
  ok: boolean;
  resumedTimer?: PomodoroUpdateData;
}
interface BrowserTimer {
  timerId: string;
  endTime: number;
  remaining: number;
  isActive: boolean;
  duration: number;
  intervalId: ReturnType<typeof setInterval> | null;
  isFocusMode: boolean;
  notificationsEnabled: boolean;
  breakDurationSeconds?: number | null;
  taskId?: string | null;
  taskHabitId?: string | null;
  taskName?: string | null;
  taskDate?: string | null;
  taskPriority?: Priority | null;
  taskDurationMinutes?: number | null;
  notificationMessages?: PomodoroNotificationMessages | null;
}

class ElectronIPCHandler {
  private isElectron: boolean;
  private browserTimers: Map<string, BrowserTimer> = new Map();
  private updateCallbacks: Set<(data: PomodoroUpdateData) => void> = new Set();

  constructor() {
    this.isElectron = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';

    if (this.isElectron) {
      try {
        window.electronAPI?.on('pomodoro-update', (data: PomodoroUpdateData) => {
          this.notifySubscribers(data);
        });
      } catch (e) {
        console.error('Failed to register IPC listener', e);
      }
    }
  }

  async startPomodoro(timerData: PomodoroTimerData): Promise<PomodoroUpdateData> {
    if (this.isElectron) {
      try {
        return await window.electronAPI!.invoke('pomodoro-start', timerData);
      } catch (e) {
        console.warn('IPC start failed, falling back to browser timer:', e);
      }
    }

    return this.startBrowserTimer(timerData);
  }

  private startBrowserTimer(timerData: PomodoroTimerData): PomodoroUpdateData {
    if (this.browserTimers.has(timerData.timerId)) {
      this.stopBrowserTimer(timerData.timerId);
    }

    const durationMs = timerData.duration * 1000;
    const timer: BrowserTimer = {
      timerId: timerData.timerId,
      duration: timerData.duration,
      remaining: durationMs,
      endTime: Date.now() + durationMs,
      isActive: true,
      intervalId: null,
      isFocusMode: timerData.isFocusMode,
      notificationsEnabled: timerData.notificationsEnabled !== false,
      breakDurationSeconds: timerData.breakDurationSeconds || null,
      taskId: timerData.taskId || null,
      taskHabitId: timerData.taskHabitId || null,
      taskName: timerData.taskName || null,
      taskDate: timerData.taskDate || null,
      taskPriority: timerData.taskPriority || null,
      taskDurationMinutes: timerData.taskDurationMinutes || null,
      notificationMessages: timerData.notificationMessages || null,
    };

    timer.intervalId = setInterval(() => {
      if (!timer.isActive) return;

      const realRemaining = Math.max(0, timer.endTime - Date.now());
      timer.remaining = realRemaining;

      const updateData: PomodoroUpdateData = {
        timerId: timer.timerId,
        duration: timer.duration,
        remaining: realRemaining,
        endTime: timer.endTime,
        elapsed: timer.duration * 1000 - realRemaining,
        isFinished: realRemaining <= 0,
        isActive: true,
        isFocusMode: timer.isFocusMode,
        notificationsEnabled: timer.notificationsEnabled,
        breakDurationSeconds: timer.breakDurationSeconds || null,
        taskId: timerData.taskId || null,
        taskHabitId: timerData.taskHabitId || null,
        taskName: timerData.taskName || null,
        taskDate: timerData.taskDate || null,
        taskPriority: timerData.taskPriority || null,
        taskDurationMinutes: timerData.taskDurationMinutes || null,
        notificationMessages: timerData.notificationMessages || null,
      };

      this.notifySubscribers(updateData);

      if (realRemaining <= 0) {
        this.stopBrowserTimer(timer.timerId);
      }
    }, 200);

    this.browserTimers.set(timerData.timerId, timer);

    const payload: PomodoroUpdateData = {
      timerId: timer.timerId,
      duration: timer.duration,
      remaining: timer.remaining,
      endTime: timer.endTime,
      elapsed: 0,
      isFinished: false,
      isActive: true,
      isFocusMode: timer.isFocusMode,
      notificationsEnabled: timer.notificationsEnabled,
      breakDurationSeconds: timer.breakDurationSeconds || null,
      taskId: timerData.taskId || null,
      taskHabitId: timerData.taskHabitId || null,
      taskName: timerData.taskName || null,
      taskDate: timerData.taskDate || null,
      taskPriority: timerData.taskPriority || null,
      taskDurationMinutes: timerData.taskDurationMinutes || null,
      notificationMessages: timerData.notificationMessages || null,
    };

    this.notifySubscribers(payload);
    return payload;
  }

  togglePomodoro(timerId: string): void {
    if (this.isElectron) {
      window.electronAPI?.send('pomodoro-toggle', { timerId });
      return;
    }

    const timer = this.browserTimers.get(timerId);
    if (!timer) return;

    timer.isActive = !timer.isActive;

    if (timer.isActive) {
      timer.endTime = Date.now() + timer.remaining;
    } else {
      timer.remaining = Math.max(0, timer.endTime - Date.now());
    }

    this.notifySubscribers({
      timerId,
      duration: timer.duration,
      remaining: timer.remaining,
      endTime: timer.endTime,
      elapsed: timer.duration * 1000 - timer.remaining,
      isFinished: timer.remaining <= 0,
      isActive: timer.isActive,
      isFocusMode: timer.isFocusMode,
      notificationsEnabled: timer.notificationsEnabled,
      breakDurationSeconds: timer.breakDurationSeconds || null,
      taskId: timer.taskId || null,
      taskHabitId: timer.taskHabitId || null,
      taskName: timer.taskName || null,
      taskDate: timer.taskDate || null,
      taskPriority: timer.taskPriority || null,
      taskDurationMinutes: timer.taskDurationMinutes || null,
      notificationMessages: timer.notificationMessages || null,
    });
  }

  stopPomodoro(timerId: string): void {
    if (this.isElectron) {
      window.electronAPI?.send('pomodoro-stop', { timerId });
      return;
    }

    this.stopBrowserTimer(timerId);
    this.notifySubscribers({
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

  private stopBrowserTimer(timerId: string) {
    const timer = this.browserTimers.get(timerId);
    if (timer?.intervalId) {
      clearInterval(timer.intervalId);
      this.browserTimers.delete(timerId);
    }
  }

  private notifySubscribers(data: PomodoroUpdateData) {
    this.updateCallbacks.forEach((callback) => callback(data));
  }

  async getActiveTimers(): Promise<PomodoroUpdateData[]> {
    if (this.isElectron) {
      try {
        const mainProcessTimers = await window.electronAPI?.invoke('pomodoro-get-active-timers');
        return Array.isArray(mainProcessTimers) ? mainProcessTimers : [];
      } catch (e) {
        console.warn('Failed to get active timers from main process:', e);
      }
    }

    return Array.from(this.browserTimers.values()).map((t) => ({
      timerId: t.timerId,
      duration: t.duration,
      remaining: t.remaining,
      endTime: t.endTime,
      elapsed: t.duration * 1000 - t.remaining,
      isFinished: false,
      isActive: t.isActive,
      isFocusMode: t.isFocusMode,
      notificationsEnabled: t.notificationsEnabled,
      breakDurationSeconds: t.breakDurationSeconds || null,
      taskId: t.taskId || null,
      taskHabitId: t.taskHabitId || null,
      taskName: t.taskName || null,
      taskDate: t.taskDate || null,
      taskPriority: t.taskPriority || null,
      taskDurationMinutes: t.taskDurationMinutes || null,
      notificationMessages: t.notificationMessages || null,
    }));
  }

  async getPendingRecoveries(): Promise<PomodoroRecoveryData[]> {
    if (!this.isElectron) return [];

    try {
      const recoveries = await window.electronAPI?.invoke('pomodoro-get-pending-recoveries');
      return Array.isArray(recoveries) ? recoveries : [];
    } catch (e) {
      console.warn('Failed to get pending recoveries:', e);
      return [];
    }
  }

  async resolveRecovery(recoveryId: string, action: PomodoroRecoveryAction): Promise<PomodoroRecoveryResolution> {
    if (!this.isElectron) {
      return { ok: true };
    }

    try {
      return await window.electronAPI!.invoke('pomodoro-resolve-recovery', { recoveryId, action });
    } catch (e) {
      console.warn('Failed to resolve recovery:', e);
      return { ok: false };
    }
  }

  onPomodoroUpdate(callback: (data: PomodoroUpdateData) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  getIsElectron(): boolean {
    return this.isElectron;
  }
}

export const electronIPC = new ElectronIPCHandler();
