'use client';

import { useEffect } from 'react';

/** Feeds the cursor position (--mx/--my) to whichever `.spotlight` element is under the pointer. */
export default function SpotlightTracker() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = (e.target as HTMLElement | null)?.closest?.('.spotlight') as HTMLElement | null;

        if (!el) return;

        const r = el.getBoundingClientRect();

        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };

    document.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
