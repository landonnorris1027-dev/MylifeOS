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
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('inert')) return true;
    const display = current.style?.display;
    const visibility = current.style?.visibility;
    if (display === 'none' || visibility === 'hidden') return true;
    current = current.parentElement;
  }

  return false;
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !isHidden(element),
  );
};

const NON_RENDERED_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT']);

/**
 * Hides everything outside the dialog from assistive technology and pointer
 * interaction by walking up from the dialog and marking each ancestor's
 * siblings inert. Siblings that are already inert (an outer dialog in a nested
 * stack, or a widget that made itself inert) are left untouched so their own
 * owner still controls the release.
 */
const isolateBackground = (container: HTMLElement): (() => void) => {
  const isolated: HTMLElement[] = [];
  let node: HTMLElement = container;
  let parent: HTMLElement | null = node.parentElement;

  while (parent) {
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === node) continue;
      if (NON_RENDERED_TAGS.has(sibling.tagName) || sibling.hasAttribute('inert')) continue;
      sibling.setAttribute('inert', '');
      isolated.push(sibling);
    }

    if (parent === document.body) break;
    node = parent;
    parent = node.parentElement;
  }

  return () => {
    for (const element of isolated) element.removeAttribute('inert');
  };
};

let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = '';

/** Reference counted so nested dialogs restore the original overflow exactly once. */
const lockBodyScroll = (): (() => void) => {
  const { body } = document;
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = body.style.overflow;
    body.style.overflow = 'hidden';
  }
  bodyScrollLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks === 0) body.style.overflow = bodyOverflowBeforeLock;
  };
};

/** Only the topmost visible dialog may move focus — lower dialogs stay frozen. */
const isTopmostDialog = (container: HTMLElement | null): boolean => {
  if (!container) return false;
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'),
  ).filter((element) => !isHidden(element));
  return dialogs.length === 0 || dialogs[dialogs.length - 1] === container;
};

/**
 * Shared keyboard behavior for modals:
 * - Escape closes
 * - Tab / Shift+Tab cycle focus within the dialog (focus trap)
 * - On open, focus moves to the first input / preferred element
 * - On close, focus returns to the element that triggered the modal
 * - Provides role="dialog" / aria-modal props
 * - Marks the rest of the page inert and locks background scrolling
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

    let releaseBackground: (() => void) | null = null;
    let releaseScroll: (() => void) | null = null;

    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      releaseBackground = isolateBackground(container);
      releaseScroll = lockBodyScroll();

      const preferred = initialFocusSelector
        ? container.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const target = preferred ?? getFocusableElements(container)[0] ?? container;
      if (target === container && !container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      target.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        // Inline editors/confirmations consume their first Escape locally.
        if (event.target instanceof Element && event.target.closest('[data-inline-escape="true"]')) return;
        const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')).filter(element => !isHidden(element));
        if (dialogs.length && dialogs[dialogs.length - 1] !== containerRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      // With a stack of dialogs only the top one owns the Tab order.
      if (!isTopmostDialog(containerRef.current)) return;

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
      releaseBackground?.();
      releaseScroll?.();
      // Remove the inert marks before restoring focus so the trigger is focusable again.
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
