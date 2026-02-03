import { DailyData, Habit, Task, Priority } from '../types';

const KEYS = {
  HABITS: 'mylifeos_habits',
  DAILY_LOGS: 'mylifeos_daily_logs',
};

// --- Helpers ---
export const generateId = () => Math.random().toString(36).substr(2, 9);
export const getTodayStr = () => new Date().toISOString().split('T')[0];

const safeParse = <T>(str: string | null, fallback: T): T => {
  if (!str || str === 'undefined' || str === 'null') return fallback;
  try {
    const parsed = JSON.parse(str);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch (e) {
    console.warn("MyLifeOS: Failed to parse storage item, resetting to fallback.", e);
    return fallback;
  }
};

// --- Data Management (Export/Import) ---
export const getAllDataJSON = () => {
  const habits = localStorage.getItem(KEYS.HABITS);
  const logs = localStorage.getItem(KEYS.DAILY_LOGS);
  
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    habits: habits ? JSON.parse(habits) : [],
    dailyLogs: logs ? JSON.parse(logs) : {},
  }, null, 2);
};

export const importDataJSON = (jsonStr: string): boolean => {
  try {
    const data = JSON.parse(jsonStr);
    
    // Basic validation
    if (!Array.isArray(data.habits) || typeof data.dailyLogs !== 'object') {
      throw new Error("Invalid data format");
    }

    localStorage.setItem(KEYS.HABITS, JSON.stringify(data.habits));
    localStorage.setItem(KEYS.DAILY_LOGS, JSON.stringify(data.dailyLogs));
    return true;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};

// --- Habits ---
export const getHabits = (): Habit[] => {
  return safeParse<Habit[]>(localStorage.getItem(KEYS.HABITS), []);
};

export const saveHabits = (habits: Habit[]) => {
  localStorage.setItem(KEYS.HABITS, JSON.stringify(habits));
};

export const addHabit = (
  name: string, 
  priority: Priority, 
  quota: number, 
  duration: number = 25,
  effectiveType: 'permanent' | 'range' = 'permanent',
  startDate?: string,
  endDate?: string
) => {
  const habits = getHabits();
  const newHabit: Habit = {
    id: generateId(),
    name,
    priority,
    dailyQuota: quota,
    defaultDurationMinutes: duration,
    effectiveType,
    startDate,
    endDate,
  };
  saveHabits([...habits, newHabit]);
  return newHabit;
};

export const deleteHabit = (id: string) => {
  const habits = getHabits();
  saveHabits(habits.filter(h => h.id !== id));

  // Sync: Remove un-scheduled (inbox) tasks associated with this habit across ALL logs
  const logsStr = localStorage.getItem(KEYS.DAILY_LOGS);
  const allLogs = safeParse<Record<string, DailyData>>(logsStr, {});
  let updated = false;

  Object.keys(allLogs).forEach(date => {
    const dayData = allLogs[date];
    if (dayData && Array.isArray(dayData.tasks)) {
      const originalCount = dayData.tasks.length;
      const filteredTasks = dayData.tasks.filter(t => !(t.habitId === id && t.status === 'inbox'));
      
      if (filteredTasks.length !== originalCount) {
        allLogs[date].tasks = filteredTasks;
        updated = true;
      }
    }
  });

  if (updated) {
    localStorage.setItem(KEYS.DAILY_LOGS, JSON.stringify(allLogs));
  }
};

// --- Daily Dispatch Engine ---
export const getDailyData = (date: string): DailyData | null => {
  const allLogs = safeParse<Record<string, DailyData>>(localStorage.getItem(KEYS.DAILY_LOGS), {});
  return allLogs[date] || null;
};

export const saveDailyData = (data: DailyData) => {
  const allLogs = safeParse<Record<string, DailyData>>(localStorage.getItem(KEYS.DAILY_LOGS), {});
  allLogs[data.date] = data;
  localStorage.setItem(KEYS.DAILY_LOGS, JSON.stringify(allLogs));
};

// Get stats for contribution graph: { "2023-10-01": 120 (minutes), ... }
export const getYearlyStats = (): Record<string, number> => {
  const allLogs = safeParse<Record<string, DailyData>>(localStorage.getItem(KEYS.DAILY_LOGS), {});
  const stats: Record<string, number> = {};
  
  Object.keys(allLogs).forEach(date => {
    const dayData = allLogs[date] as DailyData;
    const minutes = dayData.tasks
      .filter(t => t.status === 'completed')
      .reduce((acc, t) => acc + t.durationMinutes, 0);
    if (minutes > 0) stats[date] = minutes;
  });
  
  return stats;
};

export const initializeDay = (dateStr: string = getTodayStr()): DailyData => {
  let currentData = getDailyData(dateStr);
  
  // If it's a completely new day (or looking at a past/future empty day), start fresh
  if (!currentData) {
     currentData = { date: dateStr, tasks: [] };
  }

  // Sync Logic: Ensure tasks match habit quotas if it is TODAY or a FUTURE day.
  // We do not want to rewrite history for past days.
  if (dateStr >= getTodayStr()) {
    const habits = getHabits();
    const tasks = [...currentData.tasks];
    let updated = false;

    habits.forEach(habit => {
      // Check if habit is active on this date
      let isActive = true;
      if (habit.effectiveType === 'range') {
        if (habit.startDate && dateStr < habit.startDate) isActive = false;
        if (habit.endDate && dateStr > habit.endDate) isActive = false;
      }

      if (!isActive) return;

      // Count existing tasks for this habit (any status)
      const existingCount = tasks.filter(t => t.habitId === habit.id).length;
      
      if (existingCount < habit.dailyQuota) {
        const needed = habit.dailyQuota - existingCount;
        for (let i = 0; i < needed; i++) {
          tasks.push({
            id: generateId(),
            habitId: habit.id,
            name: habit.name,
            priority: habit.priority,
            status: 'inbox',
            date: dateStr,
            durationMinutes: habit.defaultDurationMinutes,
          });
        }
        updated = true;
      }
    });

    if (updated) {
      const newData = { ...currentData, tasks };
      saveDailyData(newData);
      return newData;
    }
  }
  
  return currentData;
};

export const updateTask = (task: Task) => {
  const data = getDailyData(task.date);
  if (!data) return;
  
  const newTasks = data.tasks.map(t => t.id === task.id ? task : t);
  saveDailyData({ ...data, tasks: newTasks });
};

export const deleteTaskFromDay = (taskId: string, date: string) => {
  console.log("Storage: Deleting task", taskId, "from", date);
  const data = getDailyData(date);
  if (!data) return;
  
  const newTasks = data.tasks.map(t => t.id === taskId ? { ...t, status: 'deleted' as any } : t);
  saveDailyData({ ...data, tasks: newTasks });
};

export const reduceHabitQuota = (habitId: string) => {
  console.log("Storage: Reducing quota for habit", habitId);
  const habits = getHabits();
  const habitIndex = habits.findIndex(h => h.id === habitId);
  if (habitIndex === -1) {
    console.warn("Storage: Habit not found", habitId);
    return;
  }

  const habit = habits[habitIndex];
  if (habit.dailyQuota > 1) {
    const updatedHabits = [...habits];
    updatedHabits[habitIndex] = { ...habit, dailyQuota: habit.dailyQuota - 1 };
    saveHabits(updatedHabits);
    console.log("Storage: Quota reduced to", habit.dailyQuota - 1);
  } else {
    console.log("Storage: Quota is 1, deleting habit rule entirely");
    deleteHabit(habitId);
  }
};