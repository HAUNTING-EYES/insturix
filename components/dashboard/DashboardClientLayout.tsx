"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import NotSignedIn from "@/components/NotSignedup";
import { UserInitializationProvider } from "@/components/dashboard/UserInitializationProvider";
import { DashboardProviders } from "@/components/providers/DashboardProviders";
import ServiceProviders from "@/providers/ServiceProviders";
import { User } from "@/types/userTypes";
import { lazy, Suspense } from "react";
import { ActiveBrandProvider } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import { BrandSwitcher } from "@/components/dashboard/ActiveBrand/BrandSwitcher";

// Lazy load heavy components
const DashboardSidebar = lazy(() => import("@/components/dashboard/DashboardSidebar"));
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
            <ActiveBrandProvider>
              <Suspense fallback={<div className="fixed left-0 top-0 w-16 h-screen bg-[#0B0B0A] animate-pulse lg:block hidden" />}>
                <DashboardSidebar />
              </Suspense>
              <BrandSwitcher />
              <main className="min-h-screen bg-[#0B0B0A] lg:pl-[64px] pt-16 lg:pt-0">
                <div className="min-h-screen">
                  {children}
                </div>
              </main>
            </ActiveBrandProvider>
          </ServiceProviders>
        </Suspense>
      </UserInitializationProvider>
    </DashboardProviders>
  );
}