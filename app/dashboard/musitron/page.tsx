import { auth } from "@clerk/nextjs/server";
import { MusitronLayout } from "@/components/dashboard/Musitron/MusitronLayout";
import React, { Suspense } from "react";
import { LoadingScreen } from "@/components/Loader/LoadingScreen";

export const revalidate = 60;

export default async function MusitronDashboard() {
  const session: any = await auth();
  if (!session?.userId) return null;

  // MusitronLayout currently does not accept props; recentTasks can be wired inside its ClientWrapper if needed.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MusitronLayout />
    </Suspense>
  );
}
