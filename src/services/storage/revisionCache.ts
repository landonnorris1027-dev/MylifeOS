import { getStorageItem } from './localStorageStore';
import { getDesktopStorage } from './desktopStorageAdapter';

// Raw values also guard browser/native callers and tests that bypass the adapter.
// Cache values never escape without a copy unless a reader explicitly treats them as read-only.
const caches = new Set<Map<string, { revision: number; raw: (string | null)[]; value: unknown }>>();
export function revisionCache<T>(keys: string[], compute: (raw: (string | null)[], variant: string) => T) {
  const entries = new Map<string, { revision: number; raw: (string | null)[]; value: unknown }>();
  caches.add(entries);
  return (variant = ''): T => {
    const revision = getDesktopStorage()?.revision() ?? 0;
    const raw = keys.map(getStorageItem);
    const previous = entries.get(variant);
    if (previous && previous.revision === revision && raw.every((value, i) => value === previous.raw[i])) return previous.value as T;
    const value = compute(raw, variant);
    if (entries.size >= 32) entries.clear();
    entries.set(variant, { revision, raw, value });
    return value;
  };
}
export function invalidateStorageCaches() { caches.forEach(cache => cache.clear()); }
if (typeof window !== 'undefined') {
  window.addEventListener('mylifeos-storage-restored', invalidateStorageCaches);
  window.addEventListener('mylifeos-storage-replaced', invalidateStorageCaches);
}
