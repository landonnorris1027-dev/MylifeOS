import { dailyFocusStacks, FOCUS_STACKS, focusHistoryBuckets } from './focusChartData';
import { focusHistoryRanges, summarizeFocus } from '../services/focusReports';
import { FocusSession } from '../main/focus-session';
import { Task } from '../types';

const date = '2026-10-12';
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id, name: id, date, durationMinutes: 30, status: 'completed',
  priority: 'P3', habitId: 'habit', origin: 'habit', ...overrides,
});
const session = (id: string, overrides: Partial<FocusSession> = {}): FocusSession => ({
  id, timerId: id, taskId: id, taskName: id, taskDate: date, priority: 'P1',
  plannedSeconds: 1800, actualFocusSeconds: 600, startedAt: 1, endedAt: 600001,
  result: 'completed', measurement: 'measured', ...overrides,
});

describe('measured focus stacks', () => {
  it('reconciles with report totals, preserving manual and session-snapshot priorities', () => {
    const report = summarizeFocus({ [date]: { date, tasks: [
      task('changed-priority'), task('legacy-manual', { habitId: undefined, origin: undefined }),
    ] } }, [
      session('changed-priority', { priority: 'P2' }),
      session('legacy-manual'),
      session('missing-task', { priority: undefined }),
      session('stopped', { result: 'stopped', priority: 'P3' }),
      session('estimate', { measurement: 'estimated', actualFocusSeconds: 9000 }),
    ], date, date);
    const [stack] = dailyFocusStacks(report.days, report);
    expect(stack).toEqual({ P1: 0, P2: 600, P3: 600, none: 600, unassigned: 600 });
    expect(FOCUS_STACKS.reduce((sum, key) => sum + stack[key], 0)).toBe(report.measuredSeconds);
    expect(report.historicalSeconds).toBe(9000);
  });

  it('uses the original task date for recurring ids and cross-midnight sessions', () => {
    const next = '2026-10-13';
    const report = summarizeFocus({
      [date]: { date, tasks: [task('repeat', { origin: 'manual', habitId: undefined })] },
      [next]: { date: next, tasks: [task('repeat', { date: next })] },
    }, [session('repeat', { endedAt: new Date(`${next}T00:15:00`).getTime() }),
      session('repeat', { taskDate: next, priority: 'P2' })], date, next);
    const stacks = dailyFocusStacks(report.days, report);
    expect(stacks[0].none).toBe(600);
    expect(stacks[0].P2).toBe(0);
    expect(stacks[1].P2).toBe(600);
    expect(stacks[1].none).toBe(0);
  });

  it('keeps zero days empty and imported unattributed time visible', () => {
    const day = { date, plannedSeconds: 10000, measuredSeconds: 0, historicalSeconds: 9000, deviationSeconds: -10000 };
    expect(Object.values(dailyFocusStacks([day])[0])).toEqual([0, 0, 0, 0, 0]);
    expect(dailyFocusStacks([{ ...day, measuredSeconds: 30 }])[0].unassigned).toBe(30);
  });

  it('builds exactly twenty local days and twenty Monday-based weeks across year boundaries', () => {
    const days = focusHistoryRanges('2026-01-05', 'day');
    expect(days).toHaveLength(20);
    expect(days[0]).toEqual({ from: '2025-12-17', to: '2025-12-17' });
    expect(days[19]).toEqual({ from: '2026-01-05', to: '2026-01-05' });
    const weeks = focusHistoryRanges('2026-01-07', 'week');
    expect(weeks).toHaveLength(20);
    expect(weeks[18]).toEqual({ from: '2025-12-29', to: '2026-01-04' });
    expect(weeks[19]).toEqual({ from: '2026-01-05', to: '2026-01-07' });
    expect(focusHistoryRanges('2026-01-11', 'week')[19]).toEqual({ from: '2026-01-05', to: '2026-01-11' });
  });

  it('computes weekly shortfall from weekly totals and retains zero buckets', () => {
    const report = summarizeFocus({}, [], '2026-10-12', '2026-10-13');
    report.days = [
      { date: '2026-10-12', plannedSeconds: 600, measuredSeconds: 1200, historicalSeconds: 9000, deviationSeconds: 600 },
      { date: '2026-10-13', plannedSeconds: 1800, measuredSeconds: 600, historicalSeconds: 0, deviationSeconds: -1200 },
    ];
    const days = focusHistoryBuckets(report, '2026-10-13', 'day');
    expect(days.slice(-2).map(day => day.shortfallSeconds)).toEqual([0, 1200]);
    const weeks = focusHistoryBuckets(report, '2026-10-13', 'week');
    expect(weeks).toHaveLength(20);
    expect(weeks[0].measuredSeconds).toBe(0);
    expect(weeks[19]).toMatchObject({ plannedSeconds: 2400, measuredSeconds: 1800, historicalSeconds: 9000, shortfallSeconds: 600 });
    expect(weeks[19].stacks.unassigned).toBe(1800);
  });
});
