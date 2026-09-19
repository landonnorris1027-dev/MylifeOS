import { AppDataStore } from './main/app-data-store';

const FILE_PATH = 'D:/fake/userData/app-data.json';

interface FakeFs {
  existsSync: jest.Mock;
  mkdirSync: jest.Mock;
  readFileSync: jest.Mock;
  writeFileSync: jest.Mock;
  files: Map<string, string>;
}

const createFakeFs = (initialFiles: Record<string, string> = {}): FakeFs => {
  const files = new Map<string, string>(Object.entries(initialFiles));

  return {
    files,
    existsSync: jest.fn((target: unknown) => {
      const targetPath = String(target);
      return files.has(targetPath) || !targetPath.endsWith('.json');
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

  it('recovers from a corrupted file by starting empty', () => {
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

    store.set('a', '1');
    scheduler.runPending();
    expect(JSON.parse(fakeFs.files.get(FILE_PATH)!)).toEqual({ a: '1' });
  });
});
