import DashboardClientLayout from "@/components/dashboard/DashboardClientLayout";
import React, { Suspense } from "react";
import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export const revalidate = 60;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Remove blocking getUserData call - let client handle initialization
  return (
    <DashboardClientLayout initialUserData={null}>
      <Suspense fallback={<UniversalLoader />}>
        {children}
      </Suspense>
    </DashboardClientLayout>
  );
}
