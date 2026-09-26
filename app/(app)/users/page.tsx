'use client';

// route: /users (was an unwired list that always showed "No users found"; members live under Access)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/members');
  }, [router]);
  return null;
}
