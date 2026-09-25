'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useUser } from '@contexts/UserContext';
import { useSocket } from '@contexts/SocketContext';

/**
 * Ported from src/main.jsx `bootstrapApplication()` + src/App.jsx's Pusher effect.
 *
 * Demo accounts: start the MSW worker + reseed Dexie + resume any running
 * SimulationEngine BEFORE the routed pages mount and fire their first queries.
 * The fake-backend modules are import()'d lazily so non-demo users never pull
 * msw / dexie / the seed data into their bundle.
 */
export default function Bootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const { user } = useUser();
  const { initializeSocket } = useSocket();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (savedUser?.isDemo === true) {
          const [{ setupDemoMode }, { SimulationEngine }] = await Promise.all([
            import('@utils/fakeBackend/browser'),
            import('@utils/fakeBackend/controllers'),
          ]);
          await setupDemoMode(true);
          await SimulationEngine.resumeAll();
        }
      } catch (err) {
        console.error('Demo-mode bootstrap failed:', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user?.id) initializeSocket(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!ready) {
    return <div style={{ minHeight: '100vh', background: 'var(--color-surface-0)' }} />;
  }
  return <>{children}</>;
}
