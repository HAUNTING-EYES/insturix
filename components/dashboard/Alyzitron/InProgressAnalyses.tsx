"use client";

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { AnalysisProgress } from './AnalysisProgress';
import type { AlyzitronAnalysis, AnalysisStatus } from '@/app/api/services/alyzitron/types';

// Define the statuses considered "in-progress"
const inProgressStatuses: AnalysisStatus[] = ['listed', 'queued', 'processing'];

// Timeout durations in milliseconds
const QUEUED_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function InProgressAnalyses() {
  const { cancelAnalysis } = useVideoAnalysis();
  const queryClient = useQueryClient();

  // Subscribe to the main 'analyses' query cache to get real-time updates
  const { data: allAnalyses } = useQuery<AlyzitronAnalysis[]>({
    queryKey: ['analyses'],
    // queryFn is required, but should rarely run due to ClientWrapper init + RTDB updates
    queryFn: async () => {
        console.warn("InProgressAnalyses: queryFn called (should be rare).");
        return [] as AlyzitronAnalysis[]; // Return empty array as fallback
    },
    enabled: true, // Ensure it subscribes to cache changes
    staleTime: Infinity, // Rely on cache updates from ClientWrapper/RTDB
    gcTime: 1000 * 60 * 10, // Standard garbage collection
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Filter for in-progress analyses and check for timeouts
  const now = Date.now();
  const inProgressAnalyses = ((Array.isArray(allAnalyses) ? allAnalyses : [])
    .map(a => {
      // 1. Immediately filter out analyses that are already in a terminal state in the cache
      if (!inProgressStatuses.includes(a.status)) {
        return null;
      }

      // 2. Check for timeouts for genuinely in-progress items
      let effectiveStatus: AnalysisStatus = a.status; // Start with current status
      let effectiveError: AlyzitronAnalysis['error'] = a.error; // Start with current error

      if (effectiveStatus === 'queued' && a.createdAt) {
        const queuedTime = now - new Date(a.createdAt).getTime();
        if (queuedTime > QUEUED_TIMEOUT_MS) {
          effectiveStatus = 'failed';
          effectiveError = {
            code: 'TIMEOUT_QUEUED',
            message: `Task timed out in queue`, // More specific message
          };
        }
      } else if (effectiveStatus === 'processing' && a.processingStartTime) {
        const processingTime = now - new Date(a.processingStartTime).getTime();
        if (processingTime > PROCESSING_TIMEOUT_MS) {
          effectiveStatus = 'failed';
          effectiveError = {
            code: 'TIMEOUT_PROCESSING',
            message: `Task timed out during processing`, // More specific message
          };
        }
      }

      // 3. Return the analysis object, potentially with updated status/error due to timeout
      return {
        ...a,
        status: effectiveStatus,
        error: effectiveError,
      };
    })
    .filter(Boolean) // Filter out the nulls from step 1
    // 4. Filter again: Only keep items whose *final effective status* is still in-progress
    .filter(a => inProgressStatuses.includes(a!.status)) as AlyzitronAnalysis[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Show newest first

  const handleCancel = async (taskId: string) => {
    const analysisToCancel = allAnalyses?.find(a => a.taskId === taskId);
    if (!analysisToCancel) return;

    // Store the original state for potential revert
    const originalAnalysisState = { ...analysisToCancel };

    // Optimistic update in the main cache to 'cancelled'
    queryClient.setQueryData<AlyzitronAnalysis[]>(['analyses'], (oldData) => {
        return (oldData || []).map(a =>
            a._id === analysisToCancel._id
                ? { ...a, status: 'cancelled' as AnalysisStatus, error: undefined } // Set status to 'cancelled', clear error
                : a
        );
    });

    // Also, immediately invalidate the 'completed' list query so it can potentially pick up the cancelled item
    // Use invalidateQueries with a predicate if the exact key structure is complex or varies
    // Invalidate the 'finished' list query so it can potentially pick up the cancelled/failed item
    queryClient.invalidateQueries({ queryKey: ['analyses', { scope: 'finished' }] });


    try {
      await cancelAnalysis(taskId); // This backend call MUST set the status to 'cancelled' in DB
      // Invalidation might still be useful as a fallback if RTDB fails
      // queryClient.invalidateQueries({ queryKey: ['analyses'] });
      // queryClient.invalidateQueries({ queryKey: ['analyses', { scope: 'completed' }] });
    } catch (error) {
      console.error('Failed to cancel analysis:', error);
      // Revert optimistic update on error
      queryClient.setQueryData<AlyzitronAnalysis[]>(['analyses'], (oldData) => {
        return (oldData || []).map(a =>
            a._id === analysisToCancel._id
                ? originalAnalysisState // Revert to the original state before optimistic update
                : a
        );
      });
      // Invalidate relevant queries to refetch correct state from the server
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['analyses', { scope: 'finished' }] });
    }
  };

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
              taskId={analysis.taskId}
              title={analysis.metadata?.originalFilename}
              type={analysis.type}
              status={analysis.status}
              queuePosition={analysis.status === 'queued' ? analysis.queuePosition : undefined}
              expectedDurationSeconds={analysis.expectedDurationSeconds}
              processingStartTime={analysis.processingStartTime}
              error={analysis.error}
              videoUrl={analysis.videoUrl}
              onCancel={analysis.taskId && analysis.status === 'queued' ? handleCancel : undefined} // Only allow cancel for 'queued' status
            />
          );
        })}
      </div>
    </div>
  );
}