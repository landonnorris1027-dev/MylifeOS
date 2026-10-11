import { getPlannerSettings, savePlannerSettings } from './plannerSettings';
import { KEYS, getStorageItem, setStorageItem } from './storage/localStorageStore';
import { exportBackupJSON, importBackupJSON } from './storage/backupService';

describe('retired five-minute scheduling preference', () => {
  beforeEach(() => localStorage.clear());
  it('normalizes and saves an old five-minute preference without rewriting tasks', () => {
    const logs = JSON.stringify({ '2026-10-08': { date: '2026-10-08', tasks: [
      { id: 'off-grid', name: 'Keep schedule', priority: 'P1', status: 'scheduled', date: '2026-10-08', startTime: '09:07', durationMinutes: 25 },
    ] } });
    setStorageItem(KEYS.DAILY_LOGS, logs);
    setStorageItem(KEYS.PLANNER_SETTINGS, JSON.stringify({ timelineMode: 'fullDay', intervalMinutes: 5 }));
    expect(getPlannerSettings()).toEqual({ timelineMode: 'fullDay', intervalMinutes: 15 });
    savePlannerSettings(getPlannerSettings());
    expect(JSON.parse(getStorageItem(KEYS.PLANNER_SETTINGS)!)).toEqual({ timelineMode: 'fullDay', intervalMinutes: 15 });
    expect(getStorageItem(KEYS.DAILY_LOGS)).toBe(logs);
  });
  it('imports an old v8 five-minute preference as fifteen while retaining precise sessions', async () => {
    const session = { id: 's', timerId: 't', taskId: null, taskDate: '2026-10-08', taskName: 'History', plannedSeconds: 120,
      actualFocusSeconds: 91.5, startedAt: 1000, endedAt: 92500, result: 'stopped', measurement: 'measured' };
    setStorageItem(KEYS.FOCUS_SESSIONS, JSON.stringify([session]));
    const backup = JSON.parse(exportBackupJSON([], {}));
    backup.settings.planner.intervalMinutes = 5;
    localStorage.clear();
    expect((await importBackupJSON(JSON.stringify(backup))).ok).toBe(true);
    expect(JSON.parse(getStorageItem(KEYS.PLANNER_SETTINGS)!)).toMatchObject({ intervalMinutes: 15 });
    const exported = JSON.parse(exportBackupJSON([], {}));
    expect(exported.settings.planner.intervalMinutes).toBe(15);
    expect(exported.focusSessions).toEqual([session]);
  });
});
