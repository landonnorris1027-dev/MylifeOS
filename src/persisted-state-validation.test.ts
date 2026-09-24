import fs from 'fs';
import os from 'os';
import path from 'path';
import { readJsonWithBackup, writeTextAtomically } from './main/durable-file';
import { isPersistedTimerState, isWindowStateSnapshot } from './main/persisted-state-validation';

const withTempDirectory = (run: (directory: string) => void) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-persisted-state-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

describe('persisted JSON validation and backup recovery', () => {
  it('uses the window-state backup when the primary has the wrong JSON shape', () => {
    withTempDirectory((directory) => {
      const filePath = path.join(directory, 'window-state.json');
      const backup = { x: 24, y: 32, width: 1280, height: 800, isMaximized: false };
      fs.writeFileSync(filePath, JSON.stringify({ width: 0, height: 0 }), 'utf8');
      fs.writeFileSync(`${filePath}.bak`, JSON.stringify(backup), 'utf8');

      expect(readJsonWithBackup(filePath, fs, isWindowStateSnapshot)).toEqual({
        value: backup,
        recoveredFromBackup: true,
      });
    });
  });

  it('uses the timer backup when the primary is JSON-valid but has an invalid timer collection', () => {
    withTempDirectory((directory) => {
      const filePath = path.join(directory, 'pomodoro-state.json');
      const backup = {
        activeTimers: [{ timerId: 'paused', duration: 1500, remaining: 60000, isActive: false }],
        pendingRecoveries: [],
      };
      fs.writeFileSync(filePath, JSON.stringify({ activeTimers: 'not-an-array', pendingRecoveries: [] }), 'utf8');
      fs.writeFileSync(`${filePath}.bak`, JSON.stringify(backup), 'utf8');

      expect(readJsonWithBackup(filePath, fs, isPersistedTimerState)).toEqual({
        value: backup,
        recoveredFromBackup: true,
      });
    });
  });

  it('uses the timer backup when a primary timer has no recoverable time fields', () => {
    withTempDirectory((directory) => {
      const filePath = path.join(directory, 'pomodoro-state.json');
      const backup = {
        activeTimers: [{ timerId: 'paused', duration: 1500, remaining: 60000, isActive: false }],
        pendingRecoveries: [],
      };
      fs.writeFileSync(filePath, JSON.stringify({ activeTimers: [{ timerId: 'incomplete' }], pendingRecoveries: [] }), 'utf8');
      fs.writeFileSync(`${filePath}.bak`, JSON.stringify(backup), 'utf8');

      expect(readJsonWithBackup(filePath, fs, isPersistedTimerState)).toEqual({
        value: backup,
        recoveredFromBackup: true,
      });
      expect(isPersistedTimerState({ activeTimers: [{ timerId: 'incomplete' }], pendingRecoveries: [] })).toBe(false);
    });
  });

  it('preserves legacy timer arrays while rejecting malformed timer records', () => {
    expect(isPersistedTimerState([{ timerId: 'legacy', duration: 1500, endTime: 1800, isActive: true }])).toBe(true);
    expect(isPersistedTimerState([{ timerId: 'legacy', duration: 'soon', isActive: true }])).toBe(false);
    expect(isPersistedTimerState({ activeTimers: [{}], pendingRecoveries: [] })).toBe(false);
  });

  it('keeps numeric string window bounds compatible with the existing normalizer', () => {
    expect(isWindowStateSnapshot({ x: '24', width: '1280', height: '800', isMaximized: false })).toBe(true);
    expect(isWindowStateSnapshot({ width: 'wide', height: 800 })).toBe(false);
    expect(isWindowStateSnapshot({ width: 0, height: 0 })).toBe(false);
  });

  it('does not replace a good window-state backup with a JSON-valid invalid primary', () => {
    withTempDirectory((directory) => {
      const filePath = path.join(directory, 'window-state.json');
      const previousBackup = { width: 1200, height: 800, isMaximized: false };
      fs.writeFileSync(filePath, JSON.stringify({ width: 0, height: 0 }), 'utf8');
      fs.writeFileSync(`${filePath}.bak`, JSON.stringify(previousBackup), 'utf8');

      writeTextAtomically(filePath, JSON.stringify({ width: 1400, height: 900, isMaximized: true }), fs, isWindowStateSnapshot);

      expect(JSON.parse(fs.readFileSync(`${filePath}.bak`, 'utf8'))).toEqual(previousBackup);
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({ width: 1400, height: 900, isMaximized: true });
    });
  });

  it('does not overwrite a good timer backup with a JSON-valid incomplete primary', () => {
    withTempDirectory((directory) => {
      const filePath = path.join(directory, 'pomodoro-state.json');
      const previousBackup = {
        activeTimers: [{ timerId: 'paused', duration: 1500, remaining: 60000, isActive: false }],
        pendingRecoveries: [],
      };
      const incompletePrimary = { activeTimers: [{ timerId: 'incomplete' }], pendingRecoveries: [] };
      const nextSnapshot = { activeTimers: [], pendingRecoveries: [] };
      fs.writeFileSync(filePath, JSON.stringify(incompletePrimary), 'utf8');
      fs.writeFileSync(`${filePath}.bak`, JSON.stringify(previousBackup), 'utf8');

      writeTextAtomically(filePath, JSON.stringify(nextSnapshot), fs, isPersistedTimerState);

      expect(JSON.parse(fs.readFileSync(`${filePath}.bak`, 'utf8'))).toEqual(previousBackup);
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(nextSnapshot);
    });
  });
});
