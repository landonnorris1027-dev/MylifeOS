import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';
import { useModalBehavior } from './useModalBehavior';
import { MOTION_EXIT_MS, useMotionPresence } from './useMotionPresence';
import { scrollToElement } from './useReducedMotion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Payload = { name: string };
const first = { name: 'First task' };
const second = { name: 'Second task' };
function Harness({ value }: { value: Payload | null }) {
  const { present, presenceProps } = useMotionPresence(value);
  const { containerRef, dialogProps } = useModalBehavior({ isOpen: value !== null, onClose: () => {} });
  return <>
    <button data-trigger>Open</button>
    {present && <div data-overlay {...presenceProps}>
      <div ref={containerRef} {...dialogProps}>
        <p>{present.name}</p><input aria-label="Task name" />
      </div>
    </div>}
  </>;
}

describe('animated modal lifetime', () => {
  let container: HTMLDivElement;
  let root: Root;
  let preference: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  let listeners: Set<() => void>;
  const render = (value: Payload | null) => act(() => root.render(<Harness value={value} />));
  const overlay = () => container.querySelector<HTMLElement>('[data-overlay]');

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Set();
    preference = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps a closing view inert and hidden to assistive technology, then removes it', () => {
    render(first);
    expect(overlay()?.getAttribute('data-motion-state')).toBe('open');
    render(null);
    expect(overlay()?.textContent).toContain(first.name);
    expect(overlay()?.hasAttribute('inert')).toBe(true);
    expect(overlay()?.getAttribute('aria-hidden')).toBe('true');
    act(() => vi.advanceTimersByTime(MOTION_EXIT_MS - 1));
    expect(overlay()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(overlay()).toBeNull();
  });

  it('returns focus immediately while the closing view is still visible', () => {
    render(null);
    const trigger = container.querySelector<HTMLButtonElement>('[data-trigger]')!;
    trigger.focus();
    render(first);
    act(() => vi.runOnlyPendingTimers());
    expect(container.querySelector('input')).toBe(document.activeElement);
    render(null);
    expect(document.activeElement).toBe(trigger);
    expect(overlay()).not.toBeNull();
  });

  it('cancels a pending exit when a different task opens immediately', () => {
    render(first);
    render(null);
    act(() => vi.advanceTimersByTime(90));
    render(second);
    act(() => vi.advanceTimersByTime(MOTION_EXIT_MS * 2));
    expect(overlay()?.textContent).toContain(second.name);
    expect(overlay()?.hasAttribute('inert')).toBe(false);
    expect(overlay()?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('closes immediately when reduced motion is enabled', () => {
    preference.matches = true;
    render(first);
    render(null);
    expect(overlay()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('respects a preference change in the middle of an exit', () => {
    render(first);
    render(null);
    act(() => {
      preference.matches = true;
      listeners.forEach(listener => listener());
    });
    expect(overlay()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up pending exits and preference listeners on unmount', () => {
    render(first);
    render(null);
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it.each([false, true])('uses an appropriate scroll behavior with reduced motion = %s', reduced => {
    preference.matches = reduced;
    const target = document.createElement('div');
    target.scrollIntoView = vi.fn();
    scrollToElement(target);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
  });
});
