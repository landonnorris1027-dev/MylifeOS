import { completedFocusDistribution } from './completedFocusSummary';
import { FocusSession } from '../main/focus-session';
import { Task } from '../types';

const task = (
  id: string,
  date = '2026-10-09',
  extra: Partial<Task> = {},
): Task => ({
  id,
  date,
  name: id,
  status: 'completed',
  priority: 'P1',
  origin: 'habit',
  habitId: `habit-${id}`,
  durationMinutes: 25,
  ...extra,
});
const session = (
  id: string,
  taskId: string | null,
  seconds: number,
  extra: Partial<FocusSession> = {},
): FocusSession => ({
  id,
  timerId: id,
  taskId,
  taskDate: '2026-10-09',
  taskName: taskId,
  priority: 'P1',
  plannedSeconds: 3600,
  actualFocusSeconds: seconds,
  startedAt: 1000,
  endedAt: 3601000,
  result: 'completed',
  measurement: 'measured',
  ...extra,
});

describe('completed task measured focus distribution', () => {
  it('weights by actual seconds, including earlier stopped focus on a now completed task', () => {
    const report = {
      tasks: [task('first'), task('second', '2026-10-09', { priority: 'P2' })],
      sessions: [
        session('first-done', 'first', 600),
        session('first-stop', 'first', 300, { result: 'stopped' }),
        session('second-done', 'second', 300, { priority: 'P2' }),
      ],
    };
    expect(
      completedFocusDistribution(report, '2026-10-09', '2026-10-09'),
    ).toEqual({
      totalSeconds: 1200,
      secondsByPriority: { P1: 900, P2: 300, P3: 0, none: 0 },
    });
  });
  it('excludes incomplete, undone, deleted, estimated, orphan and legacy-only records', () => {
    const report = {
      tasks: [
        task('done'),
        task('inbox', undefined, { status: 'inbox' }),
        task('scheduled', undefined, { status: 'scheduled' }),
        task('deleted', undefined, { status: 'deleted' }),
        task('legacy', undefined, { actualFocusMinutes: 25 }),
      ],
      sessions: [
        session('valid', 'done', 90.25),
        session('estimate', 'done', 600, { measurement: 'estimated' }),
        session('undone', 'inbox', 300),
        session('notdone', 'scheduled', 300),
        session('deleted', 'deleted', 300),
        session('missing', 'missing', 300),
        session('standalone', null, 300),
      ],
    };
    expect(
      completedFocusDistribution(report, '2026-10-09', '2026-10-09')
        .totalSeconds,
    ).toBe(90.25);
  });
  it('uses task date across midnight and distinguishes recurring task identities in daily and weekly totals', () => {
    const report = {
      tasks: [task('same', '2026-10-08'), task('same', '2026-10-09')],
      sessions: [
        session('previous', 'same', 600, { taskDate: '2026-10-08' }),
        session('midnight', 'same', 900, {
          startedAt: new Date('2026-10-09T23:55:00+08:00').getTime(),
          endedAt: new Date('2026-10-10T00:10:00+08:00').getTime(),
        }),
      ],
    };
    expect(
      completedFocusDistribution(report, '2026-10-09', '2026-10-09')
        .totalSeconds,
    ).toBe(900);
    expect(
      completedFocusDistribution(report, '2026-10-05', '2026-10-11')
        .totalSeconds,
    ).toBe(1500);
    expect(
      completedFocusDistribution(report, '2026-10-10', '2026-10-10')
        .totalSeconds,
    ).toBe(0);
  });
  it('keeps legacy manual focus purple and preserves the recorded habit priority', () => {
    const manual = task('manual', undefined, {
      origin: 'manual',
      habitId: undefined,
      priority: 'P1',
    });
    const changed = task('changed', undefined, { priority: 'P2' });
    const report = {
      tasks: [manual, changed],
      sessions: [
        session('manual-session', 'manual', 600),
        session('habit-session', 'changed', 300),
      ],
    };
    const original = JSON.stringify(report);
    expect(
      completedFocusDistribution(report, '2026-10-09', '2026-10-09'),
    ).toEqual({
      totalSeconds: 900,
      secondsByPriority: { P1: 300, P2: 0, P3: 0, none: 600 },
    });
    expect(JSON.stringify(report)).toBe(original);
  });
});
