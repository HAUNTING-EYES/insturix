"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ListChecks, RefreshCw } from 'lucide-react';
import { AnalysisProgress } from './AnalysisProgress';
import type { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
interface FetchedAlyzitronAnalysis extends AlyzitronAnalysis {
  expectedWaitSeconds?: number;
  createdByName?: string;
}

export interface PaginatedResponse {
  data: FetchedAlyzitronAnalysis[];
  pagination: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
  };
}

interface AnalysisListProps {
  itemsPerPage?: number;
}

const DEFAULT_ITEMS_PER_PAGE = 10;

export function AnalysisList({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: AnalysisListProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  // RTDB listener removed in favor of polling/manual invalidation

  const { data: paginatedData, isLoading, isError, error } = useQuery<PaginatedResponse, Error>({
    queryKey: ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }],
    queryFn: async () => {
      const url = `/api/services/alyzitron/analyses?status=completed,failed&page=${currentPage}&limit=${itemsPerPage}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.text();
        console.error("Failed to fetch analyses:", errorData);
        throw new Error(`Failed to fetch analyses (status: ${response.status})`);
      }
      const data: PaginatedResponse = await response.json();
      return data;
    },
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 1000 * 60 * 1,
    gcTime: 1000 * 60 * 5,
  });

  // The useEffect that manually synced RTDB with react-query has been removed.
  // The useEffect that manually synced RTDB with react-query has been removed.
  // Polling or manual invalidation now handles updates.

  if (isLoading && !paginatedData) {
    return (
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <ListChecks className="h-5 w-5" color="#8B5CF6" />
            Completed Analyses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter received data client-side to strictly enforce terminal statuses
  const analyses = (paginatedData?.data ?? []).filter(analysis =>
    ['completed', 'failed'].includes(analysis.status)
  );
  const { totalItems = 0 } = paginatedData?.pagination ?? {};
  const actualTotalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 0;
  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, actualTotalPages));
  };

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-[14px] sm:text-lg font-medium text-zinc-100 flex items-center gap-2">
          <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" color="#8B5CF6" />
          Completed Analyses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 sm:space-y-4 min-h-[200px] relative">
          {/* Loading Overlay for refetches */}
          {isLoading && paginatedData && (
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-md transition-opacity duration-300">
              <div className="w-8 h-8 border-4 border-zinc-600 border-t-zinc-100 rounded-full animate-spin" />
            </div>
          )}
          {/* Error Message */}
          {isError && (
              <div className="text-center py-8 text-red-500">
                  Error loading analyses: {error?.message || 'Unknown error'}
              </div>
          )}
          {/* Map over the paginated analyses */}
          {analyses.map((analysis: FetchedAlyzitronAnalysis) => (
            <AnalysisProgress
              key={analysis._id}
              analysisId={analysis._id.toString()}
              title={analysis.metadata?.originalFilename}
              status={analysis.status}
              error={analysis.error}
              unread={analysis.unread}
              expectedDurationSeconds={analysis.expectedDurationSeconds}
              videoUrl={analysis.videoUrl}
              metadata={analysis.metadata}
              createdByName={analysis.createdByName}
              // Pass down necessary props for cache update
              queryClient={queryClient}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
            />
          ))}

          {/* Empty State Message */}
          {analyses.length === 0 && !isLoading && !isError && (
            <div className="text-center py-8 text-zinc-500">
              No completed analyses found.
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {actualTotalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-4 sm:mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={currentPage === 1 || isLoading}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              <ChevronLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-[11px] sm:text-sm">Previous</span>
            </Button>
            <span className="text-[11px] sm:text-sm text-zinc-400 order-1 sm:order-2 text-center">
              Page {currentPage} of {actualTotalPages}
              <span className="hidden sm:inline"> ({totalItems} total)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= actualTotalPages || isLoading}
              className="w-full sm:w-auto order-3"
            >
              <span className="text-[11px] sm:text-sm">Next</span>
              <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}