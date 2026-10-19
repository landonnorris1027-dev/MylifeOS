import { FocusHistoryPeriod, focusHistoryRanges, FocusReport } from '../services/focusReports';
import { normalizeTaskPriority } from '../services/taskPriority';

export const FOCUS_STACKS = ['P1', 'P2', 'P3', 'none', 'unassigned'] as const;
export type FocusStack = (typeof FOCUS_STACKS)[number];

/** Keep the chart on the report's measured-time and task-date basis. */
export function dailyFocusStacks(
  days: FocusReport['days'],
  report?: Pick<FocusReport, 'tasks' | 'sessions'>,
) {
  const tasks = new Map(
    report?.tasks.map((task) => [`${task.date}:${task.id}`, task]),
  );
  return days.map((day) => {
    const seconds: Record<FocusStack, number> = {
      P1: 0, P2: 0, P3: 0, none: 0, unassigned: 0,
    };
    for (const session of report?.sessions ?? []) {
      if (session.taskDate !== day.date || session.measurement !== 'measured') continue;
      const task = tasks.get(`${session.taskDate}:${session.taskId}`);
      const priority = task && normalizeTaskPriority(task).priority === 'none'
        ? 'none'
        : session.priority ?? 'unassigned';
      seconds[priority] += session.actualFocusSeconds;
    }
    // Older/imported reports may lack priority snapshots. Keep their time visible.
    const attributed = FOCUS_STACKS.reduce((sum, key) => sum + seconds[key], 0);
    seconds.unassigned += Math.max(0, day.measuredSeconds - attributed);
    return seconds;
  });
}

export function focusHistoryBuckets(report: FocusReport, anchor: string, period: FocusHistoryPeriod) {
  const stacks = dailyFocusStacks(report.days, report);
  return focusHistoryRanges(anchor, period).map(({ from, to }) => {
    const bucket = {
      from, to, plannedSeconds: 0, measuredSeconds: 0, historicalSeconds: 0,
      shortfallSeconds: 0,
      stacks: { P1: 0, P2: 0, P3: 0, none: 0, unassigned: 0 } as Record<FocusStack, number>,
    };
    report.days.forEach((day, index) => {
      if (day.date < from || day.date > to) return;
      bucket.plannedSeconds += day.plannedSeconds;
      bucket.measuredSeconds += day.measuredSeconds;
      bucket.historicalSeconds += day.historicalSeconds;
      FOCUS_STACKS.forEach((key) => { bucket.stacks[key] += stacks[index][key]; });
    });
    bucket.shortfallSeconds = Math.max(0, bucket.plannedSeconds - bucket.measuredSeconds);
    return bucket;
  });
}
