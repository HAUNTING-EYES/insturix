"use client";

import { useEffect, useState } from "react";
import { useUserInitialization } from "@/components/dashboard/UserInitializationProvider";
import { FeatureUsageOverview } from "@/components/dashboard/FeatureUsageOverview";

interface ServiceUsageInfo {
  hasAccess: boolean;
  maxUsage: number;
  currentUsage: number;
  remaining: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
  isUnlimited: boolean;
}

type ServiceUsageData = Record<string, Record<string, ServiceUsageInfo>>;

export function FeatureUsageOverviewClient() {
  const { isInitialized, isLoading, user } = useUserInitialization();
  const [serviceUsage, setServiceUsage] = useState<ServiceUsageData>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchServiceUsage = async () => {
      // Wait for user initialization to complete
      if (!isInitialized || isLoading) {
        return;
      }

      try {
        setLoading(true);
        // Fetch Mongo-based usage for all services (ThinkForge included)
        const respUsage = await fetch('/api/user/feature-usage', { cache: 'no-store' });
        if (!respUsage.ok) {
          throw new Error('Failed to fetch service usage');
        }
        const result = await respUsage.json();
        setServiceUsage(result.data || {});
      } catch (err) {
        console.error('Error fetching service usage:', err);
        // Set empty data on error to stop loading state
        setServiceUsage({});
      } finally {
        setLoading(false);
      }
    };

    // Only fetch when user is properly initialized
    if (isInitialized && !isLoading) {
      // Small delay to prioritize critical rendering
      const timer = setTimeout(fetchServiceUsage, 100);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, isLoading]);

  return <FeatureUsageOverview initialData={serviceUsage} isLoadingInitial={isLoading || !isInitialized || loading} />;
}