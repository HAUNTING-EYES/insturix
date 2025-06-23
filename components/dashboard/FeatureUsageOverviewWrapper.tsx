import { auth } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { FeatureUsageOverview } from "@/components/dashboard/FeatureUsageOverview";

export async function FeatureUsageOverviewWrapper() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const serviceUsage = await ServiceUsageService.getServiceUsageForAllServices(userId);

  return <FeatureUsageOverview initialData={serviceUsage} />;
}