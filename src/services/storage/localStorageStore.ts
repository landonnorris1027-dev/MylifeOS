import { persistNativePreference } from './nativePreferences';

export const KEYS = {
  HABITS: 'mylifeos_habits',
  GOALS: 'mylifeos_goals',
  DAILY_LOGS: 'mylifeos_daily_logs',
  LANGUAGE: 'mylifeos_lang',
  FOCUS_SETTINGS: 'mylifeos_focus_settings',
  PROFILE_SETTINGS: 'mylifeos_profile_settings',
  PLANNER_SETTINGS: 'mylifeos_planner_settings',
  RECOVERY_POINTS: 'mylifeos_recovery_points',
} as const;

export const DATA_SCHEMA_VERSION = 4;

export class StorageWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageWriteError';
  }
}

const hasDesktopStorage = () => {
  return typeof window !== 'undefined' && typeof window.electronAPI?.sendSync === 'function';
};

export const getStorageItem = (key: string): string | null => {
  if (hasDesktopStorage()) {
    try {
      return window.electronAPI?.sendSync('storage-get-sync', { key }) ?? null;
    } catch (e) {
      console.warn('MyLifeOS: Failed to read desktop storage, falling back to localStorage.', e);
    }
  }

  return localStorage.getItem(key);
};

export const setStorageItem = (key: string, value: string) => {
  if (hasDesktopStorage()) {
    const result = window.electronAPI?.sendSync('storage-set-sync', { key, value });
    if (!result?.ok) {
      throw new StorageWriteError(result?.error || `Failed to write desktop storage key: ${key}`);
    }
    return;
  }

  localStorage.setItem(key, value);
  persistNativePreference(key, value);
};

export const safeParse = <T>(str: string | null, fallback: T): T => {
  if (!str || str === 'undefined' || str === 'null') return fallback;
  try {
    const parsed = JSON.parse(str);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch (e) {
    console.warn('MyLifeOS: Failed to parse storage item, resetting to fallback.', e);
    return fallback;
  }
};
