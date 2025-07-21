// "use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { BarChart2, Wallpaper, RefreshCw, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// Musitron color (example: #F59E42, adjust if needed)
const MUSITRON_COLOR = "#F59E42";

export function AnalyticsOverview() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["musitron-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/services/musitron/stats");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // Placeholder shape, adjust as per actual endpoint
  // {
  //   monthlySongs: number,
  //   maxSongs: number,
  //   remaining: number,
  //   resetPeriod: string,
  //   timeUntilReset: string
  // }

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg font-medium text-zinc-100 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" color={MUSITRON_COLOR} />
          Analytics Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="ml-2 text-zinc-400">Loading analytics...</span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error instanceof Error ? error.message : "Error loading analytics"}
          </div>
        ) : (
          <motion.div
            className="p-5 sm:p-6 bg-black/30 rounded-2xl border border-zinc-800 shadow-md"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Wallpaper className="h-6 w-6" color={MUSITRON_COLOR} />
              <div>
                <div className="text-base sm:text-lg font-semibold text-zinc-100">
                  Songs Generated
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Number of songs generated
                </div>
              </div>
            </div>
            <div className="mb-3">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-zinc-100 leading-tight">
                  {data?.monthlySongs ?? 0}
                </span>
                <span className="text-xs text-zinc-500 ml-2">
                  / {data?.maxSongs ?? 0}
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded mt-2">
                <div
                  className="h-2 rounded"
                  style={{
                    background: MUSITRON_COLOR,
                    width: data?.maxSongs
                      ? `${Math.min((data.monthlySongs / data.maxSongs) * 100, 100)}%`
                      : "0%",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center text-xs text-zinc-400">
                <span>{data?.remaining ?? 0} remaining</span>
                <span className="mx-2 text-zinc-700">·</span>
                <span>
                  Reset: <span className="font-medium">{data?.resetPeriod ?? "Monthly"}</span>
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                Resets in {data?.timeUntilReset ?? "0d 0h 0m"}
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}