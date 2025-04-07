"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query'; // Added useQuery
import { useState, useEffect } from 'react'; // Added useEffect
import { useUser } from '@clerk/nextjs';
import { useSSEConnection } from '@/hooks/useSSEConnection';
import { VideoUpload } from './VideoUpload';
import { InProgressAnalyses } from './InProgressAnalyses'; // Import the new component
import { AnalysisList } from './AnalysisList';
import { VideoType, AnalysisStatus } from '@/app/api/services/alyzitron/types';
import type { Analysis } from '../hooks/useAnalysisState';
import type { ClientAlyzitronAnalysis } from '../types/client';

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

  // Initialize SSE connection (assuming this hook might update the ['analyses'] query cache)
  useSSEConnection(user?.id || '');


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
          progress: analysis.progress || 0,
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
        progress: analysis.progress ?? existing.progress,
        estimatedTime: analysis.estimatedTime ?? existing.estimatedTime,
        results: existing.results,
      };
      
      return newData;
    });
  };

  // Effect to update activeAnalyses based on the query data
  useEffect(() => {
    const currentActive = new Set<string>();
    analysesData.forEach(a => {
      if (['pending', 'queued', 'processing'].includes(a.status)) {
        currentActive.add(a._id.toString());
      }
    });
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