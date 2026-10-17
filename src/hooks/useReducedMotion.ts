import { useEffect, useState } from 'react';

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Programmatic jumps follow the same accessibility preference as CSS motion. */
export function scrollToElement(element: HTMLElement, block: ScrollLogicalPosition = 'center') {
  element.scrollIntoView({ block, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
}
