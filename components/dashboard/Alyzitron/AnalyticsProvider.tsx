"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';
import { useUserInitialization } from '@/components/dashboard/UserInitializationProvider';
import { useConcurrentTasks } from '@/lib/hooks/useConcurrentTasks';

// Define shared types
export interface ServiceUsageInfo {
  hasAccess: boolean;
  maxUsage: number;
  currentUsage: number;
  remaining: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
  isUnlimited: boolean;
  timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
}

export interface AlyzitronStats {
  activeAnalyses: number;
  monthlyAnalyses: number;
  completedAnalyses: number;
  serviceLimits: Record<string, ServiceUsageInfo>;
}

interface AnalyticsContextType {
  stats: AlyzitronStats | null;
  loading: boolean;
  error: string | null;
  userInitLoading: boolean;
  userInitError: string | null;
  isInitialized: boolean;
  fetchStats: () => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};

export const AnalyticsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useUser();
  const { isInitialized, isLoading: userInitLoading, error: userInitError } = useUserInitialization();
  const { concurrentCount, isLoading: concurrentLoading } = useConcurrentTasks();
  const [stats, setStats] = useState<AlyzitronStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!user || !isLoaded || !isInitialized) return;

    try {
      setLoading(true);
      setError(null);

      const [serviceResponse, statsResponse] = await Promise.all([
        fetch('/api/user/feature-usage'),
        fetch('/api/services/alyzitron/stats')
      ]);

      const serviceResult = await serviceResponse.json();
      if (!serviceResponse.ok) {
        throw new Error(serviceResult.error || 'Failed to fetch service usage');
      }

      const statsResult = await statsResponse.json();
      if (!statsResponse.ok) {
        throw new Error(statsResult.error || 'Failed to fetch analysis stats');
      }

      let alyzitronLimits = serviceResult.data?.alyzitron || {};

      if (!concurrentLoading && alyzitronLimits.maxConcurrentTasks) {
        alyzitronLimits = {
          ...alyzitronLimits,
          maxConcurrentTasks: {
            ...alyzitronLimits.maxConcurrentTasks,
            currentUsage: concurrentCount,
            remaining: alyzitronLimits.maxConcurrentTasks.isUnlimited ? -1 :
              Math.max(0, alyzitronLimits.maxConcurrentTasks.maxUsage - concurrentCount)
          }
        };
      }

      setStats({
        activeAnalyses: statsResult.activeAnalyses || 0,
        monthlyAnalyses: statsResult.monthlyAnalyses || 0,
        completedAnalyses: statsResult.completedAnalyses || 0,
        serviceLimits: alyzitronLimits,
      });
    } catch (err) {
      console.error('Error fetching Alyzitron stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isInitialized && !userInitLoading && !concurrentLoading) {
      fetchStats();
    }
  }, [isLoaded, user, isInitialized, userInitLoading, concurrentCount, concurrentLoading]);

  const value = {
    stats,
    loading,
    error,
    userInitLoading,
    userInitError,
    isInitialized,
    fetchStats,
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};