"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlyzitronAnalysis,
  AnalysisStatus,
} from "@/app/api/services/alyzitron/types";

import {
  Loader2,
  FileVideo,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AnalysisProgress } from "./AnalysisProgress";

interface AlyzitronTaskHistoryProps {
  itemsPerPage?: number;
}

interface AnalysisDisplay extends AlyzitronAnalysis {
  expectedWaitSeconds?: number;
  createdByName?: string;
}

interface PaginatedAnalysisResponse {
  data: AnalysisDisplay[];
  pagination: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
  };
}

const DEFAULT_ITEMS_PER_PAGE = 6;


export function AlyzitronTaskHistory({
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
}: AlyzitronTaskHistoryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);

  
  // SERVER pagination: trust API metadata, no client slicing for history
  const { data: pageData, isLoading } = useQuery<PaginatedAnalysisResponse>({
    // Standardized per-service key: ['alyzitron-tasks', page, limit]
    queryKey: ["alyzitron-tasks", currentPage, itemsPerPage],
    queryFn: async () => {
      const response = await fetch(
        `/api/services/alyzitron/analyses?page=${currentPage}&limit=${itemsPerPage}`
      );
      if (!response.ok) throw new Error("Failed to fetch analyses");
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: (query): any => {
      const arr = Array.isArray(query.state.data?.data) ? query.state.data!.data : [];
      const hasInProgress = arr.some((a: any) =>
        ["listed", "queued", "processing"].includes(a.status)
      );
      return hasInProgress ? 0 : 1000 * 60 * 5;
    },
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
    refetchInterval: (query): any => {
      const arr = Array.isArray(query.state.data?.data) ? query.state.data!.data : [];
      const hasInProgress = arr.some((a: any) =>
        ["listed", "queued", "processing"].includes(a.status)
      );
      return hasInProgress ? 3000 : false;
    },
  });

  const pageItems = Array.isArray(pageData?.data) ? pageData!.data : [];
  const inProgressStatuses: AnalysisStatus[] = [
    "listed",
    "queued",
    "processing",
  ];
  const inProgressAnalyses: AnalysisDisplay[] = pageItems.filter((a) =>
    inProgressStatuses.includes(a.status)
  );
  const completedFailedAnalyses: AnalysisDisplay[] = pageItems.filter(
    (a) => !inProgressStatuses.includes(a.status)
  );

  const totalPages = Math.max(1, Number(pageData?.pagination?.totalPages) || 1);
  const totalItems =
    Number(pageData?.pagination?.totalItems) || pageItems.length;
  const processingAnalysesCount = inProgressAnalyses.length;

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const markAsRead = async (analysisId: string) => {
    try {
      // Update server using existing PATCH endpoint
      const response = await fetch("/api/services/alyzitron/analyses", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ analysisId }),
      });

      if (!response.ok) {
        throw new Error("Failed to mark analysis as read");
      }

      // Update local cache for all relevant query keys
      queryClient.setQueriesData(
        { queryKey: ["alyzitron-tasks"] },
        (oldData: PaginatedAnalysisResponse | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            data: oldData.data.map((analysis) =>
              analysis._id === analysisId
                ? { ...analysis, unread: false }
                : analysis
            ),
          };
        }
      );
    } catch (error) {
      console.error("Failed to mark analysis as read:", error);
      // Continue with navigation even if marking as read fails
    }
  };

  const handleAnalysisClick = async (analysis: AnalysisDisplay) => {
    // Only mark as read if it's currently unread to avoid unnecessary API calls
    if (analysis.unread) {
      await markAsRead(analysis._id);
    }
    router.push(`/dashboard/alyzitron/report/${analysis._id}`);
  };

  return (
    <div className="border-t border-[#1C1B19] px-0 py-6 sm:py-8">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.08em] text-[#5F5E5A]">
          RECENT · {totalItems}
          {processingAnalysesCount > 0 && (
            <span className="ml-2 text-[#D4A652]">
              · {processingAnalysesCount} in progress
            </span>
          )}
        </span>
      </div>

      {/* In Progress Section */}
      {inProgressAnalyses && inProgressAnalyses.length > 0 && (
        <div className="mb-1.5">
          <div className="flex flex-col gap-1.5">
            {inProgressAnalyses.map((analysis: AnalysisDisplay) => (
              <AnalysisProgress
                key={analysis._id}
                analysisId={analysis._id}
                title={analysis.metadata?.originalFilename}
                status={analysis.status}
                queuePosition={analysis.queuePosition}
                error={analysis.error}
                metadata={analysis.metadata}
                videoUrl={analysis.videoUrl}
                expectedDurationSeconds={analysis.expectedDurationSeconds}
                processingStartTime={analysis.processingStartTime}
                createdByName={analysis.createdByName}
                results={analysis.results}
                onClick={() => handleAnalysisClick(analysis)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      <div className="relative min-h-[260px]">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#7A776E]" />
          </div>
        ) : completedFailedAnalyses.length === 0 &&
          inProgressAnalyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-[#282724] bg-[#0F0F0E]/50 px-6 py-20">
            <FileVideo className="mb-4 h-10 w-10 text-[#5F5E5A]" />
            <p className="mb-2 text-center text-sm text-[#B5B2A8]">
              No analyses found yet
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {completedFailedAnalyses.map((analysis) => (
              <AnalysisProgress
                key={analysis._id}
                analysisId={analysis._id}
                title={analysis.metadata?.originalFilename}
                status={analysis.status}
                unread={analysis.unread}
                error={analysis.error}
                metadata={analysis.metadata}
                videoUrl={analysis.videoUrl}
                createdByName={analysis.createdByName}
                results={analysis.results}
                onClick={() => handleAnalysisClick(analysis)}
              />
            ))}

            {/* Empty state for current page */}
            {completedFailedAnalyses.length === 0 && !isLoading && (
              <div className="py-8 text-center text-sm text-[#5F5E5A]">
                No analyses on this page.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1 || isLoading}
            className="order-2 w-full border-[#282724] bg-transparent text-[#B5B2A8] hover:bg-[#131312] hover:text-[#ECE9E1] sm:order-1 sm:w-auto"
          >
            <ChevronLeft className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Previous</span>
          </Button>
          <span className="order-1 text-center font-mono text-xs text-[#7A776E] sm:order-2 sm:text-sm">
            Page {currentPage} of {totalPages}
            <span className="hidden sm:inline"> ({totalItems} total)</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || isLoading}
            className="order-3 w-full border-[#282724] bg-transparent text-[#B5B2A8] hover:bg-[#131312] hover:text-[#ECE9E1] sm:w-auto"
          >
            <span className="text-xs sm:text-sm">Next</span>
            <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
