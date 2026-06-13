import { DailyData, Habit, Task } from '../../types';
import { generateId, getTodayStr } from './dateUtils';
import { getAllDailyLogs, saveAllDailyLogs } from './dailyLogRepository';

export const isHabitActiveOnDate = (habit: Habit, dateStr: string) => {
  if (habit.effectiveType !== 'range') return true;
  if (habit.startDate && dateStr < habit.startDate) return false;
  if (habit.endDate && dateStr > habit.endDate) return false;
  return true;
};

export const createTaskFromHabit = (habit: Habit, dateStr: string): Task => ({
  id: generateId(),
  habitId: habit.id,
  goalId: habit.goalId,
  name: habit.name,
  priority: habit.priority,
  status: 'inbox',
  date: dateStr,
  durationMinutes: habit.defaultDurationMinutes,
});

const taskRank = (task: Task) => {
  if (task.status === 'scheduled') return 0;
  if (task.status === 'completed') return 1;
  return 2;
};

export const reconcileDayTasks = (dayData: DailyData, habits: Habit[], todayStr: string): DailyData => {
  const isFutureDay = dayData.date > todayStr;
  const isToday = dayData.date === todayStr;
  const habitMap = new Map(habits.map((habit) => [habit.id, habit]));
  const nextTasks: Task[] = [];
  const habitTasks = new Map<string, Task[]>();

  dayData.tasks.forEach((task) => {
    if (!task.habitId) {
      nextTasks.push(task);
      return;
    }

    const bucket = habitTasks.get(task.habitId) || [];
    bucket.push(task);
    habitTasks.set(task.habitId, bucket);
  });

  habitTasks.forEach((tasks, habitId) => {
    const habit = habitMap.get(habitId);
    const isActive = habit ? isHabitActiveOnDate(habit, dayData.date) : false;

    if (!isActive) {
      const preserved = tasks.filter((task) => {
        if (isFutureDay) return false;
        if (isToday) return task.status !== 'inbox';
        return true;
      });
      nextTasks.push(...preserved);
      return;
    }

    if (!habit) {
      nextTasks.push(...tasks);
      return;
    }

    const sorted = [...tasks].sort((left, right) => taskRank(left) - taskRank(right));
    const withinQuota = sorted.slice(0, habit.dailyQuota).map((task) => ({
      ...task,
      goalId: habit.goalId,
      name: habit.name,
      priority: habit.priority,
      durationMinutes: habit.defaultDurationMinutes,
    }));
    const preservedOverflow = isToday
      ? sorted.slice(habit.dailyQuota).filter((task) => task.status !== 'inbox').map((task) => ({
          ...task,
          goalId: habit.goalId,
          name: habit.name,
          priority: habit.priority,
          durationMinutes: habit.defaultDurationMinutes,
        }))
      : [];
    const kept: Task[] = [...withinQuota, ...preservedOverflow];

    let missing = habit.dailyQuota - withinQuota.length;
    while (missing > 0) {
      kept.push(createTaskFromHabit(habit, dayData.date));
      missing -= 1;
    }

    nextTasks.push(...kept);
  });

  habits.forEach((habit) => {
    if (!isHabitActiveOnDate(habit, dayData.date)) return;
    if (habitTasks.has(habit.id)) return;

    for (let i = 0; i < habit.dailyQuota; i += 1) {
      nextTasks.push(createTaskFromHabit(habit, dayData.date));
    }
  });

  return {
    ...dayData,
    tasks: nextTasks,
  };
};

export const reconcileCurrentAndFutureLogs = (habits: Habit[]) => {
  const logs = getAllDailyLogs();
  const todayStr = getTodayStr();
  let updated = false;

  Object.keys(logs).forEach((dateKey) => {
    if (dateKey < todayStr) return;

    const currentDay = logs[dateKey];
    const reconciled = reconcileDayTasks(currentDay, habits, todayStr);
    if (JSON.stringify(reconciled.tasks) !== JSON.stringify(currentDay.tasks)) {
      logs[dateKey] = reconciled;
      updated = true;
    }
  });

  if (updated) {
    saveAllDailyLogs(logs);
  }
};
