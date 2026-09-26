'use client';

// route: /internal-user (was a hard-coded mock list with inert buttons; members live under Access)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InternalUserRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/members');
  }, [router]);
  return null;
}
