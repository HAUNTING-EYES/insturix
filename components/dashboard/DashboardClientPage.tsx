"use client";

import { lazy, Suspense, useState, useEffect } from "react";
import ICS25Popup from "@/components/ICS25Popup";

// Lazy load heavy components
const Dashboard = lazy(() => import("@/components/dashboard/Dashboard"));
const CursorEffect = lazy(() => import("@/components/ui/CursorEffect"));
const DashboardShell = lazy(
  () => import("@/components/dashboard/DashboardShell")
);
const FeatureUsageOverviewClient = lazy(
  () => import("@/components/dashboard/FeatureUsageOverviewClient").then(mod => ({ default: mod.FeatureUsageOverviewClient }))
);

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

export default function DashboardClientPage() {
  const [showICS25Popup, setShowICS25Popup] = useState(false);

  useEffect(() => {
    // Check if user has seen the popup before
    const hasSeenPopup = localStorage.getItem('ics25-dashboard-popup-seen');

    if (!hasSeenPopup) {
      // Show popup after a short delay
      const timer = setTimeout(() => {
        setShowICS25Popup(true);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, []);

  const handleCloseICS25Popup = () => {
    setShowICS25Popup(false);
    // Mark as seen for this session
    localStorage.setItem('ics25-dashboard-popup-seen', 'true');
  };

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

      {/* ICS25 Popup */}
      <ICS25Popup
        isOpen={showICS25Popup}
        onClose={handleCloseICS25Popup}
      />

      <Suspense fallback={null}>
        <CursorEffect
          variant="glow"
          color={THEME.color}
          size={500}
          blur={100}
        />
      </Suspense>

      <Suspense
        fallback={
          <div className="p-8 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] animate-pulse"
                >
                  <div className="h-4 bg-white/10 rounded mb-2"></div>
                  <div className="h-8 bg-white/5 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <DashboardShell>
          <FeatureUsageOverviewClient />
        </DashboardShell>
      </Suspense>
    </>
  );
}
