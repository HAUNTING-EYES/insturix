"use client";

import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { useUserInitialization } from '@/components/dashboard/UserInitializationProvider';

interface ClickatronStats {
  monthlyTasks: number;
  pendingTasks: number;
  totalTasks: number;
  usage?: {
    hasAccess: boolean;
    maxUsage: number;
    currentUsage: number;
    remaining: number;
    resetPeriod: string;
    lastReset?: Date;
    isUnlimited: boolean;
    timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
  };
}

interface EnhancedStatsReturn {
  stats: ClickatronStats | null;
  loading: boolean;
  error: string | null;
  userInitLoading: boolean;
  userInitError: string | null;
  isInitialized: boolean;
  refetch: () => void;
}

const getStats = async (): Promise<ClickatronStats> => {
  const response = await fetch("/api/services/clickatron/stats");
  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }
  const data = await response.json();
  return data;
};

export function useEnhancedStats(): EnhancedStatsReturn {
  const { isLoaded } = useUser();
  const { isInitialized, isLoading: userInitLoading, error: userInitError } = useUserInitialization();

  const { data: stats, isLoading: loading, error, refetch } = useQuery<ClickatronStats>({
    queryKey: ['clickatron-analytics'],
    queryFn: getStats,
    enabled: isLoaded && isInitialized && !userInitLoading,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  return {
    stats: stats || null,
    loading,
    error: error?.message || null,
    userInitLoading,
    userInitError,
    isInitialized,
    refetch,
  };
}