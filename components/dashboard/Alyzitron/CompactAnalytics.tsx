"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlyzitronAnalyticsOverview } from './AnalyticsOverview';
import { useUser } from '@clerk/nextjs';
import { useUserInitialization } from '@/components/dashboard/UserInitializationProvider';

interface QuickStats {
  monthlyAnalyses: number;
  activeAnalyses: number;
}

export function CompactAnalytics() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [quickStats, setQuickStats] = useState<QuickStats>({ monthlyAnalyses: 0, activeAnalyses: 0 });
  const { user, isLoaded } = useUser();
  const { isInitialized } = useUserInitialization();

  useEffect(() => {
    const fetchQuickStats = async () => {
      if (!user || !isLoaded || !isInitialized) return;

      try {
        const response = await fetch('/api/services/alyzitron/stats');
        if (response.ok) {
          const data = await response.json();
          setQuickStats({
            monthlyAnalyses: data.monthlyAnalyses || 0,
            activeAnalyses: data.activeAnalyses || 0,
          });
        }
      } catch (error) {
        console.error('Failed to fetch quick stats:', error);
      }
    };

    fetchQuickStats();
  }, [user, isLoaded, isInitialized]);

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
            <BarChart2 className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Analytics</h3>
              <p className="text-xs text-zinc-400">Tap to view details</p>
            </div>
          </div>
          
          {/* Quick Stats - Always visible */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-sm font-semibold text-zinc-100">{quickStats.monthlyAnalyses}</div>
              <div className="text-xs text-zinc-500">This month</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-zinc-100">{quickStats.activeAnalyses}</div>
              <div className="text-xs text-zinc-500">Active</div>
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
              <AlyzitronAnalyticsOverview />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}