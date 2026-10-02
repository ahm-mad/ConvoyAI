'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import NProgress from 'nprogress';

// Ported from src/routes/RouteLoader.jsx (which watched location.pathname).
// Custom template: NProgress's built-in markup is `<div class="bar" role="bar">`,
// an invalid ARIA role (axe: aria-roles, critical) baked into the library itself.
// This is purely decorative page-load chrome, so hide it from assistive tech instead.
// IMPORTANT: NProgress.render() looks up the bar via `Settings.barSelector`, which
// defaults to `[role="bar"]` — dropping the role without also overriding barSelector
// makes that querySelector return null and crashes the whole app on every navigation.
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 150,
  minimum: 0.1,
  barSelector: '.bar',
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
