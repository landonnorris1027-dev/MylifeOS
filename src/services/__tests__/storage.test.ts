import {
  initializeDay,
  updateTask,
  reduceHabitQuota,
  importDataJSON,
  addHabit,
  getHabits,
  getDailyData,
  getAllLogs,
  deleteTaskFromDay,
  deleteHabit,
} from '../storage';
import { Task } from '../../types';

Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
    getRandomValues: (arr: any) => arr
  }
});

describe('Storage Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(3); // April
    jest.spyOn(Date.prototype, 'getDate').mockReturnValue(12); // So today is 2026-04-12
  });

  it('addHabit and initializeDay should populate tasks based on quota', async () => {
    expect(await getHabits()).toHaveLength(0);

    await addHabit('Test Habit', 'P1', 2, 25);
    expect(await getHabits()).toHaveLength(1);

    const dayData = await initializeDay('2026-04-12');

    expect(dayData.tasks).toHaveLength(2);
    expect(dayData.tasks[0].name).toBe('Test Habit');
    expect(dayData.tasks[0].status).toBe('inbox');
    expect(dayData.tasks[1].status).toBe('inbox');
    expect(dayData.tasks[0].id).not.toBe(dayData.tasks[1].id);
  });

  it('initializeDay does not create duplicate tasks if sufficient quota exists', async () => {
    await addHabit('Test Habit', 'P1', 1, 25);
    await initializeDay('2026-04-12');

    const dayData = await initializeDay('2026-04-12');
    expect(dayData.tasks).toHaveLength(1);
  });

  it('initializeDay can preview future generated tasks without persisting them', async () => {
    await addHabit('Future Habit', 'P1', 1, 25);

    const previewData = await initializeDay('2026-04-13', { persistGenerated: false });

    expect(previewData.tasks).toHaveLength(1);
    expect(previewData.tasks[0].name).toBe('Future Habit');
    expect(await getDailyData('2026-04-13')).toBeNull();
    expect(await getAllLogs()).not.toHaveProperty('2026-04-13');
  });

  it('updateTask updates task correctly', async () => {
    await addHabit('Test Habit', 'P1', 1, 25);
    const dayData = await initializeDay('2026-04-12');

    const task = dayData.tasks[0];
    const updatedTask: Task = { ...task, status: 'completed' };

    await updateTask(updatedTask);

    const freshData = await initializeDay('2026-04-12');
    expect(freshData.tasks[0].status).toBe('completed');
  });

  it('deleteTaskFromDay works correctly', async () => {
    await addHabit('Test Habit', 'P1', 1, 25);
    const dayData = await initializeDay('2026-04-12');
    const taskId = dayData.tasks[0].id;

    await deleteTaskFromDay(taskId, '2026-04-12');

    const freshData = await getDailyData('2026-04-12');
    expect(freshData!.tasks).toHaveLength(0);
  });

  it('soft-deleted tasks are not regenerated for the same day', async () => {
    await addHabit('Test Habit', 'P1', 1, 25);
    const dayData = await initializeDay('2026-04-12');
    const task = dayData.tasks[0];

    await updateTask({ ...task, status: 'deleted', startTime: undefined });

    const freshData = await initializeDay('2026-04-12');
    expect(freshData.tasks).toHaveLength(1);
    expect(freshData.tasks[0].id).toBe(task.id);
    expect(freshData.tasks[0].status).toBe('deleted');
  });

  it('reduceHabitQuota reduces quota or deletes habit if 1', async () => {
    const habit = await addHabit('Reduce Habit', 'P1', 2, 25);

    await reduceHabitQuota(habit.id);
    expect((await getHabits())[0].dailyQuota).toBe(1);

    await reduceHabitQuota(habit.id);
    expect(await getHabits()).toHaveLength(0);
  });

  it('deleteHabit removes habit and all un-scheduled tasks', async () => {
    const h1 = await addHabit('Keep Habit', 'P1', 1, 25);
    const h2 = await addHabit('Del Habit', 'P2', 1, 25);

    await initializeDay('2026-04-12');

    let dayData = await getDailyData('2026-04-12');
    expect(dayData!.tasks).toHaveLength(2);

    await deleteHabit(h2.id);

    const habits = await getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0].id).toBe(h1.id);

    dayData = await getDailyData('2026-04-12');
    expect(dayData!.tasks).toHaveLength(1);
    expect(dayData!.tasks[0].habitId).toBe(h1.id);
  });

  it('importDataJSON handles clean valid data', async () => {
    const rawJSON = JSON.stringify({
      habits: [
        { id: 'h1', name: 'Habit1', priority: 'P1', dailyQuota: 1 }
      ],
      dailyLogs: {
        '2026-04-12': {
          date: '2026-04-12',
          tasks: [
            { id: 't1', name: 'Habit1', habitId: 'h1', status: 'inbox', durationMinutes: 25 }
          ]
        }
      }
    });

    const result = await importDataJSON(rawJSON);

    expect(result.success).toBe(true);
    expect(result.habitsImported).toBe(1);
    expect(result.tasksImported).toBe(1);
    expect(await getHabits()).toHaveLength(1);
    expect((await getDailyData('2026-04-12'))?.tasks).toHaveLength(1);
  });

  it('importDataJSON clears existing daily logs before restore', async () => {
    await addHabit('Old Habit', 'P1', 1, 25);
    await initializeDay('2026-04-12');
    await initializeDay('2026-04-13');

    expect(await getAllLogs()).toHaveProperty('2026-04-12');
    expect(await getAllLogs()).toHaveProperty('2026-04-13');

    const rawJSON = JSON.stringify({
      habits: [
        { id: 'h1', name: 'Habit1', priority: 'P1', dailyQuota: 1 }
      ],
      dailyLogs: {
        '2026-04-12': {
          date: '2026-04-12',
          tasks: [
            { id: 't1', name: 'Habit1', habitId: 'h1', status: 'completed', durationMinutes: 25 }
          ]
        }
      }
    });

    const result = await importDataJSON(rawJSON);

    expect(result.success).toBe(true);
    expect((await getDailyData('2026-04-12'))?.tasks).toHaveLength(1);
    expect(await getDailyData('2026-04-13')).toBeNull();
    expect(Object.keys(await getAllLogs())).toEqual(['2026-04-12']);
  });

  it('importDataJSON validates and normalizes habit and task fields', async () => {
    const rawJSON = JSON.stringify({
      habits: [
        { id: 'h1', name: 'Habit1', priority: 'P1', dailyQuota: 1 },
        { id: 'bad-priority', name: 'Bad', priority: 'P9', dailyQuota: 1 },
        { id: 'bad-quota', name: 'Bad', priority: 'P1', dailyQuota: 0 },
        { id: 'bad-range', name: 'Bad', priority: 'P1', dailyQuota: 1, effectiveType: 'range', startDate: '2026-04-20', endDate: '2026-04-12' }
      ],
      dailyLogs: {
        '2026-04-12': {
          date: '2026-04-12',
          tasks: [
            { id: 't1', name: 'Habit1', habitId: 'h1', status: 'inbox', durationMinutes: 25 },
            { id: 'bad-status', name: 'Bad', habitId: 'h1', status: 'done', durationMinutes: 25 },
            { id: 'bad-priority', name: 'Bad', habitId: 'h1', priority: 'P9', status: 'inbox', durationMinutes: 25 },
            { id: 'bad-start', name: 'Bad', habitId: 'h1', status: 'inbox', startTime: '25:00', durationMinutes: 25 },
            { id: 'bad-date', name: 'Bad', habitId: 'h1', status: 'inbox', date: '2026-04-13', durationMinutes: 25 },
            { id: 'bad-duration', name: 'Bad', habitId: 'h1', status: 'inbox', durationMinutes: 0 }
          ]
        }
      }
    });

    const result = await importDataJSON(rawJSON);

    expect(result.success).toBe(true);
    expect(result.habitsImported).toBe(1);
    expect(result.habitsSkipped).toBe(3);
    expect(result.tasksImported).toBe(1);
    expect(result.tasksSkipped).toBe(5);
    expect((await getHabits())[0]).toEqual(expect.objectContaining({
      id: 'h1',
      defaultDurationMinutes: 25,
      effectiveType: 'permanent'
    }));
    expect((await getDailyData('2026-04-12'))?.tasks[0]).toEqual(expect.objectContaining({
      id: 't1',
      priority: 'P1',
      date: '2026-04-12'
    }));
  });

  it('importDataJSON defends against prototype pollution', async () => {
    const maliciousJSON = '{"__proto__":{"polluted":true},"habits":[],"dailyLogs":{}}';

    const result = await importDataJSON(maliciousJSON);
    expect(result.success).toBe(true);

    const obj: any = {};
    expect(obj.polluted).toBeUndefined();
  });
});
