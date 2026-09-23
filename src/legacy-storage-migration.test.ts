import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppDataStore } from './main/app-data-store';
import { migrateLegacyElectronStore } from './main/legacy-storage-migration';

const makeTempDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-legacy-migration-'));

const completedTask = (id: string, date: string, name: string) => ({
  id,
  habitId: 'habit-read',
  name,
  priority: 'P1',
  status: 'completed',
  date,
  durationMinutes: 25,
});

describe('legacy Electron storage migration', () => {
  it('migrates the 0.1.1 config.json format, including split daily logs, without changing the source', () => {
    const directory = makeTempDirectory();
    const legacyPath = path.join(directory, 'config.json');
    const appDataPath = path.join(directory, 'app-data.json');
    const previousDay = {
      date: '2026-09-20',
      tasks: [completedTask('task-previous', '2026-09-20', 'Read old aggregate')],
    };
    const splitDay = {
      date: '2026-09-20',
      tasks: [completedTask('task-current', '2026-09-20', 'Read from split key')],
    };
    const anotherSplitDay = {
      date: '2026-09-21',
      tasks: [completedTask('task-yesterday', '2026-09-21', 'Read another day')],
    };
    const legacyConfig = {
      mylifeos_habits: [{
        id: 'habit-read', name: 'Read', priority: 'P1', dailyQuota: 1,
        defaultDurationMinutes: 25, effectiveType: 'permanent',
      }],
      // Earlier builds used one aggregate key. A partially completed split
      // migration can leave this alongside the newer per-day keys.
      mylifeos_daily_logs: { '2026-09-20': previousDay },
      'mylifeos_log_2026-09-20': splitDay,
      'mylifeos_log_2026-09-21': anotherSplitDay,
      mylifeos_lang: 'en',
      mylifeos_migrated_to_electron_store: true,
    };
    const rawConfig = JSON.stringify(legacyConfig, null, 2);
    fs.writeFileSync(legacyPath, rawConfig, 'utf8');

    try {
      expect(migrateLegacyElectronStore(legacyPath, appDataPath)).toEqual({ migrated: true, reason: 'migrated' });

      const migrated = JSON.parse(fs.readFileSync(appDataPath, 'utf8'));
      expect(JSON.parse(migrated.mylifeos_habits)).toEqual(legacyConfig.mylifeos_habits);
      expect(migrated.mylifeos_lang).toBe('en');
      expect(JSON.parse(migrated.mylifeos_daily_logs)).toEqual({
        '2026-09-20': splitDay,
        '2026-09-21': anotherSplitDay,
      });
      const store = new AppDataStore({ filePath: appDataPath, logger: { error: jest.fn() } });
      expect(JSON.parse(store.get('mylifeos_habits')!)).toEqual(legacyConfig.mylifeos_habits);
      expect(JSON.parse(store.get('mylifeos_daily_logs')!)).toEqual({
        '2026-09-20': splitDay,
        '2026-09-21': anotherSplitDay,
      });
      expect(store.get('mylifeos_lang')).toBe('en');
      expect(fs.readFileSync(legacyPath, 'utf8')).toBe(rawConfig);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not overwrite an initialized destination and is safe to retry', () => {
    const directory = makeTempDirectory();
    const legacyPath = path.join(directory, 'config.json');
    const appDataPath = path.join(directory, 'app-data.json');
    fs.writeFileSync(legacyPath, JSON.stringify({ mylifeos_habits: [] }), 'utf8');
    fs.writeFileSync(appDataPath, JSON.stringify({ mylifeos_habits: '[{"id":"new","name":"New","priority":"P2","dailyQuota":1,"defaultDurationMinutes":25,"effectiveType":"permanent"}]' }), 'utf8');
    const originalDestination = fs.readFileSync(appDataPath, 'utf8');

    try {
      expect(migrateLegacyElectronStore(legacyPath, appDataPath)).toEqual({ migrated: false, reason: 'destination-exists' });
      expect(migrateLegacyElectronStore(legacyPath, appDataPath)).toEqual({ migrated: false, reason: 'destination-exists' });
      expect(fs.readFileSync(appDataPath, 'utf8')).toBe(originalDestination);
      expect(fs.existsSync(legacyPath)).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses a readable new-store backup instead of the older config.json', () => {
    const directory = makeTempDirectory();
    const legacyPath = path.join(directory, 'config.json');
    const appDataPath = path.join(directory, 'app-data.json');
    fs.writeFileSync(legacyPath, JSON.stringify({ mylifeos_habits: [] }), 'utf8');
    fs.writeFileSync(`${appDataPath}.bak`, JSON.stringify({ mylifeos_habits: '[]' }), 'utf8');

    try {
      expect(migrateLegacyElectronStore(legacyPath, appDataPath)).toEqual({ migrated: false, reason: 'destination-exists' });
      expect(fs.existsSync(appDataPath)).toBe(false);
      expect(fs.existsSync(legacyPath)).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('recovers from an unreadable new-store backup using the intact legacy config', () => {
    const directory = makeTempDirectory();
    const legacyPath = path.join(directory, 'config.json');
    const appDataPath = path.join(directory, 'app-data.json');
    const rawConfig = JSON.stringify({ mylifeos_habits: [] });
    const rawBackup = '{broken';
    fs.writeFileSync(legacyPath, rawConfig, 'utf8');
    fs.writeFileSync(`${appDataPath}.bak`, rawBackup, 'utf8');

    try {
      expect(migrateLegacyElectronStore(legacyPath, appDataPath)).toEqual({ migrated: true, reason: 'migrated' });
      expect(JSON.parse(fs.readFileSync(appDataPath, 'utf8'))).toEqual({
        mylifeos_habits: '[]',
        mylifeos_daily_logs: '{}',
      });
      expect(fs.readFileSync(`${appDataPath}.bak`, 'utf8')).toBe(rawBackup);
      expect(fs.readFileSync(legacyPath, 'utf8')).toBe(rawConfig);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps the legacy source when the atomic destination write fails and can retry', () => {
    const directory = makeTempDirectory();
    const legacyPath = path.join(directory, 'config.json');
    const appDataPath = path.join(directory, 'app-data.json');
    const legacyConfig = { mylifeos_habits: [] };
    const rawConfig = JSON.stringify(legacyConfig);
    fs.writeFileSync(legacyPath, rawConfig, 'utf8');
    const writeSpy = jest.spyOn(fs, 'writeFileSync');
    writeSpy.mockImplementationOnce(() => { throw new Error('disk full'); });

    try {
      try {
        expect(() => migrateLegacyElectronStore(legacyPath, appDataPath)).toThrow('disk full');
        expect(fs.readFileSync(legacyPath, 'utf8')).toBe(rawConfig);
        expect(fs.existsSync(appDataPath)).toBe(false);
        expect(fs.existsSync(`${appDataPath}.tmp`)).toBe(false);
      } finally {
        writeSpy.mockRestore();
      }

      expect(migrateLegacyElectronStore(legacyPath, appDataPath)).toEqual({ migrated: true, reason: 'migrated' });
      expect(fs.readFileSync(legacyPath, 'utf8')).toBe(rawConfig);
      expect(JSON.parse(fs.readFileSync(appDataPath, 'utf8'))).toEqual({
        mylifeos_habits: '[]',
        mylifeos_daily_logs: '{}',
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('leaves malformed legacy data untouched and does not create an empty destination', () => {
    const directory = makeTempDirectory();
    const legacyPath = path.join(directory, 'config.json');
    const appDataPath = path.join(directory, 'app-data.json');
    const rawConfig = '{broken';
    fs.writeFileSync(legacyPath, rawConfig, 'utf8');

    try {
      expect(() => migrateLegacyElectronStore(legacyPath, appDataPath)).toThrow('left untouched');
      expect(fs.readFileSync(legacyPath, 'utf8')).toBe(rawConfig);
      expect(fs.existsSync(appDataPath)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
