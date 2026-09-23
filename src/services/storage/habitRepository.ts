import { Habit } from '../../types';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './localStorageStore';

export const getHabitsRecord = (): Habit[] => {
  return safeParse<Habit[]>(getStorageItem(KEYS.HABITS), []);
};

export const saveHabitsRecord = (habits: Habit[]) => {
  setStorageItem(KEYS.HABITS, JSON.stringify(habits));
};
