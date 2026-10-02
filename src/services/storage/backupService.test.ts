import { exportBackupJSON, exportDesktopCompatibleBackupJSON, exportAndroidCompatibleBackupJSON, importBackupJSON, previewImportBackupJSON } from './backupService';
import { KEYS, getStorageItem, setStorageItem } from './localStorageStore';
import { saveFocusSettings, getFocusSettings } from '../focusSettings';

describe('complete snapshot backups', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); delete window.electronAPI; });

  it('preserves precise v8 sessions, rejects invalid records, and omits them in both compatibility formats', async () => {
    const session = { id: 's', timerId: 't', taskId: null, taskDate: '2026-10-02', taskName: 'Deleted task', plannedSeconds: 120, actualFocusSeconds: 1.5, startedAt: 1000, endedAt: 2500, result: 'stopped', measurement: 'measured' };
    setStorageItem(KEYS.FOCUS_SESSIONS, JSON.stringify([session]));
    const full = JSON.parse(exportBackupJSON([], {}));
    expect(full.focusSessions).toEqual([session]);
    for (const invalid of [[session, session], [{ ...session, actualFocusSeconds: -1 }], [{ ...session, endedAt: 0 }]]) {
      expect(previewImportBackupJSON(JSON.stringify({ ...full, focusSessions: invalid })).ok).toBe(false);
    }
    localStorage.clear(); expect((await importBackupJSON(JSON.stringify(full))).ok).toBe(true);
    expect(JSON.parse(getStorageItem(KEYS.FOCUS_SESSIONS)!)).toEqual([session]);
    for (const compatible of [exportDesktopCompatibleBackupJSON([], {}), exportAndroidCompatibleBackupJSON([], {})]) {
      expect(JSON.parse(compatible)).not.toHaveProperty('focusSessions');
      expect(previewImportBackupJSON(compatible).ok).toBe(true);
    }
  });

  it('round-trips all preferences, goals and tasks as a single snapshot', async () => {
    setStorageItem(KEYS.LANGUAGE, 'en');
    saveFocusSettings({ soundEnabled: false, notificationsEnabled: false, breakDurationMinutes: 15 });
    const json = exportBackupJSON([], {}, [{ id: 'g', name: 'Goal' }]);
    const preview = previewImportBackupJSON(json);
    expect(preview).toMatchObject({ ok: true, importedSettingCount: 5, importedGoalCount: 1 });
    localStorage.clear();
    expect((await importBackupJSON(json)).ok).toBe(true);
    expect(getStorageItem(KEYS.LANGUAGE)).toBe('en');
    expect(getFocusSettings()).toEqual({ soundEnabled: false, notificationsEnabled: false, breakDurationMinutes: 15, vibrationEnabled: true });
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

  it('exports v6 without vibration and preserves the receiving device preference', async () => {
    saveFocusSettings({ ...getFocusSettings(), vibrationEnabled: false });
    const compatible = JSON.parse(exportDesktopCompatibleBackupJSON([], {}));
    expect(compatible.schemaVersion).toBe(6);
    expect(compatible.settings.focus).not.toHaveProperty('vibrationEnabled');
    expect((await importBackupJSON(JSON.stringify(compatible))).ok).toBe(true);
    expect(getFocusSettings().vibrationEnabled).toBe(false);
    const full = JSON.parse(exportBackupJSON([], {}));
    expect(full.schemaVersion).toBe(8);
    expect(full.settings.focus.vibrationEnabled).toBe(false);
    delete full.settings.focus.vibrationEnabled;
    expect(previewImportBackupJSON(JSON.stringify(full)).ok).toBe(false);
  });

  it('leaves every previous key intact when the browser snapshot write fails', async () => {
    setStorageItem(KEYS.GOALS, '[{"id":"old","name":"Old"}]');
    setStorageItem(KEYS.HABITS, '[]');
    const json = exportBackupJSON([], {}, [{ id: 'new', name: 'New' }]);
    const before = getStorageItem(KEYS.GOALS);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await importBackupJSON(json)).ok).toBe(false);
    expect(getStorageItem(KEYS.GOALS)).toBe(before);
    expect(getStorageItem(KEYS.HABITS)).toBe('[]');
  });

  it('does not acknowledge a desktop import until the durable transaction resolves', async () => {
    const json = exportBackupJSON([], {});
    let finish: (value: { ok: boolean; error?: string }) => void = () => undefined;
    const invoke = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    window.electronAPI = { invoke, sendSync: vi.fn() } as unknown as Window['electronAPI'];
    let completed = false;
    const promise = importBackupJSON(json).then(result => { completed = true; return result; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(invoke).toHaveBeenCalledWith('storage-commit', expect.objectContaining({ entries: expect.objectContaining({ [KEYS.HABITS]: '[]', [KEYS.DAILY_LOGS]: '{}' }) }));
    finish({ ok: true });
    expect((await promise).ok).toBe(true);
  });
});
