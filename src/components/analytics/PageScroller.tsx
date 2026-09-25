import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Own scroll container sized to the space under the app header, so the sidebar and navbar stay put
 * (the app shell itself scrolls as one document — the same pattern the Fleet Overview uses).
 */
export default function PageScroller({
  children,
  className = '',
  footer,
}: {
  children: ReactNode;
  className?: string;
  /** Rendered pinned to the bottom of the visible area (e.g. a save bar). */
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    const fit = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;

      setHeight(Math.max(320, window.innerHeight - top));
    };

    fit();
    window.addEventListener('resize', fit);

    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div ref={ref} style={{ height }} className="a11y-muted relative flex flex-col">
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${className}`}>
        {children}
      </div>
      {footer}
    </div>
  );
}
