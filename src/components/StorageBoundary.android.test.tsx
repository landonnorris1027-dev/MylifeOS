import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import StorageBoundary from './StorageBoundary';
import ProfileStats from './ProfileStats';
import ContributionGraph from './ContributionGraph';
import { LanguageProvider } from '../contexts/LanguageContext';
import { bootstrapNativeStorage, flushNativeWrites, getNativeItem, setNativeItem } from '../services/nativeRuntime';

const native = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn(), timers: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => native,
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove() {} }) } }));
vi.mock('../services/platformFiles', () => ({ saveJSONFile: vi.fn(async () => 'backup.json') }));
vi.mock('../services/electronIPC', () => ({ electronIPC: {} }));

describe('Android save failure recovery controls', () => {
  let root: Root;
  let container: HTMLDivElement;
  let durable: { revision: number; entries: Record<string, string>; sessions: [] };
  const View = () => {
    const [label] = useState(() => JSON.parse(getNativeItem('mylifeos_goals') || '[]')[0]?.name || 'empty');
    return <button>{label}</button>;
  };
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    durable = { revision: 0, entries: { mylifeos_lang: 'en', mylifeos_goals: '[{"id":"goal","name":"old"}]' }, sessions: [] };
    native.load.mockImplementation(async () => structuredClone(durable));
    native.write.mockImplementation(async ({ entries, expectedRevision }) => {
      if (expectedRevision !== durable.revision) throw new Error('Native data changed; reload before retrying');
      durable = { ...durable, revision: durable.revision + 1, entries: { ...durable.entries, ...entries } };
      return structuredClone(durable);
    });
    await bootstrapNativeStorage(['mylifeos_lang', 'mylifeos_goals']);
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root.render(<LanguageProvider><StorageBoundary><View /></StorageBoundary></LanguageProvider>));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('keeps retry clickable outside the locked app and restores editing with pending data intact', async () => {
    expect(container.querySelector('section[aria-label="Data save status"]')).toBeNull();
    native.write.mockRejectedValueOnce(new Error('Native data changed; reload before retrying'));
    await act(async () => {
      await expect(setNativeItem('mylifeos_goals', '[{"id":"goal","name":"pending"}]')).rejects.toThrow('Native data changed');
    });
    expect(container.querySelector('fieldset')?.hasAttribute('inert')).toBe(true);
    expect(container.textContent).toContain('Reason: Native data changed; reload before retrying');
    const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Retry saving')!;
    expect(retry.disabled).toBe(false);
    expect(retry.closest('[inert], fieldset')).toBeNull();
    await act(async () => { retry.click(); await flushNativeWrites(); });
    expect(container.querySelector('fieldset')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
    expect(container.querySelector('section[aria-label="Data save status"]')).toBeNull();
    expect(container.textContent).toContain('pending');
    expect(JSON.parse(durable.entries.mylifeos_goals)[0].name).toBe('pending');
  });

  it('uses the current shared Windows profile and annual chart on Android', async () => {
    await act(async () => root.render(<LanguageProvider><StorageBoundary><ProfileStats /><ContributionGraph /></StorageBoundary></LanguageProvider>));
    expect(container.textContent).toContain('Measured focus time');
    expect(container.textContent).toContain('Period review');
    expect(container.querySelectorAll('.focus-history-column')).toHaveLength(20);
    expect(container.querySelector('.profile-activity-compact')).not.toBeNull();
    expect(container.textContent).not.toContain('Current Streak');
    expect(container.querySelector('section[aria-label="Data save status"]')).toBeNull();
  });
});
