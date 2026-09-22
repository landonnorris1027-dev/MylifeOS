import { AppDataStore } from './main/app-data-store';
import fs from 'fs';
import os from 'os';
import path from 'path';

const FILE_PATH = 'D:/fake/userData/app-data.json';

interface FakeFs {
  existsSync: jest.Mock;
  mkdirSync: jest.Mock;
  readFileSync: jest.Mock;
  writeFileSync: jest.Mock;
  copyFileSync: jest.Mock;
  openSync: jest.Mock;
  fsyncSync: jest.Mock;
  closeSync: jest.Mock;
  renameSync: jest.Mock;
  unlinkSync: jest.Mock;
  files: Map<string, string>;
}

const createFakeFs = (initialFiles: Record<string, string> = {}): FakeFs => {
  const files = new Map<string, string>(Object.entries(initialFiles));

  return {
    files,
    existsSync: jest.fn((target: unknown) => {
      const targetPath = String(target);
      return files.has(targetPath) || targetPath === path.dirname(FILE_PATH);
    }),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn((target: unknown) => {
      const content = files.get(String(target));
      if (content === undefined) throw new Error(`ENOENT: ${target}`);
      return content;
    }),
    writeFileSync: jest.fn((target: unknown, content: unknown) => {
      files.set(String(target), String(content));
    }),
    copyFileSync: jest.fn((source: unknown, destination: unknown) => {
      const content = files.get(String(source));
      if (content === undefined) throw new Error(`ENOENT: ${source}`);
      files.set(String(destination), content);
    }),
    openSync: jest.fn(() => 42),
    fsyncSync: jest.fn(),
    closeSync: jest.fn(),
    renameSync: jest.fn((source: unknown, destination: unknown) => {
      const sourcePath = String(source);
      const content = files.get(sourcePath);
      if (content === undefined) throw new Error(`ENOENT: ${source}`);
      files.set(String(destination), content);
      files.delete(sourcePath);
    }),
    unlinkSync: jest.fn((target: unknown) => {
      files.delete(String(target));
    }),
  };
};

interface FakeScheduler {
  scheduleFlush: (callback: () => void, delayMs: number) => unknown;
  cancelScheduledFlush: (handle: unknown) => void;
  runPending: () => void;
  pendingCount: () => number;
}

const createFakeScheduler = (): FakeScheduler => {
  let pending: (() => void) | null = null;

  return {
    scheduleFlush: (callback) => {
      pending = callback;
      return callback;
    },
    cancelScheduledFlush: (handle) => {
      if (pending === handle) pending = null;
    },
    runPending: () => {
      const callback = pending;
      pending = null;
      callback?.();
    },
    pendingCount: () => (pending ? 1 : 0),
  };
};

const createStore = (fakeFs: FakeFs, scheduler: FakeScheduler) =>
  new AppDataStore({
    filePath: FILE_PATH,
    fileSystem: fakeFs,
    scheduleFlush: scheduler.scheduleFlush,
    cancelScheduledFlush: scheduler.cancelScheduledFlush,
    logger: { error: jest.fn() },
  });

describe('AppDataStore', () => {
  it('retains the whole failed snapshot for retry and blocks conflicting edits', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: 'old', b: 'old' }) });
    const store = createStore(fakeFs, createFakeScheduler());
    store.set('a', 'new'); store.set('b', 'new');
    expect(store.getStatus().state).toBe('saving');
    fakeFs.writeFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(store.flush().ok).toBe(false);
    expect(store.snapshot()).toEqual({ a: 'old', b: 'old' });
    expect(store.snapshot(true)).toEqual({ a: 'new', b: 'new' });
    expect(store.getStatus()).toMatchObject({ state: 'error', hasPending: true });
    expect(() => store.set('a', 'conflict')).toThrow();
    expect(store.flush().ok).toBe(true);
    expect(store.getStatus()).toMatchObject({ state: 'saved', hasPending: false });
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({ a: 'new', b: 'new' });
  });

  it('commits a multi-key snapshot in one replacement and reports no success on failure', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: 'old', b: 'old' }) });
    const store = createStore(fakeFs, createFakeScheduler());
    fakeFs.writeFileSync.mockImplementationOnce(() => { throw new Error('denied'); });
    expect(store.commit({ a: 'new', b: 'new' }).ok).toBe(false);
    expect(store.snapshot()).toEqual({ a: 'old', b: 'old' });
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({ a: 'old', b: 'old' });
    expect(store.flush().ok).toBe(true);
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({ a: 'new', b: 'new' });
  });

  it('archives both corrupt copies before explicit restoration', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: '{broken', [`${FILE_PATH}.bak`]: 'null' });
    const store = createStore(fakeFs, createFakeScheduler());
    expect(store.commit({ a: 'restored' }).ok).toBe(false);
    expect(store.commit({ a: 'restored' }, true).ok).toBe(true);
    const archives = Array.from(fakeFs.files.entries()).filter(([key]) => key.includes('.corrupt-'));
    expect(archives.map(([, value]) => value).sort()).toEqual(['{broken', 'null'].sort());
    expect(store.get('a')).toBe('restored');
    expect(store.getStatus().state).toBe('saved');
  });

  it('does not touch damaged files when archiving fails', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: '{broken' });
    const store = createStore(fakeFs, createFakeScheduler());
    fakeFs.copyFileSync.mockImplementationOnce(() => { throw new Error('archive denied'); });
    expect(store.commit({ a: 'restored' }, true).ok).toBe(false);
    expect(fakeFs.files.get(FILE_PATH)).toBe('{broken');
    expect(store.getStatus().state).toBe('recovery');
  });

  it('uses a valid backup when nested business JSON is corrupted', () => {
    const backup = { mylifeos_habits: '[]', mylifeos_daily_logs: '{}' };
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ mylifeos_habits: '{broken' }), [`${FILE_PATH}.bak`]: JSON.stringify(backup) });
    const store = createStore(fakeFs, createFakeScheduler());
    expect(store.snapshot()).toEqual(backup);
  });

  it.each(['[{}]', '[{"id":"h","name":"Habit","priority":"P1","dailyQuota":1e309,"defaultDurationMinutes":25,"effectiveType":"permanent"}]'])(
    'rejects malformed habit data even when the outer JSON parses: %s', raw => {
      const backup = { mylifeos_habits: '[]' };
      const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ mylifeos_habits: raw }), [`${FILE_PATH}.bak`]: JSON.stringify(backup) });
      const store = createStore(fakeFs, createFakeScheduler());
      expect(store.snapshot()).toEqual(backup);
      expect(() => store.set('mylifeos_habits', raw)).toThrow();
    },
  );

  it('preserves the previous backup when copying its replacement is interrupted', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: 'current' }), [`${FILE_PATH}.bak`]: JSON.stringify({ a: 'previous' }) });
    const store = createStore(fakeFs, createFakeScheduler());
    fakeFs.copyFileSync.mockImplementationOnce((_source, destination) => {
      fakeFs.files.set(String(destination), '{partial'); throw new Error('disk full');
    });
    store.set('a', 'new');
    expect(store.flush().ok).toBe(false);
    expect(JSON.parse(fakeFs.files.get(`${FILE_PATH}.bak`)!)).toEqual({ a: 'previous' });
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({ a: 'current' });
  });
  it('atomically replaces an existing file and keeps its previous complete version', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-durable-store-'));
    const filePath = path.join(tempDir, 'app-data.json');

    try {
      const store = new AppDataStore({ filePath, flushDelayMs: 60_000 });
      store.set('a', 'old');
      expect(store.flush()).toEqual({ ok: true });
      store.set('a', 'new');
      expect(store.flush()).toEqual({ ok: true });

      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({ a: 'new' });
      expect(JSON.parse(fs.readFileSync(`${filePath}.bak`, 'utf8'))).toEqual({ a: 'old' });
      expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    } finally {
      const resolvedTempDir = path.resolve(tempDir);
      const resolvedSystemTemp = path.resolve(os.tmpdir());
      if (resolvedTempDir.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
        fs.rmSync(resolvedTempDir, { recursive: true, force: true });
      }
    }
  });

  it('loads the existing file once and serves reads from memory', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: '1', b: '2' }) });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    expect(fakeFs.readFileSync).toHaveBeenCalledTimes(1);
    expect(store.get('a')).toBe('1');
    expect(store.get('b')).toBe('2');
    expect(store.get('missing')).toBeNull();
    expect(fakeFs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('batches multiple writes into a single debounced flush', () => {
    const fakeFs = createFakeFs();
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', '1');
    store.set('b', '2');
    store.set('a', '3');

    expect(fakeFs.writeFileSync).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(1);

    scheduler.runPending();

    expect(fakeFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({ a: '3', b: '2' });
  });

  it('flush() writes immediately and cancels the pending debounce', () => {
    const fakeFs = createFakeFs();
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', '1');
    expect(store.flush()).toEqual({ ok: true });

    expect(scheduler.pendingCount()).toBe(0);
    expect(fakeFs.writeFileSync).toHaveBeenCalledTimes(1);

    // A second flush with no new writes is a no-op.
    expect(store.flush()).toEqual({ ok: true });
    expect(fakeFs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('deletes keys when set to null and serves subsequent reads from cache', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: '1' }) });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', null);
    expect(store.get('a')).toBeNull();

    scheduler.runPending();
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({});
  });

  it('rolls back to the on-disk state when a flush fails', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: 'old' }) });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', 'new');
    store.set('b', 'added');

    fakeFs.writeFileSync.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = store.flush();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('disk full');
    expect(store.get('a')).toBe('old');
    expect(store.get('b')).toBeNull();
  });

  it('keeps the last complete file when a write is interrupted after writing partial content', () => {
    const durableContent = JSON.stringify({ a: 'old' });
    const fakeFs = createFakeFs({ [FILE_PATH]: durableContent });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', 'new');
    fakeFs.writeFileSync.mockImplementationOnce((target: unknown) => {
      fakeFs.files.set(String(target), '{"a":');
      throw new Error('process interrupted');
    });

    expect(store.flush()).toEqual({ ok: false, error: 'process interrupted' });
    expect(fakeFs.files.get(FILE_PATH)).toBe(durableContent);
    expect(store.get('a')).toBe('old');
  });

  it('keeps the last complete file when the temporary file cannot be flushed to disk', () => {
    const durableContent = JSON.stringify({ a: 'old' });
    const fakeFs = createFakeFs({ [FILE_PATH]: durableContent });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', 'new');
    fakeFs.fsyncSync.mockImplementationOnce(() => {
      throw new Error('fsync failed');
    });

    expect(store.flush()).toEqual({ ok: false, error: 'fsync failed' });
    expect(fakeFs.files.get(FILE_PATH)).toBe(durableContent);
    expect(store.get('a')).toBe('old');
  });

  it('reports a debounced flush failure to the application', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: JSON.stringify({ a: 'old' }) });
    const scheduler = createFakeScheduler();
    const onFlushError = jest.fn();
    const store = new AppDataStore({
      filePath: FILE_PATH,
      fileSystem: fakeFs,
      scheduleFlush: scheduler.scheduleFlush,
      cancelScheduledFlush: scheduler.cancelScheduledFlush,
      logger: { error: jest.fn() },
      onFlushError,
    });

    store.set('a', 'new');
    fakeFs.writeFileSync.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    scheduler.runPending();

    expect(onFlushError).toHaveBeenCalledWith({ ok: false, error: 'disk full' });
    expect(store.get('a')).toBe('old');
  });

  it('blocks writes when both durable copies are unreadable', () => {
    const fakeFs = createFakeFs({ [FILE_PATH]: '{ not json' });
    const logger = { error: jest.fn() };
    const scheduler = createFakeScheduler();

    const store = new AppDataStore({
      filePath: FILE_PATH,
      fileSystem: fakeFs,
      scheduleFlush: scheduler.scheduleFlush,
      cancelScheduledFlush: scheduler.cancelScheduledFlush,
      logger,
    });

    expect(store.get('anything')).toBeNull();
    expect(logger.error).toHaveBeenCalled();

    expect(() => store.set('a', '1')).toThrow();
    scheduler.runPending();
    expect(store.getStatus().state).toBe('recovery');
    expect(fakeFs.files.get(FILE_PATH)).toBe('{ not json');
  });

  it('loads the last complete backup when the primary file is corrupted', () => {
    const fakeFs = createFakeFs({
      [FILE_PATH]: '{"a":',
      [`${FILE_PATH}.bak`]: JSON.stringify({ a: 'durable-backup' }),
    });
    const logger = { error: jest.fn() };
    const scheduler = createFakeScheduler();

    const store = new AppDataStore({
      filePath: FILE_PATH,
      fileSystem: fakeFs,
      scheduleFlush: scheduler.scheduleFlush,
      cancelScheduledFlush: scheduler.cancelScheduledFlush,
      logger,
    });

    expect(store.get('a')).toBe('durable-backup');
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not replace a valid backup with a corrupted primary before an interrupted repair', () => {
    const durableBackup = JSON.stringify({ a: 'durable-backup' });
    const fakeFs = createFakeFs({
      [FILE_PATH]: '{"a":',
      [`${FILE_PATH}.bak`]: durableBackup,
    });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    store.set('a', 'repaired');
    fakeFs.renameSync.mockImplementationOnce(() => {
      throw new Error('process interrupted before replace');
    });

    expect(store.flush()).toEqual({ ok: false, error: 'process interrupted before replace' });
    expect(fakeFs.files.get(`${FILE_PATH}.bak`)).toBe(durableBackup);
    expect(store.get('a')).toBe('durable-backup');
  });

  it('preserves and loads a valid backup when the primary has the wrong JSON shape', () => {
    const durableBackup = JSON.stringify({ a: 'durable-backup' });
    const fakeFs = createFakeFs({
      [FILE_PATH]: 'null',
      [`${FILE_PATH}.bak`]: durableBackup,
    });
    const scheduler = createFakeScheduler();
    const store = createStore(fakeFs, scheduler);

    expect(store.get('a')).toBe('durable-backup');
    store.set('a', 'repaired');
    fakeFs.renameSync.mockImplementationOnce(() => {
      throw new Error('process interrupted before replace');
    });

    expect(store.flush()).toEqual({ ok: false, error: 'process interrupted before replace' });
    expect(fakeFs.files.get(`${FILE_PATH}.bak`)).toBe(durableBackup);
    expect(store.get('a')).toBe('durable-backup');
  });
});
