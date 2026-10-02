import { importBackupJSON, exportBackupJSON, exportDesktopCompatibleBackupJSON } from './backupService';
import { commitNativeEntries, refreshNativeTimers, flushNativeWrites } from '../nativeRuntime';
import { Task } from '../../types';
jest.mock('../platform', () => ({ isAndroid: () => true }));
jest.mock('../nativeRuntime', () => ({
  commitNativeEntries: jest.fn(), refreshNativeTimers: jest.fn(), flushNativeWrites: jest.fn(),
  getNativeItem: (key: string) => globalThis.localStorage.getItem(key),
}));
beforeEach(() => {
  localStorage.clear();
  (flushNativeWrites as jest.Mock).mockResolvedValue(undefined);
  (refreshNativeTimers as jest.Mock).mockResolvedValue([]);
  (commitNativeEntries as jest.Mock).mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it('blocks import for both running and paused sessions, and for unknown session state', async () => {
  const json = JSON.stringify({ schemaVersion: 4, habits: [], dailyLogs: {} });
  for (const state of ['running', 'paused']) {
    (refreshNativeTimers as jest.Mock).mockResolvedValueOnce([{ state }]);
    expect((await importBackupJSON(json)).ok).toBe(false);
    expect(commitNativeEntries).not.toHaveBeenCalled();
  }
  (refreshNativeTimers as jest.Mock).mockRejectedValueOnce(new Error('Cannot read session state'));
  expect((await importBackupJSON(json)).ok).toBe(false);
  expect(commitNativeEntries).not.toHaveBeenCalled();
});
it('preserves historical orphan tasks and exact focus minutes through v4, v6 and v7', async () => {
  const task: Task = { id: 'history', habitId: 'removed-habit', origin: 'habit', name: 'Historical work', priority: 'P1',
    status: 'completed', date: '2026-10-01', durationMinutes: 25, actualFocusMinutes: 17 };
  const logs = { '2026-10-01': { date: '2026-10-01', tasks: [task] } };
  for (const json of [JSON.stringify({ schemaVersion: 4, habits: [], dailyLogs: logs }),
    exportDesktopCompatibleBackupJSON([], logs), exportBackupJSON([], logs)]) {
    const result = await importBackupJSON(json);
    expect(result).toMatchObject({ ok: true, importedTaskCount: 1, filteredTaskCount: 0 });
    const entries = (commitNativeEntries as jest.Mock).mock.calls.slice(-1)[0][0];
    expect(JSON.parse(entries.mylifeos_daily_logs)['2026-10-01'].tasks).toEqual([expect.objectContaining({ id: 'history', actualFocusMinutes: 17 })]);
  }
});
it('reports native import failure and uses one full commit', async () => {
  (commitNativeEntries as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  expect((await importBackupJSON(exportBackupJSON([], {}))).ok).toBe(false);
  expect(commitNativeEntries).toHaveBeenCalledTimes(1);
});
