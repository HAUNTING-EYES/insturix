// "use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, ChevronDown, RefreshCw, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AnalyticsOverview } from "./AnalyticsOverview";

// Musitron color
const MUSITRON_COLOR = "#EFB100";

export function CompactAnalytics() {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["musitron-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/services/musitron/stats");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  const quickStats = {
    monthlySongs: data?.monthlySongs ?? 0,
  };

  return (
    <div className="bg-black/40 border border-zinc-800 backdrop-blur-xl rounded-lg overflow-hidden">
      {/* Compact Header - Always Visible */}
      <motion.div
        className="p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 className="h-5 w-5" color={MUSITRON_COLOR} />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Analytics</h3>
              <p className="text-xs text-zinc-400">Tap to view details</p>
            </div>
          </div>
          {/* Quick Stats - Always visible */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: MUSITRON_COLOR }}>{quickStats.monthlySongs}</div>
              <div className="text-xs text-zinc-500">This month</div>
            </div>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="ml-1"
            >
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="border-t border-zinc-800"
          >
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-zinc-400" />
                  <span className="ml-2 text-zinc-400">Loading analytics...</span>
                </div>
              ) : isError ? (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error instanceof Error ? error.message : "Error loading analytics"}
                </div>
              ) : (
                <AnalyticsOverview />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}