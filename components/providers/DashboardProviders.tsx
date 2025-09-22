"use client";

import { lazy, Suspense } from "react";

// Lazy load heavy providers only when needed
const LocationProvider = lazy(() => import("@/lib/LocationProvider").then(mod => ({ default: mod.LocationProvider })));
const PricingClientProvider = lazy(() => import("@/lib/PricingContext").then(mod => ({ default: mod.PricingClientProvider })));
const CurrencyProvider = lazy(() => import("@/lib/CurrencyContext").then(mod => ({ default: mod.CurrencyProvider })));
const TransitionProvider = lazy(() => import("@/components/Loader/TransitionProvider").then(mod => ({ default: mod.TransitionProvider })));

interface DashboardProvidersProps {
  children: React.ReactNode;
}

export function DashboardProviders({ children }: DashboardProvidersProps) {
  return (
    <Suspense fallback={<div aria-hidden className="min-h-[200px]" /> }>
      <LocationProvider>
        <PricingClientProvider>
          <CurrencyProvider>
            <TransitionProvider>
              {children}
            </TransitionProvider>
          </CurrencyProvider>
        </PricingClientProvider>
      </LocationProvider>
    </Suspense>
  );
}