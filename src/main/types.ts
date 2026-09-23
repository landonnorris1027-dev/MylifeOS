export type Priority = 'P1' | 'P2' | 'P3';

export interface PomodoroNotificationMessages {
  focusCompleteTitle: string;
  focusCompleteBody: string;
  breakFinishedTitle: string;
  breakFinishedBody: string;
}

export interface PomodoroTimerData {
  timerId: string;
  duration: number;
  isFocusMode: boolean;
  notificationsEnabled?: boolean;
  breakDurationSeconds?: number;
  taskId?: string;
  taskHabitId?: string;
  taskName?: string;
  taskDate?: string;
  taskPriority?: Priority;
  taskDurationMinutes?: number;
  notificationMessages?: PomodoroNotificationMessages;
}

export interface PomodoroRecoveryData {
  recoveryId: string;
  timerId: string;
  reason: string;
  mode: 'focus' | 'break';
  taskId?: string | null;
  taskHabitId?: string | null;
  taskName?: string | null;
  taskDate?: string | null;
  taskPriority?: string | null;
  taskDurationMinutes?: number | null;
  notificationMessages?: PomodoroNotificationMessages | null;
  notificationsEnabled?: boolean;
  breakDurationSeconds?: number | null;
  originalDuration?: number;
  remaining?: number;
  expiredAt?: number;
}

export type PomodoroRecoveryAction = 'resume-break' | 'restart-break' | 'dismiss';

export interface MainTimer {
  timerId: string;
  duration: number;
  remaining: number;
  endTime: number;
  isActive: boolean;
  isFinished: boolean;
  isFocusMode: boolean;
  notificationsEnabled: boolean;
  breakDurationSeconds: number | null;
  taskId: string | null;
  taskHabitId: string | null;
  taskName: string | null;
  taskDate: string | null;
  taskPriority: string | null;
  taskDurationMinutes: number | null;
  notificationMessages: PomodoroNotificationMessages | null;
  startedAt: number;
  updatedAt: number;
  intervalId: NodeJS.Timeout | null;
}
