"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnalysisProgress } from './AnalysisProgress';
import type { AlyzitronAnalysis, AnalysisStatus } from '@/app/api/services/alyzitron/types';
import { useTaskUpdater } from '@/hooks/useTaskUpdater'; // Import the new hook

// Define the statuses considered "in-progress"
const inProgressStatuses: AnalysisStatus[] = ['listed', 'queued', 'processing'];

export function InProgressAnalyses() {
  useTaskUpdater(); // New hook to handle RTDB updates

  // Subscribe to the main 'analyses' query cache to get real-time updates
  const { data: allAnalyses } = useQuery<AlyzitronAnalysis[]>({
    queryKey: ['analyses'],
    // queryFn is required, but should rarely run due to ClientWrapper init + RTDB updates
    queryFn: async () => {
        console.log("InProgressAnalyses: queryFn called (fetching all analyses).");
        const response = await fetch('/api/services/alyzitron/analyses');
        if (!response.ok) throw new Error('Failed to fetch analyses');
        return response.json();
    },
    enabled: true, // Ensure it subscribes to cache changes
    // Removed staleTime: Infinity and refetchOnMount: false to allow refetching on invalidation
    gcTime: 1000 * 60 * 10, // Standard garbage collection
    // Removed refetchOnWindowFocus: false and refetchOnReconnect: false to allow default refetching behavior
  });

  // Filter for in-progress analyses
  const inProgressAnalyses = ((Array.isArray(allAnalyses) ? allAnalyses : [])
    .filter(a => inProgressStatuses.includes(a.status)) as AlyzitronAnalysis[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Show newest first


  if (inProgressAnalyses.length === 0) {
    return null; // Don't render the section if there's nothing in progress
  }

  return (
    <div>
      <h2 className="text-lg sm:text-xl font-medium text-zinc-100 mb-4 sm:mb-6">
        In Progress
      </h2>
      <div className="space-y-3 sm:space-y-4">
        {inProgressAnalyses.map((analysis) => {
          return (
            <AnalysisProgress
              key={analysis._id}
              analysisId={analysis._id.toString()}
              title={analysis.metadata?.originalFilename}
              status={analysis.status}
              queuePosition={analysis.status === 'queued' ? analysis.queuePosition : undefined}
              expectedDurationSeconds={analysis.expectedDurationSeconds}
              processingStartTime={analysis.processingStartTime}
              error={analysis.error}
              videoUrl={analysis.videoUrl}
            />
          );
        })}
      </div>
    </div>
  );
}