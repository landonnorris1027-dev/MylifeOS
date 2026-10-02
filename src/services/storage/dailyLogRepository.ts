import { revisionCache } from './revisionCache';
import { DailyData } from '../../types';
import { KEYS, getStorageItem, safeParse, setStorageItem } from './localStorageStore';

const readLogs = revisionCache([KEYS.DAILY_LOGS], ([raw]) => safeParse<Record<string, DailyData>>(raw, {}));
export const getDailyLogsSnapshot = (): Readonly<Record<string, DailyData>> => readLogs();
const copyDay = (day: DailyData): DailyData => ({ ...day, tasks: day.tasks.map(task => ({ ...task })) });
export const getAllDailyLogs = (): Record<string, DailyData> => Object.fromEntries(
  Object.entries(readLogs()).map(([date, day]) => [date, copyDay(day)]));

export const saveAllDailyLogs = (logs: Record<string, DailyData>) => {
  setStorageItem(KEYS.DAILY_LOGS, JSON.stringify(logs));
};

export const getDailyLogByDate = (date: string): DailyData | null => {
  const day = readLogs()[date];
  return day ? copyDay(day) : null;
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
