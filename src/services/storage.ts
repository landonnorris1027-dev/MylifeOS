import { DailyData, Goal, Habit, Priority, Task } from '../types';
import { exportBackupJSON, ImportDataResult, importBackupJSON, previewImportBackupJSON } from './storage/backupService';
import { formatDateLocal, generateId, getTodayStr, parseDateLocal } from './storage/dateUtils';
import { getAllDailyLogs, getCompletedMinutesByDate, getDailyLogByDate, saveDailyLog } from './storage/dailyLogRepository';
import { getGoalsRecord, saveGoalsRecord } from './storage/goalRepository';
import { getHabitsRecord, saveHabitsRecord } from './storage/habitRepository';
import {
  RecoveryPoint,
  createAutomaticRecoveryPoint,
  createRecoveryPoint,
  getRecoveryPoints,
  restoreRecoveryPoint,
} from './storage/recoveryPointService';
import { reconcileCurrentAndFutureLogs, reconcileDayTasks } from './storage/taskPlanner';

export { generateId, formatDateLocal, parseDateLocal, getTodayStr };
export type { ImportDataResult };
export type { RecoveryPoint };

export interface ProfileStats {
  totalFocusMinutes: number;
  completedTasks: number;
  totalTrackedTasks: number;
  completionRate: number;
  activeDays: number;
  currentStreakDays: number;
  longestStreakDays: number;
  averageDailyMinutes: number;
  bestDay: {
    date: string | null;
    minutes: number;
  };
  priorityMinutes: Record<Priority, number>;
  goalMinutes: Record<string, number>;
  recentWeek: Array<{
    date: string;
    minutes: number;
  }>;
}

export interface ManualTaskInput {
  name: string;
  priority: Priority;
  durationMinutes: number;
  goalId?: string;
  note?: string;
}

export const getAllDataJSON = () => {
  return exportBackupJSON(getHabitsRecord(), getAllDailyLogs(), getGoalsRecord());
};

export const importDataJSON = async (jsonStr: string): Promise<ImportDataResult> => {
  const preview = previewImportBackupJSON(jsonStr);
  if (!preview.ok) return preview;
  try { createRecoveryPoint('pre-import', { force: true }); }
  catch (error) { return { ...preview, ok: false, message: error instanceof Error ? error.message : 'Pre-import recovery point failed' }; }
  return importBackupJSON(jsonStr);
};

export const previewImportDataJSON = (jsonStr: string): ImportDataResult => {
  return previewImportBackupJSON(jsonStr);
};

export const getHabits = (): Habit[] => {
  return getHabitsRecord();
};

export const getGoals = (): Goal[] => {
  return getGoalsRecord();
};

export const saveGoals = (goals: Goal[]) => {
  createAutomaticRecoveryPoint();
  saveGoalsRecord(goals);
};

export const addGoal = (name: string) => {
  const goalName = name.trim();
  if (!goalName) return null;

  const goals = getGoalsRecord();
  const existing = goals.find((goal) => goal.name.toLowerCase() === goalName.toLowerCase());
  if (existing) return existing;

  const newGoal: Goal = {
    id: generateId(),
    name: goalName,
  };
  saveGoals([...goals, newGoal]);
  return newGoal;
};

export const saveHabits = (habits: Habit[]) => {
  createAutomaticRecoveryPoint();
  saveHabitsRecord(habits);
  reconcileCurrentAndFutureLogs(habits);
};

export const addHabit = (
  name: string,
  priority: Priority,
  quota: number,
  duration: number = 25,
  effectiveType: 'permanent' | 'range' = 'permanent',
  startDate?: string,
  endDate?: string,
  goalId?: string,
) => {
  const habits = getHabitsRecord();
  const newHabit: Habit = {
    id: generateId(),
    goalId,
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

export const addManualTask = (date: string, input: ManualTaskInput) => {
  const taskName = input.name.trim();
  if (!taskName) return null;

  const currentData = initializeDay(date);
  const newTask: Task = {
    id: generateId(),
    goalId: input.goalId,
    origin: 'manual',
    name: taskName,
    priority: input.priority,
    status: 'inbox',
    date,
    durationMinutes: input.durationMinutes,
    note: input.note?.trim() || undefined,
  };

  saveDailyData({
    ...currentData,
    tasks: [...currentData.tasks, newTask],
  });

  return newTask;
};

export const updateHabit = (updatedHabit: Habit) => {
  const habits = getHabitsRecord();
  const nextHabits = habits.map((habit) => (
    habit.id === updatedHabit.id ? updatedHabit : habit
  ));
  saveHabits(nextHabits);
  return updatedHabit;
};

export const deleteHabit = (id: string) => {
  const habits = getHabitsRecord().filter((habit) => habit.id !== id);
  saveHabits(habits);
};

export const getDailyData = (date: string): DailyData | null => {
  return getDailyLogByDate(date);
};

export const saveDailyData = (data: DailyData) => {
  createAutomaticRecoveryPoint();
  saveDailyLog(data);
};

export const getDataRecoveryPoints = (): RecoveryPoint[] => {
  return getRecoveryPoints();
};

export const restoreDataRecoveryPoint = (id: string): Promise<ImportDataResult> => {
  return restoreRecoveryPoint(id);
};

export const getYearlyStats = (): Record<string, number> => {
  return getCompletedMinutesByDate();
};

export const getProfileStats = (): ProfileStats => {
  const allLogs = getAllDailyLogs();
  const today = getTodayStr();
  const relevantDates = Object.keys(allLogs)
    .filter((date) => date <= today)
    .sort();
  const completedMinutesByDate = getCompletedMinutesByDate();

  const priorityMinutes: Record<Priority, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
  };
  const goalMinutes: Record<string, number> = {};

  let totalFocusMinutes = 0;
  let completedTasks = 0;
  let totalTrackedTasks = 0;
  let activeDays = 0;
  let currentStreakDays = 0;
  let longestStreakDays = 0;
  let bestDay = { date: null as string | null, minutes: 0 };

  relevantDates.forEach((date) => {
    const dayData = allLogs[date];
    const visibleTasks = dayData.tasks.filter((task) => task.status !== 'deleted');
    const completedToday = visibleTasks.filter((task) => task.status === 'completed');
    const dayMinutes = completedToday.reduce((sum, task) => sum + (task.actualFocusMinutes ?? task.durationMinutes), 0);

    totalFocusMinutes += dayMinutes;
    completedTasks += completedToday.length;
    totalTrackedTasks += visibleTasks.length;

    completedToday.forEach((task) => {
      const taskMinutes = task.actualFocusMinutes ?? task.durationMinutes;
      priorityMinutes[task.priority] += taskMinutes;
      if (task.goalId) {
        goalMinutes[task.goalId] = (goalMinutes[task.goalId] || 0) + taskMinutes;
      }
    });

    if (dayMinutes > 0) {
      activeDays += 1;
      if (dayMinutes > bestDay.minutes) {
        bestDay = { date, minutes: dayMinutes };
      }
    }
  });

  if (relevantDates.length > 0) {
    let runningStreak = 0;
    const cursor = parseDateLocal(relevantDates[0]);
    const endDate = parseDateLocal(today);

    while (cursor <= endDate) {
      const cursorDate = formatDateLocal(cursor);
      const completedMinutes = completedMinutesByDate[cursorDate] || 0;

      if (completedMinutes > 0) {
        runningStreak += 1;
        if (runningStreak > longestStreakDays) {
          longestStreakDays = runningStreak;
        }
      } else {
        runningStreak = 0;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const streakCursor = parseDateLocal(today);
  while (true) {
    const cursorDate = formatDateLocal(streakCursor);
    if ((completedMinutesByDate[cursorDate] || 0) > 0) {
      currentStreakDays += 1;
    } else {
      break;
    }
    streakCursor.setDate(streakCursor.getDate() - 1);
  }

  const recentWeek = Array.from({ length: 7 }, (_, index) => {
    const date = parseDateLocal(today);
    date.setDate(date.getDate() - (6 - index));
    const dateStr = formatDateLocal(date);
    const dayData = allLogs[dateStr];
    const minutes = dayData
      ? dayData.tasks
        .filter((task) => task.status === 'completed')
        .reduce((sum, task) => sum + (task.actualFocusMinutes ?? task.durationMinutes), 0)
      : 0;

    return { date: dateStr, minutes };
  });

  return {
    totalFocusMinutes,
    completedTasks,
    totalTrackedTasks,
    completionRate: totalTrackedTasks > 0 ? Math.round((completedTasks / totalTrackedTasks) * 100) : 0,
    activeDays,
    currentStreakDays,
    longestStreakDays,
    averageDailyMinutes: activeDays > 0 ? Math.round(totalFocusMinutes / activeDays) : 0,
    bestDay,
    priorityMinutes,
    goalMinutes,
    recentWeek,
  };
};

export const initializeDay = (dateStr: string = getTodayStr()): DailyData => {
  let currentData = getDailyLogByDate(dateStr);

  if (!currentData) {
    currentData = { date: dateStr, tasks: [] };
  }

  if (dateStr >= getTodayStr()) {
    const reconciled = reconcileDayTasks(currentData, getHabitsRecord(), getTodayStr());
    if (JSON.stringify(reconciled.tasks) !== JSON.stringify(currentData.tasks)) {
      createAutomaticRecoveryPoint();
      saveDailyLog(reconciled);
      return reconciled;
    }
  }

  return currentData;
};

export const updateTask = (task: Task) => {
  const data = getDailyLogByDate(task.date);
  if (!data) return;

  const newTasks = data.tasks.map((item) => (item.id === task.id ? task : item));
  createAutomaticRecoveryPoint();
  saveDailyLog({ ...data, tasks: newTasks });
};

export const deleteTaskFromDay = (taskId: string, date: string) => {
  const data = getDailyLogByDate(date);
  if (!data) return;

  const newTasks = data.tasks.filter((task) => task.id !== taskId);
  createAutomaticRecoveryPoint();
  saveDailyLog({ ...data, tasks: newTasks });
};

export const deleteTaskForToday = (taskId: string, date: string) => {
  const data = getDailyLogByDate(date);
  if (!data) return;

  const newTasks = data.tasks.map((task) => (
    task.id === taskId
      ? { ...task, status: 'deleted' as const, startTime: undefined }
      : task
  ));
  createAutomaticRecoveryPoint();
  saveDailyLog({ ...data, tasks: newTasks });
};

export const reduceHabitQuota = (habitId: string) => {
  const habits = getHabitsRecord();
  const habitIndex = habits.findIndex((habit) => habit.id === habitId);
  if (habitIndex === -1) {
    console.warn('Storage: Habit not found', habitId);
    return;
  }

  const habit = habits[habitIndex];
  if (habit.dailyQuota > 1) {
    const updatedHabits = [...habits];
    updatedHabits[habitIndex] = { ...habit, dailyQuota: habit.dailyQuota - 1 };
    saveHabits(updatedHabits);
    return;
  }

  deleteHabit(habitId);
};
