import { exportBackupJSON, importBackupJSON, previewImportBackupJSON } from './backupService';
import { KEYS, getStorageItem, setStorageItem } from './localStorageStore';
import { saveFocusSettings, getFocusSettings } from '../focusSettings';

describe('complete snapshot backups', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { jest.restoreAllMocks(); delete window.electronAPI; });

  it('round-trips all preferences, goals and tasks as a single snapshot', async () => {
    setStorageItem(KEYS.LANGUAGE, 'en');
    saveFocusSettings({ soundEnabled: false, notificationsEnabled: false, breakDurationMinutes: 15 });
    const json = exportBackupJSON([], {}, [{ id: 'g', name: 'Goal' }]);
    const preview = previewImportBackupJSON(json);
    expect(preview).toMatchObject({ ok: true, importedSettingCount: 5, importedGoalCount: 1 });
    localStorage.clear();
    expect((await importBackupJSON(json)).ok).toBe(true);
    expect(getStorageItem(KEYS.LANGUAGE)).toBe('en');
    expect(getFocusSettings()).toEqual({ soundEnabled: false, notificationsEnabled: false, breakDurationMinutes: 15 });
    expect(JSON.parse(getStorageItem(KEYS.GOALS)!)).toEqual([{ id: 'g', name: 'Goal' }]);
    expect(JSON.parse(exportBackupJSON([], {})).settings).toEqual(JSON.parse(json).settings);
  });

  it('preserves existing preferences for legacy backups and rejects malformed snapshots', async () => {
    setStorageItem(KEYS.LANGUAGE, 'en');
    expect((await importBackupJSON(JSON.stringify({ schemaVersion: 4, habits: [], dailyLogs: {} }))).ok).toBe(true);
    expect(getStorageItem(KEYS.LANGUAGE)).toBe('en');
    for (const json of ['{}', '{"schemaVersion":999}', '{"schemaVersion":5,"habits":[],"dailyLogs":{}}']) {
      expect(previewImportBackupJSON(json).ok).toBe(false);
    }
    const invalid = JSON.parse(exportBackupJSON([], {}));
    invalid.settings.focus.breakDurationMinutes = -1;
    expect(previewImportBackupJSON(JSON.stringify(invalid)).ok).toBe(false);
  });

  it('leaves every previous key intact when the browser snapshot write fails', async () => {
    setStorageItem(KEYS.GOALS, '[{"id":"old","name":"Old"}]');
    setStorageItem(KEYS.HABITS, '[]');
    const json = exportBackupJSON([], {}, [{ id: 'new', name: 'New' }]);
    const before = getStorageItem(KEYS.GOALS);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await importBackupJSON(json)).ok).toBe(false);
    expect(getStorageItem(KEYS.GOALS)).toBe(before);
    expect(getStorageItem(KEYS.HABITS)).toBe('[]');
  });

  it('does not acknowledge a desktop import until the durable transaction resolves', async () => {
    const json = exportBackupJSON([], {});
    let finish: (value: { ok: boolean; error?: string }) => void = () => undefined;
    const invoke = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    window.electronAPI = { invoke, sendSync: jest.fn() } as unknown as Window['electronAPI'];
    let completed = false;
    const promise = importBackupJSON(json).then(result => { completed = true; return result; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(invoke).toHaveBeenCalledWith('storage-commit', expect.objectContaining({ entries: expect.objectContaining({ [KEYS.HABITS]: '[]', [KEYS.DAILY_LOGS]: '{}' }) }));
    finish({ ok: true });
    expect((await promise).ok).toBe(true);
  });
});
