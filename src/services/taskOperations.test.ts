import { TaskOperations } from './taskOperations';
import { setActiveTaskIds } from './taskActivity';
import { getAllDailyLogs, saveAllDailyLogs } from './storage/dailyLogRepository';
import { getPlannerSettings, savePlannerSettings } from './plannerSettings';
import { buildTimelineSlotsForMode, isTaskStartInPastForDate } from './scheduling';
import { reconcileDayTasks } from './storage/taskPlanner';
import { Task } from '../types';
import { getFocusTotals } from './focusReports';
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, name: id, priority: 'P1', status: 'inbox', date: '2026-10-02', durationMinutes: 25, origin: 'manual', ...extra });
const seed = (tasks: Task[]) => saveAllDailyLogs({ '2026-10-02': { date: '2026-10-02', tasks } });
describe('task operation boundaries', () => {
  beforeEach(() => { localStorage.clear(); setActiveTaskIds([]); });
  afterEach(() => setActiveTaskIds([]));
  it('aborts an entire batch if any task is completed, active or a habit', async () => {
    for (const invalid of [task('b', { status: 'completed' }), task('b', { habitId: 'habit' }), task('b')]) {
      const a = task('a'); seed([a, invalid]); if (!invalid.habitId && invalid.status === 'inbox') setActiveTaskIds(['b']);
      const before = JSON.stringify(getAllDailyLogs());
      await expect(new TaskOperations().reschedule([a, invalid], '2026-10-03')).rejects.toThrow();
      expect(JSON.stringify(getAllDailyLogs())).toBe(before); setActiveTaskIds([]);
    }
  });
  it('moves multiple tasks durably and undo restores only their positions', async () => {
    const a = task('a', { startTime: '09:07', status: 'scheduled' }), b = task('b'); seed([a, b]);
    const ops = new TaskOperations(); await ops.reschedule([a, b], '2026-10-03');
    const logs = getAllDailyLogs(); logs['2026-10-03'].tasks[0].note = 'New note';
    logs['2026-10-02'].tasks.push(task('other', { startTime: '09:00', status: 'scheduled', durationMinutes: 60 })); saveAllDailyLogs(logs);
    expect(await ops.undo()).toBe('inbox');
    const result = getAllDailyLogs()['2026-10-02'].tasks;
    expect(result.find(t => t.id === 'a')).toMatchObject({ status: 'inbox', note: 'New note' });
    expect(result.find(t => t.id === 'other')?.startTime).toBe('09:00');
    expect(result.find(t => t.id === 'b')).toEqual({ ...b, priority: 'none' });
  });
  it('rejects undo after a later completion and keeps the history for review', async () => {
    const a = task('a'); seed([a]); const ops = new TaskOperations();
    await ops.change(a, { date: a.date, status: 'scheduled', startTime: '10:00' }, 'schedule');
    const logs = getAllDailyLogs(); logs[a.date].tasks[0].status = 'completed'; saveAllDailyLogs(logs);
    await expect(ops.undo()).rejects.toThrow('later task change'); expect(ops.count).toBe(1);
  });
  it.each([20, undefined])('restores a completed task to inbox while retaining its historical %s-minute basis', async actualFocusMinutes => {
    const completed = task('completed', { status: 'completed', startTime: '09:00', actualFocusMinutes }); seed([completed]);
    const history = getFocusTotals().historicalSeconds;
    const ops = new TaskOperations(); await ops.change(completed, { date: completed.date, status: 'deleted', startTime: completed.startTime }, 'delete');
    const logs = getAllDailyLogs(); logs[completed.date].tasks.push(task('new', { status: 'scheduled', startTime: '09:00' })); saveAllDailyLogs(logs);
    expect(await ops.undo()).toBe('inbox');
    expect(getAllDailyLogs()[completed.date].tasks.find(t => t.id === completed.id)).toMatchObject({ status: 'inbox', historicalFocusMinutes: actualFocusMinutes ?? 25 });
    expect(getAllDailyLogs()[completed.date].tasks.find(t => t.id === completed.id)?.startTime).toBeUndefined();
    expect(getFocusTotals().historicalSeconds).toBe(history);
  });
  it('limits history to 20 operations within one runtime', async () => {
    let a = task('a'); seed([a]); const ops = new TaskOperations();
    for (let i = 0; i < 25; i++) {
      await ops.change(a, { date: a.date, status: a.status === 'inbox' ? 'scheduled' : 'inbox', startTime: a.status === 'inbox' ? '10:00' : undefined }, 'position');
      a = getAllDailyLogs()[a.date].tasks[0];
    }
    expect(ops.count).toBe(20);
  });
  it('keeps a directly focused inbox habit unchanged through quota and deletion reconciliation', () => {
    const a = task('a', { habitId: 'h', origin: 'habit', startTime: '09:07' }); setActiveTaskIds(['a']);
    expect(reconcileDayTasks({ date: a.date, tasks: [a] }, [], a.date).tasks).toEqual([a]);
    expect(reconcileDayTasks({ date: a.date, tasks: [a] }, [{ id: 'h', name: 'Changed', priority: 'P3', dailyQuota: 1, defaultDurationMinutes: 5, effectiveType: 'permanent' }], a.date).tasks[0]).toEqual(a);
  });
  it('initializes new profiles at 15 minutes, preserves old profiles at 30 and supports the two remaining grids', () => {
    expect(getPlannerSettings().intervalMinutes).toBe(15); seed([task('old')]);
    expect(getPlannerSettings().intervalMinutes).toBe(30);
    for (const intervalMinutes of [15, 30] as const) {
      savePlannerSettings({ intervalMinutes });
      expect(getPlannerSettings().intervalMinutes).toBe(intervalMinutes);
      expect(buildTimelineSlotsForMode('fullDay', intervalMinutes)).toHaveLength(1440 / intervalMinutes);
      expect(isTaskStartInPastForDate('2026-10-02', '10:15', new Date(2026, 9, 2, 10, 7), intervalMinutes)).toBe(intervalMinutes === 30);
      expect(getAllDailyLogs()['2026-10-02'].tasks[0].id).toBe('old');
    }
  });
});
