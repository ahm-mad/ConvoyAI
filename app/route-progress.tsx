'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import NProgress from 'nprogress';

// Ported from src/routes/RouteLoader.jsx (which watched location.pathname).
NProgress.configure({ showSpinner: false, trickleSpeed: 150, minimum: 0.1 });

export default function RouteProgress() {
  const pathname = usePathname();

  useEffect(() => {
    NProgress.start();
    const timer = setTimeout(() => NProgress.done(), 400);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
