"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { BarChart2, Wallpaper, RefreshCw } from 'lucide-react';
import { useEnhancedStats } from "./hooks/useEnhancedStats";
import { useTaskUpdater } from '@/hooks/useTaskUpdater';

export function AnalyticsOverview() {
  const { stats, loading, error, refetch } = useEnhancedStats();
  
  // Initialize RTDB listener for real-time updates
  // The useTaskUpdater hook will handle cache invalidation when tasks complete
  useTaskUpdater();

  // No polling - rely solely on RTDB-triggered updates via useTaskUpdater

  if (loading) {
    return (
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <BarChart2 className="h-5 w-5" color="#8B5CF6" />
            Analytics Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <BarChart2 className="h-5 w-5" color="#8B5CF6" />
            Analytics Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-400 text-sm">
            Failed to load analytics. <button onClick={refetch} className="underline">Retry</button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg font-medium text-zinc-100 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" color="#8B5CF6" />
          Analytics Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {stats?.usage ? (
          <motion.div
            className="p-5 sm:p-6 bg-black/30 rounded-2xl border border-zinc-800 shadow-md"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Wallpaper className="h-6 w-6 text-violet-500" />
              <div>
                <div className="text-base sm:text-lg font-semibold text-zinc-100">
                  Thumbnails Generated
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Number of thumbnails generated
                </div>
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-zinc-100 leading-tight">
                  {stats.usage.currentUsage}
                </span>
                {!stats.usage.isUnlimited && (
                  <span className="text-xs text-zinc-500 ml-2">
                    / {stats.usage.maxUsage}
                  </span>
                )}
              </div>
              {!stats.usage.isUnlimited && (
                <div className="w-full h-2 bg-zinc-800 rounded mt-2">
                  <div
                    className="h-2 rounded bg-violet-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (stats.usage.currentUsage / stats.usage.maxUsage) * 100
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {stats.usage.isUnlimited ? (
              <div className="mt-4">
                <span className="bg-green-900/60 text-green-300 text-xs px-2 py-0.5 rounded font-semibold">
                  Unlimited
                </span>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                <div className="flex items-center text-xs text-zinc-400">
                  <span>{`${stats.usage.remaining} remaining`}</span>
                  {stats.usage.resetPeriod && (
                    <>
                      <span className="mx-2 text-zinc-700">·</span>
                      <span>
                        Reset:{" "}
                        <span className="font-medium">
                          {stats.usage.resetPeriod.charAt(0).toUpperCase() +
                            stats.usage.resetPeriod.slice(1)}
                        </span>
                      </span>
                    </>
                  )}
                </div>
                {stats.usage.timeUntilReset && (
                  <div className="text-xs text-zinc-400">
                    Resets in {stats.usage.timeUntilReset.days}d{" "}
                    {stats.usage.timeUntilReset.hours}h{" "}
                    {stats.usage.timeUntilReset.minutes}m
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="text-zinc-400 text-sm">No usage limits found for your account.</div>
        )}
      </CardContent>
    </Card>
  );
}