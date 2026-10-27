import { TimelineMode, TIMELINE_INTERVAL_MINUTES } from './scheduling';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './storage/localStorageStore';

export interface PlannerSettings {
  timelineMode: TimelineMode;
  intervalMinutes: typeof TIMELINE_INTERVAL_MINUTES;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  timelineMode: 'daytime',
  intervalMinutes: TIMELINE_INTERVAL_MINUTES,
};

const normalizePlannerSettings = (value: Partial<PlannerSettings>): PlannerSettings => ({
  timelineMode: value.timelineMode === 'fullDay' ? 'fullDay' : DEFAULT_PLANNER_SETTINGS.timelineMode,
  // Old 5/15-minute settings remain readable, but all new scheduling uses 30.
  intervalMinutes: TIMELINE_INTERVAL_MINUTES,
});

export const getPlannerSettings = (): PlannerSettings => {
  const stored = getStorageItem(KEYS.PLANNER_SETTINGS);
  return stored ? normalizePlannerSettings(safeParse<Partial<PlannerSettings>>(stored, {}))
    : { ...DEFAULT_PLANNER_SETTINGS };
};

export const savePlannerSettings = (settings: Partial<PlannerSettings>) => {
  const normalized = normalizePlannerSettings({ ...getPlannerSettings(), ...settings });
  setStorageItem(KEYS.PLANNER_SETTINGS, JSON.stringify(normalized));
  return normalized;
};
