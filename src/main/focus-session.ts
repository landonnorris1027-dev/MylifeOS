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
export function isFocusSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as FocusSession;
  return typeof s.id === 'string' && s.id.length > 0 && typeof s.timerId === 'string'
    && (s.taskId === null || typeof s.taskId === 'string')
    && typeof s.taskDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.taskDate)
    && (s.taskName === null || typeof s.taskName === 'string')
    && (s.goalId === undefined || typeof s.goalId === 'string')
    && (s.priority === undefined || ['P1', 'P2', 'P3'].includes(s.priority))
    && Number.isFinite(s.plannedSeconds) && s.plannedSeconds > 0
    && Number.isFinite(s.actualFocusSeconds) && s.actualFocusSeconds >= 0
    && s.actualFocusSeconds <= s.plannedSeconds
    && Number.isFinite(s.startedAt) && Number.isFinite(s.endedAt) && s.endedAt >= s.startedAt
    && ['completed', 'stopped'].includes(s.result)
    && ['measured', 'estimated'].includes(s.measurement);
}
export function validateFocusSessions(value: unknown): FocusSession[] {
  if (!Array.isArray(value) || value.some(s => !isFocusSession(s))
    || new Set(value.map(s => s.id)).size !== value.length) throw new Error('Invalid focus session records');
  return value;
}
