"use client";

// Import providers directly — lazy-loading these small providers inside a single
// Suspense boundary caused the entire dashboard to freeze if any one of them
// failed to resolve. Direct imports are fast enough and far more reliable.
import { LocationProvider } from "@/lib/LocationProvider";
import { PricingClientProvider } from "@/lib/PricingContext";
import { CurrencyProvider } from "@/lib/CurrencyContext";

interface DashboardProvidersProps {
  children: React.ReactNode;
}

export function DashboardProviders({ children }: DashboardProvidersProps) {
  return (
    <LocationProvider>
      <PricingClientProvider>
        <CurrencyProvider>
          {children}
        </CurrencyProvider>
      </PricingClientProvider>
    </LocationProvider>
  );
}