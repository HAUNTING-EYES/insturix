"use client";

import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';

export function UsageDisplay() {
  // Fetch usage data using React Query
  const { data: usageData, error } = useQuery({
    queryKey: ['clickatron-analytics'],
    queryFn: async () => {
      const response = await fetch('/api/user/service-usage?service=clickatron');
      if (!response.ok) {
        throw new Error('Failed to fetch usage data');
      }
      const data = await response.json();
      
      // Get the variation generation limit
      const variationLimit = data?.maxVariationGeneration;
      
      if (!variationLimit) {
        throw new Error('Variation generation data not found in API response');
      }
      
      const variationsUsed = variationLimit.remaining === -1 ? 0 : variationLimit.maxUsage - variationLimit.remaining;
      const variationsCap = variationLimit.maxUsage === -1 ? '∞' : variationLimit.maxUsage;
      const remaining = variationLimit.remaining === -1 ? '∞' : variationLimit.remaining;
      
      return {
        variationsUsed,
        variationsCap,
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
        <ImageIcon className="h-3.5 w-3.5 text-purple-400" />
        Clickatron - Creative Lab
      </div>
      <p className="text-zinc-40 text-sm sm:text-base max-w-2xl">
        Transform ideas into stunning visuals. Describe what you want to create.
      </p>

      {/* Usage meter (subtle near Begin Analysis) */}
      <div className="mt-4 text-xs text-zinc-400">
        Weekly variation allowance:{" "}
        <span className="text-zinc-200 font-medium">
          {usageData?.remaining || '-'} / {usageData?.variationsCap || '-'} variations
        </span>{" "}
        remaining.
      </div>
    </div>
  );
}