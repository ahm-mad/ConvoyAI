'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

/**
 * The entire ConvoyAI app is a client-side SPA today (localStorage / IndexedDB /
 * MSW service worker / Socket.IO / Unity WebGL, and providers that read localStorage
 * at render time). Rather than guarding every browser-API call site, we mount the
 * whole provider stack + routed pages behind an `ssr: false` boundary so nothing
 * in the app tree is server-rendered — behavior matches the pre-migration Vite SPA.
 *
 * Phase 8 (SEO) will pull specific public routes (/, /use-cases, /plan-price, and
 * a new /blog) OUT of this shell and render them as real Server Components.
 */
const AppShell = dynamic(() => import('./app-shell'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100vh', background: 'var(--color-surface-0)' }} />,
});

export default function Providers({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
