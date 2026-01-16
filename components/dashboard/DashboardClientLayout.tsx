"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import NotSignedIn from "@/components/NotSignedup";
import { UserInitializationProvider } from "@/components/dashboard/UserInitializationProvider";
import { DashboardProviders } from "@/components/providers/DashboardProviders";
import ServiceProviders from "@/providers/ServiceProviders";
import { User } from "@/types/userTypes";
import { lazy, Suspense } from "react";

// Lazy load heavy components
const DashboardSidebar = lazy(() => import("@/components/dashboard/DashboardSidebar"));
const TaskNotificationManager = lazy(() => import("@/components/dashboard/rtdb/TaskNotificationManager").then(mod => ({ default: mod.TaskNotificationManager })));
// const RtdbProvider = lazy(() => import("@/providers/RtdbProvider").then(mod => ({ default: mod.RtdbProvider })));

export default function DashboardClientLayout({
  children,
  initialUserData,
}: {
  children: React.ReactNode;
  initialUserData: User | null;
}) {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();

  const isReportRoute = pathname.startsWith('/dashboard/alyzitron/report/');

  if (!isSignedIn && !isReportRoute && isLoaded) {
    return <NotSignedIn />;
  }

  return (
    <DashboardProviders>
      <UserInitializationProvider initialData={initialUserData}>
        <Suspense fallback={<div className="fixed top-4 left-4 w-12 h-12 bg-zinc-800 rounded animate-pulse" />}>
          <ServiceProviders>
            <Suspense fallback={<div className="fixed left-0 top-0 w-16 h-screen bg-zinc-900 animate-pulse lg:block hidden" />}>
              <DashboardSidebar />
            </Suspense>
            <main className="min-h-screen bg-zinc-950/95 lg:pl-[64px] pt-16 lg:pt-0">
              <div className="min-h-screen">
                {children}
              </div>
            </main>
           {!pathname.startsWith("/dashboard/musitron") && (
              <Suspense fallback={null}>
                <TaskNotificationManager />
              </Suspense>
            )}
          </ServiceProviders>
        </Suspense>
      </UserInitializationProvider>
    </DashboardProviders>
  );
}