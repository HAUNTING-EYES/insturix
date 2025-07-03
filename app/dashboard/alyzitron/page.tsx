import { ClientWrapper } from "@/components/dashboard/Alyzitron/ClientWrapper";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { AlyzitronAnalyticsOverview } from "@/components/dashboard/Alyzitron/AnalyticsOverview";
import { CompactAnalytics } from "@/components/dashboard/Alyzitron/CompactAnalytics";
import { Sparkles } from "lucide-react";
import { AnalyticsProvider } from "@/components/dashboard/Alyzitron/AnalyticsProvider";

export const dynamic = "force-dynamic";

async function getRecentAnalyses() {
  const session = await auth();
  if (!session?.userId) return [];

  try {
    const { analyses } = await getCollections();
    const recentAnalyses = await analyses
      .find({ clerkUserId: session.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    // Convert ObjectId to string for frontend compatibility
    return recentAnalyses.map(analysis => ({
      ...analysis,
      _id: analysis._id.toString()
    }));
  } catch (error) {
    console.error("Error fetching recent analyses:", error);
    return [];
  }
}

// Removed old getUserStats function - now handled by new component

export default async function AlyzitronDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  const recentAnalyses = await getRecentAnalyses();

  return (
    <AnalyticsProvider>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
        <div className="flex flex-col lg:grid lg:grid-cols-3 lg:items-start gap-6 lg:gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">
            {/* Hero Section */}
            <div className="pt-4 sm:pt-0">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2 sm:gap-3">
                  <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" color="#3b81f5" />
                  Alyzitron
                </h1>
                <p className="mt-2 sm:mt-3 text-sm sm:text-base lg:text-lg text-zinc-400 font-light">
                  Transform your content with precise, data-driven insights
                </p>
              </div>
            </div>

            {/* Mobile/Tablet Compact Analytics - Positioned at top for easy access */}
            <div className="lg:hidden">
              <CompactAnalytics />
            </div>

            {/* Client Components */}
            <ClientWrapper initialAnalyses={recentAnalyses} />
          </div>

          {/* Desktop Analytics - Hidden on mobile/tablet */}
          <div className="hidden lg:block space-y-6 lg:space-y-8 sticky top-6">
            <AlyzitronAnalyticsOverview />
          </div>
        </div>
      </div>
    </AnalyticsProvider>
  );
}
