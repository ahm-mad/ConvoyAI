'use client';

// route: /profile (was an empty stub; the real profile lives in account settings)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/account-setting');
  }, [router]);
  return null;
}
