import type { StorageStatus } from '../main/storage-contract';
import { isAndroid } from './platform';
import { getNativePending, getNativeStatus, retryNativeWrites, subscribeNativeStatus } from './nativeRuntime';

export const hasManagedStorage = () => isAndroid() || Boolean(window.electronAPI);
export const storageBridge = {
  status: async (): Promise<StorageStatus> => isAndroid() ? getNativeStatus() : window.electronAPI!.invoke('storage-status'),
  subscribe: (callback: (status: StorageStatus) => void): (() => void) => isAndroid()
    ? subscribeNativeStatus(callback) : window.electronAPI!.on('storage-status', callback),
  pending: async (): Promise<Record<string, string>> => isAndroid() ? getNativePending() : window.electronAPI!.invoke('storage-pending-snapshot'),
  retry: async () => {
    if (isAndroid()) { await retryNativeWrites(); return; }
    const result = await window.electronAPI!.invoke('storage-retry');
    if (!result.ok) throw new Error(result.error || 'Save failed');
  },
};
