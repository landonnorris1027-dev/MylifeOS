console.log('--- ELECTRON PROCESS STARTING ---');

import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import fs from 'fs';
import path from 'path';
import { AppDataStore } from './app-data-store';
import { normalizePersistedTimerForRestore, PersistedTimerSnapshot } from './electron-timer-restore';
import { resolveWindowLoadTarget } from './electron-window-target';
import type {
  MainTimer,
  PomodoroNotificationMessages,
  PomodoroRecoveryAction,
  PomodoroRecoveryData,
  PomodoroTimerData,
} from './types';

try {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
} catch (e) {}

const RECOVERY_POINTS_KEY = 'mylifeos_recovery_points';

let mainWindow: BrowserWindow | null = null;
const activeTimers = new Map<string, MainTimer>();
const pendingRecoveries: PomodoroRecoveryData[] = [];
let timerStateFilePath = '';
let appDataFilePath = '';
let recoveryPointsFilePath = '';
let appDataStore: AppDataStore | null = null;
let recoveryPointsStore: AppDataStore | null = null;

function ensureDirectoryForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureTimerStatePath(): string {
  if (!timerStateFilePath) {
    timerStateFilePath = path.join(app.getPath('userData'), 'pomodoro-state.json');
  }

  return timerStateFilePath;
}

function ensureAppDataPath(): string {
  if (!appDataFilePath) {
    appDataFilePath = path.join(app.getPath('userData'), 'app-data.json');
  }

  return appDataFilePath;
}

function ensureRecoveryPointsPath(): string {
  if (!recoveryPointsFilePath) {
    recoveryPointsFilePath = path.join(app.getPath('userData'), 'recovery-points.json');
  }

  return recoveryPointsFilePath;
}

function getAppDataStore(): AppDataStore {
  if (!appDataStore) {
    appDataStore = new AppDataStore({ filePath: ensureAppDataPath() });
  }

  return appDataStore;
}

function getRecoveryPointsStore(): AppDataStore {
  if (!recoveryPointsStore) {
    recoveryPointsStore = new AppDataStore({ filePath: ensureRecoveryPointsPath() });
    migrateLegacyRecoveryPoints();
  }

  return recoveryPointsStore;
}

/**
 * Moves legacy recovery points out of the hot app-data.json file into the
 * dedicated recovery-points.json store, shrinking the hot storage path.
 */
function migrateLegacyRecoveryPoints(): void {
  const store = getAppDataStore();
  const legacy = store.get(RECOVERY_POINTS_KEY);
  if (legacy === null || !recoveryPointsStore) return;

  if (recoveryPointsStore.get(RECOVERY_POINTS_KEY) === null) {
    recoveryPointsStore.set(RECOVERY_POINTS_KEY, legacy);
    recoveryPointsStore.flush();
  }

  store.set(RECOVERY_POINTS_KEY, null);
  store.flush();
}

function getStorageStoreForKey(key: string): AppDataStore {
  return key === RECOVERY_POINTS_KEY ? getRecoveryPointsStore() : getAppDataStore();
}

function flushPendingStorageWrites(): void {
  appDataStore?.flush();
  recoveryPointsStore?.flush();
}

function persistActiveTimers(): void {
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

function queuePendingRecovery(
  timer: Partial<MainTimer> & { timerId: string; isFocusMode?: boolean; duration?: number; remaining?: number },
  reason = 'expired_while_offline',
): void {
  const recovery: PomodoroRecoveryData = {
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
    notificationMessages: timer.notificationMessages || null,
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

function restorePersistedTimers(): void {
  try {
    const filePath = ensureTimerStatePath();
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return;

    type PersistedTimerRecord = Partial<MainTimer> & PersistedTimerSnapshot;
    const parsedState = JSON.parse(raw) as
      | PersistedTimerRecord[]
      | { activeTimers?: PersistedTimerRecord[]; pendingRecoveries?: PomodoroRecoveryData[] };
    const persistedTimers = Array.isArray(parsedState) ? parsedState : parsedState.activeTimers;
    const persistedRecoveries = Array.isArray(parsedState) || !Array.isArray(parsedState?.pendingRecoveries)
      ? []
      : parsedState.pendingRecoveries;
    if (!Array.isArray(persistedTimers)) return;

    const now = Date.now();

    pendingRecoveries.splice(0, pendingRecoveries.length, ...(persistedRecoveries ?? []));

    persistedTimers.forEach((timerRecord) => {
      const restoreState = normalizePersistedTimerForRestore(timerRecord, now);

      if (restoreState.shouldRecover) {
        queuePendingRecovery({
          ...timerRecord,
          timerId: timerRecord.timerId ?? `timer-${now}`,
          remaining: restoreState.remaining,
          isFocusMode: Boolean(timerRecord.isFocusMode),
        });
        return;
      }

      const restoredTimer: MainTimer = {
        timerId: timerRecord.timerId ?? `timer-${now}`,
        duration: timerRecord.duration ?? 0,
        remaining: restoreState.remaining,
        endTime: restoreState.endTime,
        isActive: restoreState.isActive,
        isFinished: false,
        isFocusMode: Boolean(timerRecord.isFocusMode),
        taskId: timerRecord.taskId || null,
        taskHabitId: timerRecord.taskHabitId || null,
        taskName: timerRecord.taskName || null,
        taskDate: timerRecord.taskDate || null,
        taskPriority: timerRecord.taskPriority || null,
        taskDurationMinutes: timerRecord.taskDurationMinutes || null,
        notificationMessages: timerRecord.notificationMessages || null,
        notificationsEnabled: timerRecord.notificationsEnabled !== false,
        breakDurationSeconds: timerRecord.breakDurationSeconds || null,
        startedAt: timerRecord.startedAt || now,
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

function toTimerPayload(timer: MainTimer) {
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
    notificationMessages: timer.notificationMessages || null,
    notificationsEnabled: timer.notificationsEnabled !== false,
    breakDurationSeconds: timer.breakDurationSeconds || null,
    startedAt: timer.startedAt,
    updatedAt: timer.updatedAt,
  };
}

function broadcastTimerUpdate(timer: MainTimer, extra: Record<string, unknown> = {}): void {
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

function clearTimerInterval(timer: MainTimer): void {
  if (timer.intervalId) {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
  }
}


function showTimerNotification(timer: MainTimer): void {
  if (timer.notificationsEnabled === false) return;

  try {
    const messages: Partial<PomodoroNotificationMessages> = timer.notificationMessages || {};
    const title = timer.isFocusMode
      ? messages.focusCompleteTitle || 'Focus session completed'
      : messages.breakFinishedTitle || 'Break finished';
    const body = timer.isFocusMode
      ? messages.focusCompleteBody || `${timer.taskName || 'Your task'} is ready for a break.`
      : messages.breakFinishedBody || 'Time to get back to work.';

    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (error) {
    console.warn('[MyLifeOS] Failed to show notification:', error);
  }
}

function finishTimer(timerId: string): void {
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

function startTicker(timer: MainTimer): void {
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

function upsertTimer(timerData: PomodoroTimerData): MainTimer {
  const previous = activeTimers.get(timerData.timerId);
  if (previous) {
    clearTimerInterval(previous);
  }

  const durationMs = timerData.duration * 1000;
  const timer: MainTimer = {
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
    notificationMessages: timerData.notificationMessages || null,
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


function registerPomodoroIpc(): void {
  ipcMain.handle('pomodoro-start', async (_event, timerData: PomodoroTimerData) => {
    return toTimerPayload(upsertTimer(timerData));
  });

  ipcMain.handle('pomodoro-get-active-timers', async () => {
    return Array.from(activeTimers.values()).map(toTimerPayload);
  });

  ipcMain.handle('pomodoro-get-pending-recoveries', async () => {
    return [...pendingRecoveries];
  });

  ipcMain.handle(
    'pomodoro-resolve-recovery',
    async (_event, { recoveryId, action }: { recoveryId: string; action: PomodoroRecoveryAction }) => {
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
          breakDurationSeconds: recovery.breakDurationSeconds || undefined,
          taskId: recovery.taskId || undefined,
          taskHabitId: recovery.taskHabitId || undefined,
          taskName: recovery.taskName || undefined,
          taskDate: recovery.taskDate || undefined,
          taskPriority: (recovery.taskPriority as PomodoroTimerData['taskPriority']) || undefined,
          taskDurationMinutes: recovery.taskDurationMinutes || undefined,
          notificationMessages: recovery.notificationMessages || undefined,
        });

        persistActiveTimers();
        return { ok: true, resumedTimer: toTimerPayload(breakTimer) };
      }

      persistActiveTimers();
      return { ok: true };
    },
  );

  ipcMain.on('pomodoro-toggle', (_event, { timerId }: { timerId: string }) => {
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

  ipcMain.on('pomodoro-stop', (_event, { timerId }: { timerId: string }) => {
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


function registerStorageIpc(): void {
  ipcMain.on('storage-get-sync', (event, { key }: { key: unknown }) => {
    if (typeof key !== 'string') {
      event.returnValue = null;
      return;
    }

    event.returnValue = getStorageStoreForKey(key).get(key);
  });

  ipcMain.on('storage-set-sync', (event, { key, value }: { key: unknown; value: unknown }) => {
    if (typeof key !== 'string') {
      event.returnValue = { ok: false };
      return;
    }

    // Writes land in the in-memory cache immediately and are flushed to disk
    // in a debounced batch (and synchronously on before-quit). If a flush
    // fails, the cache rolls back to the on-disk state.
    getStorageStoreForKey(key).set(key, value === null || value === undefined ? null : String(value));
    event.returnValue = { ok: true };
  });
}

function createWindow(): void {
  console.log('[MyLifeOS] Creating window...');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'MyLifeOS',
    backgroundColor: '#F7F7F5',
    icon: path.join(__dirname, '../assets/icon.ico'),
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
    appRoot: path.join(__dirname, '..'),
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
      mainWindow?.show();
      mainWindow?.focus();
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

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    ensureTimerStatePath();
    ensureAppDataPath();
    getAppDataStore();
    getRecoveryPointsStore();
    restorePersistedTimers();
    registerPomodoroIpc();
    registerStorageIpc();
    createWindow();
  });

  app.on('before-quit', () => {
    flushPendingStorageWrites();
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
}

