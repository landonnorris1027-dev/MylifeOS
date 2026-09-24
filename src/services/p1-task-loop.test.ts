import {
  addHabit, deleteTaskForToday, getAllDataJSON, getDailyData, getHabits, importDataJSON,
  initializeDay, rescheduleManualTask, restoreDeletedTask, searchTasks, updateHabit,
} from './storage';
import { Task } from '../types';

const manual = (id: string, date: string, overrides: Partial<Task> = {}): Task => ({
  id, name: 'Submit form', origin: 'manual', priority: 'P2', status: 'inbox',
  date, durationMinutes: 25, note: 'Bring ID', review: 'Advisor approved', ...overrides,
});
const logsKey = 'mylifeos_daily_logs';

describe('P1 task execution loop', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-22T09:00:00+08:00'));
  });
  afterEach(() => jest.useRealTimers());

  it('finds historical tasks by note and review with date, goal, priority and status filters', () => {
    localStorage.setItem(logsKey, JSON.stringify({
      '2026-04-20': { date: '2026-04-20', tasks: [manual('old', '2026-04-20', { status: 'completed', goalId: 'g1' })] },
      '2026-04-22': { date: '2026-04-22', tasks: [manual('new', '2026-04-22', { goalId: 'g2' })] },
    }));
    expect(searchTasks({ query: 'advisor', from: '2026-04-19', to: '2026-04-21', goalId: 'g1', priority: 'P2', status: 'completed' }).map((task) => task.id)).toEqual(['old']);
    expect(searchTasks({ query: 'bring' })).toHaveLength(2);
  });

  it('moves an unfinished manual task in one storage value and preserves its identity', () => {
    const original = manual('move-me', '2026-04-22', { status: 'scheduled', startTime: '10:00' });
    localStorage.setItem(logsKey, JSON.stringify({ '2026-04-22': { date: '2026-04-22', tasks: [original] } }));
    const moved = rescheduleManualTask(original.id, original.date, '2026-04-23');
    expect(moved).toMatchObject({ id: original.id, name: original.name, note: original.note, date: '2026-04-23', status: 'inbox' });
    expect(moved.startTime).toBeUndefined();
    expect(getDailyData('2026-04-22')?.tasks).toHaveLength(0);
    expect(getDailyData('2026-04-23')?.tasks).toEqual([moved]);
  });

  it('keeps both dates unchanged if the atomic daily-log write fails', () => {
    const original = manual('move-me', '2026-04-22');
    localStorage.setItem(logsKey, JSON.stringify({ '2026-04-22': { date: '2026-04-22', tasks: [original] } }));
    const before = localStorage.getItem(logsKey);
    const setItem = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === logsKey) throw new Error('disk full');
      return setItem.call(this, key, value);
    });
    expect(() => rescheduleManualTask(original.id, original.date, '2026-04-23')).toThrow('disk full');
    expect(localStorage.getItem(logsKey)).toBe(before);
  });

  it('rejects completed or habit tasks, same date and malformed dates', () => {
    localStorage.setItem(logsKey, JSON.stringify({ '2026-04-22': { date: '2026-04-22', tasks: [
      manual('done', '2026-04-22', { status: 'completed' }),
      { ...manual('habit', '2026-04-22'), origin: 'habit', habitId: 'h1' },
    ] } }));
    expect(() => rescheduleManualTask('done', '2026-04-22', '2026-04-23')).toThrow();
    expect(() => rescheduleManualTask('habit', '2026-04-22', '2026-04-23')).toThrow();
    expect(() => rescheduleManualTask('done', '2026-04-22', '2026-04-22')).toThrow();
    expect(() => rescheduleManualTask('done', '2026-04-22', '2026-02-30')).toThrow();
  });

  it('undoes deletion and returns a conflicted scheduled task to the inbox', () => {
    const original = manual('undo-me', '2026-04-22', { status: 'scheduled', startTime: '10:00' });
    localStorage.setItem(logsKey, JSON.stringify({ '2026-04-22': { date: '2026-04-22', tasks: [original] } }));
    deleteTaskForToday(original.id, original.date);
    expect(restoreDeletedTask(original)).toBe('restored');
    expect(getDailyData(original.date)?.tasks[0]).toEqual(original);
    deleteTaskForToday(original.id, original.date);
    const logs = JSON.parse(localStorage.getItem(logsKey)!);
    logs[original.date].tasks.push(manual('blocker', original.date, { status: 'scheduled', startTime: '10:00' }));
    localStorage.setItem(logsKey, JSON.stringify(logs));
    expect(restoreDeletedTask(original)).toBe('inbox');
    expect(getDailyData(original.date)?.tasks[0]).toMatchObject({ id: original.id, status: 'inbox' });
    expect(getDailyData(original.date)?.tasks[0].startTime).toBeUndefined();
  });

  it('defaults older habits to daily, applies weekday rules with date range, and round-trips v6 backups', async () => {
    const daily = addHabit('Old daily', 'P1', 1);
    const workdays = addHabit('Weekday', 'P2', 1, 25, 'range', '2026-04-20', '2026-04-30', undefined, [1, 2, 3, 4, 5]);
    expect(daily.weekdays).toBeUndefined();
    expect(initializeDay('2026-04-23').tasks.map((task) => task.habitId)).toContain(workdays.id);
    expect(initializeDay('2026-04-25').tasks.map((task) => task.habitId)).not.toContain(workdays.id);
    expect(initializeDay('2026-05-01').tasks.map((task) => task.habitId)).not.toContain(workdays.id);
    const backup = JSON.parse(getAllDataJSON());
    expect(backup.schemaVersion).toBe(6);
    expect(backup.habits.find((habit: { id: string }) => habit.id === workdays.id).weekdays).toEqual([1, 2, 3, 4, 5]);
    localStorage.clear();
    expect((await importDataJSON(JSON.stringify(backup))).ok).toBe(true);
    expect(getHabits().find((habit) => habit.id === workdays.id)?.weekdays).toEqual([1, 2, 3, 4, 5]);
    updateHabit({ ...workdays, weekdays: [1] });
    expect(getDailyData('2026-04-23')?.tasks.find((task) => task.habitId === workdays.id)).toBeUndefined();
  });

  it('preserves user work when a future habit weekday or quota is removed', () => {
    const habit = addHabit('Read', 'P2', 3);
    const future = '2026-04-25';
    const generated = initializeDay(future).tasks.filter((task) => task.habitId === habit.id);
    const logs = JSON.parse(localStorage.getItem(logsKey)!);
    logs[future].tasks = [
      { ...generated[0], status: 'completed', review: 'Finished chapter' },
      { ...generated[1], status: 'scheduled', startTime: '10:00' },
      { ...generated[2], note: 'Bring notes' },
    ];
    localStorage.setItem(logsKey, JSON.stringify(logs));

    updateHabit({ ...habit, dailyQuota: 1 });
    expect(getDailyData(future)?.tasks.map((task) => task.id).sort()).toEqual(generated.map((task) => task.id).sort());

    updateHabit({ ...habit, dailyQuota: 1, weekdays: [1, 2, 3, 4, 5] });
    expect(getDailyData(future)?.tasks.map((task) => task.id).sort()).toEqual(generated.map((task) => task.id).sort());
    expect(getDailyData(future)?.tasks.find((task) => task.id === generated[0].id)?.review).toBe('Finished chapter');
  });
});
