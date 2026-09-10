import { KEYS, getStorageItem, safeParse, setStorageItem } from './storage/localStorageStore';

export interface FocusSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  breakDurationMinutes: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
  notificationsEnabled: true,
  breakDurationMinutes: 5,
};

const BREAK_DURATION_OPTIONS = new Set([3, 5, 10, 15]);

const normalizeFocusSettings = (value: Partial<FocusSettings>): FocusSettings => {
  const breakDurationMinutes = BREAK_DURATION_OPTIONS.has(Number(value.breakDurationMinutes))
    ? Number(value.breakDurationMinutes)
    : DEFAULT_FOCUS_SETTINGS.breakDurationMinutes;

  return {
    soundEnabled: typeof value.soundEnabled === 'boolean' ? value.soundEnabled : DEFAULT_FOCUS_SETTINGS.soundEnabled,
    vibrationEnabled: typeof value.vibrationEnabled === 'boolean' ? value.vibrationEnabled : DEFAULT_FOCUS_SETTINGS.vibrationEnabled,
    notificationsEnabled: typeof value.notificationsEnabled === 'boolean' ? value.notificationsEnabled : DEFAULT_FOCUS_SETTINGS.notificationsEnabled,
    breakDurationMinutes,
  };
};

export const getFocusSettings = (): FocusSettings => {
  return normalizeFocusSettings(safeParse<Partial<FocusSettings>>(getStorageItem(KEYS.FOCUS_SETTINGS), DEFAULT_FOCUS_SETTINGS));
};

export const saveFocusSettings = (settings: FocusSettings) => {
  const normalized = normalizeFocusSettings(settings);
  setStorageItem(KEYS.FOCUS_SETTINGS, JSON.stringify(normalized));
  return normalized;
};

