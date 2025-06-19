"use client";

import { useEffect } from "react";
import { useCurrency } from "@/lib/CurrencyContext";

export interface CurrencyProps {
  priceUSD: number;
  priceINR: number;
  priceEUR: number;
  priceGBP: number;
  priceCAD?: number;
  priceAUD?: number;
  priceSGD?: number;
  priceAED?: number;
  className?: string;
  perMonth?: boolean;
}

export function Currency(props: CurrencyProps) {
  const { selectedCurrency, selectedSymbol, isUserSelected } = useCurrency(); // Added isUserSelected

  // Log whenever this component renders, and what context it sees
  useEffect(() => {
    console.log(">>> Currency Component Rendered/Updated <<<");
    console.log("Context values seen: ", { selectedCurrency, selectedSymbol, isUserSelected });
    console.log("-----------------------------------------");
  }); // NO DEPENDENCY ARRAY - run on every render

  console.log("--- Currency Component (during render function execution) ---");
  console.log("Received from context - selectedCurrency:", selectedCurrency);
  console.log("Received from context - selectedSymbol:", selectedSymbol);
  console.log("Received from context - isUserSelected:", isUserSelected);
  console.log("--- End Currency Component ---");

  return (
    <div className={props.className as string}>
      DEBUG: {selectedSymbol} {selectedCurrency} (User Selected: {isUserSelected ? 'Yes' : 'No'})
      {props.perMonth ? "/mo" : ""}
    </div>
  );
}