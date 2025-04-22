"use client";

import { usePricing } from "@/lib/PricingContext";

export interface CurrencyProps {
  priceUSD: number;
  priceINR: number;
  priceEUR: number;
  priceGBP: number;
  className?: string;
  perMonth?: boolean; // Add this flag to determine if "/mo" should be appended
}

export function Currency({ priceUSD, priceINR, priceEUR, priceGBP, className, perMonth }: CurrencyProps) {
  const { locationData, isLoading, isError } = usePricing();

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error fetching location data</div>;

  let price;
  if (locationData?.currency === "USD") {
    price = priceUSD; // Price in USD
  } else if (locationData?.currency === "INR") {
    price = priceINR; // Price in INR
  } else if (locationData?.currency === "EUR") {
    price = priceEUR; // Price in EUR
  } else if (locationData?.currency === "GBP") {
    price = priceGBP; // Price in GBP
  } else {
    price = priceUSD; // Default price
  }

  return (
    <div className={className as string}>
      {locationData?.symbol}
      {price}
      {perMonth ? "/mo" : ""}
    </div>
  );
}