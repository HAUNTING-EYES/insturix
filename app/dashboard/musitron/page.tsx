import { auth } from "@clerk/nextjs/server";
import { MusitronLayout } from "@/components/dashboard/Musitron/MusitronLayout";
import React, { Suspense } from "react";
import { LoadingScreen } from "@/components/Loader/LoadingScreen";

export const revalidate = 60;

export default async function MusitronDashboard() {
  const session: any = await auth();
  if (!session?.userId) return null;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <MusitronLayout />
    </Suspense>
  );
}
