'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a formatted number ("87.4", "1,204", "2.86") from 0 to its value on mount / change. Anything that is
 * not a plain number ("—", "12 h 05 min") renders untouched. Respects prefers-reduced-motion.
 */
export default function CountUp({ value, duration = 900 }: { value: string; duration?: number }) {
  const match = /^([^\d]*?)(\d[\d,]*\.?\d*)([^\d]*)$/.exec(value.trim());
  const [shown, setShown] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!match || typeof window === 'undefined') return setShown(value);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(value);

    const [, prefix, raw, suffix] = match;
    const target = parseFloat(raw.replace(/,/g, ''));
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const grouped = raw.includes(',');
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const n = target * eased;

      setShown(
        prefix +
          n.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: grouped,
          }) +
          suffix
      );
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setShown(value);
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className="tabular-nums">{shown}</span>;
}
