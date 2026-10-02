import { app, BrowserWindow, Menu, Tray } from 'electron';
import fs from 'fs';
import path from 'path';
import { readJsonWithBackup, writeTextAtomically } from './durable-file';
import { isWindowStateSnapshot } from './persisted-state-validation';
import { normalizeWindowState, WindowStateSnapshot } from './window-state';
import { resolveWindowLoadTarget } from './electron-window-target';
import { isTrustedRendererUrl } from './ipc-security';
import type { AppDataStore } from './app-data-store';

export function createDesktopShell(options: { getStore: () => Pick<AppDataStore, 'get'>; isQuitting: () => boolean }) {
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let windowStateFilePath = '';
let windowStateSaveTimer: NodeJS.Timeout | null = null;
const DESKTOP_SETTINGS_KEY = 'mylifeos_desktop_settings';
const LANGUAGE_KEY = 'mylifeos_lang';
const TRAY_LABELS = { zh: { show: '显示窗口', quit: '退出 MyLifeOS' }, en: { show: 'Show window', quit: 'Quit MyLifeOS' } };
function ensureDirectoryForFile(file: string) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
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
  const raw = options.getStore().get(DESKTOP_SETTINGS_KEY);
  if (!raw) return true;

  try {
    const parsed = JSON.parse(raw) as { minimizeToTray?: unknown };
    return typeof parsed.minimizeToTray === 'boolean' ? parsed.minimizeToTray : true;
  } catch (_error) {
    return true;
  }
}

function getTrayLabels() {
  const language = options.getStore().get(LANGUAGE_KEY);
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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, path.join(__dirname, '..'), process.env.ELECTRON_START_URL)) event.preventDefault();
  });
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
    if (!options.isQuitting() && isMinimizeToTrayEnabled()) {
      event.preventDefault();
      flushWindowState();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

return { get window() { return mainWindow; }, createWindow, showMainWindow, createTray, refreshTrayMenu, destroyTray, flushWindowState };
}
