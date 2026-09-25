'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@contexts/UserContext';
import { setRouterState } from '@lib/router-compat';
import AuthLayout from '@layout/AuthLayout';

/**
 * Ported from src/routes/AuthWrapper.jsx:
 *   if (!isLoggedIn) <Navigate to="/login" state={{ from: location.pathname }} replace />
 *   else <AuthLayout>{children}</AuthLayout>
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoggedIn) {
      setRouterState({ from: pathname });
      router.replace('/login');
    }
  }, [isLoggedIn, pathname, router]);

  if (!isLoggedIn) return null;
  return <AuthLayout>{children}</AuthLayout>;
}
