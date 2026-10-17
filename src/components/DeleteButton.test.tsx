import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import DeleteButton from './DeleteButton';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';

describe('inline deletion', () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); setStorageItem(KEYS.LANGUAGE, 'zh');
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const click = async (label: string) => { await act(async () => { button(label).click(); }); };
  const render = async (remove: () => void | boolean | Promise<void | boolean>, parentClick = vi.fn()) => {
    await act(async () => root.render(<LanguageProvider><div onClick={parentClick}>
      <DeleteButton label="删除测试任务" onConfirm={remove} />
    </div></LanguageProvider>));
  };
  it('requires confirmation; cancel, outside pointer and Escape preserve the item', async () => {
    const remove = vi.fn(), parent = vi.fn(); await render(remove, parent);
    expect(button('确认删除测试任务').disabled).toBe(true);
    await click('删除测试任务'); expect(remove).not.toHaveBeenCalled();
    await click('取消删除');
    expect(document.activeElement).toBe(button('删除测试任务'));
    await click('删除测试任务');
    await act(async () => { button('确认删除测试任务').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(button('删除测试任务').getAttribute('aria-expanded')).toBe('false');
    await click('删除测试任务');
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(remove).not.toHaveBeenCalled(); expect(parent).not.toHaveBeenCalled();
    expect(button('确认删除测试任务').closest('[inert]')).not.toBeNull();
  });
  it('persists once during repeated confirmation and exposes pending then success', async () => {
    let finish!: (value: boolean) => void;
    const remove = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    await render(remove); await click('删除测试任务');
    await act(async () => { button('确认删除测试任务').click(); button('确认删除测试任务').click(); });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('正在删除');
    expect(button('取消删除').disabled).toBe(true);
    await act(async () => { finish(true); });
    expect(container.textContent).toContain('已删除');
    expect(button('删除测试任务').getAttribute('aria-expanded')).toBe('false');
  });
  it.each(['rejected', 'false'] as const)('keeps the item and permits retry after a %s persistence result', async kind => {
    const remove = vi.fn<() => Promise<boolean>>().mockImplementationOnce(() => kind === 'rejected' ? Promise.reject(new Error('write failed')) : Promise.resolve(false)).mockResolvedValue(true);
    await render(remove); await click('删除测试任务'); await click('确认删除测试任务');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('删除未完成');
    expect(button('删除测试任务').getAttribute('aria-expanded')).toBe('true');
    await click('确认删除测试任务'); expect(remove).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
