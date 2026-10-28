import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { MockInstance } from 'vitest';
import CommandPalette from './CommandPalette';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import * as storage from '../services/storage';

describe('command palette', () => {
  let container: HTMLDivElement;
  let root: Root;
  let searchSpy: MockInstance;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    setStorageItem(KEYS.LANGUAGE, 'zh');
    searchSpy = vi.spyOn(storage, 'searchTasks').mockReturnValue([]);
    vi.spyOn(storage, 'getGoals').mockReturnValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const mount = async (props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) => {
    const handlers = {
      open: true,
      onClose: vi.fn(),
      onSelectTask: vi.fn(),
      onCreateTask: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenHabits: vi.fn(),
      ...props,
    };
    await act(async () => {
      root.render(
        <LanguageProvider>
          <CommandPalette {...handlers} />
        </LanguageProvider>,
      );
    });
    return handlers;
  };

  const type = async (value: string) => {
    const input = container.querySelector('.ui-command-input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };

  const press = async (input: HTMLInputElement, key: string) => {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  };

  it('shows the shortcut actions when the query is empty', async () => {
    await mount();

    const labels = Array.from(container.querySelectorAll('.ui-command-item-label')).map((node) => node.textContent);
    expect(labels).toEqual(['新增任务', '设置', '习惯配置']);

    const first = container.querySelectorAll('.ui-command-item')[0] as HTMLElement;
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  it('filters as you type and searches in real time', async () => {
    await mount();
    const input = await type('设置');

    expect(searchSpy).toHaveBeenLastCalledWith({ query: '设置' });
    const labels = Array.from(container.querySelectorAll('.ui-command-item-label')).map((node) => node.textContent);
    expect(labels).toEqual(['设置']);
  });

  it('moves with the arrow keys and runs the active action on Enter', async () => {
    const handlers = await mount();
    const input = container.querySelector('.ui-command-input') as HTMLInputElement;

    await press(input, 'ArrowDown');
    await press(input, 'Enter');

    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(handlers.onCreateTask).not.toHaveBeenCalled();
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('wraps from the last action back to the first', async () => {
    const handlers = await mount();
    const input = container.querySelector('.ui-command-input') as HTMLInputElement;

    await press(input, 'ArrowUp');
    await press(input, 'Enter');

    expect(handlers.onOpenHabits).toHaveBeenCalledTimes(1);
  });

  it('explains the empty result instead of showing a blank list', async () => {
    await mount();
    await type('不存在的关键词');

    expect(container.querySelector('.ui-command-empty')?.textContent).toContain('输入任务名、目标或备注试试');
  });
});
