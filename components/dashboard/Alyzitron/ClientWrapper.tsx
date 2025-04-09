"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSSEConnection } from '@/hooks/useSSEConnection';
import { VideoUpload } from './VideoUpload';
import { InProgressAnalyses } from './InProgressAnalyses';
import { AnalysisList } from './AnalysisList';
import { VideoType, AnalysisStatus } from '@/app/api/services/alyzitron/types';
import type { Analysis } from '@/app/dashboard/alyzitron/hooks/useAnalysisState';
import type { ClientAlyzitronAnalysis } from '@/app/dashboard/alyzitron/types/client';

interface ClientWrapperProps {
  initialAnalyses: ClientAlyzitronAnalysis[];
}

export function ClientWrapper({ initialAnalyses }: ClientWrapperProps) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [activeAnalyses, setActiveAnalyses] = useState<Set<string>>(new Set());

  // Initialize and manage the 'analyses' query state
  const { data: analysesData = initialAnalyses } = useQuery<ClientAlyzitronAnalysis[]>({
    queryKey: ['analyses'],
    queryFn: async () => {
      // This function ideally shouldn't be called often if initialData is provided
      // and updates happen via setQueryData/SSE. Fetch only if necessary.
      console.warn("Fetching analyses directly in ClientWrapper, should be rare.");
      const response = await fetch('/api/services/alyzitron/analyses');
      if (!response.ok) throw new Error('Failed to fetch analyses');
      return response.json();
    },
    initialData: initialAnalyses,
    staleTime: 1000 * 60 * 5, // Keep data fresh for 5 mins
    gcTime: 1000 * 60 * 10,  // Garbage collect after 10 mins
    refetchOnWindowFocus: false, // Avoid refetching on window focus
  });

  // Initialize SSE connection
  const userId = user?.id || '';
  useSSEConnection(userId);

  // Removed the useEffect that caused an immediate refetch on mount
  // We will now rely on initialData + SSE updates for state changes.


  const handleAnalysisUpdate = (analysisId: string, analysis: Analysis) => {
    if (!analysisId) return;
    
    queryClient.setQueryData<ClientAlyzitronAnalysis[]>(['analyses'], old => {
      const currentData = old || [];
      const existingIndex = currentData.findIndex(a => a._id.toString() === analysisId);
      
      // Handle new analysis with optimistic update
      if (existingIndex === -1) {
        const optimisticAnalysis: ClientAlyzitronAnalysis = {
          _id: analysisId, // Will be replaced by server response
          clerkUserId: 'pending',
          type: analysis.type as VideoType,
          status: analysis.status as AnalysisStatus,
          taskId: analysis.taskId || '',
          videoUrl: analysis.videoUrl || '',
          gcsPath: analysis.videoUrl || '',
          estimatedTime: analysis.estimatedTime || 60,
          unread: true,
          results: null,
          metadata: {
            originalFilename: analysis.title || '',
            videoSize: 0,
            videoDuration: 0,
            mimeType: '',
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return [optimisticAnalysis, ...currentData];
      }
      
      const existing = currentData[existingIndex];
      
      // Skip updates for completed analyses
      if (existing.status === 'completed') {
        return currentData;
      }
      
      // Preserve processing state
      if (existing.status === 'processing' && analysis.status === 'queued') {
        return currentData;
      }
      
      // Safe update of existing analysis
      const newData = [...currentData];
      newData[existingIndex] = {
        ...existing,
        status: analysis.status as AnalysisStatus,
        // Update both estimatedTime and expectedDurationSeconds for consistency with SSE handler
        estimatedTime: analysis.estimatedTime ?? existing.estimatedTime,
        expectedDurationSeconds: analysis.estimatedTime ?? existing.expectedDurationSeconds, // Add this line
        results: existing.results, // Keep existing results unless explicitly updated
      };
      
      return newData;
    });
  };

  // Effect to update activeAnalyses based on the query data
  useEffect(() => {
    const currentActive = new Set<string>();
    // Ensure analysesData is an array before iterating
    if (Array.isArray(analysesData)) {
      analysesData.forEach(a => {
        if (['pending', 'queued', 'processing'].includes(a.status)) {
          currentActive.add(a._id.toString());
        }
      });
    }
    setActiveAnalyses(currentActive);
  }, [analysesData]);

  return (
    <div className="space-y-8">
      <VideoUpload
        onSubmit={(analysisId: string, analysis) => {
          // Optimistic update via handleAnalysisUpdate
          handleAnalysisUpdate(analysisId, {
            ...analysis,
            status: 'queued', // Start as queued
            progress: 0
          });
          // No need to manually setActiveAnalyses here, useEffect handles it
        }}
        onComplete={(analysisId: string, analysis) => {
          if (!analysisId) return;
          
          // Update with completed status before invalidating
          // Ensure final update reflects completion
          handleAnalysisUpdate(analysisId, {
            ...analysis,
            status: 'completed',
            progress: 1
          });

          // Invalidate to ensure consistency, though SSE might handle this
          // Consider if this invalidation is still needed with SSE updates
          queryClient.invalidateQueries({ queryKey: ['analyses'] });
        }}
        activeAnalyses={activeAnalyses} // Pass the derived active analyses
      />
      {/* Add the InProgressAnalyses section */}
      <InProgressAnalyses />

      {/* AnalysisList now only shows completed/failed */}
      <AnalysisList
        itemsPerPage={10}
      />
    </div>
  );
}