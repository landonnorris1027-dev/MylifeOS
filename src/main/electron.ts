console.log('--- ELECTRON PROCESS STARTING ---');

import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray } from 'electron';
import fs from 'fs';
import { DurableFocusRuntime, FocusTimer } from './focus-runtime';
import path from 'path';
import { AppDataStore, AppDataStoreFlushResult } from './app-data-store';
import type { StorageStatus, StorageTransaction } from './storage-contract';
import { normalizePersistedTimerForRestore, PersistedTimerSnapshot } from './electron-timer-restore';
import { resolveWindowLoadTarget } from './electron-window-target';
import { migrateRecoveryPoints } from './recovery-points-migration';
import { migrateLegacyElectronStore } from './legacy-storage-migration';
import { readJsonWithBackup, writeTextAtomically } from './durable-file';
import { isPersistedTimerState, isWindowStateSnapshot } from './persisted-state-validation';
import { DEFAULT_WINDOW_BOUNDS, normalizeWindowState, WindowStateSnapshot } from './window-state';
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

if (process.platform === 'win32') {
  app.setAppUserModelId('com.mylifeos.app');
}

const RECOVERY_POINTS_KEY = 'mylifeos_recovery_points';
const DESKTOP_SETTINGS_KEY = 'mylifeos_desktop_settings';
const LANGUAGE_KEY = 'mylifeos_lang';

const TRAY_LABELS = {
  zh: { show: '显示窗口', quit: '退出 MyLifeOS' },
  en: { show: 'Show window', quit: 'Quit MyLifeOS' },
};

let mainWindow: BrowserWindow | null = null;
let focusRuntime: DurableFocusRuntime | null = null;
let timerStateFilePath = '';
let appDataFilePath = '';
let recoveryPointsFilePath = '';
let windowStateFilePath = '';
let appDataStore: AppDataStore | null = null;
let recoveryPointsStore: AppDataStore | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let discardOnQuit = false;
let quitPromptOpen = false;
let windowStateSaveTimer: NodeJS.Timeout | null = null;

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
    appDataStore = new AppDataStore({
      filePath: ensureAppDataPath(),
      onFlushError: broadcastStorageWriteFailure,
      onStatusChange: broadcastStorageStatus,
    });
  }

  return appDataStore;
}

function getRecoveryPointsStore(): AppDataStore {
  if (recoveryPointsStore) return recoveryPointsStore;

  const candidateStore = new AppDataStore({
    filePath: ensureRecoveryPointsPath(),
    onFlushError: broadcastStorageWriteFailure,
    onStatusChange: broadcastStorageStatus,
  });
  if (getAppDataStore().getStatus().state === 'recovery' || candidateStore.getStatus().state === 'recovery') {
    recoveryPointsStore = candidateStore;
    return candidateStore;
  }
  let result;
  try { result = migrateRecoveryPoints(getAppDataStore(), candidateStore, RECOVERY_POINTS_KEY); }
  catch (error) {
    console.error('[MyLifeOS] Recovery migration deferred:', error);
    return getAppDataStore();
  }
  if (!result.ok) {
    console.error('[MyLifeOS] Failed to migrate recovery points:', result.error ?? 'Unknown write failure');
    return result.activeStore as AppDataStore;
  }

  recoveryPointsStore = candidateStore;
  return recoveryPointsStore;
}

function getStorageStoreForKey(key: string): AppDataStore {
  return key === RECOVERY_POINTS_KEY ? getRecoveryPointsStore() : getAppDataStore();
}

function broadcastStorageWriteFailure(result: AppDataStoreFlushResult): void {
  const payload = { error: result.error ?? 'Failed to persist application data' };
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('storage-write-error', payload);
    }
  });
}

function getStorageStatus(): StorageStatus {
  const statuses = [appDataStore, recoveryPointsStore].filter((store): store is AppDataStore => !!store).map(store => store.getStatus());
  if (focusRuntime) statuses.push(focusRuntime.status());
  const worst = statuses.find(s => s.state === 'recovery') || statuses.find(s => s.state === 'error')
    || statuses.find(s => s.state === 'saving') || { state: 'saved' as const, hasPending: false };
  return { ...worst, hasPending: statuses.some(s => s.hasPending) };
}

function broadcastStorageStatus(): void {
  const status = getStorageStatus();
  if (status.state === 'error' || status.state === 'recovery') focusRuntime?.pauseForStorageFailure();
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) window.webContents.send('storage-status', status);
  });
}

function flushPendingStorageWrites(): boolean {
  const results = [appDataStore, recoveryPointsStore].filter((store): store is AppDataStore => !!store)
    .map(store => store.getStatus().hasPending ? store.flush().ok : true);
  if (focusRuntime?.status().hasPending || focusRuntime?.status().state === 'error') {
    try { focusRuntime.retry(); } catch { return false; }
  }
  return results.every(Boolean) && !['error', 'recovery'].includes(getStorageStatus().state);
}
function ensureWindowStatePath(): string {
  if (!windowStateFilePath) {
    windowStateFilePath = path.join(app.getPath('userData'), 'window-state.json');
  }

  return windowStateFilePath;
}

function readWindowState(): WindowStateSnapshot {
  try {
    const filePath = ensureWindowStatePath();
    const result = readJsonWithBackup(filePath, fs, isWindowStateSnapshot);
    if (!result) return {};
    if (result.recoveredFromBackup) {
      console.warn('[MyLifeOS] Recovered window state from backup.');
    }
    return result.value as WindowStateSnapshot;
  } catch (error) {
    console.warn('[MyLifeOS] Failed to read window state:', error);
    return {};
  }
}

function writeWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    const isMaximized = mainWindow.isMaximized();
    // Persist the restored bounds while maximized so unmaximizing keeps size.
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    const filePath = ensureWindowStatePath();
    ensureDirectoryForFile(filePath);
    writeTextAtomically(
      filePath,
      JSON.stringify({ ...bounds, isMaximized }, null, 2),
      fs,
      isWindowStateSnapshot,
    );
  } catch (error) {
    console.warn('[MyLifeOS] Failed to write window state:', error);
  }
}

function scheduleWindowStateSave(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
  }

  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    writeWindowState();
  }, 400);
}

function flushWindowState(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }

  writeWindowState();
}

function isMinimizeToTrayEnabled(): boolean {
  const raw = getAppDataStore().get(DESKTOP_SETTINGS_KEY);
  if (!raw) return true;

  try {
    const parsed = JSON.parse(raw) as { minimizeToTray?: unknown };
    return typeof parsed.minimizeToTray === 'boolean' ? parsed.minimizeToTray : true;
  } catch (_error) {
    return true;
  }
}

function getTrayLabels() {
  const language = getAppDataStore().get(LANGUAGE_KEY);
  return language === 'en' ? TRAY_LABELS.en : TRAY_LABELS.zh;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function quitApp(): void {
  app.quit();
}

function createTray(): void {
  if (tray) return;

  try {
    tray = new Tray(path.join(__dirname, '../assets/icon.ico'));
    tray.setToolTip('MyLifeOS');
  } catch (error) {
    console.warn('[MyLifeOS] Failed to create tray icon:', error);
    tray = null;
    return;
  }

  refreshTrayMenu();

  tray.on('click', () => {
    showMainWindow();
  });
}

function refreshTrayMenu(): void {
  if (!tray) return;

  const labels = getTrayLabels();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: labels.show, click: () => showMainWindow() },
      { type: 'separator' },
      { label: labels.quit, click: () => quitApp() },
    ]),
  );
}

function destroyTray(): void {
  if (!tray) return;

  tray.destroy();
  tray = null;
}

function registerDialogIpc(): void {
  ipcMain.handle(
    'dialog-save-backup',
    async (_event, { filename, content }: { filename?: unknown; content?: unknown }) => {
      if (typeof content !== 'string') {
        return { ok: false, error: 'Missing backup content' };
      }

      const suggestedName = typeof filename === 'string' && filename.trim() ? filename.trim() : 'mylifeos_backup.json';

      try {
        const parentWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const result = parentWindow
          ? await dialog.showSaveDialog(parentWindow, {
            title: 'MyLifeOS',
            defaultPath: suggestedName,
            filters: [{ name: 'JSON', extensions: ['json'] }],
          })
          : await dialog.showSaveDialog({
            title: 'MyLifeOS',
            defaultPath: suggestedName,
            filters: [{ name: 'JSON', extensions: ['json'] }],
          });

        if (result.canceled || !result.filePath) {
          return { ok: true, canceled: true };
        }

        writeTextAtomically(result.filePath, content);
        return { ok: true, canceled: false, path: result.filePath };
      } catch (error) {
        console.error('[MyLifeOS] Failed to save backup file:', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to save backup file',
        };
      }
    },
  );
}

function getFocusRuntime(): DurableFocusRuntime {
  if (!focusRuntime) focusRuntime = new DurableFocusRuntime({
    filePath: ensureTimerStatePath(), store: getAppDataStore(), onChange: broadcastStorageStatus,
    onUpdate: (timer) => {
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) window.webContents.send('pomodoro-update', timer);
      });
      if (timer.isFinished) showTimerNotification(timer);
    },
  });
  return focusRuntime;
}
function showTimerNotification(timer: FocusTimer): void {
  if (timer.notificationsEnabled === false) return;
  try {
    const messages = timer.notificationMessages;
    if (Notification.isSupported()) new Notification({
      title: timer.isFocusMode ? messages?.focusCompleteTitle || 'Focus session completed' : messages?.breakFinishedTitle || 'Break finished',
      body: timer.isFocusMode ? messages?.focusCompleteBody || 'Your focus was saved.' : messages?.breakFinishedBody || 'Time to get back to work.',
    }).show();
  } catch (error) { console.warn('[MyLifeOS] Notification failed:', error); }
}
function registerPomodoroIpc(): void {
  ipcMain.handle('pomodoro-start', (_event, data: PomodoroTimerData) => getFocusRuntime().start(data));
  ipcMain.handle('pomodoro-toggle', (_event, data: { timerId: string }) => getFocusRuntime().toggle(data.timerId));
  ipcMain.handle('pomodoro-stop', (_event, data: { timerId: string }) => getFocusRuntime().stop(data.timerId));
  ipcMain.handle('pomodoro-complete', (_event, data: { timerId: string }) => getFocusRuntime().complete(data.timerId));
  ipcMain.handle('pomodoro-get-active-timers', () => getFocusRuntime().active());
  ipcMain.handle('pomodoro-get-completed-focus', () => getFocusRuntime().completed());
  ipcMain.handle('pomodoro-get-pending-recoveries', () => getFocusRuntime().recoveries());
  ipcMain.handle('pomodoro-pending-state', () => getFocusRuntime().pending());
  ipcMain.handle('pomodoro-abandon-for-restore', (_event, data: { confirmed: boolean }) => {
    if (data?.confirmed !== true) throw new Error('Explicit abandonment is required');
    getFocusRuntime().abandonForRestore();
  });
  ipcMain.handle('pomodoro-resolve-recovery', (_event, data: { recoveryId: string; action: PomodoroRecoveryAction }) =>
    getFocusRuntime().resolve(data.recoveryId, data.action));
  const ticker = setInterval(() => getFocusRuntime().tick(), 250);
  app.on('will-quit', () => clearInterval(ticker));
}

function registerStorageIpc(): void {
  ipcMain.handle('storage-flush', () => ({ ok: flushPendingStorageWrites(), ...getStorageStatus() }));
  ipcMain.handle('storage-status', () => getStorageStatus());
  ipcMain.handle('storage-retry', () => ({ ok: flushPendingStorageWrites(), ...getStorageStatus() }));
  ipcMain.handle('storage-pending-snapshot', () => getAppDataStore().snapshot(true));
  ipcMain.handle('storage-commit', (_event, payload: StorageTransaction) => {
    if (getFocusRuntime().blocksRestore()) return { ok: false, error: 'Stop the current timer before restoring a backup.' };
    const allowed = new Set(['mylifeos_goals', 'mylifeos_habits', 'mylifeos_daily_logs', LANGUAGE_KEY,
      'mylifeos_focus_settings', 'mylifeos_focus_sessions', 'mylifeos_profile_settings', 'mylifeos_planner_settings', DESKTOP_SETTINGS_KEY]);
    if (!payload || !payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)
      || Object.entries(payload.entries).some(([key, value]) => !allowed.has(key) || typeof value !== 'string')
      || !['mylifeos_goals', 'mylifeos_habits', 'mylifeos_daily_logs'].every(key => key in payload.entries)) {
      return { ok: false, error: 'Invalid storage transaction' };
    }
    if (payload.recover === true && recoveryPointsStore?.getStatus().state === 'recovery') {
      const recoveryRepair = recoveryPointsStore.commit({ [RECOVERY_POINTS_KEY]: '[]' }, true);
      if (!recoveryRepair.ok) return recoveryRepair;
    }
    getFocusRuntime().prepareRestore(payload.recover === true);
    const result = getAppDataStore().commit(payload.entries, payload.recover === true);
    if (result.ok) refreshTrayMenu();
    return result;
  });
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
    try {
      const store = getStorageStoreForKey(key);
      store.set(key, value === null || value === undefined ? null : String(value));
      // Recovery points protect an imminent destructive action; acknowledge only after flush.
      event.returnValue = key === RECOVERY_POINTS_KEY ? store.flush() : { ok: true };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Storage unavailable' };
    }
  });
}

function createWindow(): void {
  console.log('[MyLifeOS] Creating window...');

  const savedState = normalizeWindowState(readWindowState());

  mainWindow = new BrowserWindow({
    width: savedState.bounds.width,
    height: savedState.bounds.height,
    ...(savedState.bounds.x !== undefined ? { x: savedState.bounds.x } : {}),
    ...(savedState.bounds.y !== undefined ? { y: savedState.bounds.y } : {}),
    minWidth: 400,
    minHeight: 300,
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

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

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

  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);

  mainWindow.on('close', (event) => {
    // Closing hides the window into the tray unless the user disabled it or
    // quit from the tray menu / app.quit().
    if (!isQuitting && isMinimizeToTrayEnabled()) {
      event.preventDefault();
      flushWindowState();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    ensureTimerStatePath();
    ensureAppDataPath();
    try {
      const migration = migrateLegacyElectronStore(
        path.join(app.getPath('userData'), 'config.json'),
        ensureAppDataPath(),
      );
      if (migration.migrated) {
        console.info('[MyLifeOS] Migrated data from the previous config.json; the original file was preserved.');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[MyLifeOS] Could not migrate the previous data store:', error);
      dialog.showErrorBox(
        'MyLifeOS could not migrate existing data',
        `${detail}\n\nThe original config.json was left unchanged. Resolve this issue before launching the new version again.`,
      );
      app.quit();
      return;
    }
    getAppDataStore();
    getRecoveryPointsStore();
    try { getFocusRuntime().initialize(); } catch (error) { console.error("[MyLifeOS] Focus replay deferred:", error); }
    if (['error', 'recovery'].includes(getStorageStatus().state)) focusRuntime?.pauseForStorageFailure();
    registerPomodoroIpc();
    registerStorageIpc();
    registerDialogIpc();
    createTray();
    createWindow();
  });

  app.on('before-quit', (event) => {
    if (!discardOnQuit && !flushPendingStorageWrites()) {
      event.preventDefault();
      isQuitting = false;
      if (quitPromptOpen) return;
      quitPromptOpen = true;
      showMainWindow();
      const zh = getAppDataStore().get(LANGUAGE_KEY) !== 'en';
      void dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        message: zh ? '有修改尚未保存。' : 'Some changes have not been saved.',
        detail: zh ? '可重试保存，或返回应用导出待保存数据。放弃并退出会丢失这些修改。' : 'Retry saving or return to export pending changes. Discarding loses these changes.',
        buttons: zh ? ['返回应用', '重试保存', '放弃并退出'] : ['Return to app', 'Retry saving', 'Discard and quit'],
        defaultId: 0, cancelId: 0,
      }).then(({ response }) => {
        quitPromptOpen = false;
        if (response === 2) { discardOnQuit = true; app.quit(); }
        else if (response === 1) app.quit();
      }).catch(() => { quitPromptOpen = false; });
      return;
    }
    isQuitting = true;
    flushWindowState();
    destroyTray();
  });

  app.on('window-all-closed', () => {
    // With "minimize to tray" on, closing hides the window, so this only fires
    // when the user actually quits.
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

