"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { BarChart2, Activity, RefreshCw } from 'lucide-react';
import { useGetStats } from "./hooks/useGetStats";

export function AnalyticsOverview() {
  const { stats, isLoading } = useGetStats();

  if (isLoading) {
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

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg font-medium text-zinc-100 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" color="#8B5CF6" />
          Analytics Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4">
          {/* Monthly Tasks */}
          <motion.div
            className="p-3 sm:p-4 bg-black/20 rounded-lg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-400 mb-1">
              <BarChart2 className="h-3 w-3 sm:h-4 sm:w-4" color="#8B5CF6" />
              Monthly Tasks
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-zinc-100">
              {stats?.monthlyTasks ?? 0}
            </div>
            <div className="text-xs sm:text-sm text-zinc-500 mt-1">
              This month
            </div>
          </motion.div>

          {/* Processing Queue */}
          <motion.div
            className="p-3 sm:p-4 bg-black/20 rounded-lg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-400 mb-1">
              <Activity className="h-3 w-3 sm:h-4 sm:w-4" color="#8B5CF6" />
              Processing Queue
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-zinc-100">
              {stats?.pendingTasks ?? 0}
            </div>
            <div className="text-xs sm:text-sm text-zinc-500 mt-1">
              Currently pending
            </div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  );
}