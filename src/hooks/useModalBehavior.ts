import { useEffect, useRef } from 'react';

export interface UseModalBehaviorOptions {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Called when the user presses Escape. */
  onClose: () => void;
  /**
   * Selects the element to focus when the modal opens. Defaults to the first
   * focusable element inside the dialog.
   */
  initialFocusSelector?: string;
  /** Set false to keep Escape from closing (e.g. while a timer runs). */
  closeOnEscape?: boolean;
}

export interface UseModalBehaviorResult {
  /** Attach to the dialog container element. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Spread onto the dialog container for assistive technologies. */
  dialogProps: {
    role: 'dialog';
    'aria-modal': true;
  };
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const isHidden = (element: HTMLElement): boolean => {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;

  let current: HTMLElement | null = element;
  while (current) {
    const display = current.style?.display;
    const visibility = current.style?.visibility;
    if (display === 'none' || visibility === 'hidden') return true;
    current = current.parentElement;
  }

  return false;
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !isHidden(element),
  );
};

/**
 * Shared keyboard behavior for modals:
 * - Escape closes
 * - Tab / Shift+Tab cycle focus within the dialog (focus trap)
 * - On open, focus moves to the first input / preferred element
 * - On close, focus returns to the element that triggered the modal
 * - Provides role="dialog" / aria-modal props
 */
export const useModalBehavior = ({
  isOpen,
  onClose,
  initialFocusSelector,
  closeOnEscape = true,
}: UseModalBehaviorOptions): UseModalBehaviorResult => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const preferred = initialFocusSelector
        ? container.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const target = preferred ?? getFocusableElements(container)[0] ?? container;
      target.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      previousActiveElementRef.current?.focus?.();
      previousActiveElementRef.current = null;
    };
  }, [isOpen, initialFocusSelector, closeOnEscape]);

  return {
    containerRef,
    dialogProps: {
      role: 'dialog',
      'aria-modal': true,
    },
  };
};
