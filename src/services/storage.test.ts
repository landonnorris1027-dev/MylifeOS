import {
  addGoal,
  addHabit,
  addManualTask,
  deleteHabit,
  deleteTaskForToday,
  formatDateLocal,
  getAllDataJSON,
  getDataRecoveryPoints,
  getDailyData,
  getGoals,
  getHabits,
  getProfileStats,
  getTodayStr,
  importDataJSON,
  initializeDay,
  parseDateLocal,
  previewImportDataJSON,
  reduceHabitQuota,
  restoreDataRecoveryPoint,
  saveDailyData,
  updateHabit,
} from './storage';
import type { DailyData, Task } from '../types';
import en from '../locales/en';
import zh from '../locales/zh';

const HABITS_KEY = 'mylifeos_habits';
const DAILY_LOGS_KEY = 'mylifeos_daily_logs';

const createTask = (overrides: Partial<Task>): Task => ({
  id: overrides.id || 'task-id',
  habitId: overrides.habitId || 'habit-id',
  name: overrides.name || 'Deep Work',
  priority: overrides.priority || 'P1',
  status: overrides.status || 'inbox',
  date: overrides.date || '2026-04-22',
  durationMinutes: overrides.durationMinutes || 25,
  startTime: overrides.startTime,
  actualFocusMinutes: overrides.actualFocusMinutes,
  goalId: overrides.goalId,
  note: overrides.note,
  review: overrides.review,
});

describe('storage service', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-22T09:00:00+08:00'));
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats and parses local dates consistently', () => {
    const date = new Date(2026, 3, 22);

    expect(formatDateLocal(date)).toBe('2026-04-22');
    expect(formatDateLocal(parseDateLocal('2026-04-22'))).toBe('2026-04-22');
    expect(getTodayStr()).toBe('2026-04-22');
  });

  it('initializes today with tasks that match habit quota', () => {
    addHabit('Deep Work', 'P1', 2, 30);

    const today = initializeDay('2026-04-22');

    expect(today.tasks).toHaveLength(2);
    expect(today.tasks.every((task) => task.status === 'inbox')).toBe(true);
    expect(today.tasks.every((task) => task.durationMinutes === 30)).toBe(true);
  });

  it('carries a habit goal into generated tasks and profile stats', () => {
    const goal = addGoal('Graduate Exam');
    const habit = addHabit('Math Review', 'P1', 1, 45, 'permanent', undefined, undefined, goal?.id);
    const today = initializeDay('2026-04-22');

    expect(today.tasks[0]).toMatchObject({
      habitId: habit.id,
      goalId: goal?.id,
    });

    saveDailyData({
      date: '2026-04-22',
      tasks: [{ ...today.tasks[0], status: 'completed', actualFocusMinutes: 30 }],
    });

    expect(getProfileStats().goalMinutes[goal?.id || '']).toBe(30);
  });

  it('creates one-time manual tasks without generating future copies', () => {
    const goal = addGoal('Admin');
    const manualTask = addManualTask('2026-04-22', {
      name: 'Submit form',
      priority: 'P2',
      durationMinutes: 20,
      goalId: goal?.id,
      note: 'Bring ID',
    });

    const today = initializeDay('2026-04-22');
    const future = initializeDay('2026-04-23');

    expect(manualTask).toMatchObject({
      name: 'Submit form',
      priority: 'P2',
      durationMinutes: 20,
      origin: 'manual',
      goalId: goal?.id,
      note: 'Bring ID',
    });
    expect(manualTask?.habitId).toBeUndefined();
    expect(today.tasks).toHaveLength(1);
    expect(future.tasks).toHaveLength(0);
  });


  it('keeps a task deleted for the selected day without lowering habit quota', () => {
    const habit = addHabit('Deep Work', 'P1', 2, 30);

    saveDailyData({
      date: '2026-04-22',
      tasks: [
        createTask({ id: 'today-task-1', habitId: habit.id, name: habit.name, durationMinutes: 30 }),
        createTask({ id: 'today-task-2', habitId: habit.id, name: habit.name, durationMinutes: 30 }),
      ],
    });

    deleteTaskForToday('today-task-1', '2026-04-22');
    const reloadedToday = initializeDay('2026-04-22');
    const visibleTasks = reloadedToday.tasks.filter((task) => task.status !== 'deleted');
    const stats = getProfileStats();

    expect(getHabits()[0].id).toBe(habit.id);
    expect(getHabits()[0].dailyQuota).toBe(2);
    expect(reloadedToday.tasks).toHaveLength(2);
    expect(visibleTasks).toHaveLength(1);
    expect(visibleTasks[0].id).toBe('today-task-2');
    expect(stats.totalTrackedTasks).toBe(1);
  });
  it('removes future tasks when a habit is deleted', () => {
    const habit = addHabit('Read Book', 'P2', 2, 20);

    initializeDay('2026-04-23');
    expect(getDailyData('2026-04-23')?.tasks).toHaveLength(2);

    deleteHabit(habit.id);

    expect(getHabits()).toHaveLength(0);
    expect(getDailyData('2026-04-23')?.tasks).toHaveLength(0);
  });

  it('preserves scheduled tasks today when a habit is deleted, but removes inbox tasks', () => {
    const habit = addHabit('Workout', 'P3', 2, 25);
    const today = initializeDay('2026-04-22');
    const [firstTask, secondTask] = today.tasks;

    saveDailyData({
      date: '2026-04-22',
      tasks: [
        { ...firstTask, status: 'scheduled', startTime: '09:00' },
        { ...secondTask, status: 'inbox' },
      ],
    });

    deleteHabit(habit.id);

    const remainingTasks = getDailyData('2026-04-22')?.tasks || [];
    expect(remainingTasks).toHaveLength(1);
    expect(remainingTasks[0].status).toBe('scheduled');
    expect(remainingTasks[0].habitId).toBe(habit.id);
  });

  it('reduces future tasks to the new quota while keeping scheduled tasks first', () => {
    const habit = addHabit('Study', 'P1', 3, 45);
    const futureDate = '2026-04-24';
    const initialized = initializeDay(futureDate);
    const [firstTask, secondTask, thirdTask] = initialized.tasks;

    saveDailyData({
      date: futureDate,
      tasks: [
        { ...firstTask, status: 'scheduled', startTime: '10:00' },
        { ...secondTask, status: 'inbox' },
        { ...thirdTask, status: 'inbox' },
      ],
    });

    reduceHabitQuota(habit.id);

    const updatedFutureTasks = getDailyData(futureDate)?.tasks || [];
    expect(updatedFutureTasks).toHaveLength(2);
    expect(updatedFutureTasks.some((task) => task.status === 'scheduled')).toBe(true);
    expect(getHabits()[0].dailyQuota).toBe(2);
  });

  it('updates habit rules for today and future days without rewriting past logs', () => {
    const habit = addHabit('Original Study', 'P1', 2, 25);
    const today = initializeDay('2026-04-22');
    const future = initializeDay('2026-04-23');

    saveDailyData({
      date: '2026-04-21',
      tasks: [
        createTask({
          id: 'past-task',
          habitId: habit.id,
          name: 'Original Study',
          priority: 'P1',
          date: '2026-04-21',
          durationMinutes: 25,
          status: 'completed',
        }),
      ],
    });

    updateHabit({
      ...habit,
      name: 'Updated Study',
      priority: 'P2',
      dailyQuota: 1,
      defaultDurationMinutes: 40,
    });

    const updatedToday = getDailyData(today.date);
    const updatedFuture = getDailyData(future.date);
    const past = getDailyData('2026-04-21');

    expect(getHabits()[0].name).toBe('Updated Study');
    expect(updatedToday?.tasks).toHaveLength(1);
    expect(updatedToday?.tasks[0]).toMatchObject({
      name: 'Updated Study',
      priority: 'P2',
      durationMinutes: 40,
    });
    expect(updatedFuture?.tasks).toHaveLength(1);
    expect(updatedFuture?.tasks[0].name).toBe('Updated Study');
    expect(past?.tasks[0]).toMatchObject({
      name: 'Original Study',
      priority: 'P1',
      durationMinutes: 25,
    });
  });

  it('keeps today scheduled overflow tasks when quota is reduced', () => {
    const habit = addHabit('Language Practice', 'P2', 3, 15);
    const today = '2026-04-22';
    const initialized = initializeDay(today);
    const [firstTask, secondTask, thirdTask] = initialized.tasks;

    saveDailyData({
      date: today,
      tasks: [
        { ...firstTask, status: 'scheduled', startTime: '08:00' },
        { ...secondTask, status: 'scheduled', startTime: '09:00' },
        { ...thirdTask, status: 'inbox' },
      ],
    });

    reduceHabitQuota(habit.id);
    reduceHabitQuota(habit.id);

    const updatedToday = getDailyData(today);
    expect(getHabits()[0].dailyQuota).toBe(1);
    expect(updatedToday?.tasks).toHaveLength(2);
    expect(updatedToday?.tasks.every((task) => task.status === 'scheduled')).toBe(true);
  });

  it('drops inactive future range tasks but keeps past records', () => {
    addHabit('Sprint', 'P1', 1, 25, 'range', '2026-04-20', '2026-04-22');

    const pastData: DailyData = {
      date: '2026-04-21',
      tasks: [createTask({ id: 'past-task', habitId: '4fzzzxjyl', date: '2026-04-21', status: 'completed' })],
    };
    localStorage.setItem(
      HABITS_KEY,
      JSON.stringify([
        {
          id: '4fzzzxjyl',
          name: 'Sprint',
          priority: 'P1',
          dailyQuota: 1,
          defaultDurationMinutes: 25,
          effectiveType: 'range',
          startDate: '2026-04-20',
          endDate: '2026-04-22',
        },
      ]),
    );
    localStorage.setItem(
      DAILY_LOGS_KEY,
      JSON.stringify({
        '2026-04-21': pastData,
        '2026-04-23': {
          date: '2026-04-23',
          tasks: [createTask({ id: 'future-task', habitId: '4fzzzxjyl', date: '2026-04-23' })],
        },
      }),
    );

    const future = initializeDay('2026-04-23');
    const past = getDailyData('2026-04-21');

    expect(future.tasks).toHaveLength(0);
    expect(past?.tasks).toHaveLength(1);
    expect(past?.tasks[0].status).toBe('completed');
  });

  it('exports backups with a schema version', () => {
    addHabit('Deep Work', 'P1', 1, 25);
    initializeDay('2026-04-22');

    const exported = JSON.parse(getAllDataJSON());

    expect(exported.schemaVersion).toBe(4);
    expect(Array.isArray(exported.habits)).toBe(true);
    expect(Array.isArray(exported.goals)).toBe(true);
    expect(typeof exported.dailyLogs).toBe('object');
  });

  it('tracks actual focus minutes separately from planned task duration', () => {
    saveDailyData({
      date: '2026-04-22',
      tasks: [
        createTask({
          id: 'completed-task',
          status: 'completed',
          durationMinutes: 25,
          actualFocusMinutes: 10,
        }),
      ],
    });

    expect(getProfileStats().totalFocusMinutes).toBe(10);
    expect(getProfileStats().priorityMinutes.P1).toBe(10);
  });

  it('creates daily recovery points and restores them', () => {
    addHabit('Current Habit', 'P1', 1, 25);
    initializeDay('2026-04-22');

    const [point] = getDataRecoveryPoints();
    expect(point).toBeDefined();
    expect(point.reason).toBe('auto-daily');
    expect(point.habitCount).toBe(1);

    addHabit('Later Habit', 'P2', 1, 30);
    expect(getHabits()).toHaveLength(2);

    const result = restoreDataRecoveryPoint(point.id);

    expect(result.ok).toBe(true);
    expect(getHabits()).toHaveLength(1);
    expect(getHabits()[0].name).toBe('Current Habit');
    expect(getDataRecoveryPoints().some((item) => item.reason === 'pre-recovery-restore')).toBe(true);
  });

  it('imports legacy backups without schemaVersion by migrating them forward', () => {
    const legacyPayload = JSON.stringify({
      timestamp: '2026-04-22T01:00:00.000Z',
      habits: [
        {
          id: 'habit-1',
          name: 'Legacy Habit',
          priority: 'P2',
          dailyQuota: 1,
          defaultDurationMinutes: 30,
          effectiveType: 'permanent',
        },
      ],
      dailyLogs: {
        '2026-04-22': {
          date: '2026-04-22',
          tasks: [
            createTask({
              id: 'legacy-task-1',
              habitId: 'habit-1',
              name: 'Legacy Habit',
              priority: 'P2',
              date: '2026-04-22',
            }),
          ],
        },
      },
    });

    const result = importDataJSON(legacyPayload);

    expect(result.ok).toBe(true);
    expect(result.migratedFromVersion).toBe(1);
    expect(getHabits()).toHaveLength(1);
    expect(getDailyData('2026-04-22')?.tasks).toHaveLength(1);

    const reExported = JSON.parse(getAllDataJSON());
    expect(reExported.schemaVersion).toBe(4);
  });

  it('imports manual tasks without habit associations', () => {
    const payload = JSON.stringify({
      schemaVersion: 4,
      timestamp: '2026-04-22T01:00:00.000Z',
      goals: [],
      habits: [],
      dailyLogs: {
        '2026-04-22': {
          date: '2026-04-22',
          tasks: [
            {
              id: 'manual-import',
              origin: 'manual',
              name: 'One-off errand',
              priority: 'P3',
              status: 'inbox',
              date: '2026-04-22',
              durationMinutes: 15,
            },
          ],
        },
      },
    });

    const result = importDataJSON(payload);
    const importedTask = getDailyData('2026-04-22')?.tasks[0];

    expect(result.ok).toBe(true);
    expect(result.filteredTaskCount).toBe(0);
    expect(importedTask).toMatchObject({
      id: 'manual-import',
      origin: 'manual',
      name: 'One-off errand',
    });
    expect(importedTask?.habitId).toBeUndefined();
  });

  it('backs up and restores goals, notes, and reviews', () => {
    const goal = addGoal('Writing');
    const habit = addHabit('Draft Essay', 'P2', 1, 30, 'permanent', undefined, undefined, goal?.id);
    const day = initializeDay('2026-04-22');
    saveDailyData({
      date: '2026-04-22',
      tasks: [
        {
          ...day.tasks[0],
          habitId: habit.id,
          goalId: goal?.id,
          note: 'Use outline',
          review: 'Finished first section',
        },
      ],
    });

    const exported = getAllDataJSON();
    localStorage.clear();
    const result = importDataJSON(exported);

    expect(result.ok).toBe(true);
    expect(getGoals()).toEqual([{ id: goal?.id, name: 'Writing' }]);
    expect(getHabits()[0].goalId).toBe(goal?.id);
    expect(getDailyData('2026-04-22')?.tasks[0]).toMatchObject({
      goalId: goal?.id,
      note: 'Use outline',
      review: 'Finished first section',
    });
  });

  it('previews valid backups without changing current storage', () => {
    addHabit('Current Habit', 'P1', 1, 25);
    initializeDay('2026-04-22');
    const habitsBefore = localStorage.getItem(HABITS_KEY);
    const logsBefore = localStorage.getItem(DAILY_LOGS_KEY);

    const payload = JSON.stringify({
      schemaVersion: 2,
      timestamp: '2026-04-22T01:00:00.000Z',
      habits: [
        {
          id: 'preview-habit',
          name: 'Preview Habit',
          priority: 'P2',
          dailyQuota: 2,
          defaultDurationMinutes: 30,
          effectiveType: 'permanent',
        },
      ],
      dailyLogs: {
        '2026-04-22': {
          date: '2026-04-22',
          tasks: [
            createTask({
              id: 'preview-task',
              habitId: 'preview-habit',
              name: 'Preview Habit',
              priority: 'P2',
              date: '2026-04-22',
            }),
          ],
        },
      },
    });

    const result = previewImportDataJSON(payload);

    expect(result.ok).toBe(true);
    expect(result.importedHabitCount).toBe(1);
    expect(result.importedDayCount).toBe(1);
    expect(result.filteredHabitCount).toBe(0);
    expect(result.filteredTaskCount).toBe(0);
    expect(localStorage.getItem(HABITS_KEY)).toBe(habitsBefore);
    expect(localStorage.getItem(DAILY_LOGS_KEY)).toBe(logsBefore);
    expect(getHabits()[0].name).toBe('Current Habit');
  });

  it('rejects previewing backups from a newer unsupported schema version without changing storage', () => {
    addHabit('Current Habit', 'P1', 1, 25);
    const habitsBefore = localStorage.getItem(HABITS_KEY);

    const futurePayload = JSON.stringify({
      schemaVersion: 999,
      timestamp: '2026-04-22T01:00:00.000Z',
      habits: [],
      dailyLogs: {},
    });

    const result = previewImportDataJSON(futurePayload);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unsupported backup schema version');
    expect(localStorage.getItem(HABITS_KEY)).toBe(habitsBefore);
    expect(getHabits()).toHaveLength(1);
  });

  it('rejects backups from a newer unsupported schema version', () => {
    const futurePayload = JSON.stringify({
      schemaVersion: 999,
      timestamp: '2026-04-22T01:00:00.000Z',
      habits: [],
      dailyLogs: {},
    });

    const result = importDataJSON(futurePayload);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unsupported backup schema version');
    expect(getHabits()).toHaveLength(0);
  });

  it('keeps English and Chinese translation keys aligned', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });


  it('filters invalid import records with bad values, duplicate ids, and broken associations', () => {
    const payload = JSON.stringify({
      habits: [
        {
          id: 'habit-valid',
          name: 'Valid Habit',
          priority: 'P1',
          dailyQuota: 1,
          defaultDurationMinutes: 25,
          effectiveType: 'permanent',
        },
        {
          id: 'habit-negative-quota',
          name: 'Negative Quota',
          priority: 'P2',
          dailyQuota: -1,
          defaultDurationMinutes: 25,
          effectiveType: 'permanent',
        },
        {
          id: 'habit-invalid-range',
          name: 'Invalid Range',
          priority: 'P2',
          dailyQuota: 1,
          defaultDurationMinutes: 25,
          effectiveType: 'range',
          startDate: '2026-04-30',
          endDate: '2026-04-01',
        },
        {
          id: 'habit-valid',
          name: 'Duplicate Habit',
          priority: 'P3',
          dailyQuota: 1,
          defaultDurationMinutes: 25,
          effectiveType: 'permanent',
        },
      ],
      dailyLogs: {
        '2026-04-22': {
          date: '2026-04-22',
          tasks: [
            createTask({ id: 'task-valid', habitId: 'habit-valid', name: 'Valid Habit' }),
            createTask({ id: 'task-negative-duration', habitId: 'habit-valid', durationMinutes: -5 }),
            createTask({ id: 'task-invalid-date', habitId: 'habit-valid', date: '2026-02-30' }),
            createTask({ id: 'task-invalid-time', habitId: 'habit-valid', status: 'scheduled', startTime: '24:00' }),
            createTask({ id: 'task-orphan', habitId: 'missing-habit' }),
            createTask({ id: 'task-valid', habitId: 'habit-valid' }),
          ],
        },
        'not-a-date': {
          date: 'not-a-date',
          tasks: [createTask({ id: 'task-bad-day', habitId: 'habit-valid', date: 'not-a-date' })],
        },
        '2026-04-23': {
          date: '2026-04-24',
          tasks: [createTask({ id: 'task-day-mismatch', habitId: 'habit-valid', date: '2026-04-24' })],
        },
      },
    });

    const result = importDataJSON(payload);

    expect(result.ok).toBe(true);
    expect(result.filteredHabitCount).toBe(3);
    expect(result.filteredTaskCount).toBe(7);
    expect(result.importedDayCount).toBe(1);
    expect(getHabits()).toHaveLength(1);
    expect(getDailyData('2026-04-22')?.tasks).toHaveLength(1);
    expect(getDailyData('2026-04-22')?.tasks[0].id).toBe('task-valid');
    expect(getDailyData('not-a-date')).toBeNull();
    expect(getDailyData('2026-04-23')).toBeNull();
  });
  it('reports filtered invalid records during import', () => {
    const payload = JSON.stringify({
      habits: [
        {
          id: 'habit-valid',
          name: 'Valid Habit',
          priority: 'P1',
          dailyQuota: 1,
          defaultDurationMinutes: 25,
          effectiveType: 'permanent',
        },
        {
          id: 123,
          name: 'Broken Habit',
        },
      ],
      dailyLogs: {
        '2026-04-22': {
          date: '2026-04-22',
          tasks: [
            createTask({ id: 'task-valid', habitId: 'habit-valid' }),
            { id: 'task-invalid' },
          ],
        },
      },
    });

    const result = importDataJSON(payload);

    expect(result.ok).toBe(true);
    expect(result.filteredHabitCount).toBe(1);
    expect(result.filteredTaskCount).toBe(1);
    expect(getHabits()).toHaveLength(1);
    expect(getDailyData('2026-04-22')?.tasks).toHaveLength(1);
  });
});
