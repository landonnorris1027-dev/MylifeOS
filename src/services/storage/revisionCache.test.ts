import { KEYS, setStorageItem } from './localStorageStore';
import { getAllDailyLogs, getDailyLogByDate } from './dailyLogRepository';
import { searchTasks } from '../storage';
import { getFocusTotals } from '../focusReports';
const day = { date: '2026-10-02', tasks: [{ id: 'task', name: 'Original', priority: 'P1' as const,
  status: 'completed' as const, date: '2026-10-02', durationMinutes: 25, note: 'saved' }] };
describe('cached history remains current and cannot be mutated by callers', () => {
  beforeEach(() => localStorage.clear());
  it('separates caller edits from the saved day and search index', async () => {
    await setStorageItem(KEYS.DAILY_LOGS, JSON.stringify({ [day.date]: day }));
    getAllDailyLogs()[day.date].tasks[0].note = 'unsaved';
    searchTasks({})[0].name = 'unsaved';
    expect(getDailyLogByDate(day.date)?.tasks[0]).toMatchObject({ name: 'Original', note: 'saved' });
    expect(searchTasks({ query: 'unsaved' })).toHaveLength(0);
    expect(searchTasks({ query: 'saved' })).toHaveLength(1);
  });
  it('refreshes search and measured totals after edits, restore and retry notifications', async () => {
    await setStorageItem(KEYS.DAILY_LOGS, JSON.stringify({ [day.date]: day }));
    expect(getFocusTotals().historicalSeconds).toBe(1500);
    expect(searchTasks({ query: 'Original' })).toHaveLength(1);
    await setStorageItem(KEYS.DAILY_LOGS, JSON.stringify({ [day.date]: { ...day, tasks: [{ ...day.tasks[0], name: 'Restored' }] } }));
    await setStorageItem(KEYS.FOCUS_SESSIONS, JSON.stringify([{ id: 'session', timerId: 'timer', taskId: 'task',
      taskDate: day.date, taskName: 'Original', plannedSeconds: 1500, actualFocusSeconds: 1.25,
      startedAt: 1000, endedAt: 2250, result: 'stopped', measurement: 'measured' }]));
    window.dispatchEvent(new Event('mylifeos-storage-restored'));
    expect(searchTasks({ query: 'Original' })).toHaveLength(0);
    expect(searchTasks({ query: 'Restored' })).toHaveLength(1);
    expect(getFocusTotals()).toMatchObject({ measuredSeconds: 1.25, historicalSeconds: 0 });
  });
});
