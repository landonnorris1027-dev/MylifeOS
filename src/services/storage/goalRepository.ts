import { Goal } from '../../types';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './localStorageStore';

export const getGoalsRecord = (): Goal[] => {
  return safeParse<Goal[]>(getStorageItem(KEYS.GOALS), []);
};

export const saveGoalsRecord = (goals: Goal[]) => {
  setStorageItem(KEYS.GOALS, JSON.stringify(goals));
};
