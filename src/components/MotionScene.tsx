import React, { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

export const MOTION_EASE = 'cubic-bezier(.22,1,.36,1)';

/** Animate the new scene without remounting its children or delaying navigation. */
export default function MotionScene({ sceneKey, children }: {
  sceneKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (reduced || !ref.current?.animate) return;
    const animation = ref.current.animate([
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 360, easing: MOTION_EASE });
    return () => animation.cancel();
  }, [sceneKey, reduced]);
  return <div ref={ref} className="motion-scene">{children}</div>;
}
