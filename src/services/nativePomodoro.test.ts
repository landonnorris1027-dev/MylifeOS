import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { NativePomodoroManager } from './nativePomodoro';
import { scheduleNativeReminder, cancelNativeReminder, completeNativeReminder, setNativeTimerVisible } from './nativeReminder';
jest.mock('./nativeReminder', () => ({
  scheduleNativeReminder: jest.fn(), cancelNativeReminder: jest.fn(), setNativeTimerVisible: jest.fn(),
  completeNativeReminder: jest.fn(),
}));

jest.mock('@capacitor/app', () => ({
  App: { addListener: jest.fn() },
}));

jest.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: jest.fn(),
    schedule: jest.fn(),
    cancel: jest.fn(),
  },
}));

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const mockAddListener = App.addListener as jest.MockedFunction<typeof App.addListener>;
const mockGet = Preferences.get as jest.MockedFunction<typeof Preferences.get>;
const mockSet = Preferences.set as jest.MockedFunction<typeof Preferences.set>;

const mockSchedule = scheduleNativeReminder as jest.MockedFunction<typeof scheduleNativeReminder>;
const mockCancel = LocalNotifications.cancel as jest.MockedFunction<typeof LocalNotifications.cancel>;

describe('NativePomodoroManager', () => {
  const now = new Date('2026-09-08T04:00:00.000Z');
  const removeListener = jest.fn().mockResolvedValue(undefined);
  let manager: NativePomodoroManager | null = null;
  let appStateChange: ((state: { isActive: boolean }) => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    jest.clearAllMocks();
    appStateChange = null;
    mockAddListener.mockImplementation(async (_eventName, listener) => {
      appStateChange = listener as unknown as (state: { isActive: boolean }) => void;
      return { remove: removeListener };
    });
    mockGet.mockResolvedValue({ value: null });
    mockSet.mockResolvedValue();
    (LocalNotifications.requestPermissions as jest.Mock).mockResolvedValue({ display: 'granted' });
    (cancelNativeReminder as jest.Mock).mockResolvedValue(undefined);
    (setNativeTimerVisible as jest.Mock).mockResolvedValue(undefined);
    (completeNativeReminder as jest.Mock).mockResolvedValue(undefined);
    mockSchedule.mockResolvedValue();
    mockCancel.mockResolvedValue();
  });

  afterEach(async () => {
    await manager?.dispose();
    manager = null;
    jest.useRealTimers();
  });

  it('persists a wall-clock deadline and schedules its completion notification', async () => {
    const onUpdate = jest.fn();
    manager = new NativePomodoroManager(onUpdate);

    const update = await manager.start({
      timerId: 'focus-task-1',
      duration: 25 * 60,
      isFocusMode: true,
      notificationsEnabled: true,
      notificationMessages: {
        focusCompleteTitle: '专注完成',
        focusCompleteBody: '休息一下吧',
        breakFinishedTitle: '休息结束',
        breakFinishedBody: '继续专注',
      },
    });

    const expectedEnd = now.getTime() + 25 * 60 * 1000;
    expect(update).toMatchObject({ endTime: expectedEnd, remaining: 25 * 60 * 1000, isActive: true });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      key: 'mylifeos_native_pomodoro_timers',
      value: expect.stringContaining(`\"endTime\":${expectedEnd}`),
    }));
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({
      title: '专注完成', body: '休息一下吧', at: expectedEnd,
      vibrationEnabled: true, soundEnabled: true, notificationsEnabled: true,
    }));
  });

  it('freezes remaining time while paused and creates a new deadline on resume', async () => {
    manager = new NativePomodoroManager(jest.fn());
    await manager.start({ timerId: 'focus-task-1', duration: 10, isFocusMode: true });

    jest.setSystemTime(now.getTime() + 4_000);
    await manager.toggle('focus-task-1');
    expect(mockCancel).toHaveBeenCalled();

    jest.setSystemTime(now.getTime() + 9_000);
    await manager.toggle('focus-task-1');
    const active = await manager.getActiveTimers();

    expect(active[0]).toMatchObject({
      remaining: 6_000,
      endTime: now.getTime() + 15_000,
      isActive: true,
    });
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it('restores an elapsed timer before emitting its completion event', async () => {
    const onUpdate = jest.fn();
    mockGet.mockResolvedValue({
      value: JSON.stringify([{
        timerId: 'focus-task-1',
        duration: 10,
        isFocusMode: true,
        notificationsEnabled: true,
        endTime: now.getTime() - 1_000,
        remaining: 2_000,
        isActive: true,
        notificationId: 123,
      }]),
    });
    manager = new NativePomodoroManager(onUpdate);

    const restored = await manager.getActiveTimers();
    expect(restored[0]).toMatchObject({ remaining: 0, isActive: true, isFinished: false });
    expect(onUpdate).not.toHaveBeenCalled();

    manager.setUpdateConsumerAvailable(true);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      timerId: 'focus-task-1',
      remaining: 0,
      isFinished: true,
    }));
    expect(mockSet).toHaveBeenLastCalledWith({
      key: 'mylifeos_native_pomodoro_timers',
      value: '[]',
    });
  });

  it('reconciles the wall-clock deadline as soon as Android resumes', async () => {
    const onUpdate = jest.fn();
    manager = new NativePomodoroManager(onUpdate);
    manager.setUpdateConsumerAvailable(true);
    await manager.start({ timerId: 'focus-task-1', duration: 10, isFocusMode: true });
    onUpdate.mockClear();

    jest.setSystemTime(now.getTime() + 11_000);
    appStateChange?.({ isActive: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      remaining: 0,
      isFinished: true,
    }));
  });

  it('keeps the timer running when notification scheduling is unavailable', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSchedule.mockRejectedValue(new Error('permission denied'));
    manager = new NativePomodoroManager(jest.fn());

    await expect(manager.start({
      timerId: 'focus-task-1',
      duration: 10,
      isFocusMode: true,
    })).resolves.toMatchObject({ isActive: true, remaining: 10_000 });
    expect(mockSet).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it.each([true, false])('persists vibration=%s and sends it to the native alarm', async (vibrationEnabled) => {
    manager = new NativePomodoroManager(jest.fn());
    await manager.start({ timerId: 'vibration', duration: 10, isFocusMode: false, vibrationEnabled, soundEnabled: false });
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({ vibrationEnabled, soundEnabled: false }));
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ value: expect.stringContaining('"vibrationEnabled":' + vibrationEnabled) }));
  });

  it('retains the native alarm across foreground/background transitions and suppresses UI replay', async () => {
    const onUpdate = jest.fn();
    manager = new NativePomodoroManager(onUpdate);
    manager.setUpdateConsumerAvailable(true);
    await manager.start({ timerId: 'native', duration: 10, isFocusMode: true });
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    appStateChange?.({ isActive: false });
    appStateChange?.({ isActive: true });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(cancelNativeReminder).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isFinished: true, suppressCompletionAlert: true }));
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(completeNativeReminder).toHaveBeenCalledTimes(1);
  });

  it('keeps the native alarm when the WebView disappears without a background event', async () => {
    manager = new NativePomodoroManager(jest.fn());
    await manager.start({ timerId: 'crash', duration: 10, isFocusMode: true });
    await manager.dispose();
    manager = null;
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(cancelNativeReminder).not.toHaveBeenCalled();
    expect(setNativeTimerVisible).toHaveBeenLastCalledWith(false);
  });

  it('schedules foreground sound even with background notifications disabled', async () => {
    manager = new NativePomodoroManager(jest.fn());
    await manager.start({ timerId: 'quiet-background', duration: 10, isFocusMode: true, notificationsEnabled: false });
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({ notificationsEnabled: false, soundEnabled: true }));
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
  });

  it('cancels both the native alarm and any legacy alarm on stop', async () => {
    manager = new NativePomodoroManager(jest.fn());
    await manager.start({ timerId: 'stop', duration: 10, isFocusMode: true });
    await manager.stop('stop');
    expect(cancelNativeReminder).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('uses only the UI fallback if native alarm registration fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSchedule.mockRejectedValue(new Error('alarm registration failed'));
    const onUpdate = jest.fn();
    manager = new NativePomodoroManager(onUpdate);
    manager.setUpdateConsumerAvailable(true);
    await manager.start({ timerId: 'fallback', duration: 10, isFocusMode: true });
    jest.advanceTimersByTime(10_000);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(completeNativeReminder).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isFinished: true, suppressCompletionAlert: false }));
    warn.mockRestore();
  });
});
