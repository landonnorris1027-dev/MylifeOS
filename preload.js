const { contextBridge, ipcRenderer } = require('electron');
const { isValidTimerId, isValidDuration } = require('./shared/validation');

const sanitizeStartPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid pomodoro start payload');
  }

  const { timerId, duration, isFocusMode } = payload;
  if (!isValidTimerId(timerId) || !isValidDuration(duration) || typeof isFocusMode !== 'boolean') {
    throw new Error('Invalid pomodoro start payload fields');
  }

  return { timerId, duration, isFocusMode };
};

const sanitizeTimerOnlyPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid timer payload');
  }

  const { timerId } = payload;
  if (!isValidTimerId(timerId)) {
    throw new Error('Invalid timerId');
  }

  return { timerId };
};

const pomodoroBridge = Object.freeze({
  start: (payload) => ipcRenderer.invoke('pomodoro-start', sanitizeStartPayload(payload)),
  toggle: (payload) => ipcRenderer.send('pomodoro-toggle', sanitizeTimerOnlyPayload(payload)),
  stop: (payload) => ipcRenderer.send('pomodoro-stop', sanitizeTimerOnlyPayload(payload)),
  getActive: () => ipcRenderer.invoke('pomodoro-get-active'),
  onUpdate: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('onUpdate callback must be a function');
    }

    const handler = (_event, data) => callback(data);
    ipcRenderer.on('pomodoro-update', handler);
    return () => ipcRenderer.removeListener('pomodoro-update', handler);
  }
});

// electron-store 同步存储桥接
// 使用 ipcRenderer.invoke 避免阻塞渲染进程
const storageBridge = Object.freeze({
  get: async (key) => {
    const result = await ipcRenderer.invoke('storage-get', key);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  set: async (key, value) => {
    const result = await ipcRenderer.invoke('storage-set', key, value);
    if (!result.ok) throw new Error(result.error);
  },
  delete: async (key) => {
    const result = await ipcRenderer.invoke('storage-delete', key);
    if (!result.ok) throw new Error(result.error);
  },
  getAll: async () => {
    const result = await ipcRenderer.invoke('storage-get-all');
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  import: async (data) => {
    const result = await ipcRenderer.invoke('storage-import', data);
    if (!result.ok) throw new Error(result.error);
  },
  has: async (key) => {
    const result = await ipcRenderer.invoke('storage-has', key);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
});

contextBridge.exposeInMainWorld('myLifeOS', Object.freeze({
  pomodoro: pomodoroBridge,
  storage: storageBridge,
}));
