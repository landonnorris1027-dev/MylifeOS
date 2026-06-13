import { Task } from '../types';
import { formatDateLocal } from './storage/dateUtils';

export const TIMELINE_START_HOUR = 8;
export const TIMELINE_END_HOUR = 23;
export const TIMELINE_INTERVAL_MINUTES = 30;
export const MINUTES_PER_DAY = 24 * 60;
export type TimelineMode = 'daytime' | 'fullDay';

export interface TimelineSlot {
  time: string;
  minutes: number;
}

export const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes: number) => {
  const normalized = Math.max(0, minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

export const getEarliestSchedulableMinutesForDate = (
  dateStr: string,
  now: Date = new Date(),
  intervalMinutes: number = TIMELINE_INTERVAL_MINUTES,
): number | null => {
  if (dateStr !== formatDateLocal(now)) return null;

  const millisecondsSinceMidnight =
    (((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000) + now.getMilliseconds();
  const intervalMs = intervalMinutes * 60 * 1000;

  return Math.ceil(millisecondsSinceMidnight / intervalMs) * intervalMinutes;
};

export const isTaskStartInPastForDate = (
  dateStr: string,
  startTime: string,
  now: Date = new Date(),
  intervalMinutes: number = TIMELINE_INTERVAL_MINUTES,
) => {
  const earliestMinutes = getEarliestSchedulableMinutesForDate(dateStr, now, intervalMinutes);
  if (earliestMinutes === null) return false;

  return timeToMinutes(startTime) < earliestMinutes;
};

export const isTaskWithinDay = (startTime: string, durationMinutes: number) => {
  const start = timeToMinutes(startTime);
  return (
    Number.isFinite(start) &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0 &&
    start >= 0 &&
    start < MINUTES_PER_DAY &&
    start + durationMinutes <= MINUTES_PER_DAY
  );
};

export const buildTimelineSlots = (
  startHour: number = TIMELINE_START_HOUR,
  endHour: number = TIMELINE_END_HOUR,
  intervalMinutes: number = TIMELINE_INTERVAL_MINUTES,
): TimelineSlot[] => {
  const slots: TimelineSlot[] = [];
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60 + 30;

  for (let current = startMinutes; current <= endMinutes; current += intervalMinutes) {
    slots.push({
      time: minutesToTime(current),
      minutes: current,
    });
  }

  return slots;
};

export const buildTimelineSlotsForMode = (mode: TimelineMode) => {
  return mode === 'fullDay'
    ? buildTimelineSlots(0, TIMELINE_END_HOUR, TIMELINE_INTERVAL_MINUTES)
    : buildTimelineSlots(TIMELINE_START_HOUR, TIMELINE_END_HOUR, TIMELINE_INTERVAL_MINUTES);
};

export const getTaskTimeRange = (task: Task) => {
  const start = timeToMinutes(task.startTime || '00:00');
  return {
    start,
    end: start + task.durationMinutes,
  };
};

export const getTaskTimeLabel = (task: Task) => {
  if (!task.startTime) return null;
  const range = getTaskTimeRange(task);
  return `${minutesToTime(range.start)}-${minutesToTime(range.end)}`;
};

export const getScheduledTasks = (tasks: Task[]) => {
  return tasks.filter((task) => (task.status === 'scheduled' || task.status === 'completed') && task.startTime);
};

export const getOverlappingTasks = (
  tasks: Task[],
  startTime: string,
  durationMinutes: number,
  ignoreTaskId?: string,
) => {
  const candidateStart = timeToMinutes(startTime);
  const candidateEnd = candidateStart + durationMinutes;

  return getScheduledTasks(tasks).filter((task) => {
    if (ignoreTaskId && task.id === ignoreTaskId) return false;
    const range = getTaskTimeRange(task);
    return candidateStart < range.end && candidateEnd > range.start;
  });
};

export const hasSchedulingConflict = (
  tasks: Task[],
  startTime: string,
  durationMinutes: number,
  ignoreTaskId?: string,
) => {
  return getOverlappingTasks(tasks, startTime, durationMinutes, ignoreTaskId).length > 0;
};
