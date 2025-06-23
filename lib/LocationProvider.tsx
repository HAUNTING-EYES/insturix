"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLocationData, LocationData } from './QFunctions';

interface LocationContextType {
  locationData: LocationData | undefined;
  isLoading: boolean;
  isError: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider = ({ children }: { children: ReactNode }) => {
  const { data: locationData, isLoading, isError } = useQuery({
    queryKey: ['location'],
    queryFn: fetchLocationData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <LocationContext.Provider value={{ locationData, isLoading, isError }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};