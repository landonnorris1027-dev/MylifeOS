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

/**
 * Priority is data, not chrome: a task's colour encodes which bucket it is in.
 * The six roles per key live in src/styles/tokens.css as `--p<key>-<role>`, so
 * a theme can restate them in one place instead of chasing arbitrary values
 * through JSX.
 *
 * The class strings are spelled out per key on purpose. Tailwind scans raw
 * source text, including comments, and it cannot follow string interpolation:
 * a class name assembled at runtime emits a rule with the placeholder still in
 * it, which then fails to minify. A shared helper that builds the names
 * therefore compiles to unstyled cards — that was the first version of this
 * refactor.
 */
export const PRIORITY_STYLES = {
  none: {
    bg: 'bg-[var(--pnone-soft)]',
    border: 'border-[var(--pnone-line)]',
    text: 'text-[var(--pnone-ink)]',
    tag: 'bg-[var(--pnone-tag)]',
    accent: 'bg-[var(--pnone-solid)]',
    hover: 'hover:bg-[var(--pnone-hover)]',
  },
  P1: {
    bg: 'bg-[var(--p1-soft)]',
    border: 'border-[var(--p1-line)]',
    text: 'text-[var(--p1-ink)]',
    tag: 'bg-[var(--p1-tag)]',
    accent: 'bg-[var(--p1-solid)]',
    hover: 'hover:bg-[var(--p1-hover)]',
  },
  P2: {
    bg: 'bg-[var(--p2-soft)]',
    border: 'border-[var(--p2-line)]',
    text: 'text-[var(--p2-ink)]',
    tag: 'bg-[var(--p2-tag)]',
    accent: 'bg-[var(--p2-solid)]',
    hover: 'hover:bg-[var(--p2-hover)]',
  },
  P3: {
    bg: 'bg-[var(--p3-soft)]',
    border: 'border-[var(--p3-line)]',
    text: 'text-[var(--p3-ink)]',
    tag: 'bg-[var(--p3-tag)]',
    accent: 'bg-[var(--p3-solid)]',
    hover: 'hover:bg-[var(--p3-hover)]',
  },
};
