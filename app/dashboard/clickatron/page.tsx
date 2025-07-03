import { auth } from "@clerk/nextjs/server";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { ClickatronTask } from "@/schemas/Clickatron";
import { ClickatronLayout } from "@/components/dashboard/Clickatron/ClickatronLayout";

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

  return <ClickatronLayout initialTasks={recentTasks} />;
}