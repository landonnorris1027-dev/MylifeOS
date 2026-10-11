import { DailyData, Task } from '../types';

/** Legacy manual tasks are recognized even before the origin field existed. */
export const normalizeTaskPriority = (task: Task): Task =>
  (task.origin === 'manual' || !task.habitId) && task.priority !== 'none'
    ? { ...task, priority: 'none' } : task;

export const normalizeTaskPriorities = (logs: Record<string, DailyData>): Record<string, DailyData> =>
  Object.fromEntries(Object.entries(logs).map(([date, day]) => [date, {
    ...day, tasks: day.tasks.map(normalizeTaskPriority),
  }]));
