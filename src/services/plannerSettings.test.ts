import { getPlannerSettings, savePlannerSettings } from './plannerSettings';
import { KEYS, getStorageItem, setStorageItem } from './storage/localStorageStore';
import { exportBackupJSON, importBackupJSON } from './storage/backupService';

describe('fixed thirty-minute scheduling preference', () => {
  beforeEach(() => localStorage.clear());
  it.each([5, 15, 30])('normalizes a stored %i-minute preference without rewriting tasks', intervalMinutes => {
    const logs = JSON.stringify({ '2026-10-08': { date: '2026-10-08', tasks: [
      { id: 'off-grid', name: 'Keep schedule', priority: 'P1', status: 'scheduled', date: '2026-10-08', startTime: '09:07', durationMinutes: 25 },
    ] } });
    setStorageItem(KEYS.DAILY_LOGS, logs);
    setStorageItem(KEYS.PLANNER_SETTINGS, JSON.stringify({ timelineMode: 'fullDay', intervalMinutes }));
    expect(getPlannerSettings()).toEqual({ timelineMode: 'fullDay', intervalMinutes: 30 });
    savePlannerSettings(getPlannerSettings());
    expect(JSON.parse(getStorageItem(KEYS.PLANNER_SETTINGS)!)).toEqual({ timelineMode: 'fullDay', intervalMinutes: 30 });
    expect(getStorageItem(KEYS.DAILY_LOGS)).toBe(logs);
  });
  it.each([5, 15, 30])('imports a v8 %i-minute preference as thirty while retaining tasks and sessions', async intervalMinutes => {
    const session = { id: 's', timerId: 't', taskId: null, taskDate: '2026-10-08', taskName: 'History', plannedSeconds: 120,
      actualFocusSeconds: 91.5, startedAt: 1000, endedAt: 92500, result: 'stopped', measurement: 'measured' };
    const date = '2026-10-08';
    const task = { id: 'off-grid', name: 'Keep schedule', priority: 'none' as const, origin: 'manual' as const,
      status: 'scheduled' as const, date, startTime: '09:07', durationMinutes: 25 };
    setStorageItem(KEYS.FOCUS_SESSIONS, JSON.stringify([session]));
    const backup = JSON.parse(exportBackupJSON([], { [date]: { date, tasks: [task] } }));
    backup.settings.planner.intervalMinutes = intervalMinutes;
    localStorage.clear();
    expect((await importBackupJSON(JSON.stringify(backup))).ok).toBe(true);
    expect(JSON.parse(getStorageItem(KEYS.PLANNER_SETTINGS)!)).toMatchObject({ intervalMinutes: 30 });
    const exported = JSON.parse(exportBackupJSON([], {}));
    expect(exported.settings.planner.intervalMinutes).toBe(30);
    expect(exported.focusSessions).toEqual([session]);
    expect(JSON.parse(getStorageItem(KEYS.DAILY_LOGS)!)[date].tasks[0].startTime).toBe('09:07');
  });
});
