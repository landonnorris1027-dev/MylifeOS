import React, { useState } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';
import { useModalBehavior } from './useModalBehavior';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
  closeOnEscape?: boolean;
  initialFocusSelector?: string;
  onClose: () => void;
}

const Harness: React.FC<HarnessProps> = ({ onClose, closeOnEscape, initialFocusSelector }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { containerRef, dialogProps } = useModalBehavior({
    isOpen,
    onClose,
    closeOnEscape,
    initialFocusSelector,
  });

  return (
    <div>
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>
        open
      </button>
      {isOpen && (
        <div className="overlay">
          <div {...dialogProps} ref={containerRef} tabIndex={-1}>
            <input data-testid="first-input" />
            <button data-testid="middle-button">middle</button>
            <button data-testid="last-button" onClick={() => setIsOpen(false)}>
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const pressKey = (key: string, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
};

describe('useModalBehavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const openModal = () => {
    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="trigger"]')!;
    trigger.focus();
    act(() => {
      trigger.click();
    });
    // Flush the deferred focus timeout inside act.
    act(() => {
      jest.runAllTimers();
    });
    return trigger;
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('moves focus into the dialog on open and returns it on close', () => {
    const onClose = jest.fn();
    act(() => {
      root.render(<Harness onClose={onClose} />);
    });

    const trigger = openModal();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('first-input');

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="last-button"]')!.click();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    act(() => {
      root.render(<Harness onClose={onClose} />);
    });

    openModal();
    act(() => {
      pressKey('Escape');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when closeOnEscape is false', () => {
    const onClose = jest.fn();
    act(() => {
      root.render(<Harness onClose={onClose} closeOnEscape={false} />);
    });

    openModal();
    act(() => {
      pressKey('Escape');
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps Tab within the dialog and cycles with Shift+Tab', () => {
    const onClose = jest.fn();
    act(() => {
      root.render(<Harness onClose={onClose} />);
    });

    openModal();

    const last = container.querySelector<HTMLElement>('[data-testid="last-button"]')!;
    const first = container.querySelector<HTMLElement>('[data-testid="first-input"]')!;

    last.focus();
    act(() => {
      pressKey('Tab');
    });
    expect(document.activeElement).toBe(first);

    act(() => {
      pressKey('Tab', true);
    });
    expect(document.activeElement).toBe(last);
  });

  it('focuses the preferred element when initialFocusSelector is given', () => {
    const onClose = jest.fn();
    act(() => {
      root.render(<Harness onClose={onClose} initialFocusSelector='[data-testid="last-button"]' />);
    });

    openModal();
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('last-button');
  });
});
