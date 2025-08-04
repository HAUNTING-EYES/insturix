"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/CurrencyContext";

const SUPPORTED_CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", flag: "🇦🇪" },
];
interface CurrencySelectorProps {
  onCurrencyChange?: (currency: string, symbol: string) => void;
  className?: string;
  compact?: boolean;
}

export function CurrencySelector({ 
  onCurrencyChange, 
  className = "",
  compact = false 
}: CurrencySelectorProps) {
  const { selectedCurrency, setSelectedCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCurrencySelect = (currency: string, symbol: string) => {
    setSelectedCurrency(currency, symbol);
    onCurrencyChange?.(currency, symbol);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const currentCurrency = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency) || SUPPORTED_CURRENCIES[0];

  if (compact) {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-2"
          onClick={toggleDropdown}
        >
          <span className="text-sm">{currentCurrency.flag} {currentCurrency.symbol}</span>
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
        
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-md shadow-xl z-[100]">
            {SUPPORTED_CURRENCIES.map((currency) => (
              <button
                key={currency.code}
                onClick={() => handleCurrencySelect(currency.code, currency.symbol)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center text-sm text-white ${
                  selectedCurrency === currency.code ? "bg-gray-700" : ""
                }`}
              >
                <span className="mr-2">{currency.flag}</span>
                <span>{currency.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <Button 
        variant="outline" 
        className="justify-between min-w-[200px]"
        onClick={toggleDropdown}
      >
        <div className="flex items-center">
          <Globe className="h-4 w-4 mr-2" />
          <span className="mr-2">{currentCurrency.flag}</span>
          <span>{currentCurrency.name}</span>
          <span className="ml-2 text-muted-foreground">({currentCurrency.symbol})</span>
        </div>
        <ChevronDown className="h-4 w-4" />
      </Button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-gray-900 border border-gray-700 rounded-md shadow-xl z-[100]">
          {SUPPORTED_CURRENCIES.map((currency) => (
            <button
              key={currency.code}
              onClick={() => handleCurrencySelect(currency.code, currency.symbol)}
              className={`w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center text-white ${
                selectedCurrency === currency.code ? "bg-gray-700" : ""
              }`}
            >
              <span className="mr-3">{currency.flag}</span>
              <div className="flex flex-col">
                <span className="font-medium">{currency.name}</span>
                <span className="text-sm text-gray-300">
                  {currency.code} ({currency.symbol})
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}