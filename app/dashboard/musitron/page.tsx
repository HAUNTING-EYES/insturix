import { auth } from "@clerk/nextjs/server";
import { getMusitronDb } from "@/lib/musitron-mongo";
import { MusitronTask } from "@/schemas/Musitron";
import { IMusitronTask } from "@/schemas/Musitron";
import { MusitronLayout } from "@/components/dashboard/Musitron/MusitronLayout";
import React, { Suspense } from "react";
import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export const revalidate = 60;

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
      createdAt: task.createdAt?.toISOString?.() ?? new Date(task.createdAt).toISOString(),
      updatedAt: task.updatedAt?.toISOString?.() ?? new Date(task.updatedAt).toISOString(),
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

  // MusitronLayout currently does not accept props; recentTasks can be wired inside its ClientWrapper if needed.
  return (
    <Suspense fallback={<UniversalLoader />}>
      <MusitronLayout />
    </Suspense>
  );
}