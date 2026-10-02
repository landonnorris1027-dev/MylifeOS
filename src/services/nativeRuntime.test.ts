const mockNative = { load: jest.fn(), write: jest.fn(), timer: jest.fn(), timers: jest.fn(), saveDocument: jest.fn() };
export {};
jest.mock('@capacitor/core', () => ({ registerPlugin: () => mockNative }));

describe('Android durable storage boundary', () => {
  let runtime: typeof import('./nativeRuntime');
  let durable: { revision: number; entries: Record<string, string>; sessions: any[] };
  beforeEach(async () => {
    jest.resetModules(); jest.clearAllMocks(); localStorage.clear();
    durable = { revision: 0, entries: { goals: 'old', habits: 'old' }, sessions: [] };
    mockNative.load.mockImplementation(async () => ({ ...durable, entries: { ...durable.entries } }));
    mockNative.write.mockImplementation(async ({ entries, expectedRevision }) => {
      if (expectedRevision !== durable.revision) throw new Error('Revision conflict');
      durable = { ...durable, revision: durable.revision + 1, entries: { ...durable.entries, ...entries } };
      return durable;
    });
    mockNative.timers.mockImplementation(async () => durable);
    runtime = require('./nativeRuntime');
    await runtime.bootstrapNativeStorage(['goals', 'habits']);
  });
  it('serializes rapid edits and waits for their acknowledgements', async () => {
    const first = runtime.setNativeItem('goals', 'first');
    const last = runtime.setNativeItem('goals', 'last');
    expect(runtime.getNativeStatus().state).toBe('saving');
    await Promise.all([first, last]); await runtime.flushNativeWrites();
    expect(durable.entries.goals).toBe('last');
    expect(mockNative.write.mock.calls.map(([input]) => input.expectedRevision)).toEqual([0, 1]);
    expect(runtime.getNativeStatus()).toMatchObject({ state: 'saved', hasPending: false });
  });
  it('freezes failed edits, retains the latest candidate and retries against a fresh revision', async () => {
    mockNative.write.mockRejectedValueOnce(new Error('disk full'));
    const first = runtime.setNativeItem('goals', 'first');
    const last = runtime.setNativeItem('goals', 'last');
    await expect(first).rejects.toThrow('disk full');
    await expect(last).rejects.toThrow();
    await expect(runtime.flushNativeWrites()).rejects.toThrow('disk full');
    expect(runtime.getNativeItem('goals')).toBe('old');
    expect(runtime.getNativePending().goals).toBe('last');
    expect(() => runtime.setNativeItem('goals', 'blocked')).toThrow('read-only');
    durable.revision = 8;
    await runtime.retryNativeWrites();
    expect(durable.entries.goals).toBe('last');
    expect(runtime.getNativeStatus().state).toBe('saved');
  });
  it('commits a full import once and leaves all old keys durable on failure', async () => {
    mockNative.write.mockRejectedValueOnce(new Error('atomic write failed'));
    await expect(runtime.commitNativeEntries({ goals: 'new', habits: 'new' })).rejects.toThrow();
    expect(durable.entries).toEqual({ goals: 'old', habits: 'old' });
    expect(mockNative.write).toHaveBeenCalledWith(expect.objectContaining({ replace: true, entries: { goals: 'new', habits: 'new' } }));
    expect(runtime.getNativePending()).toMatchObject({ goals: 'new', habits: 'new' });
  });
  it('passes dirty legacy values without deleting rollback sources', async () => {
    localStorage.setItem('goals', 'pending legacy');
    localStorage.setItem('mylifeos_native_dirty:goals', '1');
    await runtime.bootstrapNativeStorage(['goals']);
    expect(mockNative.load).toHaveBeenLastCalledWith({ legacy: { goals: 'pending legacy' }, dirty: ['goals'] });
    expect(localStorage.getItem('mylifeos_native_dirty:goals')).toBe('1');
  });
  it('never reports a failed session write or query as a running/empty session', async () => {
    mockNative.timer.mockRejectedValueOnce(new Error('timer save failed'));
    await expect(runtime.nativeTimerOperation('start', 'session')).rejects.toThrow('timer save failed');
    expect(runtime.getNativeStatus().state).toBe('error');
    await runtime.retryNativeWrites();
    mockNative.timers.mockRejectedValueOnce(new Error('query failed'));
    await expect(runtime.refreshNativeTimers()).rejects.toThrow('query failed');
    expect(runtime.getNativeStatus().state).toBe('error');
  });
  it('enters recovery when startup cannot read data', async () => {
    mockNative.load.mockRejectedValueOnce(new Error('corrupt originals'));
    await runtime.bootstrapNativeStorage(['goals']);
    expect(runtime.getNativeStatus()).toMatchObject({ state: 'recovery', error: 'corrupt originals' });
    await expect(runtime.retryNativeWrites()).rejects.toThrow('validated backup');
  });
  it('serializes native timer queries with edits to avoid acknowledgement races', async () => {
    const edit = runtime.setNativeItem('goals', 'new');
    const query = runtime.refreshNativeTimers();
    await Promise.all([edit, query]);
    expect(runtime.getNativeItem('goals')).toBe('new');
    expect(mockNative.write.mock.invocationCallOrder[0]).toBeLessThan(mockNative.timers.mock.invocationCallOrder[0]);
  });
});
