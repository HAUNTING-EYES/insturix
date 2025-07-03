"use client";

import { Sparkles } from "lucide-react";
import { ClientWrapper } from "@/components/dashboard/Clickatron/ClientWrapper";
import { AnalyticsOverview } from "@/components/dashboard/Clickatron/AnalyticsOverview";
import { IClickatronTask } from "@/schemas/Clickatron";

interface ClickatronLayoutProps {
  initialTasks: IClickatronTask[];
}

export function ClickatronLayout({ initialTasks }: ClickatronLayoutProps) {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      <div className="flex flex-col lg:grid lg:grid-cols-3 lg:items-start gap-6 lg:gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          {/* Hero Section */}
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

          {/* Client Components */}
          <ClientWrapper initialTasks={initialTasks} />
        </div>

        {/* Desktop Analytics - Hidden on mobile/tablet */}
        <div className="hidden lg:block space-y-6 lg:space-y-8 sticky top-6">
          <AnalyticsOverview />
        </div>
      </div>
    </div>
  );
}