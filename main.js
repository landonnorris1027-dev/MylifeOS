const { app, BrowserWindow, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// 初始化 electron-store，数据将自动存储在 %APPDATA%/mylifeos/config.json
const store = new Store({
  name: 'config',
  defaults: {
    mylifeos_habits: [],
    mylifeos_daily_logs: {},
    mylifeos_lang: 'zh',
  },
});

// 在 app 准备之前禁用硬件加速以避免 GPU 进程崩溃问题（Windows 常见）
try {
  // disableHardwareAcceleration 必须在 app.ready 之前调用
  app.disableHardwareAcceleration();
  // 额外开关以尽量完全禁用 GPU
  app.commandLine.appendSwitch('disable-gpu');
} catch (e) { }

// 全局变量，防止窗口被自动关闭
let mainWindow = null;

const { PomodoroManager } = require('./shared/pomodoroManager');

// 全局番茄钟管理实例
const pomodoroManager = new PomodoroManager({ getMainWindow: () => mainWindow, NotificationImpl: Notification });
const DEBUG_LOG_ENABLED = process.env.MYLIFEOS_DEBUG_LOG === 'true' && process.env.NODE_ENV !== 'production';
const DEBUG_LOG_PATH = path.join(app.getPath('userData'), 'debug.log');
const STORAGE_ALLOWED_KEYS = new Set([
  'mylifeos_habits',
  'mylifeos_daily_logs',
  'mylifeos_lang',
  'mylifeos_migrated_to_electron_store',
]);
const STORAGE_LOG_KEY_PATTERN = /^mylifeos_log_\d{4}-\d{2}-\d{2}$/;

const isAllowedStorageKey = (key) => {
  return typeof key === 'string' && (STORAGE_ALLOWED_KEYS.has(key) || STORAGE_LOG_KEY_PATTERN.test(key));
};

const assertAllowedStorageKey = (key) => {
  if (!isAllowedStorageKey(key)) {
    throw new Error('Storage key is not allowed');
  }
};

const getAllowedStoreSnapshot = () => {
  return Object.keys(store.store).reduce((result, key) => {
    if (isAllowedStorageKey(key)) {
      result[key] = store.store[key];
    }
    return result;
  }, {});
};

const debugLog = (line) => {
  if (!DEBUG_LOG_ENABLED) return;
  try {
    const debugDir = path.dirname(DEBUG_LOG_PATH);
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (e) {}
};

const logMainError = (message, error) => {
  const detail = error ? ` ${error.stack || error.message || String(error)}` : '';
  debugLog(`${message}${detail}\n`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error || '');
  }
};

function createWindow() {
  debugLog('[MyLifeOS] Creating window...\n');

  // 创建窗口，但先不立即显示，等待内容准备完毕再 show（更可靠）
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "MyLifeOS",
    backgroundColor: '#F7F7F5',
    icon: path.join(__dirname, 'public/favicon.ico'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const startUrl = process.env.ELECTRON_START_URL;
  const filePath = path.join(__dirname, 'build/index.html');
  const loadPromise = startUrl ? mainWindow.loadURL(startUrl) : mainWindow.loadFile(filePath);
  debugLog(`[MyLifeOS] Loading ${startUrl ? 'URL' : 'file'}: ${startUrl || filePath}\n`);

  loadPromise.then(() => {
    // 如果 ready-to-show 没有触发（例如 GPU 进程问题），在 load 完成后作为后备显示窗口
    try {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    } catch (e) { }
  }).catch(err => {
    logMainError("[MyLifeOS] FAILED to load file:", err);
  });

  // 当渲染器准备好显示时再显示窗口，避免白屏或未显示的情况
  mainWindow.once('ready-to-show', () => {
    try {
      mainWindow.show();
      mainWindow.focus();
    } catch (e) {
      logMainError('[MyLifeOS] failed to show window:', e);
    }
  });

  // 捕获加载失败以便记录原因
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logMainError('[MyLifeOS] did-fail-load', `${errorCode} ${errorDescription} ${validatedURL} ${isMainFrame}`);
  });

  // 如果窗口是白的，按 Ctrl+Shift+I 可以打开控制台查看原因
  // 根据环境变量决定是否自动打开 DevTools（仅用于调试）
  try {
    const enableDevtools = process.env.ENABLE_DEVTOOLS === 'true' || process.env.NODE_ENV === 'development';
    if (enableDevtools) {
      // 以分离窗口方式打开，便于不遮挡主窗口
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (e) { }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {

  createWindow();
});

// IPC 事件处理
const { ipcMain } = require('electron');
const { isValidTimerId, isValidDuration } = require('./shared/validation');

const parseStartPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid pomodoro-start payload');
  }

  const { timerId, duration, isFocusMode } = payload;
  if (!isValidTimerId(timerId) || !isValidDuration(duration) || typeof isFocusMode !== 'boolean') {
    throw new Error('Invalid pomodoro-start payload fields');
  }

  return { timerId, duration, isFocusMode };
};

const parseTimerPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid timer payload');
  }

  const { timerId } = payload;
  if (!isValidTimerId(timerId)) {
    throw new Error('Invalid timerId');
  }

  return { timerId };
};

ipcMain.handle('pomodoro-start', (event, payload) => {
  const { timerId, duration, isFocusMode } = parseStartPayload(payload);
  const result = pomodoroManager.startTimer(timerId, duration, isFocusMode);
  return { timerId, ...result };
});

ipcMain.on('pomodoro-toggle', (event, payload) => {
  const { timerId } = parseTimerPayload(payload);
  pomodoroManager.toggleTimer(timerId);
});

ipcMain.on('pomodoro-stop', (event, payload) => {
  const { timerId } = parseTimerPayload(payload);
  pomodoroManager.stopTimer(timerId);
  event.reply('pomodoro-stopped', { timerId });
});

ipcMain.handle('pomodoro-get-active', () => {
  return pomodoroManager.getActiveTimers();
});

// ============ electron-store async IPC handlers ============
ipcMain.handle('storage-get', async (event, key) => {
  try {
    assertAllowedStorageKey(key);
    return { ok: true, value: store.get(key) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('storage-set', async (event, key, value) => {
  try {
    assertAllowedStorageKey(key);
    store.set(key, value);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('storage-delete', async (event, key) => {
  try {
    assertAllowedStorageKey(key);
    store.delete(key);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('storage-get-all', async () => {
  try {
    return { ok: true, value: getAllowedStoreSnapshot() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('storage-import', async (event, data) => {
  try {
    // 逐个 key 写入，避免覆盖无关配置
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      keys.forEach(assertAllowedStorageKey);
      keys.forEach((key) => store.set(key, data[key]));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('storage-has', async (event, key) => {
  try {
    assertAllowedStorageKey(key);
    return { ok: true, value: store.has(key) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 应用退出前清理所有计时器
    pomodoroManager.cleanup();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 应用退出前的清理工作
app.on('before-quit', () => {
  pomodoroManager.cleanup();
});
