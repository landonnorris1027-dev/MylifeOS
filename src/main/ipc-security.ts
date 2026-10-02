import path from 'path';
import { pathToFileURL } from 'url';
import { isAllowedDevServerUrl } from './electron-window-target';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 240) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v);
export function isTrustedRendererUrl(url: string, appRoot: string, startUrl = ''): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(isAllowedDevServerUrl(startUrl) ? startUrl : pathToFileURL(path.join(appRoot, 'build/index.html')).href);
    return actual.protocol === expected.protocol && actual.host === expected.host
      && decodeURIComponent(actual.pathname).toLowerCase() === decodeURIComponent(expected.pathname).toLowerCase();
  } catch { return false; }
}
export function validateIpcRequest(channel: string, payload: unknown): void {
  let valid = false;
  if (['storage-read-all', 'storage-flush', 'storage-status', 'storage-retry', 'storage-pending-snapshot', 'app-info',
    'pomodoro-get-active-timers', 'pomodoro-get-completed-focus', 'pomodoro-get-pending-recoveries', 'pomodoro-pending-state'].includes(channel)) valid = payload === undefined;
  else if (['pomodoro-toggle', 'pomodoro-stop', 'pomodoro-complete'].includes(channel)) valid = object(payload) && text(payload.timerId);
  else if (channel === 'pomodoro-abandon-for-restore') valid = object(payload) && payload.confirmed === true;
  else if (channel === 'pomodoro-resolve-recovery') valid = object(payload) && text(payload.recoveryId)
    && ['complete', 'resume-break', 'restart-break', 'dismiss'].includes(String(payload.action));
  else if (channel === 'pomodoro-start' && object(payload)) {
    valid = text(payload.timerId) && typeof payload.duration === 'number' && Number.isFinite(payload.duration)
      && payload.duration > 0 && payload.duration <= 86400 && typeof payload.isFocusMode === 'boolean'
      && ['notificationsEnabled', 'soundEnabled', 'vibrationEnabled'].every(key => payload[key] === undefined || typeof payload[key] === 'boolean')
      && ['taskId', 'taskHabitId', 'taskName', 'taskDate'].every(key => payload[key] === undefined || text(payload[key], key === 'taskName' ? 2000 : 240))
      && (payload.taskPriority === undefined || ['P1', 'P2', 'P3'].includes(String(payload.taskPriority)))
      && (payload.taskDurationMinutes === undefined || typeof payload.taskDurationMinutes === 'number' && Number.isInteger(payload.taskDurationMinutes) && payload.taskDurationMinutes > 0 && payload.taskDurationMinutes <= 1440)
      && (payload.breakDurationSeconds === undefined || typeof payload.breakDurationSeconds === 'number' && Number.isFinite(payload.breakDurationSeconds) && payload.breakDurationSeconds > 0 && payload.breakDurationSeconds <= 86400)
      && (payload.notificationMessages === undefined || object(payload.notificationMessages) && Object.values(payload.notificationMessages).every(value => text(value, 2000)));
  } else if (['storage-get-sync', 'storage-set-sync', 'storage-write'].includes(channel) && object(payload)) {
    valid = typeof payload.key === 'string' && /^[a-z][a-z0-9_]{0,100}$/.test(payload.key);
    if (channel !== 'storage-get-sync') valid = valid && typeof payload.value === 'string' && payload.value.length <= 128 * 1024 * 1024;
    if (channel === 'storage-write') valid = valid && (payload.expectedValue === null || typeof payload.expectedValue === 'string' && payload.expectedValue.length <= 128 * 1024 * 1024);
  } else if (channel === 'storage-commit') valid = object(payload) && object(payload.entries)
    && (payload.recover === undefined || typeof payload.recover === 'boolean')
    && Object.values(payload.entries).every(value => typeof value === 'string' && value.length <= 128 * 1024 * 1024);
  else if (channel === 'dialog-save-backup') valid = object(payload) && typeof payload.content === 'string'
    && payload.content.length > 0 && payload.content.length <= 128 * 1024 * 1024
    && (payload.filename === undefined || text(payload.filename) && !/[<>:"/\\|?*]/.test(String(payload.filename)));
  if (!valid) throw new Error(`Invalid IPC request: ${channel}`);
}
