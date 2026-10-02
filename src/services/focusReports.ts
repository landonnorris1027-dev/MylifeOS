import { revisionCache } from './storage/revisionCache';
import { DailyData, Priority, Task } from '../types';
import { FocusSession, validateFocusSessions } from '../main/focus-session';
import { getDailyLogsSnapshot } from './storage/dailyLogRepository';
import { KEYS, getStorageItem } from './storage/localStorageStore';
import { formatDateLocal, parseDateLocal } from './storage/dateUtils';
export type FocusPeriod = 'week' | 'rolling';
export interface FocusDay { date: string; plannedSeconds: number; measuredSeconds: number; historicalSeconds: number; deviationSeconds: number; }
export interface FocusReport {
  from: string; to: string; measuredSeconds: number; historicalSeconds: number;
  goalSeconds: Record<string, number>; prioritySeconds: Record<Priority, number>;
  days: FocusDay[]; tasks: Task[]; sessions: FocusSession[];
}
const sessions = revisionCache([KEYS.FOCUS_SESSIONS], ([raw]) => validateFocusSessions(JSON.parse(raw || '[]')));
export const getFocusSessions = (): FocusSession[] => sessions().map(session => ({ ...session }));
export function focusPeriodRange(anchor: string, period: FocusPeriod): { from: string; to: string } {
  const start = parseDateLocal(anchor), end = parseDateLocal(anchor);
  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime()); end.setDate(end.getDate() + 6);
  } else start.setDate(start.getDate() - 6);
  return { from: formatDateLocal(start), to: formatDateLocal(end) };
}
/** Task date owns attribution, including sessions that cross local midnight. */
export function summarizeFocus(logs: Record<string, DailyData>, sessions: FocusSession[], from: string, to: string): FocusReport {
  const report: FocusReport = { from, to, measuredSeconds: 0, historicalSeconds: 0, goalSeconds: {}, prioritySeconds: { P1: 0, P2: 0, P3: 0 }, days: [], tasks: [], sessions: [] };
  const days = new Map<string, FocusDay>();
  const day = (date: string) => {
    if (!days.has(date)) days.set(date, { date, plannedSeconds: 0, measuredSeconds: 0, historicalSeconds: 0, deviationSeconds: 0 });
    return days.get(date)!;
  };
  const recordedTasks = new Set(sessions.filter(s => s.taskId).map(s => s.taskDate + ':' + s.taskId));
  for (const [date, data] of Object.entries(logs)) {
    if (date < from || date > to) continue;
    report.tasks.push(...data.tasks);
    for (const task of data.tasks) {
      if (task.status !== 'deleted') day(date).plannedSeconds += task.durationMinutes * 60;
      if (task.historicalFocusMinutes || ((task.status === 'completed' || task.status === 'deleted' && task.actualFocusMinutes)
        && !recordedTasks.has(date + ':' + task.id))) {
        const seconds = (task.historicalFocusMinutes ?? task.actualFocusMinutes ?? task.durationMinutes) * 60;
        report.historicalSeconds += seconds; day(date).historicalSeconds += seconds;
      }
    }
  }
  for (const session of sessions) {
    if (session.taskDate < from || session.taskDate > to) continue;
    report.sessions.push(session);
    if (session.measurement === 'estimated') {
      report.historicalSeconds += session.actualFocusSeconds;
      day(session.taskDate).historicalSeconds += session.actualFocusSeconds;
      continue;
    }
    report.measuredSeconds += session.actualFocusSeconds;
    day(session.taskDate).measuredSeconds += session.actualFocusSeconds;
    const goal = session.goalId || '';
    report.goalSeconds[goal] = (report.goalSeconds[goal] || 0) + session.actualFocusSeconds;
    if (session.priority) report.prioritySeconds[session.priority] += session.actualFocusSeconds;
  }
  for (const value of Array.from(days.values())) value.deviationSeconds = value.measuredSeconds - value.plannedSeconds;
  report.days = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
  return report;
}
function buildFocusReport(anchor: string, period: FocusPeriod): FocusReport {
  const range = focusPeriodRange(anchor, period);
  const report = summarizeFocus(getDailyLogsSnapshot(), getFocusSessions(), range.from, range.to);
  const cursor = parseDateLocal(range.from);
  for (let i = 0; i < 7; i++) {
    const date = formatDateLocal(cursor);
    if (!report.days.some(d => d.date === date)) report.days.push({ date, plannedSeconds: 0, measuredSeconds: 0, historicalSeconds: 0, deviationSeconds: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  report.days.sort((a, b) => a.date.localeCompare(b.date)); return report;
}
const totals = revisionCache([KEYS.DAILY_LOGS, KEYS.FOCUS_SESSIONS], () => summarizeFocus(getDailyLogsSnapshot(), sessions(), '0000-01-01', '9999-12-31'));
const reports = revisionCache([KEYS.DAILY_LOGS, KEYS.FOCUS_SESSIONS], (_raw, key) => {
  const [anchor, period] = key.split(':'); return buildFocusReport(anchor, period as FocusPeriod);
});
export const getFocusReport = (anchor: string, period: FocusPeriod): FocusReport => reports(anchor + ':' + period);
export const getFocusTotals = () => totals();
export const getMeasuredMinutesByDate = () => Object.fromEntries(getFocusTotals().days.map(d => [d.date, d.measuredSeconds / 60]));
