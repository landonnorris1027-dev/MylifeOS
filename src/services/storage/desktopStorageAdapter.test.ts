import { DesktopBridge, DesktopSnapshot, DesktopStorageAdapter } from './desktopStorageAdapter';
describe('desktop async storage boundary', () => {
  const setup = async () => {
    let snapshot: DesktopSnapshot = { revision: 0, entries: { probe: 'old' } };
    const bridge: DesktopBridge = {
      read: vi.fn(async () => ({ ...snapshot, entries: { ...snapshot.entries } })),
      write: vi.fn(async input => {
        if ((snapshot.entries[input.key] ?? null) !== input.expectedValue) return { ok: false, error: 'Revision conflict' };
        snapshot = { revision: snapshot.revision + 1, entries: { ...snapshot.entries, [input.key]: input.value } };
        return { ok: true };
      }),
      flush: vi.fn(async () => ({ ok: true, state: 'saved' as const, hasPending: false })),
      retry: vi.fn(async () => ({ ok: true, state: 'saved' as const, hasPending: false })),
      status: vi.fn(async () => ({ state: 'saved' as const, hasPending: false })),
      subscribe: () => () => undefined, subscribeChanges: () => () => undefined,
    };
    const adapter = new DesktopStorageAdapter(bridge); await adapter.initialize();
    return { adapter, bridge, changeExternally: () => { snapshot.entries.probe = 'external'; snapshot.revision++; } };
  };
  it('serializes rapid edits and distinguishes acceptance from durable flush', async () => {
    const { adapter, bridge } = await setup();
    const first = adapter.set('probe', 'first'), last = adapter.set('probe', 'last');
    expect(adapter.status().state).toBe('saving');
    await Promise.all([first, last]); expect(adapter.status().state).toBe('saving');
    expect(vi.mocked(bridge.write).mock.calls.map(([input]) => input.expectedValue)).toEqual(['old', 'first']);
    await adapter.flush(); expect(adapter.get('probe')).toBe('last'); expect(adapter.status().state).toBe('saved');
  });
  it('retains failed edits for export/retry while exposing durable data', async () => {
    const { adapter, bridge } = await setup();
    vi.mocked(bridge.write).mockRejectedValueOnce(Error('disk failed'));
    await expect(adapter.set('probe', 'candidate')).rejects.toThrow();
    await expect(adapter.flush()).rejects.toThrow('disk failed');
    expect(adapter.get('probe')).toBe('old'); expect(adapter.pending().probe).toBe('candidate');
    await adapter.retry(); expect(adapter.get('probe')).toBe('candidate'); expect(adapter.status().state).toBe('saved');
  });
  it('never overwrites an external completion when an earlier edit conflicts', async () => {
    const { adapter, changeExternally } = await setup(); changeExternally();
    await expect(adapter.set('probe', 'stale')).rejects.toThrow('Revision conflict');
    await expect(adapter.retry()).rejects.toThrow('Data changed');
    expect(adapter.get('probe')).toBe('external'); expect(adapter.pending().probe).toBe('stale');
    await adapter.discardLocalCandidate(); expect(adapter.get('probe')).toBe('external');
    expect(adapter.status().state).toBe('saved');
  });
  it('exports only local differences over a pending main-process completion', async () => {
    const { adapter, changeExternally } = await setup();
    expect(adapter.pendingOverrides()).toEqual({});
    const pendingCompletion = { probe: 'old', mylifeos_daily_logs: 'completed', mylifeos_focus_sessions: 'session-record' };
    expect({ ...pendingCompletion, ...adapter.pendingOverrides() }).toEqual(pendingCompletion);
    changeExternally(); await expect(adapter.set('probe', 'local edit')).rejects.toThrow();
    expect({ ...pendingCompletion, ...adapter.pendingOverrides() }).toEqual({ ...pendingCompletion, probe: 'local edit' });
  });
  it('dispatches both rapid edits before the first acknowledgement and waits for both on quit', async () => {
    const { adapter, bridge } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = bridge.write;
    vi.mocked(bridge.write).mockImplementationOnce(async request => { await gate; return original(request); });
    const first = adapter.set('one', 'first'), second = adapter.set('two', 'second');
    expect(bridge.write).toHaveBeenCalledTimes(2);
    let finished = false;
    const closing = adapter.prepareQuit().then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false);
    expect(() => adapter.set('late', 'edit')).toThrow('closing');
    release(); await Promise.all([first, second, closing]);
    expect(adapter.status().state).toBe('saved');
  });
  it('blocks quit when a renderer CAS conflict remains although main storage is saved', async () => {
    const { adapter, changeExternally } = await setup(); changeExternally();
    await expect(adapter.set('probe', 'local')).rejects.toThrow();
    await expect(adapter.prepareQuit()).rejects.toThrow('Revision conflict');
    expect(adapter.pendingOverrides()).toEqual({ probe: 'local' });
    adapter.cancelQuit(); await adapter.discardLocalCandidate();
    await expect(adapter.prepareQuit()).resolves.toBeUndefined();
  });
});
