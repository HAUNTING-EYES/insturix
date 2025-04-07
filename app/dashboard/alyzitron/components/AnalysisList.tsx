"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react'; // Added ChevronLeft
// Removed useVideoAnalysis - not used directly here anymore
import { AnalysisProgress } from './AnalysisProgress';
// Removed ApiAnalysisStatus - not used directly
import type { ClientAlyzitronAnalysis } from '../types/client';

interface FetchedAlyzitronAnalysis extends ClientAlyzitronAnalysis {
  expectedWaitSeconds?: number;
  expectedDurationSeconds?: number;
  queuePosition?: number;
}

interface PaginatedResponse {
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

interface AnalysisUpdateEvent extends Partial<Omit<ClientAlyzitronAnalysis, '_id' | 'metadata'>> {
  _id?: string;
  analysisId?: string;
  metadata?: Partial<ClientAlyzitronAnalysis['metadata']>;
}

const DEFAULT_ITEMS_PER_PAGE = 10;

export function AnalysisList({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: AnalysisListProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: paginatedData, isLoading, isError, error } = useQuery<PaginatedResponse, Error>({
    queryKey: ['analyses', { scope: 'completed', page: currentPage, limit: itemsPerPage }],
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

  const analyses = paginatedData?.data ?? [];
  const { totalPages = 1 } = paginatedData?.pagination ?? {};

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  // Removed local state management (managedAnalyses, analysisRefs)
  // Removed updateAnalysisState callback
  // Removed SSE event handler useEffect - assuming centralized handling updates the query cache

  // Removed useEffect for deriving managedAnalyses

  // Removed handleCancel - not applicable to completed/failed items in this list

  return (
    <div>
      {/* Title - Simplified */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-medium text-zinc-100">
          Completed Analyses
        </h2>
        {/* Removed View All / Show Recent Button */}
      </div>
      {/* Analysis List Area */}
      <div className="space-y-4 min-h-[200px] relative"> {/* Added min-height */}
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
            progress={analysis.progress ?? (analysis.status === 'completed' ? 1 : 0)}
            error={analysis.error}
            unread={analysis.unread}
            expectedDurationSeconds={analysis.expectedDurationSeconds}
            onCancel={undefined}
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
      <div className="flex items-center justify-center space-x-4 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousPage}
          disabled={currentPage === 1 || isLoading}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-zinc-400">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextPage}
          disabled={currentPage === totalPages || isLoading}
        >
          Next
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}