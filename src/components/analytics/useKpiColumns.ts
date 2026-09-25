import { useLayoutEffect, useRef, useState } from 'react';

/**
 * KPI tile columns from the container's real width (the expanded sidebar eats 256 px, so viewport
 * breakpoints lie): 6 across on wide screens, then 3 / 2 / 1 — never an orphan row of one.
 * Pass `count` for a row of a different size (e.g. 5 tiles): columns then follow a minimum tile width
 * and step down so the last row is never a lone tile.
 */
export function useKpiColumns(count?: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    const fit = () => {
      const w = el.getBoundingClientRect().width;

      if (count) {
        let n = Math.max(1, Math.min(count, Math.floor((w + 16) / (180 + 16))));

        if (n > 1 && n < count && count % n === 1) n -= 1; // never a lone tile on the last row

        setCols(n);

        return;
      }

      setCols(w >= 1440 ? 6 : w >= 900 ? 3 : w >= 560 ? 2 : 1);
    };

    fit();

    const ro = new ResizeObserver(fit);

    ro.observe(el);

    return () => ro.disconnect();
  }, [count]);

  return { ref, cols };
}
