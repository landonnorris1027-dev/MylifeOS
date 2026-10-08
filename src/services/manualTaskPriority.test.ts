import { addManualTask, getDailyData, getProfileStats, searchTasks } from './storage';
import { getAllDailyLogs, saveAllDailyLogs } from './storage/dailyLogRepository';
import { KEYS, getStorageItem, setStorageItem } from './storage/localStorageStore';
import { exportBackupJSON, exportDesktopCompatibleBackupJSON, importBackupJSON } from './storage/backupService';
import { isAppDataRecord } from '../main/app-data-store';
import { buildTaskFromRecovery } from '../hooks/useAppController';
import type { Task } from '../types';
const date = '2026-04-22';
const manual: Task = { id: 'old-manual', name: 'Old manual', date, origin: 'manual', priority: 'P1',
  status: 'completed', durationMinutes: 25, actualFocusMinutes: 20, startTime: '09:07', note: 'Keep note', review: 'Keep review' };
const habit: Task = { ...manual, id: 'habit', habitId: 'removed-habit', origin: 'habit', priority: 'P2' };
const logs = { [date]: { date, tasks: [manual, habit] } };
describe('unprioritized manual tasks', () => {
  beforeEach(() => localStorage.clear());
  it('normalizes existing and legacy manual tasks without losing history or writing during reads', () => {
    const raw = JSON.stringify({ [date]: { date, tasks: [manual, { ...manual, id: 'legacy', origin: undefined }, habit] } });
    setStorageItem(KEYS.DAILY_LOGS, raw);
    expect(getDailyData(date)?.tasks).toEqual([
      { ...manual, priority: 'none' }, { ...manual, id: 'legacy', origin: undefined, priority: 'none' }, habit,
    ]);
    expect(getStorageItem(KEYS.DAILY_LOGS)).toBe(raw);
  });
  it('creates new manual tasks with none even for old callers supplying a priority', () => {
    expect(addManualTask(date, { name: 'New manual', durationMinutes: 25 })?.priority).toBe('none');
    expect(addManualTask(date, { name: 'Old caller', durationMinutes: 25, priority: 'P1' })?.priority).toBe('none');
  });
  it('separates manual search and statistics while retaining total focus time', () => {
    saveAllDailyLogs(logs);
    expect(searchTasks({ priority: 'none' }).map(task => task.id)).toEqual([manual.id]);
    expect(searchTasks({ priority: 'P2' }).map(task => task.id)).toEqual([habit.id]);
    const stats = getProfileStats();
    expect(stats.totalFocusMinutes).toBe(40);
    expect(stats.priorityMinutes).toEqual({ P1: 0, P2: 20, P3: 0, none: 20 });
    expect(getAllDailyLogs()[date].tasks[0]).toEqual({ ...manual, priority: 'none' });
  });
  it('round-trips the new value and old priorities without filtering out tasks', async () => {
    const backup = exportBackupJSON([], logs);
    const original = JSON.parse(backup);
    expect(original.dailyLogs[date].tasks[0].priority).toBe('none');
    expect(manual.priority).toBe('P1');
    const result = await importBackupJSON(backup);
    expect(result).toMatchObject({ ok: true, filteredTaskCount: 0, importedTaskCount: 2 });
    expect(getDailyData(date)?.tasks.map(task => task.priority)).toEqual(['none', 'P2']);
  });
  it('uses P3 only for explicit old-app exports and restores none in updated apps', async () => {
    const compatible = exportDesktopCompatibleBackupJSON([], logs);
    expect(JSON.parse(compatible).dailyLogs[date].tasks[0].priority).toBe('P3');
    expect((await importBackupJSON(compatible)).ok).toBe(true);
    expect(getDailyData(date)?.tasks[0].priority).toBe('none');
  });
  it('accepts native manual storage but rejects a habit with none', () => {
    const record = { [KEYS.DAILY_LOGS]: JSON.stringify({ [date]: { date, tasks: [{ ...manual, priority: 'none' }] } }) };
    expect(isAppDataRecord(record)).toBe(true);
    record[KEYS.DAILY_LOGS] = JSON.stringify({ [date]: { date, tasks: [{ ...habit, priority: 'none' }] } });
    expect(isAppDataRecord(record)).toBe(false);
  });
  it('restores old and new manual timers without reintroducing priority', () => {
    const recovery = { recoveryId: 'r', timerId: 't', taskId: manual.id, taskName: manual.name,
      taskDate: date, taskDurationMinutes: 25, reason: 'expired_while_offline', mode: 'focus' as const };
    expect(buildTaskFromRecovery({ ...recovery, taskPriority: 'none' })?.priority).toBe('none');
    expect(buildTaskFromRecovery({ ...recovery, taskPriority: 'P1' })?.priority).toBe('none');
    expect(buildTaskFromRecovery({ ...recovery, taskHabitId: 'habit', taskPriority: 'P1' })?.priority).toBe('P1');
  });
});
