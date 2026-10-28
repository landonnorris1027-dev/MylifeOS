import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';
import { LanguageProvider } from '../contexts/LanguageContext';
import { Toaster, clearToasts } from '../ui';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';

const render = async (root: Root, node: React.ReactElement) => {
  await act(async () => {
    root.render(<LanguageProvider>{node}</LanguageProvider>);
  });
};

describe('dialog action buttons', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    clearToasts();
    setStorageItem(KEYS.LANGUAGE, 'zh');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the destructive confirm dialog focused on cancel', async () => {
    await render(root, <ConfirmModal isOpen message="删除后不可恢复" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    // useModalBehavior moves focus in a macrotask; yield once so it has run.
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons.every((node) => node.className.includes('ui-btn'))).toBe(true);

    const cancel = container.querySelector('[data-modal-cancel]') as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    expect(cancel.getAttribute('data-variant')).toBe('secondary');
    expect(document.activeElement).toBe(cancel);
  });

  it('gives the alert dialog a single named primary action', async () => {
    const onClose = vi.fn();
    await render(root, <AlertModal isOpen message="备份失败" onClose={onClose} />);

    const primary = container.querySelector('.ui-btn') as HTMLButtonElement;
    expect(primary).not.toBeNull();
    expect(primary.getAttribute('data-size')).toBe('lg');
    expect(primary.getAttribute('data-block')).toBe('true');

    await act(async () => { primary.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes success alerts into the toast queue instead of a dialog', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <LanguageProvider>
          <AlertModal isOpen tone="success" message="已保存" onClose={onClose} />
          <Toaster />
        </LanguageProvider>,
      );
    });

    expect(onClose).toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();

    const toastEl = container.querySelector('[data-slot="toast"]') as HTMLElement;
    expect(toastEl).not.toBeNull();
    expect(toastEl.textContent).toContain('已保存');
    expect(toastEl.getAttribute('role')).toBe('status');

    const close = toastEl.querySelector('[data-slot="icon-button"]') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('关闭');
  });
});
