import { Suspense } from "react";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";

export const metadata = {
  title: "Admin Dashboard | Insturix",
  description: "Control panel for managing event data and analytics",
  robots: "noindex, nofollow", // Hide from search engines
};

/**
 * Admin Dashboard Page
 * 
 * Protected by AdminLayout - only accessible to authenticated admin users.
 * Admin verification happens at the layout level.
 */
export default async function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950 flex items-center justify-center">
          <div className="w-8 h-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
        </div>
      }
    >
      <AdminDashboardClient />
    </Suspense>
  );
}
