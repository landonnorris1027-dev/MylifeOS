import { KEYS, getStorageItem, safeParse, setStorageItem } from './storage/localStorageStore';

export interface DesktopSettings {
  /** Closing the window hides it into the tray instead of quitting. */
  minimizeToTray: boolean;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  minimizeToTray: true,
};

const normalizeDesktopSettings = (value: Partial<DesktopSettings>): DesktopSettings => {
  return {
    minimizeToTray:
      typeof value.minimizeToTray === 'boolean'
        ? value.minimizeToTray
        : DEFAULT_DESKTOP_SETTINGS.minimizeToTray,
  };
};

export const getDesktopSettings = (): DesktopSettings => {
  return normalizeDesktopSettings(
    safeParse<Partial<DesktopSettings>>(getStorageItem(KEYS.DESKTOP_SETTINGS), DEFAULT_DESKTOP_SETTINGS),
  );
};

export const saveDesktopSettings = (settings: DesktopSettings): DesktopSettings => {
  const normalized = normalizeDesktopSettings(settings);
  setStorageItem(KEYS.DESKTOP_SETTINGS, JSON.stringify(normalized));
  return normalized;
};
