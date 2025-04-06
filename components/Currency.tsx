"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLocationData } from "../lib/QFunctions";

export interface CurrencyProps {
  priceUSD: number;
  priceINR: number;
  priceEUR: number;
  priceGBP: number;
  className?: string;
  perMonth?: boolean; // Add this flag to determine if "/mo" should be appended
}

export function Currency({ priceUSD, priceINR, priceEUR, priceGBP, className, perMonth }: CurrencyProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["location"],
    queryFn: fetchLocationData,
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error fetching location data</div>;

  let price;
  if (data?.currency === "USD") {
    price = priceUSD; // Price in USD
  } else if (data?.currency === "INR") {
    price = priceINR; // Price in INR
  } else if (data?.currency === "EUR") {
    price = priceEUR; // Price in EUR
  } else if (data?.currency === "GBP") {
    price = priceGBP; // Price in GBP
  } else {
    price = priceUSD; // Default price
  }

  return (
    <div className={className as string}>
      {data?.symbol}
      {price}
      {perMonth ? "/mo" : ""}
    </div>
  );
}