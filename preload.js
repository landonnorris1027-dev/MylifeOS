const { contextBridge, ipcRenderer } = require('electron');

const validInvokeChannels = new Set([
  'pomodoro-start',
  'pomodoro-get-active-timers',
  'pomodoro-get-pending-recoveries',
  'pomodoro-resolve-recovery',
]);

const validSendChannels = new Set([
  'pomodoro-toggle',
  'pomodoro-stop',
  'storage-get-sync',
  'storage-set-sync',
]);

const validOnChannels = new Set([
  'pomodoro-update',
]);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel, payload) {
    if (!validInvokeChannels.has(channel)) {
      throw new Error(`Blocked invoke channel: ${channel}`);
    }

    return ipcRenderer.invoke(channel, payload);
  },
  send(channel, payload) {
    if (!validSendChannels.has(channel)) {
      throw new Error(`Blocked send channel: ${channel}`);
    }

    ipcRenderer.send(channel, payload);
  },
  sendSync(channel, payload) {
    if (!validSendChannels.has(channel)) {
      throw new Error(`Blocked sync channel: ${channel}`);
    }

    return ipcRenderer.sendSync(channel, payload);
  },
  on(channel, callback) {
    if (!validOnChannels.has(channel)) {
      throw new Error(`Blocked event channel: ${channel}`);
    }

    const wrapped = (_event, data) => callback(data);
    ipcRenderer.on(channel, wrapped);

    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
});
