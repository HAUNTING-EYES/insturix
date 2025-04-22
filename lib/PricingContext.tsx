"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLocationData, LocationData } from './QFunctions';

interface PricingContextType {
  locationData: LocationData | undefined;
  isLoading: boolean;
  isError: boolean;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export function PricingClientProvider({ children }: { children: ReactNode }) {
  const { data: locationData, isLoading, isError } = useQuery<LocationData, Error>({
    queryKey: ["location"],
    queryFn: fetchLocationData,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  return (
    <PricingContext.Provider value={{ locationData, isLoading, isError }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing(): PricingContextType {
  const context = useContext(PricingContext);
  if (context === undefined) {
    throw new Error('usePricing must be used within a PricingClientProvider');
  }
  return context;
}