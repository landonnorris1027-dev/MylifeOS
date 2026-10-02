import { focusPeriodRange, summarizeFocus } from './focusReports';
import { FocusSession } from '../main/focus-session';
import { DailyData, Task } from '../types';
const session = (id: string, extra: Partial<FocusSession> = {}): FocusSession => ({ id, timerId: id, taskId: 'task', taskDate: '2026-09-28', taskName: 'Focus', priority: 'P1', goalId: 'deleted-goal', plannedSeconds: 1500, actualFocusSeconds: 91.5, startedAt: new Date(2026, 8, 28, 23, 59).getTime(), endedAt: new Date(2026, 8, 29, 0, 2).getTime(), result: 'completed', measurement: 'measured', ...extra });
describe('precise focus reporting', () => {
  it('uses local Monday through Sunday independently of the rolling seven days', () => {
    expect(focusPeriodRange('2026-10-04', 'week')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(focusPeriodRange('2026-10-05', 'week')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(focusPeriodRange('2026-10-02', 'rolling')).toEqual({ from: '2026-09-26', to: '2026-10-02' });
  });
  it('counts stopped sessions, attributes cross-midnight focus to the original day, and preserves deleted associations', () => {
    const report = summarizeFocus({}, [session('done'), session('stop', { result: 'stopped', actualFocusSeconds: 10.25 })], '2026-09-28', '2026-10-04');
    expect(report.measuredSeconds).toBe(101.75);
    expect(report.goalSeconds['deleted-goal']).toBe(101.75);
    expect(report.days).toEqual([{ date: '2026-09-28', plannedSeconds: 0, measuredSeconds: 101.75, historicalSeconds: 0, deviationSeconds: 101.75 }]);
  });
  it('separates legacy task estimates and explicit offline estimates without double counting a recorded task', () => {
    const task: Task = { id: 'task', name: 'Focus', date: '2026-09-28', priority: 'P1', durationMinutes: 25, actualFocusMinutes: 2, status: 'completed', review: 'Reviewed' };
    const logs: Record<string, DailyData> = { [task.date]: { date: task.date, tasks: [task, { ...task, id: 'legacy', actualFocusMinutes: undefined }] } };
    const report = summarizeFocus(logs, [session('done'), session('estimate', { taskId: 'offline', measurement: 'estimated', actualFocusSeconds: 300 })], '2026-09-28', '2026-10-04');
    expect(report.measuredSeconds).toBe(91.5);
    expect(report.historicalSeconds).toBe(1800);
    expect(report.days[0]).toMatchObject({ plannedSeconds: 3000, deviationSeconds: -2908.5 });
    expect(report.tasks[0].review).toBe('Reviewed');
  });
});
