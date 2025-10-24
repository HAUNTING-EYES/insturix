"use client";

import React from 'react';
import dynamic from 'next/dynamic';

const LazyAnalytics = dynamic(() => import('./LazyAnalytics'), { ssr: false });

export default function ClientLoader() {
  return <LazyAnalytics />;
}
