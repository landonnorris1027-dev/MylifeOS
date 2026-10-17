import { useLayoutEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

export const MOTION_EXIT_MS = 180;

/** Retain only the closing view; live open state still controls focus and actions. */
export function useMotionPresence<T>(value: T | null) {
  const reduced = useReducedMotion();
  const [retained, setRetained] = useState(value);

  useLayoutEffect(() => {
    if (value !== null) {
      setRetained(value);
      return;
    }
    if (reduced) {
      setRetained(null);
      return;
    }
    if (retained === null) return;
    const timer = window.setTimeout(() => setRetained(null), MOTION_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [value, reduced, retained]);

  const present = value !== null ? value : reduced ? null : retained;
  return {
    present,
    isPresent: present !== null,
    presenceProps: {
      'data-motion-state': value !== null ? 'open' as const : 'closed' as const,
      'aria-hidden': value === null ? true : undefined,
      // Inert closes pointer AND keyboard interaction immediately during the exit.
      inert: value === null ? '' : undefined,
    },
  };
}
