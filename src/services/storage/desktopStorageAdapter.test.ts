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
  });
});
