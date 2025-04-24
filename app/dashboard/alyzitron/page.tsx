import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientWrapper } from "@/components/dashboard/Alyzitron/ClientWrapper";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { serializeAnalyses } from "@/app/dashboard/alyzitron/utils/serialization";
import { BarChart2, Star, Loader } from "lucide-react";

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

    return serializeAnalyses(recentAnalyses);
  } catch (error) {
    console.error("Error fetching recent analyses:", error);
    return [];
  }
}

async function getUserStats(userId: string) {
  try {
    const { analyses, userData } = await getCollections();

    const user = await userData.findOne({ clerkUserId: userId });
    const activeAnalyses = await analyses.countDocuments({
      clerkUserId: userId,
      status: { $in: ["pending", "queued", "processing"] },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyAnalyses = await analyses.countDocuments({
      clerkUserId: userId,
      createdAt: { $gte: monthStart },
    });

    const completedAnalyses = await analyses
      .find({
        clerkUserId: userId,
        status: "completed",
      })
      .toArray();

    const averageScore =
      completedAnalyses.length > 0
        ? completedAnalyses.reduce((sum, analysis) => {
            const score = analysis.results?.score || 0;
            return sum + score;
          }, 0) / completedAnalyses.length
        : 0;

    return {
      activeAnalyses,
      monthlyAnalyses,
      averageScore: Math.round(averageScore * 10) / 10,
      limits: user?.limits || {
        maxMonthlyAnalyses: 100,
        maxConcurrentAnalyses: 3,
      },
    };
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return {
      activeAnalyses: 0,
      monthlyAnalyses: 0,
      averageScore: 0,
      limits: {
        maxMonthlyAnalyses: 100,
        maxConcurrentAnalyses: 3,
      },
    };
  }
}

export default async function AlyzitronDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  const recentAnalyses = await getRecentAnalyses();
  const stats = await getUserStats(session.userId);

  return (
    <div className="container mx-auto p-8">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          {/* Hero Section */}
          <div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
                <BarChart2 className="h-8 w-8" color="#3b81f5" />
                Alyzitron
              </h1>
              <p className="mt-3 text-lg text-zinc-400 font-light">
                Transform your content with precise, data-driven insights
              </p>
            </div>
          </div>

          {/* Client Components */}
          <ClientWrapper initialAnalyses={recentAnalyses} />
        </div>

        {/* Stats & Insights */}
        <div className="space-y-8">
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
                <BarChart2 className="h-5 w-5" color="#3b81f5" />
                Analytics Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                  <BarChart2 className="h-4 w-4" color="#3b81f5" />
                  Monthly Analysis
                </div>
                <div className="text-3xl font-semibold text-zinc-100">
                  {stats.monthlyAnalyses}
                </div>
                <div className="text-sm text-zinc-500 mt-1">
                  of {stats.limits.maxMonthlyAnalyses} available
                </div>
              </div>
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                  <Star className="h-4 w-4" color="#3b81f5" />
                  Average Score
                </div>
                <div className="text-3xl font-semibold text-zinc-100">
                  {stats.averageScore.toFixed(1)}
                </div>
                <div className="text-sm text-zinc-500 mt-1">
                  Across all content
                </div>
              </div>
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                  <Loader className="h-4 w-4" color="#3b81f5" />
                  Processing Queue
                </div>
                <div className="text-3xl font-semibold text-zinc-100">
                  {stats.activeAnalyses}
                </div>
                <div className="text-sm text-zinc-500 mt-1">
                  of {stats.limits.maxConcurrentAnalyses} concurrent allowed
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
