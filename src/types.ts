export type Priority = 'P1' | 'P2' | 'P3';
export type TaskPriority = Priority | 'none';
export const isTaskPriority = (value: unknown): value is TaskPriority => value === 'none' || isPriority(value);

export const isPriority = (value: unknown): value is Priority => {
  return value === 'P1' || value === 'P2' || value === 'P3';
};

export type TaskStatus = 'inbox' | 'scheduled' | 'completed' | 'deleted';

export interface Habit {
  id: string;
  goalId?: string;
  name: string;
  priority: Priority;
  dailyQuota: number; // How many "pomodoros" per day
  defaultDurationMinutes: number;
  effectiveType: 'permanent' | 'range';
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  weekdays?: number[]; // Sunday = 0; absent means every day for older habits
}

export interface Goal {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  habitId?: string;
  goalId?: string;
  origin?: 'habit' | 'manual';
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm format
  durationMinutes: number;
  actualFocusMinutes?: number;
  historicalFocusMinutes?: number; // Retained legacy estimate when a completed task is deleted/requeued.
  note?: string;
  review?: string;
}

export interface DailyData {
  date: string;
  tasks: Task[];
}

export const PRIORITY_STYLES = {
  none: {
    bg: 'bg-[#fff7e8]', border: 'border-[#f9e5bb]', text: 'text-[#533c16]',
    tag: 'bg-[#fbedcf]', accent: 'bg-[var(--priority-none)]', hover: 'hover:bg-[#fff0d4]',
  },
  P1: {
    bg: 'bg-[#f4effe]',
    border: 'border-[#e4d9fc]',
    text: 'text-[#3d2b65]',
    tag: 'bg-[#e8defc]',
    accent: 'bg-[var(--priority-p1)]',
    hover: 'hover:bg-[#eee5fd]'
  },
  P2: {
    bg: 'bg-[#edf3fe]',
    border: 'border-[#d3e1fc]',
    text: 'text-[#183456]',
    tag: 'bg-[#dce7fd]',
    accent: 'bg-[var(--priority-p2)]',
    hover: 'hover:bg-[#e1ebfd]'
  },
  P3: {
    bg: 'bg-[#eef4fa]',
    border: 'border-[#d7e4f1]',
    text: 'text-[#25435e]',
    tag: 'bg-[#dce8f4]',
    accent: 'bg-[var(--priority-p3)]',
    hover: 'hover:bg-[#e1ecf7]'
  }
};
