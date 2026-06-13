console.log('--- ELECTRON PROCESS STARTING ---');

const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { normalizePersistedTimerForRestore } = require('./electron-timer-restore');
const { resolveWindowLoadTarget } = require('./electron-window-target');

try {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
} catch (e) {}

let mainWindow = null;
const activeTimers = new Map();
const pendingRecoveries = [];
let timerStateFilePath = '';
let appDataFilePath = '';

function ensureDirectoryForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureTimerStatePath() {
  if (!timerStateFilePath) {
    timerStateFilePath = path.join(app.getPath('userData'), 'pomodoro-state.json');
  }

  return timerStateFilePath;
}

function ensureAppDataPath() {
  if (!appDataFilePath) {
    appDataFilePath = path.join(app.getPath('userData'), 'app-data.json');
  }

  return appDataFilePath;
}

function readAppDataStore() {
  try {
    const filePath = ensureAppDataPath();
    ensureDirectoryForFile(filePath);

    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('[MyLifeOS] Failed to read app data store:', error);
    return {};
  }
}

function writeAppDataStore(store) {
  const filePath = ensureAppDataPath();
  ensureDirectoryForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
}

function persistActiveTimers() {
  try {
    const filePath = ensureTimerStatePath();
    ensureDirectoryForFile(filePath);
    const payload = {
      activeTimers: Array.from(activeTimers.values()).map((timer) => toTimerPayload(timer)),
      pendingRecoveries,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.error('[MyLifeOS] Failed to persist timers:', error);
  }
}

function queuePendingRecovery(timer, reason = 'expired_while_offline') {
  const recovery = {
    recoveryId: `${timer.timerId}_recovery`,
    timerId: timer.timerId,
    reason,
    mode: timer.isFocusMode ? 'focus' : 'break',
    taskId: timer.taskId || null,
    taskHabitId: timer.taskHabitId || null,
    taskName: timer.taskName || null,
    taskDate: timer.taskDate || null,
    taskPriority: timer.taskPriority || null,
    taskDurationMinutes: timer.taskDurationMinutes || null,
    notificationsEnabled: timer.notificationsEnabled !== false,
    breakDurationSeconds: timer.breakDurationSeconds || null,
    originalDuration: timer.duration,
    remaining: timer.remaining,
    expiredAt: Date.now(),
  };

  const existingIndex = pendingRecoveries.findIndex((item) => item.recoveryId === recovery.recoveryId);
  if (existingIndex >= 0) {
    pendingRecoveries[existingIndex] = recovery;
  } else {
    pendingRecoveries.push(recovery);
  }
}

function restorePersistedTimers() {
  try {
    const filePath = ensureTimerStatePath();
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return;

    const parsedState = JSON.parse(raw);
    const persistedTimers = Array.isArray(parsedState) ? parsedState : parsedState.activeTimers;
    const persistedRecoveries = Array.isArray(parsedState?.pendingRecoveries) ? parsedState.pendingRecoveries : [];
    if (!Array.isArray(persistedTimers)) return;

    const now = Date.now();

    pendingRecoveries.splice(0, pendingRecoveries.length, ...persistedRecoveries);

    persistedTimers.forEach((timer) => {
      const restoreState = normalizePersistedTimerForRestore(timer, now);

      if (restoreState.shouldRecover) {
        queuePendingRecovery({
          ...timer,
          remaining: restoreState.remaining,
          isFocusMode: Boolean(timer.isFocusMode),
        });
        return;
      }

      const restoredTimer = {
        timerId: timer.timerId,
        duration: timer.duration,
        remaining: restoreState.remaining,
        endTime: restoreState.endTime,
        isActive: restoreState.isActive,
        isFinished: false,
        isFocusMode: Boolean(timer.isFocusMode),
        taskId: timer.taskId || null,
        taskHabitId: timer.taskHabitId || null,
        taskName: timer.taskName || null,
        taskDate: timer.taskDate || null,
        taskPriority: timer.taskPriority || null,
        taskDurationMinutes: timer.taskDurationMinutes || null,
        notificationsEnabled: timer.notificationsEnabled !== false,
        breakDurationSeconds: timer.breakDurationSeconds || null,
        startedAt: timer.startedAt || now,
        updatedAt: now,
        intervalId: null,
      };

      activeTimers.set(restoredTimer.timerId, restoredTimer);

      if (restoredTimer.isActive) {
        startTicker(restoredTimer);
      }
    });

    persistActiveTimers();
  } catch (error) {
    console.error('[MyLifeOS] Failed to restore persisted timers:', error);
  }
}

function toTimerPayload(timer) {
  return {
    timerId: timer.timerId,
    duration: timer.duration,
    remaining: timer.remaining,
    endTime: timer.endTime,
    elapsed: Math.max(0, timer.duration * 1000 - timer.remaining),
    isActive: timer.isActive,
    isFinished: timer.isFinished,
    isFocusMode: timer.isFocusMode,
    taskId: timer.taskId || null,
    taskHabitId: timer.taskHabitId || null,
    taskName: timer.taskName || null,
    taskDate: timer.taskDate || null,
    taskPriority: timer.taskPriority || null,
    taskDurationMinutes: timer.taskDurationMinutes || null,
    notificationsEnabled: timer.notificationsEnabled !== false,
    breakDurationSeconds: timer.breakDurationSeconds || null,
    startedAt: timer.startedAt,
    updatedAt: timer.updatedAt,
  };
}

function broadcastTimerUpdate(timer, extra = {}) {
  const payload = {
    ...toTimerPayload(timer),
    ...extra,
  };

  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('pomodoro-update', payload);
    }
  });
}

function clearTimerInterval(timer) {
  if (timer.intervalId) {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
  }
}

function showTimerNotification(timer) {
  if (timer.notificationsEnabled === false) return;

  try {
    const title = timer.isFocusMode ? 'Focus session completed' : 'Break finished';
    const body = timer.isFocusMode
      ? `${timer.taskName || 'Your task'} is ready for a break.`
      : 'Time to get back to work.';

    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (error) {
    console.warn('[MyLifeOS] Failed to show notification:', error);
  }
}

function finishTimer(timerId) {
  const timer = activeTimers.get(timerId);
  if (!timer) return;

  clearTimerInterval(timer);
  timer.remaining = 0;
  timer.endTime = Date.now();
  timer.updatedAt = Date.now();
  timer.isActive = false;
  timer.isFinished = true;

  broadcastTimerUpdate(timer);
  showTimerNotification(timer);
  activeTimers.delete(timerId);
  persistActiveTimers();
}

function startTicker(timer) {
  clearTimerInterval(timer);

  timer.intervalId = setInterval(() => {
    if (!timer.isActive) return;

    const remaining = Math.max(0, timer.endTime - Date.now());
    timer.remaining = remaining;
    timer.updatedAt = Date.now();

    if (remaining <= 0) {
      finishTimer(timer.timerId);
      return;
    }

    broadcastTimerUpdate(timer);
  }, 250);
}

function upsertTimer(timerData) {
  const previous = activeTimers.get(timerData.timerId);
  if (previous) {
    clearTimerInterval(previous);
  }

  const durationMs = timerData.duration * 1000;
  const timer = {
    timerId: timerData.timerId,
    duration: timerData.duration,
    remaining: durationMs,
    endTime: Date.now() + durationMs,
    isActive: true,
    isFinished: false,
    isFocusMode: timerData.isFocusMode,
    notificationsEnabled: timerData.notificationsEnabled !== false,
    breakDurationSeconds: timerData.breakDurationSeconds || null,
    taskId: timerData.taskId || null,
    taskHabitId: timerData.taskHabitId || null,
    taskName: timerData.taskName || null,
    taskDate: timerData.taskDate || null,
    taskPriority: timerData.taskPriority || null,
    taskDurationMinutes: timerData.taskDurationMinutes || null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    intervalId: null,
  };

  activeTimers.set(timer.timerId, timer);
  startTicker(timer);
  broadcastTimerUpdate(timer);
  persistActiveTimers();

  return timer;
}

function registerPomodoroIpc() {
  ipcMain.handle('pomodoro-start', async (_event, timerData) => {
    return toTimerPayload(upsertTimer(timerData));
  });

  ipcMain.handle('pomodoro-get-active-timers', async () => {
    return Array.from(activeTimers.values()).map(toTimerPayload);
  });

  ipcMain.handle('pomodoro-get-pending-recoveries', async () => {
    return [...pendingRecoveries];
  });

  ipcMain.handle('pomodoro-resolve-recovery', async (_event, { recoveryId, action }) => {
    const recoveryIndex = pendingRecoveries.findIndex((item) => item.recoveryId === recoveryId);
    if (recoveryIndex === -1) {
      return { ok: false };
    }

    const recovery = pendingRecoveries[recoveryIndex];
    pendingRecoveries.splice(recoveryIndex, 1);

    if (action === 'resume-break' || action === 'restart-break') {
      const breakTimer = upsertTimer({
        timerId: recovery.timerId.replace(/_break$/, '') + '_break',
        duration: recovery.breakDurationSeconds || 5 * 60,
        isFocusMode: false,
        notificationsEnabled: recovery.notificationsEnabled !== false,
        breakDurationSeconds: recovery.breakDurationSeconds || null,
        taskId: recovery.taskId,
        taskHabitId: recovery.taskHabitId,
        taskName: recovery.taskName,
        taskDate: recovery.taskDate,
        taskPriority: recovery.taskPriority,
        taskDurationMinutes: recovery.taskDurationMinutes,
      });

      persistActiveTimers();
      return { ok: true, resumedTimer: toTimerPayload(breakTimer) };
    }

    persistActiveTimers();
    return { ok: true };
  });

  ipcMain.on('pomodoro-toggle', (_event, { timerId }) => {
    const timer = activeTimers.get(timerId);
    if (!timer) return;

    if (timer.isActive) {
      timer.remaining = Math.max(0, timer.endTime - Date.now());
      timer.isActive = false;
      timer.updatedAt = Date.now();
      clearTimerInterval(timer);
    } else {
      timer.endTime = Date.now() + timer.remaining;
      timer.isActive = true;
      timer.updatedAt = Date.now();
      startTicker(timer);
    }

    broadcastTimerUpdate(timer);
    persistActiveTimers();
  });

  ipcMain.on('pomodoro-stop', (_event, { timerId }) => {
    const timer = activeTimers.get(timerId);
    if (!timer) return;

    clearTimerInterval(timer);
    timer.isActive = false;
    timer.updatedAt = Date.now();
    broadcastTimerUpdate(timer, { stopped: true });
    activeTimers.delete(timerId);
    persistActiveTimers();
  });
}

function registerStorageIpc() {
  ipcMain.on('storage-get-sync', (event, { key }) => {
    if (typeof key !== 'string') {
      event.returnValue = null;
      return;
    }

    const store = readAppDataStore();
    const value = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    event.returnValue = typeof value === 'string' ? value : null;
  });

  ipcMain.on('storage-set-sync', (event, { key, value }) => {
    if (typeof key !== 'string') {
      event.returnValue = { ok: false };
      return;
    }

    const store = readAppDataStore();
    if (value === null || value === undefined) {
      delete store[key];
    } else {
      store[key] = String(value);
    }
    try {
      writeAppDataStore(store);
      event.returnValue = { ok: true };
    } catch (error) {
      console.error('[MyLifeOS] Failed to write app data store:', error);
      event.returnValue = {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to write app data store',
      };
    }
  });
}

function createWindow() {
  console.log('[MyLifeOS] Creating window...');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'MyLifeOS',
    backgroundColor: '#F7F7F5',
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const loadTarget = resolveWindowLoadTarget({
    appRoot: __dirname,
    startUrl: process.env.ELECTRON_START_URL,
  });
  console.log(`[MyLifeOS] Loading ${loadTarget.type}: ${loadTarget.value}`);

  const loadPromise = loadTarget.type === 'url'
    ? mainWindow.loadURL(loadTarget.value)
    : mainWindow.loadFile(loadTarget.value);

  loadPromise
    .then(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    })
    .catch((err) => {
      console.error(`[MyLifeOS] FAILED to load ${loadTarget.type}:`, err);
    });

  mainWindow.once('ready-to-show', () => {
    try {
      mainWindow.show();
      mainWindow.focus();
    } catch (e) {
      console.error('[MyLifeOS] failed to show window:', e);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[MyLifeOS] did-fail-load', errorCode, errorDescription, validatedURL, isMainFrame);
  });

  try {
    const enableDevtools = process.env.ENABLE_DEVTOOLS === 'true' || process.env.NODE_ENV === 'development';
    if (enableDevtools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (e) {}

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ensureTimerStatePath();
  ensureAppDataPath();
  restorePersistedTimers();
  registerPomodoroIpc();
  registerStorageIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
