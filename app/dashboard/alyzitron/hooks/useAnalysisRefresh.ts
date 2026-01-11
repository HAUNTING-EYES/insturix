import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { AlyzitronAnalysis } from "@/app/api/services/alyzitron/types";

interface UseAnalysisRefreshProps {
  analysisId?: string;
  enabled?: boolean;
  refreshInterval?: number;
}

export function useAnalysisRefresh({
  analysisId,
  enabled = true,
  refreshInterval = 5000, // 5 seconds
}: UseAnalysisRefreshProps) {
  const queryClient = useQueryClient();

  // Fetch analysis data
  const {
    data: analysis,
    isLoading,
    error,
  } = useQuery<
    AlyzitronAnalysis,
    Error,
    AlyzitronAnalysis,
    [string, string | undefined]
  >({
    queryKey: ["analysis", analysisId],
    queryFn: async ({ queryKey: [, id] }) => {
      if (!id) {
        throw new Error("Analysis ID is required");
      }
      const response = await fetch(`/api/services/alyzitron/analyses/${id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch analysis");
      }
      const data = await response.json();
      return data as AlyzitronAnalysis;
    },
    enabled: enabled && !!analysisId,
    refetchInterval: (query) => {
      if (!query.state.data) return false;
      // Keep polling while analysis is in progress
      const status = query.state.data.status;
      return ["listed", "queued", "processing"].includes(status)
        ? refreshInterval
        : false;
    },
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    retry: (failureCount, error) => {
      // Retry up to 3 times unless it's a 404
      if (error instanceof Error && error.message.includes("not found")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Force refresh analysis data
  const refresh = useCallback(() => {
    if (analysisId) {
      queryClient.invalidateQueries({
        queryKey: ["analysis", analysisId],
      });
    }
  }, [analysisId, queryClient]);

  const isInProgress =
    analysis && ["listed", "queued", "processing"].includes(analysis.status);

  return {
    analysis,
    isLoading,
    error,
    refresh,
    isStale: isInProgress || !analysis,
    isInProgress,
  };
}
