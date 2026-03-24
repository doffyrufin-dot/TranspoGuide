'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthSessionSync() {
  const router = useRouter();

  useEffect(() => {
    // Sync auth session on mount
    router.refresh();
  }, [router]);

  return null;
}