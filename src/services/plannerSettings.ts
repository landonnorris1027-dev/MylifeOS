import { TimelineMode } from './scheduling';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './storage/localStorageStore';

export interface PlannerSettings {
  timelineMode: TimelineMode;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  timelineMode: 'daytime',
};

const normalizePlannerSettings = (value: Partial<PlannerSettings>): PlannerSettings => ({
  timelineMode: value.timelineMode === 'fullDay' ? 'fullDay' : DEFAULT_PLANNER_SETTINGS.timelineMode,
});

export const getPlannerSettings = (): PlannerSettings => {
  return normalizePlannerSettings(safeParse<Partial<PlannerSettings>>(getStorageItem(KEYS.PLANNER_SETTINGS), DEFAULT_PLANNER_SETTINGS));
};

export const savePlannerSettings = (settings: PlannerSettings) => {
  const normalized = normalizePlannerSettings(settings);
  setStorageItem(KEYS.PLANNER_SETTINGS, JSON.stringify(normalized));
  return normalized;
};
