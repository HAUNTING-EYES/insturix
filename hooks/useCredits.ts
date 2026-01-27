/**
 * useCredits Hook
 * 
 * React Query-based hook for managing credits balance with automatic refresh.
 * Use `invalidateCredits()` to trigger refresh after any credits-changing action.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

// Query key for credits - used to invalidate from anywhere
export const CREDITS_QUERY_KEY = ['user', 'credits'];

export interface CreditsBalance {
  subscriptionCredits: number;
  topupCredits: number;
  totalCredits: number;
  subscriptionCreditsExpiry: string | null;
}

export interface CreditTransaction {
  id: string;
  type: 'subscription_grant' | 'topup' | 'usage' | 'refund' | 'expiry' | 'adjustment';
  amount: number;
  service?: string;
  action?: string;
  timestamp: string;
  balanceAfter: number;
}

export interface CreditsData {
  balance: CreditsBalance;
  recentTransactions: CreditTransaction[];
}

async function fetchCredits(): Promise<CreditsData> {
  const res = await fetch('/api/user/credits');
  const data = await res.json();
  
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch credits');
  }
  
  return {
    balance: data.balance,
    recentTransactions: data.recentTransactions || [],
  };
}

export function useCredits() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: CREDITS_QUERY_KEY,
    queryFn: fetchCredits,
    enabled: !!userId, // Only fetch if user is signed in
    staleTime: 30 * 1000, 
    gcTime: 5 * 60 * 1000, 
    refetchOnWindowFocus: true, 
  });

  // Function to invalidate and refetch credits from anywhere
  const invalidateCredits = () => {
    queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
  };

  return {
    balance: data?.balance ?? null,
    transactions: data?.recentTransactions ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    invalidateCredits,
  };
}

// Hook for checking if user has enough credits for an action
export function useCreditsCheck(requiredCredits: number) {
  const { balance, isLoading } = useCredits();
  
  const hasEnough = balance ? balance.totalCredits >= requiredCredits : false;
  const shortfall = balance ? Math.max(0, requiredCredits - balance.totalCredits) : requiredCredits;
  
  return {
    hasEnough,
    shortfall,
    available: balance?.totalCredits ?? 0,
    isLoading,
  };
}

// Global helper to invalidate credits from outside React components
// Useful for API route responses or SSE events
let queryClientRef: ReturnType<typeof useQueryClient> | null = null;

export function setQueryClientRef(client: ReturnType<typeof useQueryClient>) {
  queryClientRef = client;
}

export function invalidateCreditsGlobally() {
  if (queryClientRef) {
    queryClientRef.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
  }
}
