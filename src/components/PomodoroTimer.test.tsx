import type { Mock } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PomodoroTimer from './PomodoroTimer';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import { electronIPC } from '../services/electronIPC';
import type { PomodoroUpdateData } from '../services/electronIPC';
import type { Task } from '../types';
import { isAndroid } from '../services/platform';
import * as localStorageStore from '../services/storage/localStorageStore';
const mockIsAndroid = isAndroid as Mock;
vi.mock('../services/platform', () => ({ isAndroid: vi.fn(() => false) }));

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
    mockIsAndroid.mockReturnValue(false);
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
    vi.restoreAllMocks();
  });

  it('completes the task immediately when the user marks it done early', async () => {
    const onComplete = vi.fn();

    await act(async () => {
      root.render(
        <LanguageProvider>
          <PomodoroTimer
            task={task}
            onClose={vi.fn()}
            onComplete={onComplete}
            onSessionStateChange={vi.fn()}
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

  it('direct focus starts a managed session while preserving the original non-grid schedule', async () => {
    const scheduled = { ...task, startTime: '09:07' };
    vi.spyOn(electronIPC, 'getIsElectron').mockReturnValue(true);
    const start = vi.spyOn(electronIPC, 'startPomodoro').mockImplementation(async data => ({ ...data, remaining: data.duration * 1000, endTime: Date.now() + data.duration * 1000, elapsed: 0, isFinished: false, isActive: true }));
    const onComplete = vi.fn();
    await act(async () => root.render(<React.StrictMode><LanguageProvider><PomodoroTimer autoStart task={scheduled} onClose={vi.fn()} onComplete={onComplete} onSessionStateChange={vi.fn()} /></LanguageProvider></React.StrictMode>));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ taskId: scheduled.id, taskDate: scheduled.date, duration: 1500 }));
    expect(scheduled.startTime).toBe('09:07');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('shows a retryable error and clears session state when a desktop timer fails to start', async () => {
    const onSessionStateChange = vi.fn();
    let handleUpdate: ((update: PomodoroUpdateData) => void) | undefined;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(electronIPC, 'getIsElectron').mockReturnValue(true);
    const startPomodoro = vi.spyOn(electronIPC, 'startPomodoro').mockRejectedValue(new Error('main process unavailable'));
    vi.spyOn(electronIPC, 'onPomodoroUpdate').mockImplementation((callback) => {
      handleUpdate = callback;
      return vi.fn();
    });

    await act(async () => {
      root.render(
        <LanguageProvider>
          <PomodoroTimer
            task={task}
            onClose={vi.fn()}
            onComplete={vi.fn()}
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

  it('offers an Android break only after focus completion has been saved', async () => {
    mockIsAndroid.mockReturnValue(true);
    vi.spyOn(localStorageStore, 'getStorageItem').mockImplementation(key => localStorage.getItem(key));
    let update: ((data: PomodoroUpdateData) => void) | undefined;
    vi.spyOn(electronIPC, 'onPomodoroUpdate').mockImplementation(callback => { update = callback; return vi.fn(); });
    const start = vi.spyOn(electronIPC, 'startPomodoro').mockImplementation(async payload => ({
      ...payload, remaining: payload.duration * 1000, endTime: Date.now() + payload.duration * 1000,
      elapsed: 0, isFinished: false, isActive: true,
    }));
    let acknowledge: (result: boolean) => void = () => undefined;
    const onComplete = vi.fn(() => new Promise<boolean>(resolve => { acknowledge = resolve; }));
    const onClose = vi.fn();
    const stop = vi.spyOn(electronIPC, 'stopPomodoro').mockResolvedValue();
    await act(async () => { root.render(<LanguageProvider><PomodoroTimer task={task} onClose={onClose}
      onComplete={onComplete} onSessionStateChange={vi.fn()} /></LanguageProvider>); });
    await act(async () => { (container.querySelectorAll('button')[1] as HTMLButtonElement).click(); });
    const timerId = start.mock.calls[0][0].timerId;
    await act(async () => { update?.({ timerId, duration: 1500, remaining: 0, endTime: Date.now(),
      elapsed: 1500000, isFinished: true, isActive: false, completionPersisted: true, suppressCompletionAlert: true }); });
    expect(onComplete).toHaveBeenCalledWith(task, 25);
    expect(start).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('开始休息');
    await act(async () => { acknowledge(true); });
    expect(container.textContent).toContain('开始休息');
    expect(start).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { (Array.from(container.querySelectorAll('button')).find(button => button.textContent === '返回计划') as HTMLButtonElement).click(); });
    expect(stop).toHaveBeenCalledWith(timerId);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps an Android running session alive when the timer panel is closed', async () => {
    mockIsAndroid.mockReturnValue(true);
    vi.spyOn(localStorageStore, 'getStorageItem').mockImplementation(key => localStorage.getItem(key));
    const stop = vi.spyOn(electronIPC, 'stopPomodoro').mockResolvedValue();
    const onClose = vi.fn();
    await act(async () => { root.render(<LanguageProvider><PomodoroTimer task={task} onClose={onClose}
      onComplete={vi.fn()} onSessionStateChange={vi.fn()} restoredState={{ timerId: 's', taskId: task.id,
        taskName: task.name, taskDate: task.date, taskPriority: task.priority, taskDurationMinutes: 25,
        mode: 'focus', remainingSeconds: 100, isActive: true }} /></LanguageProvider>); });
    await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); });
    expect(onClose).toHaveBeenCalledTimes(1); expect(stop).not.toHaveBeenCalled();
  });
});
