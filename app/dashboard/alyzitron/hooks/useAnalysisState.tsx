"use client";

import * as React from "react";
import { analysisEventEmitter } from "@/lib/sseManager";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  simulateProgress,
  updateQueueState,
  estimateQueueWaitTime,
} from "@/app/dashboard/alyzitron/utils/progress";
import { useToast } from "../../../../hooks/use-toast";
import { CheckCircle2 } from "lucide-react";

export interface Analysis {
  analysisId: string;
  taskId: string;
  type: string;
  title?: string;
  videoUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  estimatedTime?: number;
  queuePosition?: number;
  results?: {
    category: string;
    metrics?: Record<string, number>;
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

interface ProgressState {
  startTime: number;
  estimatedDuration: number;
  status: Analysis["status"];
  progress: number;
}

async function fetchAnalysis(analysisId: string): Promise<Analysis> {
  const response = await fetch(
    `/api/services/alyzitron/analyses/${analysisId}`
  );
  if (!response.ok) throw new Error("Failed to fetch analysis status");
  return await response.json();
}

const getStoredProgressState = (analysisId: string): ProgressState | null => {
  const stored = localStorage.getItem(`analysis_progress_${analysisId}`);
  if (!stored) return null;

  const state = JSON.parse(stored);
  // Only return if not older than 1 hour and analysis is not complete
  if (Date.now() - state.startTime < 3600000 && state.status !== "completed") {
    return state;
  }
  localStorage.removeItem(`analysis_progress_${analysisId}`);
  return null;
};

export function useAnalysisState(analysisId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const toastIdRef = React.useRef<
    { id: string; dismiss: () => void } | undefined
  >(undefined);
  const previousStatusRef = React.useRef<Analysis["status"] | null>(null);
  const completionNotifiedRef = React.useRef<boolean>(false);

  // Query for fetching analysis status
  // Query for fetching analysis status with SSE integration
  const { data: analysis, error } = useQuery<Analysis | null, Error>({
    queryKey: ["analysis", analysisId],
    queryFn: () =>
      analysisId ? fetchAnalysis(analysisId) : Promise.resolve(null),
    enabled: !!analysisId,
  });

  // Listen for SSE updates
  React.useEffect(() => {
    if (!analysisId) return;

    const handleAnalysisUpdate = (data: Partial<Analysis>) => {
      if (data.analysisId === analysisId) {
        queryClient.setQueryData<Analysis | null>(
          ["analysis", analysisId],
          (old) => {
            if (!old) return null;
            return {
              ...old,
              ...data,
            };
          }
        );
      }
    };

    analysisEventEmitter.on("analysisUpdate", handleAnalysisUpdate);

    return () => {
      analysisEventEmitter.off("analysisUpdate", handleAnalysisUpdate);
    };
  }, [analysisId, queryClient]);

  // Load notification state on mount
  React.useEffect(() => {
    if (analysisId) {
      const notified = localStorage.getItem(`analysis_notified_${analysisId}`);
      completionNotifiedRef.current = notified === "true";

      // Restore progress state
      const storedState = getStoredProgressState(analysisId);
      if (storedState) {
        queryClient.setQueryData<Analysis>(["analysis", analysisId], {
          status: storedState.status,
          progress: storedState.progress,
          analysisId,
          taskId: "restored",
          type: "restored",
          videoUrl: "",
        });
      }
    }
  }, [analysisId, queryClient]);

  React.useEffect(() => {
    if (!analysis?.status || analysis.status === previousStatusRef.current) {
      return;
    }

    if (toastIdRef.current) {
      toastIdRef.current?.dismiss();
    }

    const isNewCompletion =
      analysis.status === "completed" &&
      previousStatusRef.current !== "completed" &&
      !completionNotifiedRef.current;

    if (isNewCompletion) {
      const toastResult = toast({
        variant: "default",
        title: "Analysis Complete",
        description: "Your video analysis is ready to view",
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        duration: 5000,
      });
      toastIdRef.current = { id: toastResult.id, dismiss: toastResult.dismiss };

      if (analysisId) {
        localStorage.setItem(`analysis_notified_${analysisId}`, "true");
        completionNotifiedRef.current = true;
        localStorage.removeItem(`analysis_progress_${analysisId}`);
      }
    }

    previousStatusRef.current = analysis.status;
  }, [analysis?.status, analysisId, toast]);

  // Progress simulation mutation
  const { mutate: simulateProgressMutation } = useMutation<
    void,
    Error,
    { estimatedTime: number }
  >({
    mutationFn: async (params) => {
      return new Promise<void>((resolve) => {
        const progressState: ProgressState = {
          startTime: Date.now(),
          estimatedDuration: params.estimatedTime * 1000,
          status: "processing",
          progress: 0,
        };

        // Store initial progress state
        if (analysisId) {
          localStorage.setItem(
            `analysis_progress_${analysisId}`,
            JSON.stringify(progressState)
          );
        }

        simulateProgress(
          {
            targetProgress: 0.95,
            duration: progressState.estimatedDuration,
            updateInterval: 100,
          },
          (progress) => {
            // Update progress in React Query cache
            queryClient.setQueryData<Analysis | null>(
              ["analysis", analysisId],
              (old) => {
                if (!old) return null;
                const newState: Analysis = {
                  ...old,
                  progress,
                  status:
                    progress >= 0.95
                      ? "completed"
                      : ("processing" as Analysis["status"]),
                };

                // Update stored progress state
                if (analysisId && newState.status !== "completed") {
                  localStorage.setItem(
                    `analysis_progress_${analysisId}`,
                    JSON.stringify({
                      ...progressState,
                      progress,
                      status: newState.status,
                    })
                  );
                }

                return newState;
              }
            );
          },
          resolve
        );
      });
    },
  });

  // Queue state mutation
  const { mutate: updateQueueMutation } = useMutation<
    void,
    Error,
    { position: number; waitTime: number }
  >({
    mutationFn: async (params) => {
      return new Promise<void>((resolve) => {
        updateQueueState(params.position, params.waitTime, (state) => {
          // Update queue state in React Query cache
          queryClient.setQueryData<Analysis | null>(
            ["analysis", analysisId],
            (old) => {
              if (!old) return null;
              const status: Analysis["status"] =
                state.estimatedWaitTime === 0 ? "processing" : "queued";
              return {
                ...old,
                queuePosition: state.position,
                status,
              };
            }
          );

          if (state.estimatedWaitTime === 0) {
            resolve();
          }
        });
      });
    },
  });

  const startProgressTracking = (estimatedTime: number) => {
    if (analysisId) {
      localStorage.removeItem(`analysis_notified_${analysisId}`);
      completionNotifiedRef.current = false;
    }
    simulateProgressMutation({ estimatedTime });
  };

  const startQueueTracking = (position: number) => {
    if (analysisId) {
      localStorage.removeItem(`analysis_notified_${analysisId}`);
      completionNotifiedRef.current = false;
    }
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
