import { migrateRecoveryPoints, RecoveryPointsStore } from './main/recovery-points-migration';

const KEY = 'mylifeos_recovery_points';

const createStore = (
  initialValue: string | null,
  flushResult: { ok: boolean; error?: string } = { ok: true },
): RecoveryPointsStore & { set: jest.Mock; flush: jest.Mock } => {
  let value = initialValue;
  let durableValue = initialValue;
  return {
    get: jest.fn(() => value),
    set: jest.fn((_key: string, nextValue: string | null) => {
      value = nextValue;
    }),
    flush: jest.fn(() => {
      if (flushResult.ok) {
        durableValue = value;
      } else {
        value = durableValue;
      }
      return flushResult;
    }),
  };
};

describe('recovery-points migration', () => {
  it('keeps the legacy recovery points when the destination cannot be persisted', () => {
    const legacyStore = createStore('[{"id":"legacy"}]');
    const recoveryStore = createStore(null, { ok: false, error: 'disk full' });

    const result = migrateRecoveryPoints(legacyStore, recoveryStore, KEY);

    expect(result).toMatchObject({ ok: false, migrated: false, error: 'disk full' });
    expect(recoveryStore.set).toHaveBeenCalledWith(KEY, '[{"id":"legacy"}]');
    expect(legacyStore.set).not.toHaveBeenCalled();
    expect(legacyStore.get(KEY)).toBe('[{"id":"legacy"}]');
    expect(result.activeStore).toBe(legacyStore);

    result.activeStore.set(KEY, '[{"id":"legacy"},{"id":"new"}]');
    expect(legacyStore.set).toHaveBeenCalledWith(KEY, '[{"id":"legacy"},{"id":"new"}]');
  });

  it('deletes the legacy copy only after the destination is persisted', () => {
    const calls: string[] = [];
    const legacyStore = createStore('[{"id":"legacy"}]');
    const recoveryStore = createStore(null);
    recoveryStore.flush.mockImplementation(() => {
      calls.push('destination-flushed');
      return { ok: true };
    });
    legacyStore.set.mockImplementation((_key: string, value: string | null) => {
      calls.push(`legacy-set:${String(value)}`);
    });

    const result = migrateRecoveryPoints(legacyStore, recoveryStore, KEY);

    expect(result).toMatchObject({ ok: true, migrated: true });
    expect(result.activeStore).toBe(recoveryStore);
    expect(calls).toEqual(['destination-flushed', 'legacy-set:null']);
    expect(legacyStore.flush).toHaveBeenCalledTimes(1);
  });

  it('keeps using the legacy store when deleting its durable copy fails', () => {
    const legacyStore = createStore('[{"id":"legacy"}]', { ok: false, error: 'source locked' });
    const recoveryStore = createStore(null);

    const result = migrateRecoveryPoints(legacyStore, recoveryStore, KEY);

    expect(result).toMatchObject({ ok: false, migrated: false, error: 'source locked' });
    expect(result.activeStore).toBe(legacyStore);
    expect(legacyStore.get(KEY)).toBe('[{"id":"legacy"}]');
    expect(recoveryStore.get(KEY)).toBe('[{"id":"legacy"}]');
  });

  it('refreshes an existing destination from the active legacy store before retrying cleanup', () => {
    const latestLegacyValue = '[{"id":"legacy"},{"id":"created-after-failure"}]';
    const legacyStore = createStore(latestLegacyValue);
    const recoveryStore = createStore('[{"id":"legacy"}]');

    const result = migrateRecoveryPoints(legacyStore, recoveryStore, KEY);

    expect(result).toMatchObject({ ok: true, migrated: true });
    expect(recoveryStore.set).toHaveBeenCalledWith(KEY, latestLegacyValue);
    expect(recoveryStore.get(KEY)).toBe(latestLegacyValue);
    expect(legacyStore.set).toHaveBeenCalledWith(KEY, null);
  });
});
