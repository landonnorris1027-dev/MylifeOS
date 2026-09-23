import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PomodoroTimer from './PomodoroTimer';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import { electronIPC } from '../services/electronIPC';
import type { PomodoroUpdateData } from '../services/electronIPC';
import type { Task } from '../types';

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
    // Pin the language preference so the assertion on the Chinese title below
    // does not depend on the machine's system language.
    setStorageItem(KEYS.LANGUAGE, 'zh');
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
  });

  it('shows a retryable error and clears session state when a desktop timer fails to start', async () => {
    const onSessionStateChange = jest.fn();
    let handleUpdate: ((update: PomodoroUpdateData) => void) | undefined;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(electronIPC, 'getIsElectron').mockReturnValue(true);
    const startPomodoro = jest.spyOn(electronIPC, 'startPomodoro').mockRejectedValue(new Error('main process unavailable'));
    jest.spyOn(electronIPC, 'onPomodoroUpdate').mockImplementation((callback) => {
      handleUpdate = callback;
      return jest.fn();
    });

    await act(async () => {
      root.render(
        <LanguageProvider>
          <PomodoroTimer
            task={task}
            onClose={jest.fn()}
            onComplete={jest.fn()}
            onSessionStateChange={onSessionStateChange}
          />
        </LanguageProvider>,
      );
    });

    const playButton = container.querySelectorAll('button')[1];
    await act(async () => {
      playButton.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('计时器启动失败，请重试。');
    expect(onSessionStateChange).not.toHaveBeenCalledWith(expect.objectContaining({ timerId: expect.any(String) }));

    const timerId = startPomodoro.mock.calls[0][0].timerId;
    await act(async () => {
      handleUpdate?.({
        timerId,
        duration: 60,
        remaining: 0,
        endTime: Date.now(),
        elapsed: 0,
        isFinished: false,
        isActive: false,
        stopped: true,
      });
    });

    expect(onSessionStateChange).not.toHaveBeenCalledWith(expect.objectContaining({ timerId }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('计时器启动失败，请重试。');

    startPomodoro.mockResolvedValue({
      timerId,
      duration: task.durationMinutes * 60,
      remaining: task.durationMinutes * 60 * 1000,
      endTime: Date.now() + task.durationMinutes * 60 * 1000,
      elapsed: 0,
      isFinished: false,
      isActive: true,
      isFocusMode: true,
    });
    await act(async () => {
      playButton.click();
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onSessionStateChange).toHaveBeenCalledWith(expect.objectContaining({ timerId, isActive: true }));
  });
});
