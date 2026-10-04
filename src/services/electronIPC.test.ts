import type { PomodoroTimerData } from './electronIPC';

const timerData: PomodoroTimerData = {
  timerId: 'timer-test',
  duration: 60,
  isFocusMode: true,
  notificationsEnabled: true,
};

describe('electronIPC startPomodoro', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    delete window.electronAPI;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.electronAPI;
  });

  it('rejects a failed desktop start without creating a browser timer', async () => {
    let mainProcessTimerActive = false;
    const invoke = vi.fn().mockImplementation(async () => {
      mainProcessTimerActive = true;
      throw new Error('main process unavailable');
    });
    const send = vi.fn((channel: string, payload: { timerId: string }) => {
      if (channel === 'pomodoro-stop' && payload.timerId === timerData.timerId) {
        mainProcessTimerActive = false;
      }
    });
    window.electronAPI = {
      invoke,
      on: vi.fn(() => vi.fn()),
      send,
      sendSync: vi.fn(),
    } as unknown as NonNullable<Window['electronAPI']>;

    const { electronIPC } = await import('./electronIPC');
    const update = vi.fn();
    electronIPC.onPomodoroUpdate(update);

    await expect(electronIPC.startPomodoro(timerData)).rejects.toThrow('main process unavailable');

    expect(invoke).toHaveBeenCalledWith('pomodoro-start', timerData);
    expect(send).not.toHaveBeenCalled();
    // Main process retains the candidate; the renderer must not discard retry evidence.
    expect(mainProcessTimerActive).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('uses a browser timer when no desktop bridge exists', async () => {
    const { electronIPC } = await import('./electronIPC');

    const started = await electronIPC.startPomodoro(timerData);

    expect(started).toMatchObject({ timerId: timerData.timerId, isActive: true });
    expect(vi.getTimerCount()).toBe(1);

    electronIPC.stopPomodoro(timerData.timerId);
    expect(vi.getTimerCount()).toBe(0);
  });
});
