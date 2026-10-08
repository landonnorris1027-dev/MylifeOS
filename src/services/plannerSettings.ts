import { TimelineMode } from './scheduling';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './storage/localStorageStore';

export interface PlannerSettings {
  timelineMode: TimelineMode;
  intervalMinutes: 15 | 30;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  timelineMode: 'daytime',
  intervalMinutes: 15,
};

const normalizePlannerSettings = (value: Partial<PlannerSettings>): PlannerSettings => ({
  timelineMode: value.timelineMode === 'fullDay' ? 'fullDay' : DEFAULT_PLANNER_SETTINGS.timelineMode,
  intervalMinutes: value.intervalMinutes === 15 || value.intervalMinutes === 30 ? value.intervalMinutes
    : (value.intervalMinutes as number | undefined) === 5 ? 15 : 30,
});

export const getPlannerSettings = (): PlannerSettings => {
  const stored = getStorageItem(KEYS.PLANNER_SETTINGS);
  const existing = stored !== null || [KEYS.DAILY_LOGS, KEYS.HABITS, KEYS.FOCUS_SETTINGS].some(key => getStorageItem(key) !== null);
  return stored ? normalizePlannerSettings(safeParse<Partial<PlannerSettings>>(stored, {}))
    : { ...DEFAULT_PLANNER_SETTINGS, intervalMinutes: existing ? 30 : 15 };
};

export const savePlannerSettings = (settings: Partial<PlannerSettings>) => {
  const normalized = normalizePlannerSettings({ ...getPlannerSettings(), ...settings });
  setStorageItem(KEYS.PLANNER_SETTINGS, JSON.stringify(normalized));
  return normalized;
};
