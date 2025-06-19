import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

export interface FeatureUsageInfo {
  hasAccess: boolean;
  maxUsage: number;
  currentUsage: number;
  remaining: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
  isUnlimited: boolean;
}

export interface UseFeatureUsageReturn {
  featureUsage: Record<string, FeatureUsageInfo>;
  loading: boolean;
  error: string | null;
  refreshUsage: () => Promise<void>;
  useFeature: (featureName: string, amount?: number) => Promise<boolean>;
  canUseFeature: (featureName: string, amount?: number) => boolean;
  getUsageDisplay: (featureName: string) => string;
}

export const useFeatureUsage = (): UseFeatureUsageReturn => {
  const { user, isLoaded } = useUser();
  const [featureUsage, setFeatureUsage] = useState<Record<string, FeatureUsageInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatureUsage = useCallback(async () => {
    if (!user || !isLoaded) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/user/feature-usage');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch feature usage');
      }

      setFeatureUsage(result.data || {});
      
      // Log if any features were reset
      if (result.resetFeatures?.length > 0) {
        console.log('Features reset:', result.resetFeatures);
      }
    } catch (err) {
      console.error('Error fetching feature usage:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user, isLoaded]);

  const useFeature = useCallback(async (featureName: string, amount: number = 1): Promise<boolean> => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }

    try {
      const response = await fetch('/api/user/feature-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ featureName, amount }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          // Usage limit exceeded - update local state with current usage
          if (result.data) {
            setFeatureUsage(prev => ({
              ...prev,
              [featureName]: result.data
            }));
          }
          setError(`Usage limit exceeded for ${featureName}`);
          return false;
        }
        throw new Error(result.error || 'Failed to use feature');
      }

      // Update local state with new usage info
      setFeatureUsage(prev => ({
        ...prev,
        [featureName]: result.data
      }));

      setError(null);
      return true;
    } catch (err) {
      console.error('Error using feature:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [user]);

  const canUseFeature = useCallback((featureName: string, amount: number = 1): boolean => {
    const usage = featureUsage[featureName];
    if (!usage) return false;
    
    if (usage.isUnlimited) return true;
    return usage.remaining >= amount;
  }, [featureUsage]);

  const getUsageDisplay = useCallback((featureName: string): string => {
    const usage = featureUsage[featureName];
    if (!usage) return 'Not available';
    
    if (usage.isUnlimited) {
      return `${usage.currentUsage} used (Unlimited)`;
    }
    
    return `${usage.currentUsage}/${usage.maxUsage} used (${usage.remaining} remaining)`;
  }, [featureUsage]);

  const refreshUsage = useCallback(async () => {
    await fetchFeatureUsage();
  }, [fetchFeatureUsage]);

  useEffect(() => {
    if (isLoaded) {
      fetchFeatureUsage();
    }
  }, [isLoaded, fetchFeatureUsage]);

  return {
    featureUsage,
    loading,
    error,
    refreshUsage,
    useFeature,
    canUseFeature,
    getUsageDisplay,
  };
};

// Hook for a specific feature
export const useFeature = (featureName: string) => {
  const { featureUsage, loading, error, useFeature, canUseFeature, getUsageDisplay, refreshUsage } = useFeatureUsage();
  
  const featureData = featureUsage[featureName];
  
  return {
    usage: featureData,
    loading,
    error,
    canUse: (amount?: number) => canUseFeature(featureName, amount),
    use: (amount?: number) => useFeature(featureName, amount),
    displayText: getUsageDisplay(featureName),
    refreshUsage,
  };
};