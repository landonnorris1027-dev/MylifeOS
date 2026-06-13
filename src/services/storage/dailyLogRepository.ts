import { DailyData } from '../../types';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './localStorageStore';

export const getAllDailyLogs = (): Record<string, DailyData> => {
  return safeParse<Record<string, DailyData>>(getStorageItem(KEYS.DAILY_LOGS), {});
};

export const saveAllDailyLogs = (logs: Record<string, DailyData>) => {
  setStorageItem(KEYS.DAILY_LOGS, JSON.stringify(logs));
};

export const getDailyLogByDate = (date: string): DailyData | null => {
  const allLogs = getAllDailyLogs();
  return allLogs[date] || null;
};

export const saveDailyLog = (data: DailyData) => {
  const allLogs = getAllDailyLogs();
  allLogs[data.date] = data;
  saveAllDailyLogs(allLogs);
};

export const getCompletedMinutesByDate = (): Record<string, number> => {
  const allLogs = getAllDailyLogs();
  const stats: Record<string, number> = {};

  Object.keys(allLogs).forEach((date) => {
    const dayData = allLogs[date];
    const minutes = dayData.tasks
      .filter((task) => task.status === 'completed')
      .reduce((acc, task) => acc + (task.actualFocusMinutes ?? task.durationMinutes), 0);
    if (minutes > 0) stats[date] = minutes;
  });

  return stats;
};
