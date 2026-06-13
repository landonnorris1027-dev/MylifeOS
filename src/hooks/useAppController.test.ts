import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { buildTaskFromRecovery } from './useAppController';
import { useAppController } from './useAppController';
import { LanguageProvider } from '../contexts/LanguageContext';
import { addHabit, getDailyData, initializeDay } from '../services/storage';
import type { PomodoroRecoveryData } from '../services/electronIPC';
import type { DailyData } from '../types';

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
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 22, 23, 10, 0, 0));
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
