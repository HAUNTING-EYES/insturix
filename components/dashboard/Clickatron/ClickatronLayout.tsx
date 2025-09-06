"use client";

import { Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";

// Lazy load heavy components
const ClientWrapper = lazy(() => import("@/components/dashboard/Clickatron/ClientWrapper").then(mod => ({ default: mod.ClientWrapper })));
const AnalyticsOverview = lazy(() => import("@/components/dashboard/Clickatron/AnalyticsOverview").then(mod => ({ default: mod.AnalyticsOverview })));
const CompactAnalytics = lazy(() => import("@/components/dashboard/Clickatron/CompactAnalytics").then(mod => ({ default: mod.CompactAnalytics })));

export function ClickatronLayout() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      <div className="flex flex-col lg:grid lg:grid-cols-3 lg:items-start gap-6 lg:gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          {/* Hero Section - Load immediately */}
          <div className="pt-4 sm:pt-0">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2 sm:gap-3">
                <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" color="#8B5CF6" />
                Clickatron
              </h1>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base lg:text-lg text-zinc-400 font-light">
                Generate stunning YouTube thumbnails in seconds using AI
              </p>
            </div>
          </div>

          {/* Mobile/Tablet Compact Analytics */}
          <div className="lg:hidden">
            <Suspense fallback={
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] animate-pulse">
                <div className="h-4 bg-white/10 rounded mb-2"></div>
                <div className="h-8 bg-white/5 rounded"></div>
              </div>
            }>
              <CompactAnalytics />
            </Suspense>
          </div>

          {/* Client Components */}
          <Suspense fallback={
            <div className="space-y-6">
              <div className="p-6 rounded-lg bg-white/[0.02] border border-white/[0.08] animate-pulse">
                <div className="h-6 bg-white/10 rounded mb-4"></div>
                <div className="h-32 bg-white/5 rounded"></div>
              </div>
            </div>
          }>
            <ClientWrapper />
          </Suspense>
        </div>

        {/* Desktop Analytics - Hidden on mobile/tablet */}
        <div className="hidden lg:block space-y-6 lg:space-y-8 sticky top-6">
          <Suspense fallback={
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] animate-pulse">
              <div className="h-4 bg-white/10 rounded mb-2"></div>
              <div className="h-8 bg-white/5 rounded"></div>
            </div>
          }>
            <AnalyticsOverview />
          </Suspense>
        </div>
      </div>
    </div>
  );
}