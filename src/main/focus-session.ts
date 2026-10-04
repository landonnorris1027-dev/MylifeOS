export interface FocusSession {
  id: string;
  timerId: string;
  taskId: string | null;
  taskDate: string;
  taskName: string | null;
  taskHabitId?: string | null;
  goalId?: string;
  priority?: 'P1' | 'P2' | 'P3';
  plannedSeconds: number;
  actualFocusSeconds: number;
  startedAt: number;
  endedAt: number;
  result: 'completed' | 'stopped';
  notificationsEnabled?: boolean;
  measurement: 'measured' | 'estimated';
}

export const FOCUS_SESSIONS_KEY = 'mylifeos_focus_sessions';
export const isSessionId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 240 && !/[\x00-\x1f]/.test(v);
export const isSessionTimestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8640000000000000;
export function isTaskDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function isFocusSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as FocusSession;
  const id = isSessionId;
  const timestamp = isSessionTimestamp;
  return id(s.id) && id(s.timerId)
    && (s.taskId === null || id(s.taskId))
    && isTaskDate(s.taskDate)
    && (s.taskName === null || typeof s.taskName === 'string' && s.taskName.length <= 2000)
    && (s.taskHabitId === undefined || s.taskHabitId === null || id(s.taskHabitId))
    && (s.goalId === undefined || id(s.goalId))
    && (s.notificationsEnabled === undefined || typeof s.notificationsEnabled === 'boolean')
    && (s.priority === undefined || ['P1', 'P2', 'P3'].includes(s.priority))
    && Number.isFinite(s.plannedSeconds) && s.plannedSeconds > 0 && s.plannedSeconds <= 86400
    && Number.isFinite(s.actualFocusSeconds) && s.actualFocusSeconds >= 0
    && s.actualFocusSeconds <= s.plannedSeconds
    && timestamp(s.startedAt) && timestamp(s.endedAt) && s.endedAt >= s.startedAt
    && ['completed', 'stopped'].includes(s.result)
    && ['measured', 'estimated'].includes(s.measurement);
}
export function validateFocusSessions(value: unknown): FocusSession[] {
  if (!Array.isArray(value) || value.some(s => !isFocusSession(s))
    || new Set(value.map(s => s.id)).size !== value.length) throw new Error('Invalid focus session records');
  return value;
}
