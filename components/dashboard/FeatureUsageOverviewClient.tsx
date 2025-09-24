"use client";

import { useUserInitialization } from "@/components/dashboard/UserInitializationProvider";
import { FeatureUsageOverview } from "@/components/dashboard/FeatureUsageOverview";

export function FeatureUsageOverviewClient() {
  const { isInitialized, isLoading, featureUsage } = useUserInitialization();

  return <FeatureUsageOverview initialData={featureUsage} isLoadingInitial={isLoading || !isInitialized} />;
}