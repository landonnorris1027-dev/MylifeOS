import { KEYS, getStorageItem, safeParse, setStorageItem } from './storage/localStorageStore';

export interface ProfileSettings {
  weeklyTargetMinutes: number;
}

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  weeklyTargetMinutes: 10 * 60,
};

const normalizeProfileSettings = (value: Partial<ProfileSettings>): ProfileSettings => {
  const weeklyTargetMinutes = Number(value.weeklyTargetMinutes);

  return {
    weeklyTargetMinutes: Number.isFinite(weeklyTargetMinutes) && weeklyTargetMinutes >= 60 && weeklyTargetMinutes <= 80 * 60
      ? Math.round(weeklyTargetMinutes)
      : DEFAULT_PROFILE_SETTINGS.weeklyTargetMinutes,
  };
};

export const getProfileSettings = (): ProfileSettings => {
  return normalizeProfileSettings(safeParse<Partial<ProfileSettings>>(getStorageItem(KEYS.PROFILE_SETTINGS), DEFAULT_PROFILE_SETTINGS));
};

export const saveProfileSettings = (settings: ProfileSettings) => {
  const normalized = normalizeProfileSettings(settings);
  setStorageItem(KEYS.PROFILE_SETTINGS, JSON.stringify(normalized));
  return normalized;
};
