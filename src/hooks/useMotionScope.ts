import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { Task } from '../types';
import { MOTION_EASE } from '../components/MotionScene';
import { useReducedMotion } from './useReducedMotion';

const REVEAL_SELECTOR = '.profile-panel, .motion-task, [data-timeline-time], .motion-search-result';

/** One delegated listener and one observer for the entire app; no scroll handler. */
export function useMotionScope() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const scope = ref.current;
    if (!scope || reduced) return;
    const animations = new Set<Animation>();
    const presses = new WeakMap<HTMLElement, Animation>();
    const play = (element: HTMLElement, frames: Keyframe[], duration: number, delay = 0) => {
      if (typeof element.animate !== 'function') return;
      const animation = element.animate(frames, { duration, delay, easing: MOTION_EASE, fill: 'backwards' });
      animations.add(animation);
      animation.onfinish = animation.oncancel = () => animations.delete(animation);
      return animation;
    };
    const click = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!button || button.disabled || button.closest('[inert], [data-motion-feedback="self"]')) return;
      presses.get(button)?.cancel();
      const animation = play(button, [
        { scale: '.96' }, { scale: '1.025', offset: .65 }, { scale: '1' },
      ], 300);
      if (animation) presses.set(button, animation);
    };
    scope.addEventListener('click', click, true);

    // Content remains visible if IntersectionObserver or Web Animations is absent.
    let observer: IntersectionObserver | undefined;
    let mutations: MutationObserver | undefined;
    const pending = new Set<HTMLElement>();
    if (typeof IntersectionObserver === 'function' && typeof HTMLElement.prototype.animate === 'function') {
      const seen = new WeakSet<HTMLElement>();
      observer = new IntersectionObserver(entries => {
        let order = 0;
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          observer?.unobserve(element);
          pending.delete(element);
          delete element.dataset.motionReveal;
          play(element, [
            { opacity: 0, translate: '0 10px' },
            { opacity: 1, translate: '0 0' },
          ], 420, Math.min(order++ * 35, 140));
        });
      }, { rootMargin: '24px 0px', threshold: .01 });
      const observe = (element: HTMLElement) => {
        if (seen.has(element)) return;
        seen.add(element);
        element.dataset.motionReveal = 'pending';
        pending.add(element);
        observer?.observe(element);
      };
      const scan = (element: Element) => {
        if (element instanceof HTMLElement && element.matches(REVEAL_SELECTOR)) observe(element);
        element.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(observe);
      };
      scan(scope);
      mutations = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node instanceof Element) scan(node);
        }));
        pending.forEach(element => {
          if (scope.contains(element)) return;
          observer?.unobserve(element);
          delete element.dataset.motionReveal;
          pending.delete(element);
        });
      });
      mutations.observe(scope, { childList: true, subtree: true });
    }

    return () => {
      scope.removeEventListener('click', click, true);
      mutations?.disconnect();
      observer?.disconnect();
      pending.forEach(element => delete element.dataset.motionReveal);
      animations.forEach(animation => animation.cancel());
    };
  }, [reduced]);

  return ref;
}

interface Position { x: number; y: number; }
// Layout coordinates ignore ongoing reveal transforms and native page scrolling.
const positionOf = (element: HTMLElement): Position => {
  let x = 0; let y = 0; let parent: HTMLElement | null = element;
  while (parent) {
    x += parent.offsetLeft; y += parent.offsetTop;
    parent = parent.offsetParent as HTMLElement | null;
  }
  return { x, y };
};

/** Ease cards into their new positions after scheduling, undoing or removing. */
export function useTaskLayout(ref: RefObject<HTMLDivElement>, inbox: Task[], scheduled: Task[], scopeKey: string) {
  const previous = useRef(new Map<string, Position>());
  const previousScope = useRef(scopeKey);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const positions = new Map<string, Position>();
    const animations: Animation[] = [];
    const sameScope = previousScope.current === scopeKey;
    const cards = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-task-id]') || []);
    // Batch all geometry reads before starting any animations.
    const measurements = cards.filter(card => card.getClientRects().length > 0).map(card => ({
      card, id: card.dataset.taskId!, position: positionOf(card), bounds: card.getBoundingClientRect(),
    }));
    measurements.forEach(({ card, id, position, bounds }) => {
      positions.set(id, position);
      const before = sameScope ? previous.current.get(id) : undefined;
      if (!before || reduced || !card.animate || bounds.bottom < 0 || bounds.top > window.innerHeight) return;
      const x = before.x - position.x; const y = before.y - position.y;
      if (Math.abs(x) + Math.abs(y) < 2 || Math.abs(y) > window.innerHeight) return;
      animations.push(card.animate([
        { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' },
      ], { duration: 380, easing: MOTION_EASE }));
    });
    previous.current = positions;
    previousScope.current = scopeKey;
    return () => animations.forEach(animation => animation.cancel());
  }, [ref, inbox, scheduled, scopeKey, reduced]);
}
