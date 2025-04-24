'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    // Immediately redirect to homepage
    router.push('/');
  }, [router]);

  return null; // No UI needed for immediate redirect
}
