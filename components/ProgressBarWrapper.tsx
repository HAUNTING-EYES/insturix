"use client";

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Client-side only import of ProgressBar with no SSR
const ProgressBar = dynamic(() => import("@/components/ProgressBar"), { 
  ssr: false,
  loading: () => null // Don't show anything while loading
});

export default function ProgressBarWrapper() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
} 