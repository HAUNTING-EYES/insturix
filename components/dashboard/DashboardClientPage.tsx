"use client";

import Dashboard from "@/components/dashboard/Dashboard";
import CursorEffect from "@/components/ui/CursorEffect";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { FeatureUsageOverviewClient } from "@/components/dashboard/FeatureUsageOverviewClient";
import { useUserInitialization } from "@/components/dashboard/UserInitializationProvider";

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

export default function DashboardClientPage() {
  const { isLoading, error } = useUserInitialization();

  // Remove blocking loading state for user initialization
  // Always show dashboard; handle initialization in background

  // Optionally, show a non-blocking notification if error occurs
  // if (error) {
  //   // Could show a toast or banner, but don't block dashboard
  // }

  return (
    <>
      <Dashboard />
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
      {/* Feature Usage Overview */}
      <FeatureUsageOverviewClient />
      </DashboardShell>
      {/* Optionally, show a subtle loader or notification if isLoading */}
      {/* {isLoading && <div className="absolute top-4 right-4"><Loader2 className="h-5 w-5 animate-spin" /></div>} */}
    </>
  );
}