"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { simulateProgress, updateQueueState, estimateQueueWaitTime } from "../utils/progress";

export interface Analysis {
  analysisId: string;
  taskId: string;
  type: string;
  title?: string;
  videoUrl: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  estimatedTime?: number;
  queuePosition?: number;
  results?: {
    category: string;
    metrics?: Record<string, unknown>;
    insights?: string[];
  };
  error?: {
    message: string;
    action?: string;
  };
  metadata?: {
    originalFilename: string;
    fileSize: number;
    mimeType: string;
  };
}

{ /* interface AnalysisProgress {
  progress: number;
  status: Analysis['status'];
  queuePosition?: number;
  estimatedWaitTime?: number;
} */}

const POLL_INTERVAL = 2000; // 2 seconds

async function fetchAnalysis(analysisId: string): Promise<Analysis> {
  const response = await fetch(`/api/services/alyzitron/analyses/${analysisId}`);
  if (!response.ok) throw new Error('Failed to fetch analysis status');
  const data = await response.json();
  return data;
}

export function useAnalysisState(analysisId?: string) {
  const queryClient = useQueryClient();

  // Query for fetching analysis status
  const { data: analysis, error } = useQuery<Analysis | null, Error>({
    queryKey: ['analysis', analysisId],
    queryFn: () => analysisId ? fetchAnalysis(analysisId) : Promise.resolve(null),
    enabled: !!analysisId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return !data || data.status === 'completed' || data.status === 'failed' 
        ? false 
        : POLL_INTERVAL;
    }
  });

  // Progress simulation mutation
  const { mutate: simulateProgressMutation } = useMutation<
    void,
    Error,
    { estimatedTime: number }
  >({
    mutationFn: async (params) => {
      return new Promise<void>((resolve) => {
        simulateProgress(
          {
            targetProgress: 0.9,
            duration: params.estimatedTime * 1000,
            updateInterval: 100,
          },
          (progress) => {
            // Update progress in React Query cache
            queryClient.setQueryData<Analysis | null>(
              ['analysis', analysisId],
              (old) => {
                if (!old) return null;
                return {
                  ...old,
                  progress,
                  status: progress >= 0.9 ? 'completed' : 'processing'
                };
              }
            );
          },
          resolve
        );
      });
    }
  });

  // Queue state mutation
  const { mutate: updateQueueMutation } = useMutation<
    void,
    Error,
    { position: number; waitTime: number }
  >({
    mutationFn: async (params) => {
      return new Promise<void>((resolve) => {
        updateQueueState(
          params.position,
          params.waitTime,
          (state) => {
            // Update queue state in React Query cache
            queryClient.setQueryData<Analysis | null>(
              ['analysis', analysisId],
              (old) => {
                if (!old) return null;
                return {
                  ...old,
                  queuePosition: state.position,
                  status: state.estimatedWaitTime === 0 ? 'processing' : 'queued'
                };
              }
            );

            if (state.estimatedWaitTime === 0) {
              resolve();
            }
          }
        );
      });
    }
  });

  // Start progress tracking
  const startProgressTracking = (estimatedTime: number) => {
    simulateProgressMutation({ estimatedTime });
  };

  // Start queue tracking
  const startQueueTracking = (position: number) => {
    const waitTime = estimateQueueWaitTime(position);
    updateQueueMutation({ position, waitTime });
  };

  return {
    analysis,
    error,
    startProgressTracking,
    startQueueTracking,
  };
}