export const KEYS = {
  HABITS: 'mylifeos_habits',
  GOALS: 'mylifeos_goals',
  DAILY_LOGS: 'mylifeos_daily_logs',
  LANGUAGE: 'mylifeos_lang',
  FOCUS_SETTINGS: 'mylifeos_focus_settings',
  PROFILE_SETTINGS: 'mylifeos_profile_settings',
  PLANNER_SETTINGS: 'mylifeos_planner_settings',
  RECOVERY_POINTS: 'mylifeos_recovery_points',
  DESKTOP_SETTINGS: 'mylifeos_desktop_settings',
} as const;

export const DATA_SCHEMA_VERSION = 5;
const BROWSER_SNAPSHOT = 'mylifeos_business_snapshot';
let desktopReadOnly = false;
export const setStorageReadOnly = (value: boolean) => { desktopReadOnly = value; };
export const isStorageReadOnly = () => desktopReadOnly;
const usesSnapshot = (key: string) => key !== KEYS.RECOVERY_POINTS && Object.values(KEYS).includes(key as typeof KEYS[keyof typeof KEYS]);
const readBrowserSnapshot = (): Record<string, string> | null => {
  const raw = localStorage.getItem(BROWSER_SNAPSHOT);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.values(value).some(entry => typeof entry !== 'string')) throw new StorageWriteError('Invalid browser snapshot');
  return value;
};

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
      throw new StorageWriteError('Desktop storage is unavailable; browser fallback is disabled to protect data.');
    }
  }

  const snapshot = usesSnapshot(key) ? readBrowserSnapshot() : null;
  return snapshot ? snapshot[key] ?? null : localStorage.getItem(key);
};

export const setStorageItem = (key: string, value: string) => {
  if (desktopReadOnly) throw new StorageWriteError('Storage is read-only until retry or recovery succeeds');
  if (hasDesktopStorage()) {
    const result = window.electronAPI?.sendSync('storage-set-sync', { key, value });
    if (!result?.ok) {
      throw new StorageWriteError(result?.error || `Failed to write desktop storage key: ${key}`);
    }
    return;
  }

  const snapshot = usesSnapshot(key) ? readBrowserSnapshot() : null;
  if (snapshot) localStorage.setItem(BROWSER_SNAPSHOT, JSON.stringify({ ...snapshot, [key]: value }));
  else localStorage.setItem(key, value);
};

export const commitStorageSnapshot = async (entries: Record<string, string>, recover = false): Promise<void> => {
  if (hasDesktopStorage()) {
    const result = await window.electronAPI!.invoke('storage-commit', { entries, recover });
    if (!result?.ok) throw new StorageWriteError(result?.error || 'Snapshot commit failed');
  } else {
    const previous: Record<string, string> = {};
    Object.values(KEYS).filter(usesSnapshot).forEach(key => {
      const value = getStorageItem(key);
      if (value !== null) previous[key] = value;
    });
    // Web Storage atomically replaces one value; legacy keys remain untouched.
    localStorage.setItem(BROWSER_SNAPSHOT, JSON.stringify({ ...previous, ...entries }));
  }
  window.dispatchEvent(new Event('mylifeos-storage-restored'));
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
