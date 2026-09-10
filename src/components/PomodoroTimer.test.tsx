import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PomodoroTimer from './PomodoroTimer';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { Task } from '../types';
import { playCompletionAlert } from '../services/nativeReminder';
import { electronIPC, PomodoroUpdateData } from '../services/electronIPC';

jest.mock('../services/nativeReminder', () => ({ playCompletionAlert: jest.fn() }));

describe('PomodoroTimer task completion', () => {
  let container: HTMLDivElement;
  let root: Root;

  const task: Task = {
    id: 'task-1',
    name: 'Finish chapter',
    priority: 'P1',
    status: 'scheduled',
    date: '2026-08-18',
    durationMinutes: 25,
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('completes the task immediately when the user marks it done early', async () => {
    const onComplete = jest.fn();

    await act(async () => {
      root.render(
        <LanguageProvider>
          <PomodoroTimer
            task={task}
            onClose={jest.fn()}
            onComplete={onComplete}
            onSessionStateChange={jest.fn()}
          />
        </LanguageProvider>,
      );
    });

    const completeButton = container.querySelector('[title="提前完成"]') as HTMLButtonElement;
    expect(completeButton).not.toBeNull();

    await act(async () => {
      completeButton.click();
    });

    expect(onComplete).toHaveBeenCalledWith(task, 1);
    expect(playCompletionAlert).toHaveBeenCalledWith(expect.any(Function), true);
  });

  it.each([true, false])('respects stored sound=false and vibration=%s for early completion', async (vibrationEnabled) => {
    localStorage.setItem('mylifeos_focus_settings', JSON.stringify({ soundEnabled: false, vibrationEnabled }));
    await act(async () => {
      root.render(<LanguageProvider><PomodoroTimer task={task} onClose={jest.fn()} onComplete={jest.fn()} onSessionStateChange={jest.fn()} /></LanguageProvider>);
    });
    await act(async () => { (container.querySelector('[title="提前完成"]') as HTMLButtonElement).click(); });
    expect(playCompletionAlert).not.toHaveBeenCalled();
  });

  it('passes the persisted vibration switch to foreground alerts', async () => {
    localStorage.setItem('mylifeos_focus_settings', JSON.stringify({ vibrationEnabled: false }));
    await act(async () => {
      root.render(<LanguageProvider><PomodoroTimer task={task} onClose={jest.fn()} onComplete={jest.fn()} onSessionStateChange={jest.fn()} /></LanguageProvider>);
    });
    await act(async () => { (container.querySelector('[title="提前完成"]') as HTMLButtonElement).click(); });
    expect(playCompletionAlert).toHaveBeenCalledWith(expect.any(Function), false);
  });

  it.each([true, false])('handles a managed break completion with suppressCompletionAlert=%s', async (silent) => {
    jest.useFakeTimers();
    let updateListener: (data: PomodoroUpdateData) => void = () => undefined;
    jest.spyOn(electronIPC, 'getUsesManagedTimer').mockReturnValue(true);
    jest.spyOn(electronIPC, 'onPomodoroUpdate').mockImplementation((callback) => {
      updateListener = callback;
      return () => undefined;
    });
    const complete = jest.fn();
    await act(async () => {
      root.render(<LanguageProvider><PomodoroTimer task={task} restoredState={{
        timerId: 'restored', taskId: task.id, taskName: task.name, taskPriority: task.priority,
        taskDate: task.date, taskDurationMinutes: 25, mode: 'break', remainingSeconds: 1, isActive: true,
      }} onClose={jest.fn()} onComplete={complete} onSessionStateChange={jest.fn()} /></LanguageProvider>);
    });
    await act(async () => {
      const update = { timerId: 'restored_break', duration: 300, remaining: 0, endTime: Date.now(), elapsed: 300000,
        isFinished: true, isActive: false, suppressCompletionAlert: silent };
      updateListener(update);
      updateListener(update);
      jest.advanceTimersByTime(500);
    });
    expect(playCompletionAlert).toHaveBeenCalledTimes(silent ? 0 : 1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
