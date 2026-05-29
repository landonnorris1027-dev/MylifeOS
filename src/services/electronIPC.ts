import type { PomodoroBridge, PomodoroTimerPayload, PomodoroTimerUpdate } from '../types/electronBridge';
import { logger } from './logger';

interface BrowserTimer {
  timerId: string;
  endTime: number;
  remaining: number;
  isActive: boolean;
  duration: number;
  intervalId: any;
}

const getPreloadPomodoroAPI = (): PomodoroBridge | null => {
  if (typeof window === 'undefined') return null;
  return window.myLifeOS?.pomodoro ?? null;
};

class ElectronIPCHandler {
  private preloadPomodoroAPI: PomodoroBridge | null;
  private isElectron: boolean;
  private browserTimers: Map<string, BrowserTimer> = new Map();
  private updateCallbacks: Set<(data: PomodoroTimerUpdate) => void> = new Set();

  constructor() {
    this.preloadPomodoroAPI = getPreloadPomodoroAPI();
    this.isElectron = !!this.preloadPomodoroAPI;

    if (this.preloadPomodoroAPI?.onUpdate) {
      try {
        this.preloadPomodoroAPI.onUpdate((data: PomodoroTimerUpdate) => {
          this.notifySubscribers(data);
        });
      } catch (e) {
        logger.error('Failed to register preload IPC listener', e);
      }
    }
  }

  async startPomodoro(timerData: PomodoroTimerPayload): Promise<any> {
    if (this.isElectron && this.preloadPomodoroAPI) {
      try {
        await this.preloadPomodoroAPI.start(timerData);
      } catch (e) {
        logger.warn('IPC start failed:', e);
      }
    } else {
      this.startBrowserTimer(timerData);
    }

    return {
      startTime: Date.now(),
      endTime: Date.now() + timerData.duration * 1000,
      timerId: timerData.timerId
    };
  }

  private startBrowserTimer(timerData: PomodoroTimerPayload) {
    if (this.browserTimers.has(timerData.timerId)) {
      this.stopBrowserTimer(timerData.timerId);
    }

    const timer: BrowserTimer = {
      timerId: timerData.timerId,
      duration: timerData.duration * 1000,
      remaining: timerData.duration * 1000,
      endTime: Date.now() + timerData.duration * 1000,
      isActive: true,
      intervalId: null
    };

    timer.intervalId = setInterval(() => {
      if (!timer.isActive) return;

      const now = Date.now();
      const realRemaining = Math.max(0, timer.endTime - now);
      timer.remaining = realRemaining;

      const updateData: PomodoroTimerUpdate = {
        timerId: timer.timerId,
        remaining: realRemaining,
        elapsed: timer.duration - realRemaining,
        isFinished: realRemaining <= 0,
        isActive: true
      };

      this.notifySubscribers(updateData);

    }, 1000);

    this.browserTimers.set(timerData.timerId, timer);

    this.notifySubscribers({
      timerId: timerData.timerId,
      remaining: timer.remaining,
      elapsed: 0,
      isFinished: false,
      isActive: true
    });
  }

  togglePomodoro(timerId: string): void {
    if (this.isElectron && this.preloadPomodoroAPI) {
      this.preloadPomodoroAPI.toggle({ timerId });
      return;
    }

    const timer = this.browserTimers.get(timerId);
    if (timer) {
      timer.isActive = !timer.isActive;

      if (timer.isActive) {
        timer.endTime = Date.now() + timer.remaining;
      }

      this.notifySubscribers({
        timerId,
        remaining: timer.remaining,
        elapsed: timer.duration - timer.remaining,
        isFinished: timer.remaining <= 0,
        isActive: timer.isActive
      });
    }
  }

  stopPomodoro(timerId: string): void {
    if (this.isElectron && this.preloadPomodoroAPI) {
      this.preloadPomodoroAPI.stop({ timerId });
      // Main process will send an event effectively stopping, but we proactively clear our list locally just in case? No, the IPC handles state.
      return;
    }

    this.stopBrowserTimer(timerId);
    this.notifySubscribers({
      timerId,
      remaining: 0,
      elapsed: 0,
      isFinished: false,
      isActive: false,
      stopped: true
    });
  }

  private stopBrowserTimer(timerId: string) {
    const timer = this.browserTimers.get(timerId);
    if (timer && timer.intervalId) {
      clearInterval(timer.intervalId);
      this.browserTimers.delete(timerId);
    }
  }

  private notifySubscribers(data: PomodoroTimerUpdate) {
    this.updateCallbacks.forEach(callback => callback(data));
  }

  async getActiveTimers(): Promise<any[]> {
    if (this.preloadPomodoroAPI) {
      try {
        return await this.preloadPomodoroAPI.getActive();
      } catch (e) {
        logger.warn('Failed to read active timers from main process, fallback to local timers', e);
      }
    }

    return Array.from(this.browserTimers.values()).map(t => ({
      id: t.timerId,
      endTime: t.endTime,
      duration: t.duration,
      remaining: t.remaining
    }));
  }

  onPomodoroUpdate(callback: (data: PomodoroTimerUpdate) => void): () => void {
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
