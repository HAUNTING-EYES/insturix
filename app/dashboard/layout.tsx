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
  // Fetch user data but don't block on errors - let client handle gracefully
  let userData = null;
  try {
    userData = await getUserData();
  } catch (error) {
    console.error("Failed to fetch user data in layout:", error);
    // Continue with null userData - client will handle initialization
  }

  return (
    <DashboardClientLayout initialUserData={userData ? JSON.parse(JSON.stringify(userData)) : null}>
      <Suspense fallback={<UniversalLoader />}>
        {children}
      </Suspense>
    </DashboardClientLayout>
  );
}
