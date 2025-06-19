"use client";

import { useQuery } from '@tanstack/react-query';
import { usePricing } from "@/lib/PricingContext";

export interface DBPlan {
  id: string;
  name: string;
  type: string;
  description: string;
  serviceLimits: {
    alyzitron: Array<{ limitType: string; description: string; maxUsage: number; resetPeriod: string }>;
    editron: Array<{ limitType: string; description: string; maxUsage: number; resetPeriod: string }>;
    shield: Array<{ limitType: string; description: string; maxUsage: number; resetPeriod: string }>;
    socialize: Array<{ limitType: string; description: string; maxUsage: number; resetPeriod: string }>;
    thinkforge: Array<{ limitType: string; description: string; maxUsage: number; resetPeriod: string }>;
    musitron: Array<{ limitType: string; description: string; maxUsage: number; resetPeriod: string }>;
  };
  pricing: {
    amount: number;
    currency: string;
    symbol: string;
  };
  allPricing: {
    USD: { amount: number; currency: string; symbol: string };
    INR: { amount: number; currency: string; symbol: string };
    EUR: { amount: number; currency: string; symbol: string };
    GBP: { amount: number; currency: string; symbol: string };
  };
  billingPeriod: string;
  isActive: boolean;
  sortOrder: number;
}

interface PlansResponse {
  success: boolean;
  plans: DBPlan[];
  currency: string;
  count: number;
}

const fetchPlans = async (currency: string = "USD"): Promise<PlansResponse> => {
  const response = await fetch(`/api/plans?currency=${currency}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch plans');
  }

  return response.json();
};

export function usePlansFromDB() {
  const { locationData, isLoading: locationLoading } = usePricing();
  const userCurrency = locationData?.currency || "USD";

  const {
    data,
    isLoading: plansLoading,
    isError,
    error,
    refetch
  } = useQuery<PlansResponse>({
    queryKey: ['plans', userCurrency],
    queryFn: () => fetchPlans(userCurrency),
    enabled: !locationLoading, // Only fetch plans after location is loaded
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    plans: data?.plans || [],
    isLoading: locationLoading || plansLoading,
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