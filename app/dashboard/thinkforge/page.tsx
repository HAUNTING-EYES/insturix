"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import ThinkForgeDashboard from "@/components/dashboard/ThinkForge/ThinkForgeDashboard";

export default function Dashboard() {
  return (
    <DashboardShell>
      {/* Dashboard Header */}
      <ThinkForgeDashboard />
    </DashboardShell>
  );
}
