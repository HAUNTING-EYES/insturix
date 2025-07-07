"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { VideoUpload } from './VideoUpload';
import { useTaskUpdater } from '@/hooks/useTaskUpdater'; // Import the new hook
import { AnalysisStatus, AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
import type { Analysis } from '@/app/dashboard/alyzitron/types/analysis';
import { AlyzitronTaskHistory } from './AlyzitronTaskHistory'; // Import the new combined component

interface ClientWrapperProps {
  initialAnalyses: AlyzitronAnalysis[];
}

export function ClientWrapper({ initialAnalyses }: ClientWrapperProps) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [activeAnalyses, setActiveAnalyses] = useState<Set<string>>(new Set());

  // Initialize and manage the 'analyses' query state
  const { data: analysesData = initialAnalyses } = useQuery<AlyzitronAnalysis[]>({
    queryKey: ['analyses'],
    queryFn: async () => {
      // This function ideally shouldn't be called often if initialData is provided
      // and updates happen via setQueryData/RTDB. Fetch only if necessary.
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

  // Initialize RTDB listener for real-time updates via the new hook
  useTaskUpdater();

  // The manual RTDB sync useEffect has been removed, as useTaskUpdater handles cache invalidation.



  const handleAnalysisUpdate = (analysisId: string, analysis: Analysis) => {
    if (!analysisId) return;
    
    queryClient.setQueryData<AlyzitronAnalysis[]>(['analyses'], old => {
      const currentData = old || [];
      // Look for existing analysis by both _id and taskId to handle cases where
      // the analysis was just added to cache with a different _id
      const existingIndex = currentData.findIndex(a => a._id === analysisId);
      
      // Handle new analysis with optimistic update
      if (existingIndex === -1) {
        const optimisticAnalysis: AlyzitronAnalysis = {
          _id: analysisId, // Will be replaced by server response
          clerkUserId: 'pending',
          status: analysis.status as AnalysisStatus,
          videoUrl: analysis.videoUrl || '',
          estimatedTime: analysis.estimatedTime || 60,
          unread: true,
          results: null,
          metadata: {
            originalFilename: analysis.title || '',
            videoSize: 0,
            videoDuration: 0,
            mimeType: '',
            isPublic: false,
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
        // Update both estimatedTime and expectedDurationSeconds for consistency with RTDB handler
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
        if (['listed', 'queued', 'processing'].includes(a.status)) {
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
          console.log('ONSUBMIT: Called with', { analysisId, analysis });
          // Analysis is already added to cache by submitAnalysis function
          // Just update the status to queued if needed
          queryClient.setQueryData<AlyzitronAnalysis[]>(['analyses'], old => {
            console.log('ONSUBMIT: Current cache data:', old);
            const currentData = old || [];
            const existingIndex = currentData.findIndex(a => a._id === analysisId);
            
            console.log('ONSUBMIT: Found existing index:', existingIndex);
            
            if (existingIndex !== -1) {
              // Update existing analysis
              const newData = [...currentData];
              newData[existingIndex] = {
                ...newData[existingIndex],
                status: 'queued' as any
              };
              console.log('ONSUBMIT: Updated existing analysis');
              return newData;
            }
            
            console.log('ONSUBMIT: Analysis not found in cache, not adding');
            // If not found, it means the cache addition didn't work, so add it
            return currentData;
          });
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

          // Invalidate to ensure consistency, though RTDB might handle this
          // Consider if this invalidation is still needed with RTDB updates
          queryClient.invalidateQueries({ queryKey: ['analyses'] });
        }}
        activeAnalyses={activeAnalyses} // Pass the derived active analyses
      />
      <AlyzitronTaskHistory />
    </div>
  );
}