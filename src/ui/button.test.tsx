import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Button, IconButton } from './index';

describe('button primitives', () => {
  let container: HTMLDivElement;
  let root: Root;
  let submitted: number;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    submitted = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not submit the surrounding form unless asked', async () => {
    await act(async () => {
      root.render(
        <form onSubmit={(event) => { event.preventDefault(); submitted += 1; }}>
          <Button>取消</Button>
          <Button type="submit">保存</Button>
        </form>,
      );
    });

    const [cancel, save] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    expect(cancel.type).toBe('button');
    expect(save.type).toBe('submit');

    await act(async () => {
      cancel.click();
    });
    expect(submitted).toBe(0);

    await act(async () => {
      save.click();
    });
    expect(submitted).toBe(1);
  });

  it('blocks interaction and reports busy while loading', async () => {
    let clicked = 0;
    await act(async () => {
      root.render(<Button loading onClick={() => { clicked += 1; }}>保存</Button>);
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('svg')).not.toBeNull();

    await act(async () => {
      button.click();
    });
    expect(clicked).toBe(0);
  });

  it('renders a child element when asChild is set', async () => {
    await act(async () => {
      root.render(<Button asChild variant="secondary" size="lg"><a href="#target">打开</a></Button>);
    });

    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(link.className).toContain('ui-btn');
    expect(link.getAttribute('data-variant')).toBe('secondary');
    expect(link.getAttribute('href')).toBe('#target');
  });

  it('stretches with block and switches size tokens', async () => {
    await act(async () => {
      root.render(<Button block size="lg">提交</Button>);
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('data-block')).toBe('true');
    expect(button.getAttribute('data-size')).toBe('lg');
  });

  it('gives every icon button a name and a safe default type', async () => {
    await act(async () => {
      root.render(
        <form onSubmit={(event) => event.preventDefault()}>
          <IconButton aria-label="关闭"><span aria-hidden="true">x</span></IconButton>
          <IconButton aria-label="删除" variant="danger" tone="inherit" size="lg"><span aria-hidden="true">x</span></IconButton>
        </form>,
      );
    });

    const [close, remove] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    expect(close.type).toBe('button');
    expect(close.getAttribute('aria-label')).toBe('关闭');
    expect(close.getAttribute('data-size')).toBe('md');
    expect(remove.getAttribute('data-variant')).toBe('danger');
    expect(remove.getAttribute('data-tone')).toBe('inherit');
    expect(remove.getAttribute('data-size')).toBe('lg');
  });
});
