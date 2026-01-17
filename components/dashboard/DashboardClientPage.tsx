"use client";

import { lazy, Suspense, useState } from "react";
import { CreditsCard } from "@/components/shared/CreditsCard";
import { CreditsTopupModal } from "@/components/shared/CreditsTopupModal";

// Lazy load heavy components
const Dashboard = lazy(() => import("@/components/dashboard/Dashboard"));
const CursorEffect = lazy(() => import("@/components/ui/CursorEffect"));
const DashboardShell = lazy(
  () => import("@/components/dashboard/DashboardShell")
);

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

export default function DashboardClientPage() {
  const [showTopup, setShowTopup] = useState(false);

  return (
    <>
      <Suspense
        fallback={
          <div className="p-8">
            <div className="p-4 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] animate-pulse">
              <div className="h-8 bg-white/10 rounded mb-2"></div>
              <div className="h-6 bg-white/5 rounded w-2/3"></div>
            </div>
          </div>
        }
      >
        <Dashboard />
      </Suspense>

      <Suspense fallback={null}>
        <CursorEffect
          variant="glow"
          color={THEME.color}
          size={500}
          blur={100}
        />
      </Suspense>

      {/* Credits Card - replaces old per-service usage overview */}
      <div className="p-8 pt-4">
        <CreditsCard 
          onTopupClick={() => setShowTopup(true)} 
          className="max-w-md"
        />
      </div>

      <CreditsTopupModal 
        isOpen={showTopup} 
        onClose={() => setShowTopup(false)} 
      />
    </>
  );
}
