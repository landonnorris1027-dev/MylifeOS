export type Priority = 'P1' | 'P2' | 'P3';

export type TaskStatus = 'inbox' | 'scheduled' | 'completed' | 'deleted';

export interface Habit {
  id: string;
  name: string;
  priority: Priority;
  dailyQuota: number; // How many "pomodoros" per day
  defaultDurationMinutes: number;
  effectiveType: 'permanent' | 'range';
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface Task {
  id: string;
  habitId: string;
  name: string;
  priority: Priority;
  status: TaskStatus;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:00 format mostly
  durationMinutes: number;
}

export interface DailyData {
  date: string;
  tasks: Task[];
}

export const PRIORITY_STYLES = {
  P1: {
    bg: 'bg-red-50',
    border: 'border-red-100',
    text: 'text-red-900',
    tag: 'bg-red-100',
    accent: 'bg-red-500',
    hover: 'hover:bg-red-100'
  },
  P2: {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-900',
    tag: 'bg-amber-100',
    accent: 'bg-amber-500',
    hover: 'hover:bg-amber-100'
  },
  P3: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    text: 'text-emerald-900',
    tag: 'bg-emerald-100',
    accent: 'bg-emerald-500',
    hover: 'hover:bg-emerald-100'
  }
};