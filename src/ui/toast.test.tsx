import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Toaster, clearToasts, dismissToast, toast } from './toast';

describe('toast queue', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    clearToasts();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearToasts();
  });

  const renderToaster = async () => {
    await act(async () => { root.render(<Toaster />); });
  };

  it('renders nothing while the queue is empty', async () => {
    await renderToaster();
    expect(container.querySelector('[data-slot="toaster"]')).toBeNull();
  });

  it('keeps at most three toasts and drops the oldest', async () => {
    await renderToaster();
    await act(async () => {
      toast({ message: 'one', duration: 0 });
      toast({ message: 'two', duration: 0 });
      toast({ message: 'three', duration: 0 });
      toast({ message: 'four', duration: 0 });
    });

    const items = Array.from(container.querySelectorAll('[data-slot="toast"]'));
    expect(items).toHaveLength(3);
    expect(items.map((node) => node.textContent)).toEqual(['two', 'three', 'four']);
  });

  it('replaces a toast that reuses an id instead of stacking it', async () => {
    await renderToaster();
    await act(async () => {
      toast({ id: 'undo', message: '任务 A', duration: 0 });
      toast({ id: 'undo', message: '任务 B', duration: 0 });
    });

    const items = container.querySelectorAll('[data-slot="toast"]');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('任务 B');
  });

  it('runs the action and dismisses the toast', async () => {
    const onClick = vi.fn();
    await renderToaster();
    await act(async () => {
      toast({ message: '已删除', action: { label: '撤销', onClick }, duration: 0 });
    });

    const action = container.querySelector('.ui-toast-action') as HTMLButtonElement;
    expect(action.textContent).toBe('撤销');

    await act(async () => { action.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 220); }); });
    expect(container.querySelector('[data-slot="toast"]')).toBeNull();
  });

  it('announces assertive toasts as alerts', async () => {
    await renderToaster();
    await act(async () => {
      toast({ message: '任务已删除', assertive: true, duration: 0 });
      toast({ message: '已保存' });
    });

    const items = Array.from(container.querySelectorAll('[data-slot="toast"]'));
    expect(items[0].getAttribute('role')).toBe('alert');
    expect(items[0].getAttribute('aria-live')).toBe('assertive');
    expect(items[1].getAttribute('role')).toBe('status');
  });

  it('auto-dismisses after the duration and honours a manual dismiss', async () => {
    await renderToaster();
    await act(async () => { toast({ message: '短暂', duration: 60 }); });
    expect(container.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);

    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 320); }); });
    expect(container.querySelectorAll('[data-slot="toast"]')).toHaveLength(0);

    await act(async () => { toast({ id: 'manual', message: '手动', duration: 0 }); });
    await act(async () => { dismissToast('manual'); });
    expect(container.querySelectorAll('[data-slot="toast"]')).toHaveLength(0);
  });
});
