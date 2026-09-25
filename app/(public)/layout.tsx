'use client';

import type { ReactNode } from 'react';
import NonAuthLayout from '@layout/NonAuthLayout';

// Public routes — old: <NonAuthLayout><item.component /></NonAuthLayout>
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <NonAuthLayout>{children}</NonAuthLayout>;
}
