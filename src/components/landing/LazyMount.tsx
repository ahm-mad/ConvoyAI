'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Mounts its children only while they are near the viewport (and unmounts them when far away), so a page with several
 * WebGL maps never keeps more than one alive. `minHeight` holds the space while unmounted.
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

  useEffect(() => {
    const el = box.current;

    if (!el || typeof IntersectionObserver === 'undefined') return setNear(true);

    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin });

    io.observe(el);

    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div ref={box} className={className}>
      {near ? children : null}
    </div>
  );
}
