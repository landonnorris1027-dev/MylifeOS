import { Diagnostics } from './diagnostics';
import type { BuildInfo } from './build-info';
import { createDesktopShell } from './desktop-shell';
import { isTrustedRendererUrl, validateIpcRequest } from './ipc-security';
console.log('--- ELECTRON PROCESS STARTING ---');

import { app, BrowserWindow, dialog, ipcMain, Notification, IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import { DurableFocusRuntime, FocusTimer } from './focus-runtime';
import { WriteQueue } from './write-queue';
import path from 'path';
import { AppDataStore, AppDataStoreFlushResult } from './app-data-store';
import type { StorageStatus, StorageTransaction } from './storage-contract';
import { migrateRecoveryPoints } from './recovery-points-migration';
import { migrateLegacyElectronStore } from './legacy-storage-migration';
import { writeTextAtomically } from './durable-file';
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


let focusRuntime: DurableFocusRuntime | null = null;
let timerStateFilePath = '';
let appDataFilePath = '';
let recoveryPointsFilePath = '';
let appDataStore: AppDataStore | null = null;
let recoveryPointsStore: AppDataStore | null = null;
let isQuitting = false;
let discardOnQuit = false;
let quitPromptOpen = false;
const writeQueue = new WriteQueue();
let sentRevision = -1;
let drainingQuit = false;
const diagnostics = new Diagnostics(path.join(app.getPath('userData'), 'diagnostics'));
function buildInfo(): BuildInfo { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8')); }
process.on('uncaughtExceptionMonitor', error => diagnostics.record('uncaught-error', { code: error.name }));
const shell = createDesktopShell({ getStore: getAppDataStore, isQuitting: () => isQuitting });

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

let diagnosedState = '';
function broadcastStorageStatus(): void {
  const status = getStorageStatus();
  if (status.state !== diagnosedState && (status.state === 'error' || status.state === 'recovery')) diagnostics.record(status.state === 'error' ? 'storage-error' : 'storage-recovery', { code: 'WRITE_OR_READ_FAILED' });
  diagnosedState = status.state;
  if (status.state === 'error' || status.state === 'recovery') focusRuntime?.pauseForStorageFailure();
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) window.webContents.send('storage-status', status);
  });
  if (appDataStore && appDataStore.revision !== sentRevision) {
    sentRevision = appDataStore.revision;
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) window.webContents.send('storage-changed', { revision: sentRevision });
    });
  }
}

function flushPendingStorageWrites(): boolean {
  const results = [appDataStore, recoveryPointsStore].filter((store): store is AppDataStore => !!store)
    .map(store => store.getStatus().hasPending ? store.flush().ok : true);
  if (focusRuntime?.status().hasPending || focusRuntime?.status().state === 'error') {
    try { focusRuntime.retry(); } catch { return false; }
  }
  return results.every(Boolean) && !['error', 'recovery'].includes(getStorageStatus().state);
}
function assertIpcSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): void {
  if (!shell.window || event.sender !== shell.window.webContents || !event.senderFrame || event.senderFrame.parent
    || !isTrustedRendererUrl(event.senderFrame.url, path.join(__dirname, '..'), process.env.ELECTRON_START_URL)) {
    throw new Error('Untrusted IPC source');
  }
}
function safeHandle<T>(channel: string, handler: (event: IpcMainInvokeEvent, payload: T) => unknown): void {
  ipcMain.handle(channel, (event, payload) => {
    assertIpcSender(event); validateIpcRequest(channel, payload);
    return channel === 'dialog-save-backup' ? handler(event, payload) : writeQueue.enqueue(() => handler(event, payload));
  });
}
function registerDialogIpc(): void {
  safeHandle(
    'dialog-save-backup',
    async (_event, { filename, content }: { filename?: unknown; content?: unknown }) => {
      if (typeof content !== 'string') {
        return { ok: false, error: 'Missing backup content' };
      }

      const suggestedName = typeof filename === 'string' && filename.trim() ? filename.trim() : 'mylifeos_backup.json';

      try {
        const parentWindow = shell.window && !shell.window.isDestroyed() ? shell.window : null;
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

        await writeQueue.enqueue(() => writeTextAtomically(result.filePath!, content));
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
  safeHandle('pomodoro-start', (_event, data: PomodoroTimerData) => getFocusRuntime().start(data));
  safeHandle('pomodoro-toggle', (_event, data: { timerId: string }) => getFocusRuntime().toggle(data.timerId));
  safeHandle('pomodoro-stop', (_event, data: { timerId: string }) => getFocusRuntime().stop(data.timerId));
  safeHandle('pomodoro-complete', (_event, data: { timerId: string }) => getFocusRuntime().complete(data.timerId));
  safeHandle('pomodoro-get-active-timers', () => getFocusRuntime().active());
  safeHandle('pomodoro-get-completed-focus', () => getFocusRuntime().completed());
  safeHandle('pomodoro-get-pending-recoveries', () => getFocusRuntime().recoveries());
  safeHandle('pomodoro-pending-state', () => getFocusRuntime().pending());
  safeHandle('pomodoro-abandon-for-restore', (_event, data: { confirmed: boolean }) => {
    if (data?.confirmed !== true) throw new Error('Explicit abandonment is required');
    getFocusRuntime().abandonForRestore();
  });
  safeHandle('pomodoro-resolve-recovery', (_event, data: { recoveryId: string; action: PomodoroRecoveryAction }) =>
    getFocusRuntime().resolve(data.recoveryId, data.action));
  const ticker = setInterval(() => {
    if (!writeQueue.pending) void writeQueue.enqueue(() => getFocusRuntime().tick());
  }, 250);
  app.on('will-quit', () => clearInterval(ticker));
}

function registerStorageIpc(): void {
  safeHandle('app-info', () => buildInfo());
  safeHandle('storage-read-all', () => ({ revision: getAppDataStore().revision,
    entries: { ...getAppDataStore().snapshot(), [RECOVERY_POINTS_KEY]: getRecoveryPointsStore().get(RECOVERY_POINTS_KEY) || '[]' } }));
  safeHandle('storage-write', (_event, payload: { key: string; value: string; expectedValue: string | null }) => {
    const store = getStorageStoreForKey(payload.key);
    if (store.get(payload.key) !== payload.expectedValue) return { ok: false, error: 'Data changed before this edit was accepted' };
    store.set(payload.key, payload.value);
    if (payload.key === RECOVERY_POINTS_KEY) return store.flush();
    return { ok: true, accepted: true, revision: store.revision };
  });
  safeHandle('storage-flush', () => ({ ok: flushPendingStorageWrites(), ...getStorageStatus() }));
  safeHandle('storage-status', () => getStorageStatus());
  safeHandle('storage-retry', () => ({ ok: flushPendingStorageWrites(), ...getStorageStatus() }));
  safeHandle('storage-pending-snapshot', () => getAppDataStore().snapshot(true));
  safeHandle('storage-commit', (_event, payload: StorageTransaction) => {
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
    if (result.ok) shell.refreshTrayMenu();
    return result;
  });
  ipcMain.on('storage-get-sync', (event, payload: { key: unknown }) => {
    try { assertIpcSender(event); validateIpcRequest('storage-get-sync', payload); } catch { event.returnValue = null; return; }
    const { key } = payload;
    if (typeof key !== 'string') {
      event.returnValue = null;
      return;
    }

    event.returnValue = getStorageStoreForKey(key).get(key);
  });

  ipcMain.on('storage-set-sync', (event, payload: { key: unknown; value: unknown }) => {
    try { assertIpcSender(event); validateIpcRequest('storage-set-sync', payload); } catch { event.returnValue = { ok: false, error: 'Invalid storage request or source' }; return; }
    const { key, value } = payload;
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

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    shell.showMainWindow();
  });

  app.whenReady().then(() => {
    try { const info = buildInfo(); diagnostics.record('startup', { version: info.version, commit: info.sourceCommit }); } catch { diagnostics.record('startup'); }
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
    shell.createTray();
    shell.createWindow();
  });

  app.on('before-quit', (event) => {
    if (writeQueue.pending) {
      event.preventDefault();
      if (!drainingQuit) {
        drainingQuit = true;
        void writeQueue.drain().then(() => { drainingQuit = false; app.quit(); });
      }
      return;
    }
    if (!discardOnQuit && !flushPendingStorageWrites()) {
      event.preventDefault();
      isQuitting = false;
      if (quitPromptOpen) return;
      quitPromptOpen = true;
      shell.showMainWindow();
      const zh = getAppDataStore().get(LANGUAGE_KEY) !== 'en';
      void dialog.showMessageBox(shell.window!, {
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
    shell.flushWindowState();
    shell.destroyTray();
  });

  app.on('window-all-closed', () => {
    // With "minimize to tray" on, closing hides the window, so this only fires
    // when the user actually quits.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (shell.window === null) {
      shell.createWindow();
    }
  });
}

