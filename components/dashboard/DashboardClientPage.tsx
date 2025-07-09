"use client";

import Dashboard from "@/components/dashboard/Dashboard";
import CursorEffect from "@/components/ui/CursorEffect";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { FeatureUsageOverviewClient } from "@/components/dashboard/FeatureUsageOverviewClient";
import { useUserInitialization } from "@/components/dashboard/UserInitializationProvider";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

function LoadingState() {
  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
        <div className="mt-8">
          <Card className="w-full border-slate-200/60 dark:border-slate-800/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <Loader2 className="h-5 w-5 animate-spin" />
                Initializing your account...
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-slate-400">
                Setting up your dashboard with a free plan. This will only take a moment.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    </>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
        <div className="mt-8">
          <Card className="w-full border-rose-200/60 dark:border-rose-800/60">
            <CardHeader>
              <CardTitle className="text-rose-700 dark:text-rose-300">
                Account Initialization Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-rose-600 dark:text-rose-400 mb-4">
                There was an issue setting up your account: {error}
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Please refresh the page to try again. If the problem persists, contact support.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    </>
  );
}

export default function DashboardClientPage() {
  const { isInitialized, isLoading, error } = useUserInitialization();

  // Show loading state while initializing user
  if (isLoading) {
    return <LoadingState />;
  }

  // Show error state if initialization failed
  if (error) {
    return <ErrorState error={error} />;
  }

  // Show dashboard once initialized (or if user already existed)
  return (
    <>
      <Dashboard />
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
      {/* Feature Usage Overview */}
      <FeatureUsageOverviewClient />
      </DashboardShell>
    </>
  );
}