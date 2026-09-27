'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps a live value and flashes a brand glow behind it whenever `value` changes (not on the first render), so
 * numbers that update in real time visibly "tick". The flash is CSS-only and disabled under reduced motion.
 */
export default function Flash({
  value,
  children,
  className = '',
}: {
  value: string | number | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  const prev = useRef(value);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setTick(t => t + 1);
    }
  }, [value]);

  // A new key remounts the span, which replays the CSS animation on every change.
  return (
    <span key={tick} className={`${className} ${tick ? 'value-flash' : ''}`}>
      {children ?? value}
    </span>
  );
}
