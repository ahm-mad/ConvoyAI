'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const listeners = new Set<() => void>();
let ticking = false;

/** One shared scroll/resize listener (rAF-throttled) for every LazyMount on the page, instead of one each. */
function notify() {
  if (ticking) return;

  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    listeners.forEach(fn => fn());
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', notify, { passive: true });
  window.addEventListener('resize', notify);
}

/**
 * Mounts its children only while they are near the viewport (and unmounts them when far away), so a page with several
 * WebGL maps never keeps more than one alive. `minHeight` holds the space while unmounted. Uses a scroll-position
 * check (rAF-throttled) rather than IntersectionObserver: some automated/embedded browser contexts never fire IO
 * callbacks even though scroll and rAF work normally, and this reads the same either way.
 */
export default function LazyMount({
  children,
  rootMargin = '500px',
  className = '',
}: {
  children: ReactNode;
  rootMargin?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const margin = parseFloat(rootMargin) || 500;

  useEffect(() => {
    const check = () => {
      const el = box.current;

      if (!el) return;

      const r = el.getBoundingClientRect();

      setNear(r.bottom > -margin && r.top < window.innerHeight + margin);
    };

    check();
    listeners.add(check);

    return () => {
      listeners.delete(check);
    };
  }, [margin]);

  return (
    <div ref={box} className={className}>
      {near ? children : null}
    </div>
  );
}
