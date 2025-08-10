"use client";

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';

export function UsageDisplay() {
  // Fetch usage data using React Query
  const { data: usageData, error } = useQuery({
    queryKey: ['alyzitron-analytics'],
    queryFn: async () => {
      const response = await fetch('/api/user/service-usage?service=alyzitron');
      if (!response.ok) {
        throw new Error('Failed to fetch usage data');
      }
      const data = await response.json();
      console.log('UsageDisplay API response:', data);
      console.log('UsageDisplay API response keys:', Object.keys(data));
      
      // The API is returning AnalysisMinutes directly, not wrapped in alyzitron
      const analysisMinutes = data?.AnalysisMinutes;
      
      if (!analysisMinutes) {
        console.error('AnalysisMinutes not found. Full response:', data);
        console.error('Available keys:', Object.keys(data));
        throw new Error('AnalysisMinutes data not found in API response');
      }
      
      console.log('AnalysisMinutes data:', analysisMinutes);
      console.log('AnalysisMinutes currentUsage:', analysisMinutes.currentUsage);
      console.log('AnalysisMinutes maxUsage:', analysisMinutes.maxUsage);
      console.log('AnalysisMinutes remaining:', analysisMinutes.remaining);
      
      const minutesUsed = analysisMinutes.remaining === -1 ? 0 : analysisMinutes.maxUsage - analysisMinutes.remaining;
      const minutesCap = analysisMinutes.maxUsage === -1 ? '∞' : analysisMinutes.maxUsage;
      const remaining = analysisMinutes.remaining === -1 ? '∞' : analysisMinutes.remaining;
      
      console.log('Calculated values:', { minutesUsed, minutesCap, remaining });
      
      return {
        minutesUsed,
        minutesCap,
        remaining
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
  });

  // Log error if there is one
  if (error) {
    console.error('UsageDisplay query error:', error);
  }

  return (
    <div className="mt-4 text-xs text-zinc-400">
      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-300 mb-4">
        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
        Alyzitron - Diagnostic Lab
      </div>
      <p className="text-zinc-400 text-sm sm:text-base max-w-2xl">
        A premium, fluid, and actionable analysis experience. Drag-and-drop
        or paste a link to begin.
      </p>

      {/* Usage meter (subtle near Begin Analysis) */}
      <div className="mt-4 text-xs text-zinc-400">
        Monthly analysis allowance:{" "}
        <span className="text-zinc-200 font-medium">
          {usageData?.remaining || '-'} / {usageData?.minutesCap || '-'} minutes
        </span>{" "}
        remaining.
      </div>
    </div>
  );
}