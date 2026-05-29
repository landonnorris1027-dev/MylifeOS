class PomodoroManager {
  constructor({ getMainWindow = () => null, NotificationImpl = null } = {}) {
    this.getMainWindow = getMainWindow;
    this.NotificationImpl = NotificationImpl;
    this.timers = new Map();
    this.intervals = new Map();
  }

  startTimer(timerId, duration, isFocusMode = true) {
    if (this.timers.has(timerId)) {
      this.clearTimer(timerId);
    }

    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);
    const durationMs = duration * 1000;

    this.timers.set(timerId, {
      id: timerId,
      startTime,
      endTime,
      duration,
      remainingMs: durationMs,
      isFocusMode,
      isActive: true
    });

    const interval = setInterval(() => {
      const timer = this.timers.get(timerId);
      if (!timer) {
        this.clearTimer(timerId);
        return;
      }

      if (!timer.isActive) {
        return;
      }

      const now = Date.now();
      const remaining = Math.max(0, timer.endTime - now);
      timer.remainingMs = remaining;

      this.broadcastUpdate(timerId, {
        remaining,
        elapsed: (timer.duration * 1000) - remaining,
        isActive: timer.isActive,
        isFinished: remaining <= 0
      });

      if (remaining <= 0) {
        this.handleTimerFinish(timerId, timer.isFocusMode);
      }
    }, 1000);

    this.intervals.set(timerId, interval);
    return { startTime, endTime };
  }

  handleTimerFinish(timerId, isFocusMode) {
    this.sendNotification(isFocusMode ? '专注时间结束' : '休息时间结束');

    this.broadcastUpdate(timerId, {
      remaining: 0,
      isFinished: true
    });

    this.clearTimer(timerId);
  }

  sendNotification(message) {
    const Notification = this.NotificationImpl;
    if (Notification && Notification.isSupported()) {
      const notification = new Notification({
        title: 'MyLifeOS Pomodoro',
        body: message,
      });
      notification.show();
    }
  }

  broadcastUpdate(timerId, data) {
    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pomodoro-update', { timerId, ...data });
    }
  }

  toggleTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) return;

    const durationMs = timer.duration * 1000;

    if (timer.isActive) {
      timer.remainingMs = Math.max(0, timer.endTime - Date.now());
      timer.isActive = false;
    } else {
      const remaining = Math.max(0, timer.remainingMs ?? (timer.endTime - Date.now()));
      timer.endTime = Date.now() + remaining;
      timer.startTime = Date.now() - (durationMs - remaining);
      timer.remainingMs = remaining;
      timer.isActive = true;
    }

    this.broadcastUpdate(timerId, {
      remaining: timer.remainingMs,
      elapsed: durationMs - timer.remainingMs,
      isActive: timer.isActive,
      isFinished: timer.remainingMs <= 0
    });
  }

  stopTimer(timerId) {
    this.clearTimer(timerId);
    this.broadcastUpdate(timerId, { stopped: true });
  }

  clearTimer(timerId) {
    const interval = this.intervals.get(timerId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(timerId);
    }
    this.timers.delete(timerId);
  }

  getActiveTimers() {
    return Array.from(this.timers.values()).map(timer => ({
      ...timer,
      remaining: timer.isActive
        ? Math.max(0, timer.endTime - Date.now())
        : Math.max(0, timer.remainingMs ?? 0)
    }));
  }

  cleanup() {
    this.timers.forEach((_, timerId) => {
      this.clearTimer(timerId);
    });
  }
}

module.exports = {
  PomodoroManager
};
