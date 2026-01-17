import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

/**
 * @deprecated This hook is deprecated. Use CreditsCard or /api/user/credits directly.
 * Per-feature usage limits have been replaced by the unified credits system.
 */

export interface CreditsInfo {
  subscriptionCredits: number;
  topupCredits: number;
  totalCredits: number;
}

export interface UseFeatureUsageReturn {
  credits: CreditsInfo | null;
  loading: boolean;
  error: string | null;
  refreshCredits: () => Promise<void>;
  hasCredits: (amount: number) => boolean;
}

export const useFeatureUsage = (): UseFeatureUsageReturn => {
  const { user, isLoaded } = useUser();
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!user || !isLoaded) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/user/credits');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch credits');
      }

      if (result.success && result.balance) {
        setCredits({
          subscriptionCredits: result.balance.subscriptionCredits,
          topupCredits: result.balance.topupCredits,
          totalCredits: result.balance.totalCredits,
        });
      }
    } catch (err) {
      console.error('Error fetching credits:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user, isLoaded]);

  const hasCredits = useCallback((amount: number = 1): boolean => {
    if (!credits) return false;
    return credits.totalCredits >= amount;
  }, [credits]);

  const refreshCredits = useCallback(async () => {
    await fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    if (isLoaded) {
      fetchCredits();
    }
  }, [isLoaded, fetchCredits]);

  return {
    credits,
    loading,
    error,
    refreshCredits,
    hasCredits,
  };
};

// Simplified hook for checking credits
export const useCredits = () => {
  const { credits, loading, error, refreshCredits, hasCredits } = useFeatureUsage();
  
  return {
    balance: credits,
    loading,
    error,
    refresh: refreshCredits,
    hasEnough: hasCredits,
  };
};