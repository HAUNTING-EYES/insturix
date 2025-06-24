"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { usePricing } from './PricingContext';

interface CurrencyContextType {
  selectedCurrency: string;
  selectedSymbol: string;
  setSelectedCurrency: (currency: string, symbol: string) => void;
  isUserSelected: boolean;
  version: number; // New version number
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { locationData } = usePricing();
  const [selectedCurrency, setStateCurrency] = useState<string>("USD");
  const [selectedSymbol, setStateSymbol] = useState<string>("$");
  const [isUserSelected, setIsUserSelected] = useState<boolean>(false);
  const [version, setVersion] = useState<number>(0);

  const setSelectedCurrency = (currency: string, symbol: string) => {
    setStateCurrency(currency);
    setStateSymbol(symbol);
    setVersion(prev => prev + 1);
  };

  const updateSelectedCurrencyState = (currency: string, symbol: string) => {
    // Only update if currency actually changed
    if (selectedCurrency !== currency || selectedSymbol !== symbol) {
      setSelectedCurrency(currency, symbol);
      setIsUserSelected(true);
      
      localStorage.setItem('preferred-currency', currency);
      localStorage.setItem('preferred-symbol', symbol);
    }
  };

  const contextValue: CurrencyContextType = {
    selectedCurrency,
    selectedSymbol,
    setSelectedCurrency: updateSelectedCurrencyState,
    isUserSelected,
    version // Add version to context
  };
  
  useEffect(() => {
    const savedCurrency = localStorage.getItem('preferred-currency');
    const savedSymbol = localStorage.getItem('preferred-symbol');
    
    if (savedCurrency && savedSymbol) {
      setSelectedCurrency(savedCurrency, savedSymbol);
      setIsUserSelected(true);
    } else if (locationData?.currency && locationData?.symbol) {
      setSelectedCurrency(locationData.currency, locationData.symbol);
      setIsUserSelected(false);
    } else {
      setSelectedCurrency("USD", "$");
      setIsUserSelected(false);
    }
  }, [locationData]);

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