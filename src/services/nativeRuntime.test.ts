const mockNative = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn(), timer: vi.fn(), timers: vi.fn(), stopForRecovery: vi.fn(), saveDocument: vi.fn() }));
export {};
vi.mock('@capacitor/core', () => ({ registerPlugin: () => mockNative }));

describe('Android durable storage boundary', () => {
  let runtime: typeof import('./nativeRuntime');
  let durable: { revision: number; entries: Record<string, string>; sessions: any[] };
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
    durable = { revision: 0, entries: { goals: 'old', habits: 'old' }, sessions: [] };
    mockNative.load.mockImplementation(async () => ({ ...durable, entries: { ...durable.entries } }));
    mockNative.write.mockImplementation(async ({ entries, expectedRevision }) => {
      if (expectedRevision !== durable.revision) throw new Error('Revision conflict');
      durable = { ...durable, revision: durable.revision + 1, entries: { ...durable.entries, ...entries } };
      return durable;
    });
    mockNative.timers.mockImplementation(async () => durable);
    mockNative.timer.mockImplementation(async ({ action, timerId }) => {
      durable = { ...durable, revision: durable.revision + 1, sessions: durable.sessions.map(session => session.timerId !== timerId
        ? session : { ...session, isActive: action === 'resume', state: action === 'resume' ? 'running' : 'paused' }) };
      return durable;
    });
    runtime = await import('./nativeRuntime');
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
    const retry = runtime.retryNativeWrites(); await Promise.resolve();
    expect(runtime.getNativeStatus().transaction).toBe(true);
    expect(() => runtime.setNativeItem('goals', 'overlap')).toThrow();
    await retry;
    expect(mockNative.write).toHaveBeenLastCalledWith(expect.objectContaining({ replace: true }));
    expect(runtime.getNativeStatus()).toMatchObject({ state: 'saved', transaction: false });
  });
  it('passes dirty legacy values without deleting rollback sources', async () => {
    localStorage.setItem('goals', 'pending legacy');
    localStorage.setItem('mylifeos_native_dirty:goals', '1');
    await runtime.bootstrapNativeStorage(['goals']);
    expect(mockNative.load).toHaveBeenLastCalledWith({ legacy: { goals: 'pending legacy' }, dirty: ['goals'] });
    expect(localStorage.getItem('mylifeos_native_dirty:goals')).toBe('1');
  });
  it('locks edits during an entire replacement and waits for queued native queries before reporting saved', async () => {
    let finishWrite: (result: typeof durable) => void = () => undefined;
    let finishQuery: (result: typeof durable) => void = () => undefined;
    mockNative.write.mockImplementationOnce(() => new Promise(resolve => {
      finishWrite = result => { durable = result; resolve(result); };
    }));
    mockNative.timers.mockImplementationOnce(() => new Promise(resolve => { finishQuery = resolve; }));
    const commit = runtime.commitNativeEntries({ goals: 'imported', habits: 'imported' });
    await Promise.resolve();
    expect(runtime.getNativeStatus().transaction).toBe(true);
    expect(() => runtime.setNativeItem('goals', 'A')).toThrow('whole-data');
    const query = runtime.refreshNativeTimers();
    finishWrite({ ...durable, revision: 1, entries: { goals: 'imported', habits: 'imported' } });
    await commit; await Promise.resolve();
    expect(runtime.getNativeStatus().state).toBe('saving');
    finishQuery(durable); await query;
    expect(runtime.getNativeStatus()).toMatchObject({ state: 'saved', transaction: false });
    await runtime.setNativeItem('goals', 'imported+A');
    expect(durable.entries.goals).toBe('imported+A');
  });
  it('loads intact native data even when the WebView snapshot cache is damaged', async () => {
    localStorage.setItem('mylifeos_business_snapshot', '{broken cache');
    localStorage.setItem('goals', 'legacy fallback');
    await runtime.bootstrapNativeStorage(['goals']);
    expect(mockNative.load).toHaveBeenLastCalledWith({ legacy: { goals: 'legacy fallback' }, dirty: [] });
    expect(runtime.getNativeStatus().state).toBe('saved');
    expect(runtime.getNativeItem('goals')).toBe('old');
    expect(localStorage.getItem('mylifeos_business_snapshot')).toBe('{broken cache');
  });
  it('never reports a failed session write or query as a running/empty session', async () => {
    mockNative.timer.mockRejectedValueOnce(new Error('timer save failed'));
    await expect(runtime.nativeTimerOperation('start', 'session')).rejects.toThrow('timer save failed');
    expect(runtime.getNativeStatus().state).toBe('error');
    await runtime.retryNativeWrites();
    expect(mockNative.timer).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'start', timerId: 'session' }));
    mockNative.timers.mockRejectedValueOnce(new Error('query failed'));
    await expect(runtime.refreshNativeTimers()).rejects.toThrow('query failed');
    expect(runtime.getNativeStatus().state).toBe('error');
  });
  it('enters recovery when startup cannot read data', async () => {
    mockNative.load.mockRejectedValueOnce(new Error('corrupt originals'));
    await runtime.bootstrapNativeStorage(['goals']);
    expect(runtime.getNativeStatus()).toMatchObject({ state: 'recovery', error: 'corrupt originals' });
    await expect(runtime.retryNativeWrites()).rejects.toThrow('validated backup');
    mockNative.timers.mockRejectedValueOnce(new Error('still corrupt'));
    await expect(runtime.refreshNativeTimers(true)).rejects.toThrow('still corrupt');
    expect(runtime.getNativeStatus().state).toBe('recovery');
    mockNative.stopForRecovery.mockResolvedValueOnce({ recoveryStopped: true });
    await runtime.stopNativeForRecovery();
    expect(runtime.getNativeStatus().state).toBe('recovery');
  });
  it('serializes native timer queries with edits to avoid acknowledgement races', async () => {
    const edit = runtime.setNativeItem('goals', 'new');
    const query = runtime.refreshNativeTimers();
    await Promise.all([edit, query]);
    expect(runtime.getNativeItem('goals')).toBe('new');
    expect(runtime.getNativeStatus()).toMatchObject({ state: 'saved', hasPending: false });
    expect(mockNative.write.mock.invocationCallOrder[0]).toBeLessThan(mockNative.timers.mock.invocationCallOrder[0]);
  });
  it('preserves edits queued while a stale native query is in flight', async () => {
    let finishQuery: (result: typeof durable) => void = () => undefined;
    let finishWrite: (result: typeof durable) => void = () => undefined;
    mockNative.timers.mockImplementationOnce(() => new Promise(resolve => { finishQuery = resolve; }));
    const query = runtime.refreshNativeTimers(); await Promise.resolve();
    mockNative.write.mockImplementationOnce(({ entries }) => new Promise(resolve => { finishWrite = result => { durable = result; resolve(result); }; }));
    const editA = runtime.setNativeItem('goals', 'A');
    finishQuery({ ...durable }); await query; await Promise.resolve();
    expect(runtime.getNativeItem('goals')).toBe('A');
    const editB = runtime.setNativeItem('goals', `${runtime.getNativeItem('goals')}+B`);
    finishWrite({ ...durable, revision: 1, entries: { ...durable.entries, goals: 'A' } });
    await Promise.all([editA, editB]);
    expect(durable.entries.goals).toBe('A+B');
  });
  it('retries a pause idempotently after the native commit succeeded but acknowledgement was lost', async () => {
    durable.sessions = [{ timerId: 's', isActive: true, state: 'running' }];
    await runtime.bootstrapNativeStorage([]);
    mockNative.timer.mockImplementationOnce(async () => {
      durable = { ...durable, revision: durable.revision + 1, sessions: [{ timerId: 's', isActive: false, state: 'paused' }] };
      throw new Error('acknowledgement lost');
    });
    await expect(runtime.nativeTimerOperation('toggle', 's')).rejects.toThrow();
    expect(runtime.getNativeTimerPending()).toMatchObject({ action: 'pause', timerId: 's' });
    await runtime.retryNativeWrites();
    expect(mockNative.timer).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'pause' }));
    expect(durable.sessions[0].isActive).toBe(false);
  });
});
