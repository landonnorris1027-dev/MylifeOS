import { FocusReport } from '../services/focusReports';
import { normalizeTaskPriority } from '../services/taskPriority';
import { TaskPriority } from '../types';

export const COMPLETED_FOCUS_CATEGORIES = ['P1', 'P2', 'P3', 'none'] as const;

/** Only persisted measured focus attached to currently completed tasks contributes. */
export function completedFocusDistribution(
  report: Pick<FocusReport, 'tasks' | 'sessions'>,
  from: string,
  to: string,
) {
  const completed = new Map(
    report.tasks
      .filter(
        (task) =>
          task.status === 'completed' && task.date >= from && task.date <= to,
      )
      .map((task) => [`${task.date}:${task.id}`, normalizeTaskPriority(task)]),
  );
  const secondsByPriority: Record<TaskPriority, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    none: 0,
  };
  let totalSeconds = 0;
  for (const session of report.sessions) {
    const task =
      session.taskId && completed.get(`${session.taskDate}:${session.taskId}`);
    if (!task || session.measurement !== 'measured') continue;
    // Match the existing focus report's snapshot rule; legacy manual tasks stay purple.
    const priority =
      task.priority === 'none' ? 'none' : (session.priority ?? task.priority);
    secondsByPriority[priority] += session.actualFocusSeconds;
    totalSeconds += session.actualFocusSeconds;
  }
  return { totalSeconds, secondsByPriority };
}
