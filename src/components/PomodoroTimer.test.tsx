import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PomodoroTimer from './PomodoroTimer';
import { LanguageProvider } from '../contexts/LanguageContext';
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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
});
