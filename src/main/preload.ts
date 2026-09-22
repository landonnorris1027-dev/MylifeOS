import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const validInvokeChannels = new Set<string>([
  'pomodoro-start',
  'pomodoro-get-active-timers',
  'pomodoro-get-pending-recoveries',
  'pomodoro-resolve-recovery',
  'dialog-save-backup',
  'storage-status',
  'storage-retry',
  'storage-pending-snapshot',
  'storage-commit',
]);

const validSendChannels = new Set<string>([
  'pomodoro-toggle',
  'pomodoro-stop',
  'storage-get-sync',
  'storage-set-sync',
]);

const validOnChannels = new Set<string>([
  'pomodoro-update',
  'storage-write-error',
  'storage-status',
]);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel: string, payload?: unknown) {
    if (!validInvokeChannels.has(channel)) {
      throw new Error(`Blocked invoke channel: ${channel}`);
    }

    return ipcRenderer.invoke(channel, payload);
  },
  send(channel: string, payload?: unknown) {
    if (!validSendChannels.has(channel)) {
      throw new Error(`Blocked send channel: ${channel}`);
    }

    ipcRenderer.send(channel, payload);
  },
  sendSync(channel: string, payload?: unknown) {
    if (!validSendChannels.has(channel)) {
      throw new Error(`Blocked sync channel: ${channel}`);
    }

    return ipcRenderer.sendSync(channel, payload);
  },
  on(channel: string, callback: (data: unknown) => void) {
    if (!validOnChannels.has(channel)) {
      throw new Error(`Blocked event channel: ${channel}`);
    }

    const wrapped = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(channel, wrapped);

    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
});
