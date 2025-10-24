"use client";

import React, { useEffect } from 'react';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { PerformanceMonitor } from '@/components/performance/PerformanceMonitor';

export default function LazyAnalytics() {
  // Intentionally lightweight client component
  useEffect(() => {
    // Defer any immediate microtasks to ensure main thread settles
    const id = setTimeout(() => {}, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <VercelAnalytics />
      <PerformanceMonitor />
    </>
  );
}
