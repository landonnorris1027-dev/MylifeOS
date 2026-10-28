import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Dialog } from './dialog';
import { IconButton } from './button';

const flushFocus = async () => {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

describe('dialog shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders nothing while closed', async () => {
    await act(async () => {
      root.render(<Dialog open={false} onClose={vi.fn()} title="标题">正文</Dialog>);
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('names the panel from its title and exposes a labelled close button', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <Dialog open onClose={onClose} title="临时任务" closeLabel="关闭">
          <p>正文</p>
        </Dialog>,
      );
    });

    const panel = container.querySelector('[role="dialog"]') as HTMLElement;
    const heading = container.querySelector('h2') as HTMLHeadingElement;
    const labelledBy = panel.getAttribute('aria-labelledby');

    expect(labelledBy).toBe(heading.id);
    expect(heading.textContent).toContain('临时任务');
    expect(panel.getAttribute('aria-label')).toBeNull();

    const close = container.querySelector('[data-slot="icon-button"]') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('关闭');
    await act(async () => { close.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to aria-label when there is no visible title', async () => {
    await act(async () => {
      root.render(<Dialog open onClose={vi.fn()} ariaLabel="安排任务" variant="notice">内容</Dialog>);
    });

    const panel = container.querySelector('[role="alertdialog"], [role="dialog"]') as HTMLElement;
    expect(panel.getAttribute('aria-label')).toBe('安排任务');
    expect(container.querySelector('h2')).toBeNull();
  });

  it('lets a caller replace the close control', async () => {
    const reset = vi.fn();
    await act(async () => {
      root.render(
        <Dialog
          open
          onClose={vi.fn()}
          title="习惯配置"
          headerAction={<IconButton aria-label="重置并关闭" onClick={reset}>x</IconButton>}
        >
          <p>正文</p>
        </Dialog>,
      );
    });

    const buttons = container.querySelectorAll('[data-slot="icon-button"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('重置并关闭');
  });

  it('closes on Escape and moves focus inside on open', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <Dialog open onClose={onClose} title="标题">
          <button>动作</button>
        </Dialog>,
      );
    });
    await flushFocus();

    const panel = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the panel as a direct child so the entry animation can target it', async () => {
    await act(async () => {
      root.render(<Dialog open onClose={vi.fn()} title="标题">正文</Dialog>);
    });

    const overlay = container.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    expect(overlay.className).toContain('motion-modal-overlay');
    expect(overlay.firstElementChild?.getAttribute('role')).toBe('dialog');
  });
});
