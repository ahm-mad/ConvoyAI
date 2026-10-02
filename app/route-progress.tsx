'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import NProgress from 'nprogress';

// Ported from src/routes/RouteLoader.jsx (which watched location.pathname).
// Custom template: NProgress's built-in markup is `<div class="bar" role="bar">`,
// an invalid ARIA role (axe: aria-roles, critical) baked into the library itself.
// This is purely decorative page-load chrome, so hide it from assistive tech instead.
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 150,
  minimum: 0.1,
  template: '<div class="bar" aria-hidden="true"><div class="peg"></div></div>',
});

export default function RouteProgress() {
  const pathname = usePathname();

  useEffect(() => {
    NProgress.start();
    const timer = setTimeout(() => NProgress.done(), 400);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
