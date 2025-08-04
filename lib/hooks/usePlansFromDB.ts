"use client";

import { useQuery } from '@tanstack/react-query';
import { useCurrency } from "@/lib/CurrencyContext";
import { fetchPlans, PlansResponse } from '@/lib/data/plans';

export function usePlansFromDB() {
  const { selectedCurrency } = useCurrency();
  const userCurrency = selectedCurrency || "USD";

  const {
    data,
    isLoading: plansLoading,
    isError,
    error,
    refetch
  } = useQuery<PlansResponse>({
    queryKey: ['plans', userCurrency],
    queryFn: () => fetchPlans(userCurrency),
    enabled: !!userCurrency, // Only fetch plans after currency is loaded
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    plans: data?.plans || [],
    isLoading: plansLoading,
    isError,
    error: error as Error | null,
    currency: data?.currency || userCurrency,
    refetch,
    count: data?.count || 0,
  };
}

// Hook for admin to get all plans including inactive ones
export function useAllPlansFromDB(includeInactive: boolean = false) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<PlansResponse>({
    queryKey: ['admin-plans', includeInactive],
    queryFn: () => fetchPlans(`USD${includeInactive ? '&includeInactive=true' : ''}`),
    staleTime: 1000 * 60 * 2, // 2 minutes for admin
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  return {
    plans: data?.plans || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    count: data?.count || 0,
  };
}