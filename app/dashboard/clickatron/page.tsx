import { auth } from "@clerk/nextjs/server";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { ClickatronTask } from "@/schemas/Clickatron";
import { Sparkles } from "lucide-react";
import { ClientWrapper } from "@/components/dashboard/Clickatron/ClientWrapper";
import { AnalyticsOverview } from "@/components/dashboard/Clickatron/AnalyticsOverview";
import { IClickatronTask } from "@/schemas/Clickatron";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

async function getRecentTasks(): Promise<any[]> {
  const session: any = await auth();
  if (!session?.userId) return [];

  try {
    await getClickatronDb();
    const recentTasks = await ClickatronTask.find({ userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    return recentTasks.map((task: any) => ({
      ...task,
      _id: task._id.toString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      ...(task.completedAt && { completedAt: task.completedAt.toISOString() }),
    }));
  } catch (error) {
    console.error("Error fetching recent Clickatron tasks:", error);
    return [];
  }
}

export default async function ClickatronDashboard() {
  const session: any = await auth();
  if (!session?.userId) return null;

  const recentTasks = await getRecentTasks();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          {/* Hero Section */}
          <div className="pt-4 sm:pt-0">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2 sm:gap-3">
                <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" color="#8B5CF6" />
                Clickatron
              </h1>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base lg:text-lg text-zinc-400 font-light">
                Generate stunning YouTube thumbnails in seconds using AI
              </p>
            </div>
          </div>

          {/* Client Components */}
          <ClientWrapper initialTasks={recentTasks} />
        </div>

        {/* Desktop Analytics - Hidden on mobile/tablet */}
        <div className="hidden lg:block space-y-6 lg:space-y-8">
          <AnalyticsOverview />
        </div>
      </div>
    </div>
  );
}