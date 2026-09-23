import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { buildTaskFromRecovery } from './useAppController';
import { useAppController } from './useAppController';
import { LanguageProvider } from '../contexts/LanguageContext';
import { addHabit, getDailyData, initializeDay, updateTask } from '../services/storage';
import { electronIPC } from '../services/electronIPC';
import type { PomodoroRecoveryData } from '../services/electronIPC';
import type { TimerSessionSnapshot } from '../components/PomodoroTimer';
import type { DailyData, Task } from '../types';
import { setStorageReadOnly } from '../services/storage/localStorageStore';

jest.mock('../services/electronIPC', () => ({
  electronIPC: {
    getActiveTimers: jest.fn(() => Promise.resolve([])),
    getPendingRecoveries: jest.fn(() => Promise.resolve([])),
    resolveRecovery: jest.fn(() => Promise.resolve({ ok: true })),
    getIsElectron: jest.fn(() => false),
    startPomodoro: jest.fn(() => Promise.resolve({})),
    togglePomodoro: jest.fn(),
    stopPomodoro: jest.fn(),
    onPomodoroUpdate: jest.fn(() => () => undefined),
    onStorageWriteError: jest.fn(() => () => undefined),
  },
}));

const getActiveTimersMock = electronIPC.getActiveTimers as unknown as jest.Mock;

// CRA resets mock implementations before each test, including factory defaults.
beforeEach(() => {
  (electronIPC.getPendingRecoveries as jest.Mock).mockResolvedValue([]);
  ((electronIPC as unknown as { onStorageWriteError: jest.Mock }).onStorageWriteError)
    .mockImplementation(() => () => undefined);
});

const drainMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const DAILY_LOGS_KEY = 'mylifeos_daily_logs';

const baseRecovery: PomodoroRecoveryData = {
  recoveryId: 'recovery-1',
  timerId: 'timer-task-1',
  reason: 'expired_while_offline',
  mode: 'focus',
  taskId: 'task-1',
  taskName: 'Deep Work',
  taskDate: '2026-04-22',
  taskPriority: 'P1',
  taskDurationMinutes: 25,
};

describe('useAppController recovery helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses taskHabitId from recovery data when available', () => {
    const task = buildTaskFromRecovery({
      ...baseRecovery,
      taskHabitId: 'habit-direct',
    });

    expect(task?.habitId).toBe('habit-direct');
  });

  it('recovers habitId from the stored daily task for legacy recovery data', () => {
    const dailyData: DailyData = {
      date: '2026-04-22',
      tasks: [
        {
          id: 'task-1',
          habitId: 'habit-from-log',
          name: 'Deep Work',
          priority: 'P1',
          status: 'scheduled',
          date: '2026-04-22',
          startTime: '09:00',
          durationMinutes: 25,
        },
      ],
    };
    localStorage.setItem(DAILY_LOGS_KEY, JSON.stringify({ '2026-04-22': dailyData }));

    const task = buildTaskFromRecovery(baseRecovery);

    expect(task?.habitId).toBe('habit-from-log');
    expect(task?.startTime).toBe('09:00');
  });

  it('builds a manual task when recovery data has no habit association', () => {
    const task = buildTaskFromRecovery(baseRecovery);

    expect(task).toMatchObject({
      id: 'task-1',
      origin: 'manual',
      name: 'Deep Work',
    });
    expect(task?.habitId).toBeUndefined();
  });
});

describe('useAppController scheduling guards', () => {
  let container: HTMLDivElement;
  let root: Root;
  let controller: ReturnType<typeof useAppController> | null = null;

  const Harness = () => {
    controller = useAppController();
    return null;
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem('mylifeos_lang', 'zh');
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 22, 23, 10, 0, 0));
    getActiveTimersMock.mockImplementation(() => Promise.resolve([]));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    controller = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  it('checks pending recoveries on startup without logging an error', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    try {
      await act(async () => {
        root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
        await drainMicrotasks();
      });
      expect(electronIPC.getPendingRecoveries).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('shows persisted tasks without reconciling habits while storage is read-only', async () => {
    addHabit('Unreconciled Habit', 'P1', 1, 25);
    const day = '2026-04-22';
    const task = { id: 'manual', name: 'Durable manual task', priority: 'P1', status: 'inbox', date: day, durationMinutes: 25 };
    const durable = JSON.stringify({ [day]: { date: day, tasks: [task] } });
    localStorage.setItem(DAILY_LOGS_KEY, durable);
    setStorageReadOnly(true);
    try {
      await act(async () => {
        root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
        await drainMicrotasks();
      });
      await act(async () => { controller?.actions.selectDate(day); });
      expect(controller?.state.dailyData?.tasks).toEqual([task]);
      expect(localStorage.getItem(DAILY_LOGS_KEY)).toBe(durable);
      expect(controller?.state.alertConfig.isOpen).toBe(false);
    } finally { setStorageReadOnly(false); }
  });

  it('shows an alert when a debounced desktop write fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let reportFailure: ((failure: { error?: string }) => void) | undefined;
      ((electronIPC as unknown as { onStorageWriteError: jest.Mock }).onStorageWriteError)
        .mockImplementation((callback: (failure: { error?: string }) => void) => {
          reportFailure = callback;
          return () => undefined;
        });

      await act(async () => {
        root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
        await drainMicrotasks();
      });

      expect(reportFailure).toBeDefined();
      await act(async () => {
        reportFailure?.({ error: 'disk full' });
      });

      expect(controller?.state.alertConfig).toMatchObject({
        isOpen: true,
        message: '保存失败，请检查磁盘权限或可用空间。',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rejects direct schedule confirmation for a past slot today', async () => {
    addHabit('Late Study', 'P1', 1, 25);
    const task = initializeDay('2026-04-22').tasks[0];

    await act(async () => {
      root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
    });

    await act(async () => {
      controller?.actions.handleTaskClick(task);
    });

    await act(async () => {
      controller?.actions.handleScheduleConfirm('22:00');
    });

    expect(getDailyData('2026-04-22')?.tasks[0].startTime).toBeUndefined();
    expect(controller?.state.alertConfig.isOpen).toBe(true);
  });

  it('schedules an inbox task through direct drop to an available slot', async () => {
    addHabit('Late Study', 'P1', 1, 25);
    const task = initializeDay('2026-04-22').tasks[0];

    await act(async () => {
      root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
    });

    await act(async () => {
      controller?.actions.loadData('2026-04-22');
    });

    await act(async () => {
      controller?.actions.handleTaskDropToTime(task.id, '23:30');
    });

    expect(getDailyData('2026-04-22')?.tasks[0]).toMatchObject({
      status: 'scheduled',
      startTime: '23:30',
    });
  });

  it('saves notes and review text for a task', async () => {
    addHabit('Late Study', 'P1', 1, 25);
    const task = initializeDay('2026-04-22').tasks[0];

    await act(async () => {
      root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
    });

    await act(async () => {
      controller?.actions.handleTaskReviewSave(task, 'Check chapter 3 ', ' Good progress ');
    });

    expect(getDailyData('2026-04-22')?.tasks[0]).toMatchObject({
      note: 'Check chapter 3',
      review: 'Good progress',
    });
  });
});

describe('useAppController stale timer session handling', () => {
  let container: HTMLDivElement;
  let root: Root;
  let controller: ReturnType<typeof useAppController> | null = null;

  const Harness = () => {
    controller = useAppController();
    return null;
  };

  const scheduleTwoTasks = (): [Task, Task] => {
    addHabit('Late Study', 'P1', 2, 25);
    const [rawA, rawB] = initializeDay('2026-04-22').tasks;
    const taskA: Task = { ...rawA, status: 'scheduled', startTime: '09:00' };
    const taskB: Task = { ...rawB, status: 'scheduled', startTime: '10:00' };
    updateTask(taskA);
    updateTask(taskB);
    return [taskA, taskB];
  };

  const buildBreakSnapshot = (task: Task): TimerSessionSnapshot => ({
    timerId: 'timer_stale',
    taskId: task.id,
    taskName: task.name,
    taskPriority: task.priority,
    taskDate: task.date,
    taskDurationMinutes: task.durationMinutes,
    mode: 'break',
    remainingSeconds: 0,
    isActive: false,
  });

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 22, 23, 10, 0, 0));
    getActiveTimersMock.mockImplementation(() => Promise.resolve([]));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    controller = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  it('clears a finished restored session and opens the clicked task instead of the break screen', async () => {
    const [taskA, taskB] = scheduleTwoTasks();

    await act(async () => {
      root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
    });

    await act(async () => {
      controller?.actions.setRestoredTimerState(buildBreakSnapshot(taskA));
    });

    getActiveTimersMock.mockImplementation(() => Promise.resolve([]));

    await act(async () => {
      controller?.actions.handleTaskClick(taskB);
      await drainMicrotasks();
    });

    expect(controller?.state.activeTask?.id).toBe(taskB.id);
    expect(controller?.state.restoredTimerState).toBeNull();
  });

  it('keeps returning to a still-running restored session when clicking another task', async () => {
    const [taskA, taskB] = scheduleTwoTasks();

    getActiveTimersMock.mockImplementation(() => Promise.resolve([]));

    await act(async () => {
      root.render(React.createElement(LanguageProvider, null, React.createElement(Harness)));
    });

    await act(async () => {
      controller?.actions.setRestoredTimerState(buildBreakSnapshot(taskA));
    });

    getActiveTimersMock.mockImplementation(() => Promise.resolve([{ timerId: 'timer_stale_break' }]));

    await act(async () => {
      controller?.actions.handleTaskClick(taskB);
      await drainMicrotasks();
    });

    expect(controller?.state.activeTask?.id).toBe(taskA.id);
    expect(controller?.state.restoredTimerState).not.toBeNull();
  });
});
