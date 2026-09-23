import { getFocusSettings } from '../focusSettings';
import { getPlannerSettings } from '../plannerSettings';
import { getProfileSettings } from '../profileSettings';
import { getDesktopSettings } from '../desktopSettings';
import { KEYS, getStorageItem } from './localStorageStore';

export const SETTING_KEYS = {
  language: KEYS.LANGUAGE, focus: KEYS.FOCUS_SETTINGS, planner: KEYS.PLANNER_SETTINGS,
  profile: KEYS.PROFILE_SETTINGS, desktop: KEYS.DESKTOP_SETTINGS,
};

export type BackupSettings = Partial<Record<keyof typeof SETTING_KEYS, unknown>>;

export const readBackupSettings = (): BackupSettings => ({
  language: getStorageItem(KEYS.LANGUAGE) || (navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh'),
  focus: getFocusSettings(), planner: getPlannerSettings(), profile: getProfileSettings(), desktop: getDesktopSettings(),
});

/** Reject malformed supplied settings instead of silently replacing preferences with defaults. */
export const validateBackupSettings = (value: unknown): BackupSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backup settings');
  const settings = value as Record<string, unknown>;
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  for (const [key, v] of Object.entries(settings)) {
    let valid = false;
    switch (key) {
      case 'language': valid = v === 'zh' || v === 'en'; break;
      case 'focus': valid = object(v) && typeof v.soundEnabled === 'boolean' && typeof v.notificationsEnabled === 'boolean' && typeof v.breakDurationMinutes === 'number' && [3, 5, 10, 15].includes(v.breakDurationMinutes); break;
      case 'planner': valid = object(v) && (v.timelineMode === 'daytime' || v.timelineMode === 'fullDay'); break;
      case 'profile': valid = object(v) && typeof v.weeklyTargetMinutes === 'number' && Number.isInteger(v.weeklyTargetMinutes) && v.weeklyTargetMinutes >= 60 && v.weeklyTargetMinutes <= 4800; break;
      case 'desktop': valid = object(v) && typeof v.minimizeToTray === 'boolean'; break;
      default: throw new Error(`Unknown backup setting: ${key}`);
    }
    if (!valid) throw new Error(`Invalid backup setting: ${key}`);
  }
  return settings;
};

export const settingsToEntries = (settings: BackupSettings): Record<string, string> => Object.fromEntries(
  Object.entries(settings).map(([key, value]) => [SETTING_KEYS[key as keyof typeof SETTING_KEYS], key === 'language' ? String(value) : JSON.stringify(value)]),
);
