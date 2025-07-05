import { auth } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { FeatureUsageOverview } from "@/components/dashboard/FeatureUsageOverview";

export async function FeatureUsageOverviewWrapper() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  try {
    const serviceUsage = await ServiceUsageService.getServiceUsageForAllServices(userId);
    return <FeatureUsageOverview initialData={serviceUsage} />;
  } catch (error) {
    console.error("Failed to fetch service usage for user:", userId, error);
    // Return empty state - the UserInitializationProvider will handle user creation
    return <FeatureUsageOverview initialData={{}} />;
  }
}