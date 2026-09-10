import { Capacitor } from '@capacitor/core';
import { playCompletionAlert } from './nativeReminder';

const mockCanAlert = jest.fn();
const mockVibrate = jest.fn();
jest.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: jest.fn() },
  registerPlugin: () => ({
    canAlert: (...args: unknown[]) => mockCanAlert(...args),
    vibrate: (...args: unknown[]) => mockVibrate(...args),
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (Capacitor.getPlatform as jest.Mock).mockReturnValue('android');
  mockCanAlert.mockResolvedValue({ allowed: true });
  mockVibrate.mockResolvedValue(undefined);
});

it('pairs foreground sound with one native vibration request', async () => {
  const sound = jest.fn(() => true);
  await playCompletionAlert(sound, true);
  expect(sound).toHaveBeenCalledTimes(1);
  expect(mockVibrate).toHaveBeenCalledTimes(1);
});

it('honors the vibration switch and unavailable audio', async () => {
  await playCompletionAlert(() => true, false);
  await playCompletionAlert(() => false, true);
  expect(mockVibrate).not.toHaveBeenCalled();
});

it('respects device silent and Do Not Disturb policy', async () => {
  mockCanAlert.mockResolvedValue({ allowed: false });
  const sound = jest.fn(() => true);
  await playCompletionAlert(sound, true);
  expect(sound).not.toHaveBeenCalled();
  expect(mockVibrate).not.toHaveBeenCalled();
});

it('does not propagate vibration hardware failures', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockVibrate.mockRejectedValue(new Error('no vibrator'));
  const sound = jest.fn(() => true);
  await expect(playCompletionAlert(sound, true)).resolves.toBeUndefined();
  expect(sound).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it('keeps desktop sound without native calls', async () => {
  (Capacitor.getPlatform as jest.Mock).mockReturnValue('web');
  const sound = jest.fn(() => true);
  await playCompletionAlert(sound, true);
  expect(sound).toHaveBeenCalled();
  expect(mockCanAlert).not.toHaveBeenCalled();
  expect(mockVibrate).not.toHaveBeenCalled();
});
