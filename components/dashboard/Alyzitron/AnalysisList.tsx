"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnalysisProgress } from './AnalysisProgress';
import type { ClientAlyzitronAnalysis } from '@/app/dashboard/alyzitron/types/client';

interface FetchedAlyzitronAnalysis extends ClientAlyzitronAnalysis {
  expectedWaitSeconds?: number;
  expectedDurationSeconds?: number;
  queuePosition?: number;
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

interface AnalysisUpdateEvent extends Partial<Omit<ClientAlyzitronAnalysis, '_id' | 'metadata'>> {
  _id?: string;
  analysisId?: string;
  metadata?: Partial<ClientAlyzitronAnalysis['metadata']>;
}

const DEFAULT_ITEMS_PER_PAGE = 10;

export function AnalysisList({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: AnalysisListProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser(); // Get user object from Clerk

  const { data: paginatedData, isLoading, isError, error } = useQuery<PaginatedResponse, Error>({
    queryKey: ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }], // Use a scope reflecting terminal statuses
    queryFn: async () => {
      const url = `/api/services/alyzitron/analyses?status=completed,failed,cancelled&page=${currentPage}&limit=${itemsPerPage}`; // Added cancelled status
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
  const { totalItems = 0 } = paginatedData?.pagination ?? {}; // Only extract totalItems initially
  // Calculate actual total pages, ensuring it's 0 if totalItems is 0
  const actualTotalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 0;

  // --- SSE Integration ---
  useEffect(() => {
    if (!user?.id) {
      // console.log("SSE: User ID not available yet.");
      return;
    }

    // console.log(`SSE: Setting up connection for user ${user.id}...`);
    const endpointUrl = `/api/sse?userId=${encodeURIComponent(user.id)}`;
    const eventSource = new EventSource(endpointUrl);

    eventSource.onopen = () => {
      // console.log("SSE connection established.");
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      eventSource.close(); // Close on error
    };
    const handleAnalysisUpdate = (eventData: AnalysisUpdateEvent) => {
      const analysisId = eventData._id || eventData.analysisId;
      const status = eventData.status;

      // Check if it's a completion/failure event and has an ID
      if (analysisId && status && ['completed', 'failed', 'cancelled'].includes(status)) { // Added cancelled status
        // console.log(`SSE: Received update for ${analysisId}, status: ${status}. Invalidating query.`);

        // Invalidate the query for the first page of completed analyses.
        // This will trigger a refetch, ensuring the list includes the new item
        // with all its necessary data fetched from the API.
        queryClient.invalidateQueries({
          queryKey: ['analyses', { scope: 'finished', page: 1, limit: itemsPerPage }], // Align invalidation key
        });

        if (currentPage !== 1) {
           queryClient.invalidateQueries({
             queryKey: ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }], // Align invalidation key
             // refetchType: 'inactive' // Don't force refetch if not active view
           });
        }
      }
    };

    // Use the default 'onmessage' handler as specified
    eventSource.onmessage = (event) => {
      try {
        // console.log("SSE message received:", event.data);
        const eventData = JSON.parse(event.data) as AnalysisUpdateEvent;
        // Pass the parsed data to the existing handler
        handleAnalysisUpdate(eventData);
      } catch (e) {
        console.error("Failed to parse SSE message data:", e);
      }
    };

    // Cleanup function: close the connection when the component unmounts
    return () => {
      // console.log("Closing SSE connection.");
      eventSource.close();
    };
  }, [queryClient, itemsPerPage, currentPage, user?.id]);


  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, actualTotalPages));
  };

  return (
    <div>
      {/* Title - Simplified */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-medium text-zinc-100">
          Completed Analyses
        </h2>
      </div>
      {/* Analysis List Area */}
      <div className="space-y-4 min-h-[200px] relative">
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

      {/* Pagination Controls - Conditionally render or always show disabled */}
      {/* Option 1: Always show, but disabled */}
      <div className="flex items-center justify-center space-x-4 mt-6">
         <Button
           variant="outline"
           size="sm"
           onClick={handlePreviousPage}
           // Disable if on page 1 OR if there are no pages at all
           disabled={currentPage === 1 || actualTotalPages === 0 || isLoading}
         >
           <ChevronLeft className="mr-2 h-4 w-4" />
           Previous
         </Button>
         <span className="text-sm text-zinc-400">
           {/* Display page 1 of 0 when empty */}
           Page {actualTotalPages === 0 ? 1 : currentPage} of {actualTotalPages} ({totalItems} total)
         </span>
         <Button
           variant="outline"
           size="sm"
           onClick={handleNextPage}
           // Disable if on the last page OR if there are no pages at all
           disabled={currentPage >= actualTotalPages || actualTotalPages === 0 || isLoading}
         >
           Next
           <ChevronRight className="ml-2 h-4 w-4" />
         </Button>
       </div>
    </div>
  );
}