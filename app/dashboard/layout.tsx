import { getUserData } from "@/lib/services/getUserData";
import DashboardClientLayout from "@/components/dashboard/DashboardClientLayout";
import React, { Suspense } from "react";
import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export const revalidate = 60;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userData = await getUserData();

  return (
    <DashboardClientLayout initialUserData={JSON.parse(JSON.stringify(userData))}>
      <Suspense fallback={<UniversalLoader />}>
        {children}
      </Suspense>
    </DashboardClientLayout>
  );
}
