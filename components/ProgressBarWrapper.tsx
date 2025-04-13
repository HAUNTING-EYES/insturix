"use client";

import dynamic from 'next/dynamic';

// Client-side only import of ProgressBar
const ProgressBar = dynamic(() => import("@/components/ProgressBar"), { ssr: false });

export default function ProgressBarWrapper() {
  return <ProgressBar />;
} 