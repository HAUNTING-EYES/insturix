"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  Activity,
  Video,
  Play,
  RefreshCw,
  AlertCircle,
  Clock,
  Info,
} from "lucide-react";
import { SERVICE_LIMIT_DEFINITIONS } from "@/lib/config/serviceLimits";
import { useQuery } from "@tanstack/react-query";

// type to normalize limit usage entries coming from API
type LimitUsage = {
  currentUsage: number;
  maxUsage: number; // -1 for unlimited
  remaining: number;
  resetPeriod: "daily" | "weekly" | "monthly" | "none" | string;
  isUnlimited?: boolean;
  timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
};

// Icon mapping for limit types
const iconMap: Record<string, React.ReactNode> = {
  BarChart2: <BarChart2 className="h-4 w-4" />,
  Activity: <Activity className="h-4 w-4" />,
  Video: <Video className="h-4 w-4" />,
  Play: <Play className="h-4 w-4" />,
};

const getLimitDisplayInfo = (limitType: string) => {
  const alyzitronLimits = SERVICE_LIMIT_DEFINITIONS.alyzitron;
  const limitDef = (alyzitronLimits as any)?.[limitType];

  if (!limitDef) {
    return {
      name: limitType,
      icon: <Video className="h-4 w-4" />,
      description: "Service limit",
    };
  }

  return {
    name: limitDef.name,
    icon: iconMap[limitDef.icon || "Video"] || <Video className="h-4 w-4" />,
    description: limitDef.description,
  };
};

function formatTimeUntilReset(
  timeUntilReset: { days: number; hours: number; minutes: number; totalMs: number } | null | undefined
): string {
  if (!timeUntilReset || timeUntilReset.totalMs <= 0) {
    return "Resets soon";
  }

  const { days = 0, hours = 0, minutes = 0 } = timeUntilReset;

  if (days > 0) {
    return `Resets in ${days}d ${hours}h`;
  } else if (hours > 0) {
    return `Resets in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `Resets in ${minutes}m`;
  } else {
    return "Resets soon";
  }
}

// Mirror Musitron: export a named component that uses TanStack useQuery with key ['alyzitron-analytics']
export function AlyzitronAnalyticsOverview() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["alyzitron-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/services/alyzitron/stats");
      if (!res.ok) throw new Error("Failed to fetch Alyzitron analytics");
      return res.json();
    },
    staleTime: 60_000,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <TooltipProvider>
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" color="#3b81f5" />
              Analytics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
              <span className="ml-2 text-zinc-400">Loading analytics...</span>
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  if (isError) {
    return (
      <TooltipProvider>
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" color="#3b81f5" />
              Analytics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error instanceof Error ? error.message : "Error loading analytics"}
            </div>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-4 border-zinc-700 text-zinc-300">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  const stats = data as any;
  if (!stats) return null;

  const serviceLimitsObj = (stats.serviceLimits || {}) as Record<string, LimitUsage>;
  const serviceLimitsArray = Object.entries(serviceLimitsObj) as [string, LimitUsage][];
  const visibleLimits = isExpanded ? serviceLimitsArray : serviceLimitsArray.slice(0, 2);

  return (
    <TooltipProvider>
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-medium text-zinc-100 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" color="#3b81f5" />
            Analytics Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Stats Grid - responsive layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {/* Monthly Usage */}
            <motion.div
              className="p-3 sm:p-4 bg-black/20 rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-400 mb-1">
                <BarChart2 className="h-3 w-3 sm:h-4 sm:w-4" color="#3b81f5" />
                Monthly Analyses
              </div>
              <div className="text-2xl sm:text-3xl font-semibold text-zinc-100">
                {stats.monthlyAnalyses ?? 0}
              </div>
              <div className="text-xs sm:text-sm text-zinc-500 mt-1">
                This month
              </div>
            </motion.div>
          </div>

          {/* Service Limits */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-medium text-zinc-300">Service Limits</h4>
              {serviceLimitsArray.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-auto p-1 text-zinc-400 hover:text-zinc-200"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </Button>
              )}
            </div>

            <AnimatePresence>
              {visibleLimits.map(([limitType, usage], index) => {
                const displayInfo = getLimitDisplayInfo(limitType);
                if (!usage) return null;

                const u = usage as LimitUsage;
                const usagePercentage =
                  u.isUnlimited || u.maxUsage === -1 ? 0 : (u.currentUsage / u.maxUsage) * 100;
                const isNearLimit = usagePercentage >= 80;

                return (
                  <motion.div
                    key={limitType}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="p-2 sm:p-3 bg-black/10 rounded-lg border border-zinc-800/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 mr-2">
                        {displayInfo.icon}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help min-w-0">
                              <span className="text-xs sm:text-sm font-medium text-zinc-300 truncate">
                                {displayInfo.name}
                              </span>
                              <Info className="h-2 w-2 sm:h-3 sm:w-3 text-zinc-500 flex-shrink-0" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-xs">
                            <span className="text-xs text-zinc-300">{displayInfo.description}</span>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.isUnlimited || u.maxUsage === -1 ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-200">
                            Unlimited
                          </span>
                        ) : (
                          <span className={`text-xs ${isNearLimit ? "text-orange-400" : "text-zinc-400"}`}>
                            {u.currentUsage} / {u.maxUsage}
                          </span>
                        )}
                      </div>
                    </div>
                    {!(u.isUnlimited || u.maxUsage === -1) && (
                      <div className="w-full h-2 bg-zinc-800 rounded">
                        <div
                          className={`h-2 rounded ${isNearLimit ? "bg-orange-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(usagePercentage, 100)}%`, transition: "width 0.3s" }}
                        />
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between text-[10px] sm:text-xs text-zinc-500">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Clock className="h-2 w-2 sm:h-3 sm:w-3" />
                          <span className="capitalize">{u.resetPeriod}</span>
                        </div>
                        <span className="text-zinc-700">·</span>
                        {/* <span>{u.remaining > 0 ? `${u.remaining} left` : "No remaining"}</span> */}
                      </div>
                      {u.timeUntilReset && u.resetPeriod !== "none" && u.currentUsage > 0 && (
                        <div className="text-[10px] sm:text-xs text-zinc-500">
                          {formatTimeUntilReset(u.timeUntilReset)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export {};