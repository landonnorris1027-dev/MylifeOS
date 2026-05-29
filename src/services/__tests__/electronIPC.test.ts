// src/services/__tests__/electronIPC.test.ts
import { electronIPC } from '../electronIPC';

describe('ElectronIPCHandler (Browser Fallback)', () => {
  beforeEach(() => {
    // Reset any state if needed, though electronIPC is a singleton.
    // In Jest, window is defined but window.myLifeOS is not,
    // so electronIPC initializes in browser fallback mode.
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('starts a browser timer if not in electron', async () => {
    const subscriber = jest.fn();
    const unsubscribe = electronIPC.onPomodoroUpdate(subscriber);

    await electronIPC.startPomodoro({
      timerId: 'test-timer',
      duration: 300,
      isFocusMode: true
    });

    // Should immediately notify subscriber with initial state
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
      timerId: 'test-timer',
      remaining: 300000,
      elapsed: 0,
      isFinished: false,
      isActive: true
    }));

    // Advance time by 1 second
    jest.advanceTimersByTime(1000);

    // subscriber should have been called again by the interval
    expect(subscriber).toHaveBeenCalledTimes(2);

    electronIPC.stopPomodoro('test-timer');
    unsubscribe();
  });

  it('toggles a browser timer', async () => {
    const subscriber = jest.fn();
    const unsubscribe = electronIPC.onPomodoroUpdate(subscriber);

    await electronIPC.startPomodoro({
      timerId: 'toggle-timer',
      duration: 60,
      isFocusMode: true
    });
    
    subscriber.mockClear();

    // Toggle off
    electronIPC.togglePomodoro('toggle-timer');

    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
      timerId: 'toggle-timer',
      isActive: false
    }));

    // Toggle on again
    electronIPC.togglePomodoro('toggle-timer');

    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
      timerId: 'toggle-timer',
      isActive: true
    }));

    electronIPC.stopPomodoro('toggle-timer');
    unsubscribe();
  });
});
