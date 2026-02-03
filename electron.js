console.log('--- ELECTRON PROCESS STARTING ---');

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 在 app 准备之前禁用硬件加速以避免 GPU 进程崩溃问题（Windows 常见）
try {
  // disableHardwareAcceleration 必须在 app.ready 之前调用
  app.disableHardwareAcceleration();
  // 额外开关以尽量完全禁用 GPU
  app.commandLine.appendSwitch('disable-gpu');
} catch (e) {}

// 全局变量，防止窗口被自动关闭
let mainWindow = null;
const __DEBUG_LOG_PATH = path.join(__dirname, '.cursor', 'debug.log');
// 确保目录存在以便写入日志
try {
  const __DEBUG_LOG_DIR = path.dirname(__DEBUG_LOG_PATH);
  if (!fs.existsSync(__DEBUG_LOG_DIR)) {
    fs.mkdirSync(__DEBUG_LOG_DIR, { recursive: true });
  }
} catch (e) {}

// #region agent log - startup env
try {
  const payload = { sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'ENV', location: 'electron.js:startup', message: 'startup env', data: { pid: process.pid, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS || null, vscodePid: process.env.VSCODE_PID || null }, timestamp: Date.now() };
  try { fetch('http://127.0.0.1:7242/ingest/b05344c6-eeb8-4b25-9852-7301449ea86a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => { }); } catch (e) {}
  try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify(payload) + '\\n'); } catch (e) {}
} catch (e) {}
// #endregion

function createWindow() {
  console.log('[MyLifeOS] Creating window...');

  // #region agent log
  try { fetch('http://127.0.0.1:7242/ingest/b05344c6-eeb8-4b25-9852-7301449ea86a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H1', location: 'electron.js:createWindow', message: 'enter createWindow', data: {}, timestamp: Date.now() }) }).catch(() => { }); } catch (e) { }
  try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H1', location: 'electron.js:createWindow', message: 'enter createWindow', data: {}, timestamp: Date.now() }) + '\\n'); } catch (e) { }
  // #endregion

  // 创建窗口，但先不立即显示，等待内容准备完毕再 show（更可靠）
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "MyLifeOS",
    backgroundColor: '#F7F7F5',
    icon: path.join(__dirname, 'public/favicon.ico'),
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // 生产模式：加载构建文件
  const filePath = path.join(__dirname, 'build/index.html');
  console.log(`[MyLifeOS] Loading file: ${filePath}`);
  // #region agent log
  try { fetch('http://127.0.0.1:7242/ingest/b05344c6-eeb8-4b25-9852-7301449ea86a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H2', location: 'electron.js:createWindow', message: 'about to loadFile', data: { filePath }, timestamp: Date.now() }) }).catch(() => { }); } catch (e) { }
  try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H2', location: 'electron.js:createWindow', message: 'about to loadFile', data: { filePath }, timestamp: Date.now() }) + '\\n'); } catch (e) { }
  // #endregion

  mainWindow.loadFile(filePath).then(() => {
    // #region agent log
    try {
      fetch('http://127.0.0.1:7242/ingest/b05344c6-eeb8-4b25-9852-7301449ea86a', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H4', location: 'electron.js:createWindow', message: 'loadFile succeeded', data: { filePath }, timestamp: Date.now() }) }).catch(() => { }); } catch(e) {}
    try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H4', location: 'electron.js:createWindow', message: 'loadFile succeeded', data: { filePath }, timestamp: Date.now() }) + '\\n'); } catch (e) {}
    // #endregion
    // 如果 ready-to-show 没有触发（例如 GPU 进程问题），在 load 完成后作为后备显示窗口
    try {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
        try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H8', location: 'electron.js:createWindow', message: 'loadFile.then fallback show', data: {}, timestamp: Date.now() }) + '\\n'); } catch (e) {}
      }
    } catch (e) {}
  }).catch(err => {
    console.error("[MyLifeOS] FAILED to load file:", err);
    // #region agent log
    try { fetch('http://127.0.0.1:7242/ingest/b05344c6-eeb8-4b25-9852-7301449ea86a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H3', location: 'electron.js:loadFile.catch', message: 'loadFile failed', data: { error: String(err) }, timestamp: Date.now() }) }).catch(() => { }); } catch (e) { }
    try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H3', location: 'electron.js:loadFile.catch', message: 'loadFile failed', data: { error: String(err) }, timestamp: Date.now() }) + '\\n'); } catch (e) {}
    // #endregion
  });

  // 当渲染器准备好显示时再显示窗口，避免白屏或未显示的情况
  mainWindow.once('ready-to-show', () => {
    try {
      mainWindow.show();
      mainWindow.focus();
      try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H6', location: 'electron.js:createWindow', message: 'ready-to-show, window shown', data: {}, timestamp: Date.now() }) + '\\n'); } catch (e) {}
    } catch (e) {
      console.error('[MyLifeOS] failed to show window:', e);
    }
  });

  // 捕获加载失败以便记录原因
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[MyLifeOS] did-fail-load', errorCode, errorDescription, validatedURL, isMainFrame);
    try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H7', location: 'electron.js:did-fail-load', message: 'did-fail-load', data: { errorCode, errorDescription, validatedURL, isMainFrame }, timestamp: Date.now() }) + '\\n'); } catch (e) {}
  });

        // 如果窗口是白的，按 Ctrl+Shift+I 可以打开控制台查看原因
        // 根据环境变量决定是否自动打开 DevTools（仅用于调试）
        try {
          const enableDevtools = process.env.ENABLE_DEVTOOLS === 'true' || process.env.NODE_ENV === 'development';
          if (enableDevtools) {
            // 以分离窗口方式打开，便于不遮挡主窗口
            mainWindow.webContents.openDevTools({ mode: 'detach' });
            try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H9', location: 'electron.js:createWindow', message: 'devtools opened', data: {}, timestamp: Date.now() }) + '\\n'); } catch (e) {}
          }
        } catch (e) {}

        mainWindow.on('closed', () => {
          mainWindow = null;
        });
      }

app.whenReady().then(() => {
  // #region agent log
  try { fetch('http://127.0.0.1:7242/ingest/b05344c6-eeb8-4b25-9852-7301449ea86a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H5', location: 'electron.js:whenReady', message: 'app.whenReady', data: { platform: process.platform }, timestamp: Date.now() }) }).catch(() => { }); } catch (e) { }
  try { fs.appendFileSync(__DEBUG_LOG_PATH, JSON.stringify({ sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H5', location: 'electron.js:whenReady', message: 'app.whenReady', data: { platform: process.platform }, timestamp: Date.now() }) + '\\n'); } catch (e) {}
  // #endregion

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