import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import StorageBoundary from './StorageBoundary';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { StorageStatus } from '../main/storage-contract';
import * as platformFiles from '../services/platformFiles';

describe('desktop save state UI', () => {
  let root: Root;
  let container: HTMLDivElement;
  let statusListener: (status: StorageStatus) => void;
  let status: StorageStatus;
  let invoke: jest.Mock;
  let durableLabel: string;
  const interact = jest.fn();
  const View = () => { const [value] = useState(durableLabel); return <><button>{value}</button><div role="button" tabIndex={0} draggable onClick={interact} onKeyDown={interact} onDragStart={interact}>Custom task</div></>; };
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    status = { state: 'saved', hasPending: false };
    durableLabel = 'Current durable task';
    invoke = jest.fn(async channel => {
      if (channel === 'storage-status') return status;
      if (channel === 'storage-pending-snapshot') return {
        mylifeos_habits: '[]', mylifeos_daily_logs: '{}', mylifeos_goals: '[{"id":"pending","name":"Pending goal"}]', mylifeos_lang: 'en',
      };
      if (channel === 'storage-retry') {
        statusListener({ state: 'saved', hasPending: false }); return { ok: true };
      }
      throw new Error(channel);
    });
    window.electronAPI = {
      invoke, sendSync: jest.fn((_channel, payload) => payload.key === 'mylifeos_lang' ? 'en' : null),
      on: jest.fn((_channel, callback) => { statusListener = callback; return () => undefined; }),
    } as unknown as Window['electronAPI'];
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount()); container.remove(); delete window.electronAPI; jest.restoreAllMocks();
  });
  const render = async () => { await act(async () => root.render(<LanguageProvider><StorageBoundary><View /></StorageBoundary></LanguageProvider>)); };

  it('reloads durable UI after failure and allows retry without losing the pending snapshot', async () => {
    await render();
    durableLabel = 'Rolled back task';
    await act(async () => statusListener({ state: 'error', hasPending: true, error: 'disk full' }));
    expect(container.textContent).toContain('Rolled back task');
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    const custom = container.querySelector('[role=button]')!;
    act(() => {
      custom.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      custom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      custom.dispatchEvent(new Event('dragstart', { bubbles: true }));
    });
    expect(interact).not.toHaveBeenCalled();
    expect(container.querySelector('fieldset')?.hasAttribute('inert')).toBe(true);
    durableLabel = 'Retried task';
    await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Retry saving')!.click());
    expect(container.textContent).toContain('Retried task');
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
  });

  it('exports the pending snapshot rather than the rolled-back data', async () => {
    jest.spyOn(platformFiles, 'saveJSONFile').mockResolvedValue('D:/test/backup.json');
    await render();
    await act(async () => statusListener({ state: 'error', hasPending: true }));
    await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Export pending data')!.click());
    const json = JSON.parse((platformFiles.saveJSONFile as jest.Mock).mock.calls[0][0]);
    expect(json.goals[0].id).toBe('pending');
    expect(json.schemaVersion).toBe(6);
  });

  it('never mounts business UI over unreadable data', async () => {
    status = { state: 'recovery', hasPending: false };
    await render();
    expect(container.textContent).not.toContain('Current durable task');
    expect(container.textContent).toContain('writes are blocked');
    expect(container.querySelector('input[type=file]')).not.toBeNull();
  });
});
