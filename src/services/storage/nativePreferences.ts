import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

let writeQueue: Promise<void> = Promise.resolve();
let writeSequence = 0;
const DIRTY_KEY_PREFIX = 'mylifeos_native_dirty:';

const isNativePlatform = () => Capacitor.isNativePlatform();
const getDirtyKey = (key: string) => `${DIRTY_KEY_PREFIX}${key}`;

export const hydrateNativePreferences = async (keys: readonly string[]): Promise<void> => {
  if (!isNativePlatform()) return;

  const entries = await Promise.all(keys.map(async (key) => ({
    key,
    nativeValue: (await Preferences.get({ key })).value,
  })));

  await Promise.all(entries.map(async ({ key, nativeValue }) => {
    const dirtyKey = getDirtyKey(key);
    const pendingWriteToken = localStorage.getItem(dirtyKey);
    const browserValue = localStorage.getItem(key);

    if (pendingWriteToken !== null && browserValue !== null) {
      await Preferences.set({ key, value: browserValue });
      if (localStorage.getItem(dirtyKey) === pendingWriteToken) {
        localStorage.removeItem(dirtyKey);
      }
      return;
    }

    if (nativeValue !== null) {
      localStorage.setItem(key, nativeValue);
      return;
    }

    if (browserValue !== null) {
      await Preferences.set({ key, value: browserValue });
    }
  }));
};

export const persistNativePreference = (key: string, value: string): void => {
  if (!isNativePlatform()) return;

  const dirtyKey = getDirtyKey(key);
  const writeToken = `${Date.now()}:${writeSequence += 1}`;
  localStorage.setItem(dirtyKey, writeToken);

  writeQueue = writeQueue
    .then(async () => {
      await Preferences.set({ key, value });
      if (localStorage.getItem(dirtyKey) === writeToken) {
        localStorage.removeItem(dirtyKey);
      }
    })
    .catch((error) => {
      console.error(`MyLifeOS: Failed to persist native preference: ${key}`, error);
    });
};

export const flushNativePreferenceWrites = async (): Promise<void> => {
  await writeQueue;
};
