"use client";

import React, { createContext, useContext, ReactNode, useState } from 'react';

interface CurrencyContextType {
  selectedCurrency: string;
  selectedSymbol: string;
  setSelectedCurrency: (currency: string, symbol: string) => void;
  isUserSelected: boolean;
  version: number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Hardcoded to USD only
  const [selectedCurrency] = useState<string>("USD");
  const [selectedSymbol] = useState<string>("$");
  const [isUserSelected] = useState<boolean>(true);
  const [version] = useState<number>(0);

  const setSelectedCurrency = () => {
    // No-op for USD-only transition
  };

  const contextValue: CurrencyContextType = {
    selectedCurrency,
    selectedSymbol,
    setSelectedCurrency,
    isUserSelected,
    version
  };

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}