"use client";

import React from 'react';
import { PricingClientProvider } from '@/lib/PricingContext';

export function PricingProviderWrapper({ children }: { children: React.ReactNode }) {
  return <PricingClientProvider>{children}</PricingClientProvider>;
}