"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import type {
  AlyzitronAnalysis,
  AnalysisStatus,
} from "@/app/api/services/alyzitron/types";

import {
  Loader2,
  FileVideo,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Activity,
  Radar,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30">
            <BarChart3 className="h-4 w-4 text-blue-300" />
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
            Analysis History
          </h2>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="px-2.5 py-1 bg-zinc-800/60 border border-zinc-700/50 rounded-full text-xs font-medium">
              {totalItems} total
            </span>
            {processingAnalysesCount > 0 && (
              <span className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-full text-xs font-medium animate-pulse">
                {processingAnalysesCount} processing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* In Progress Section */}
      {inProgressAnalyses && inProgressAnalyses.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-zinc-800/50">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-amber-100 tracking-wide uppercase letter-spacing-wider">
              In Progress
            </h3>
            <div className="h-1 w-1 rounded-full bg-amber-400/60 animate-pulse"></div>
          </div>
          <div className="space-y-3 sm:space-y-4">
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
                onClick={() => handleAnalysisClick(analysis)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      <div className="space-y-3 sm:space-y-4 min-h-[400px] relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : completedFailedAnalyses.length === 0 &&
          inProgressAnalyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-black/20 py-24 px-6">
            <FileVideo className="h-12 w-12 text-zinc-500 mb-4" />
            <p className="text-zinc-400 text-center mb-2">
              No analyses found yet
            </p>
            <p className="text-zinc-500 text-sm text-center">
              Start an analysis using the form above to see it appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-zinc-800/50">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500/20 to-yellow-500/20 border border-emerald-500/20">
                <Radar className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-emerald-100 tracking-wide uppercase letter-spacing-wider">
                Processing Result
              </h3>
            </div>
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
                onClick={() => handleAnalysisClick(analysis)}
              />
            ))}

            {/* Empty state for current page */}
            {completedFailedAnalyses.length === 0 && !isLoading && (
              <div className="text-center py-8 text-zinc-500">
                No analyses on this page.
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1 || isLoading}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            <ChevronLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Previous</span>
          </Button>
          <span className="text-xs sm:text-sm text-zinc-400 order-1 sm:order-2 text-center">
            Page {currentPage} of {totalPages}
            <span className="hidden sm:inline"> ({totalItems} total)</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || isLoading}
            className="w-full sm:w-auto order-3"
          >
            <span className="text-xs sm:text-sm">Next</span>
            <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
