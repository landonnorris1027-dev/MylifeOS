import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { setStorageItem } from './localStorageStore';
import {
  flushNativePreferenceWrites,
  hydrateNativePreferences,
} from './nativePreferences';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(),
  },
}));

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const mockIsNativePlatform = Capacitor.isNativePlatform as jest.MockedFunction<typeof Capacitor.isNativePlatform>;
const mockGet = Preferences.get as jest.MockedFunction<typeof Preferences.get>;
const mockSet = Preferences.set as jest.MockedFunction<typeof Preferences.set>;

describe('nativePreferences', () => {
  beforeEach(async () => {
    await flushNativePreferenceWrites();
    localStorage.clear();
    jest.clearAllMocks();
    mockIsNativePlatform.mockReturnValue(false);
    mockGet.mockResolvedValue({ value: null });
    mockSet.mockResolvedValue();
  });

  it('does not access native preferences in browser or Electron contexts', async () => {
    localStorage.setItem('example', 'browser-value');

    await hydrateNativePreferences(['example']);
    setStorageItem('example', 'updated-value');
    await flushNativePreferenceWrites();

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(localStorage.getItem('example')).toBe('updated-value');
  });

  it('hydrates WebView storage from native preferences before app startup', async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGet.mockResolvedValue({ value: 'native-value' });

    await hydrateNativePreferences(['example']);

    expect(localStorage.getItem('example')).toBe('native-value');
  });

  it('backfills a missing native value from existing WebView storage', async () => {
    mockIsNativePlatform.mockReturnValue(true);
    localStorage.setItem('example', 'existing-value');

    await hydrateNativePreferences(['example']);

    expect(mockSet).toHaveBeenCalledWith({ key: 'example', value: 'existing-value' });
  });

  it('mirrors subsequent storage writes to native preferences', async () => {
    mockIsNativePlatform.mockReturnValue(true);

    setStorageItem('example', 'new-value');
    await flushNativePreferenceWrites();

    expect(localStorage.getItem('example')).toBe('new-value');
    expect(mockSet).toHaveBeenCalledWith({ key: 'example', value: 'new-value' });
  });

  it('recovers a newer WebView value after a native write fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockIsNativePlatform.mockReturnValue(true);
    mockSet.mockRejectedValueOnce(new Error('native write failed'));

    setStorageItem('example', 'newer-local-value');
    await flushNativePreferenceWrites();

    mockGet.mockResolvedValue({ value: 'stale-native-value' });
    mockSet.mockResolvedValue();
    await hydrateNativePreferences(['example']);

    expect(localStorage.getItem('example')).toBe('newer-local-value');
    expect(mockSet).toHaveBeenLastCalledWith({ key: 'example', value: 'newer-local-value' });

    consoleError.mockRestore();
  });

  it('keeps the latest write dirty across an A-B-A queue failure', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockIsNativePlatform.mockReturnValue(true);
    mockSet
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('last native write failed'));

    setStorageItem('example', 'A');
    setStorageItem('example', 'B');
    setStorageItem('example', 'A');
    await flushNativePreferenceWrites();

    mockGet.mockResolvedValue({ value: 'B' });
    mockSet.mockResolvedValue();
    await hydrateNativePreferences(['example']);

    expect(localStorage.getItem('example')).toBe('A');
    expect(mockSet).toHaveBeenLastCalledWith({ key: 'example', value: 'A' });

    consoleError.mockRestore();
  });
});
