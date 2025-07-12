import { auth } from "@clerk/nextjs/server";
import { getMusitronDb } from "@/lib/musitron-mongo";
import { MusitronTask } from "@/schemas/Musitron";
import { IMusitronTask } from "@/schemas/Musitron";
import { MusitronLayout } from "@/components/dashboard/Musitron/MusitronLayout";

export const dynamic = "force-dynamic";

async function getRecentTasks(): Promise<IMusitronTask[]> {
  const session: any = await auth();
  if (!session?.userId) return [];

  try {
    await getMusitronDb();
    const recentTasks = await MusitronTask.find({ userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    return recentTasks.map((task: any) => ({
      ...task,
      _id: task._id.toString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error("Error fetching recent Musitron tasks:", error);
    return [];
  }
}

export default async function MusitronDashboard() {
  const session: any = await auth();
  if (!session?.userId) return null;

  const recentTasks = await getRecentTasks();

  return <MusitronLayout initialTasks={recentTasks} />;
}