"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2, ChevronDown } from 'lucide-react';
import { AnalyticsOverview } from './AnalyticsOverview';
import { useEnhancedStats } from './hooks/useEnhancedStats';

export function CompactAnalytics() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { stats } = useEnhancedStats();

  const quickStats = {
    monthlyTasks: stats?.monthlyTasks ?? 0,
    pendingTasks: stats?.pendingTasks ?? 0,
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
            <BarChart2 className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Analytics</h3>
              <p className="text-xs text-zinc-400">Tap to view details</p>
            </div>
          </div>
          
          {/* Quick Stats - Only monthly tasks visible */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-sm font-semibold text-zinc-100">{quickStats.monthlyTasks}</div>
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
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="border-t border-zinc-800"
          >
            <div className="p-4">
              <AnalyticsOverview />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}