export interface RecoveryPointsFlushResult {
  ok: boolean;
  error?: string;
}

export interface RecoveryPointsStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  flush(): RecoveryPointsFlushResult;
}

export interface RecoveryPointsMigrationResult {
  ok: boolean;
  migrated: boolean;
  activeStore: RecoveryPointsStore;
  error?: string;
}

/**
 * Moves recovery points between durable stores without deleting the legacy
 * copy until the destination has been flushed successfully.
 */
export function migrateRecoveryPoints(
  legacyStore: RecoveryPointsStore,
  recoveryStore: RecoveryPointsStore,
  key: string,
): RecoveryPointsMigrationResult {
  const legacy = legacyStore.get(key);
  if (legacy === null) return { ok: true, migrated: false, activeStore: recoveryStore };

  // The legacy store remains authoritative until cleanup succeeds. A previous
  // attempt may have written the destination and then failed to delete the
  // source; refresh it on every retry so recovery points created meanwhile
  // cannot be lost.
  recoveryStore.set(key, legacy);
  const destinationFlush = recoveryStore.flush();
  if (!destinationFlush.ok) {
    return { ok: false, migrated: false, activeStore: legacyStore, error: destinationFlush.error };
  }

  legacyStore.set(key, null);
  const legacyFlush = legacyStore.flush();
  if (!legacyFlush.ok) {
    return { ok: false, migrated: false, activeStore: legacyStore, error: legacyFlush.error };
  }

  return { ok: true, migrated: true, activeStore: recoveryStore };
}
