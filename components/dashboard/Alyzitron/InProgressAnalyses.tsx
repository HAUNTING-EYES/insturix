"use client";

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { AnalysisProgress } from './AnalysisProgress';
import type { ClientAlyzitronAnalysis } from '@/app/dashboard/alyzitron/types/client';

// Define the statuses considered "in-progress"
const inProgressStatuses: ClientAlyzitronAnalysis['status'][] = ['pending', 'queued', 'processing'];

export function InProgressAnalyses() {
  const { cancelAnalysis } = useVideoAnalysis();
  const queryClient = useQueryClient();

  // Subscribe to the main 'analyses' query cache to get real-time updates
  const { data: allAnalyses } = useQuery<ClientAlyzitronAnalysis[]>({
    queryKey: ['analyses'],
    // queryFn is required, but should rarely run due to ClientWrapper init + SSE updates
    queryFn: async () => {
        console.warn("InProgressAnalyses: queryFn called (should be rare).");
        return [] as ClientAlyzitronAnalysis[]; // Return empty array as fallback
    },
    enabled: true, // Ensure it subscribes to cache changes
    staleTime: Infinity, // Rely on cache updates from ClientWrapper/SSE
    gcTime: 1000 * 60 * 10, // Standard garbage collection
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Filter for in-progress analyses, ensuring allAnalyses is an array
  const inProgressAnalyses = Array.isArray(allAnalyses)
    ? allAnalyses.filter(a =>
        inProgressStatuses.includes(a.status)
      ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Show newest first
    : []; // Default to empty array if allAnalyses is not an array

  const handleCancel = async (taskId: string) => {
    // Find the analysis associated with the taskId to get the _id for potential optimistic update
    const analysisToCancel = allAnalyses?.find(a => a.taskId === taskId);
    if (!analysisToCancel) return;

    // Optimistic update in the main cache
    queryClient.setQueryData<ClientAlyzitronAnalysis[]>(['analyses'], (oldData) => {
        return (oldData || []).map(a =>
            a._id === analysisToCancel._id
                ? { ...a, status: 'failed', error: { code: 'USER_CANCELLED', message: 'Cancelled by user' } }
                : a
        );
    });

    try {
      await cancelAnalysis(taskId);
      // Optional: Invalidate if SSE doesn't reliably report cancellation status
      // queryClient.invalidateQueries({ queryKey: ['analyses'] });
    } catch (error) {
      console.error('Failed to cancel analysis:', error);
      // Revert optimistic update on error? Or rely on SSE/refetch to correct state.
      queryClient.invalidateQueries({ queryKey: ['analyses'] }); // Invalidate on error to be safe
    }
  };

  if (inProgressAnalyses.length === 0) {
    return null; // Don't render the section if there's nothing in progress
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-zinc-100 mb-6">
        In Progress
      </h2>
      <div className="space-y-4">
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
              onCancel={analysis.taskId && ['queued', 'processing'].includes(analysis.status) ? handleCancel : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}