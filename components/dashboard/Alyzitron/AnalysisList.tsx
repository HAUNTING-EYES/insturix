"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnalysisProgress } from './AnalysisProgress';
import { useRtdb } from '@/providers/RtdbProvider';
import type { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';

interface FetchedAlyzitronAnalysis extends AlyzitronAnalysis {
  expectedWaitSeconds?: number;
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

interface AnalysisUpdateEvent extends Partial<Omit<AlyzitronAnalysis, '_id' | 'metadata'>> {
  _id?: string;
  analysisId?: string;
  metadata?: Partial<AlyzitronAnalysis['metadata']>;
}

const DEFAULT_ITEMS_PER_PAGE = 10;

export function AnalysisList({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: AnalysisListProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser();
  const { allTasks } = useRtdb();
  const alyzitronTasks = allTasks.alyzitron || [];

  const { data: paginatedData, isLoading, isError, error } = useQuery<PaginatedResponse, Error>({
    queryKey: ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }],
    queryFn: async () => {
      const url = `/api/services/alyzitron/analyses?status=completed,failed,cancelled&page=${currentPage}&limit=${itemsPerPage}`;
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

  // Filter received data client-side to strictly enforce terminal statuses
  const analyses = (paginatedData?.data ?? []).filter(analysis =>
    ['completed', 'failed', 'cancelled'].includes(analysis.status)
  );
  const { totalItems = 0 } = paginatedData?.pagination ?? {};
  const actualTotalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 0;

  // --- RTDB Integration for real-time updates ---
  useEffect(() => {
    if (alyzitronTasks.length === 0) return;

    // Check for tasks that have completed/failed and invalidate the query to fetch full details
    alyzitronTasks.forEach(task => {
      if (['completed', 'failed'].includes(task.status)) {
        // Invalidate the query to refetch completed analyses
        queryClient.invalidateQueries({
          queryKey: ['analyses', { scope: 'finished', page: 1, limit: itemsPerPage }],
        });

        // Also invalidate current page if not page 1
        if (currentPage !== 1) {
          queryClient.invalidateQueries({
            queryKey: ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }],
          });
        }
      }
    });
  }, [alyzitronTasks, queryClient, itemsPerPage, currentPage]);


  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, actualTotalPages));
  };

  return (
    <div>
      {/* Title - Simplified */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-medium text-zinc-100">
          Completed Analyses
        </h2>
      </div>
      {/* Analysis List Area */}
      <div className="space-y-3 sm:space-y-4 min-h-[200px] relative">
        {/* Loading Overlay - Uses isLoading from the paginated query */}
        {isLoading && (
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
            taskId={analysis.taskId}
            title={analysis.metadata?.originalFilename}
            type={analysis.type}
            status={analysis.status}
            error={analysis.error}
            unread={analysis.unread}
            expectedDurationSeconds={analysis.expectedDurationSeconds}
            onCancel={undefined}
            videoUrl={analysis.videoUrl}
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

      {/* Pagination Controls - Mobile optimized */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-4 sm:mt-6">
         <Button
           variant="outline"
           size="sm"
           onClick={handlePreviousPage}
           disabled={currentPage === 1 || actualTotalPages === 0 || isLoading}
           className="w-full sm:w-auto order-2 sm:order-1"
         >
           <ChevronLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
           <span className="text-xs sm:text-sm">Previous</span>
         </Button>
         <span className="text-xs sm:text-sm text-zinc-400 order-1 sm:order-2 text-center">
           Page {actualTotalPages === 0 ? 1 : currentPage} of {actualTotalPages}
           <span className="hidden sm:inline"> ({totalItems} total)</span>
         </span>
         <Button
           variant="outline"
           size="sm"
           onClick={handleNextPage}
           disabled={currentPage >= actualTotalPages || actualTotalPages === 0 || isLoading}
           className="w-full sm:w-auto order-3"
         >
           <span className="text-xs sm:text-sm">Next</span>
           <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
         </Button>
       </div>
    </div>
  );
}