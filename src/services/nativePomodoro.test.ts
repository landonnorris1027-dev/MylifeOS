import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { NativePomodoroManager } from './nativePomodoro';

jest.mock('@capacitor/app', () => ({
  App: { addListener: jest.fn() },
}));

jest.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: jest.fn(),
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
const mockCreateChannel = LocalNotifications.createChannel as jest.MockedFunction<typeof LocalNotifications.createChannel>;
const mockSchedule = LocalNotifications.schedule as jest.MockedFunction<typeof LocalNotifications.schedule>;
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
    mockCreateChannel.mockResolvedValue();
    mockSchedule.mockResolvedValue({ notifications: [] });
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
    expect(mockSchedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        title: '专注完成',
        body: '休息一下吧',
        schedule: { at: new Date(expectedEnd), allowWhileIdle: true },
        isExactNotification: true,
        isExactMandatory: false,
      })],
    });
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
    await Promise.resolve();
    await Promise.resolve();

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
});
