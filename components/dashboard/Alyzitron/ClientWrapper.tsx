"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRtdb } from '@/providers/RtdbProvider';
import { VideoUpload } from './VideoUpload';
import { InProgressAnalyses } from './InProgressAnalyses';
import { AnalysisList } from './AnalysisList';
import { VideoType, AnalysisStatus, AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
import type { Analysis } from '@/app/dashboard/alyzitron/types/analysis';

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

  // Initialize RTDB listener for real-time updates
  const { allTasks } = useRtdb();
  const alyzitronTasks = allTasks.alyzitron || [];

  // Sync RTDB data with our analyses query data
  useEffect(() => {
    if (alyzitronTasks.length === 0) return;


    queryClient.setQueryData<AlyzitronAnalysis[]>(['analyses'], (old) => {
      const currentData = Array.isArray(old) ? old : Array.isArray(initialAnalyses) ? initialAnalyses : [];
      
      // Create a map of existing analyses by taskId for quick lookup
      const analysisMap = new Map<string, AlyzitronAnalysis>();
      currentData.forEach(analysis => {
        if (analysis.taskId) {
          analysisMap.set(analysis.taskId, analysis);
        }
      });

      // Update existing analyses with RTDB data
      alyzitronTasks.forEach(task => {
        const existingAnalysis = analysisMap.get(task.taskId);
        if (existingAnalysis) {
          // Update status from RTDB
          if (existingAnalysis.status !== task.status) {
            analysisMap.set(task.taskId, {
              ...existingAnalysis,
              status: task.status as AnalysisStatus,
              updatedAt: new Date(task.updatedAt),
            });
          }
        } else {
          // If we have a task in RTDB but no analysis in our data,
          // this might be a new task - fetch the full analysis data
          // Could potentially trigger a refetch here if needed
        }
      });

      // Convert back to array and sort by updatedAt
      const updatedAnalyses = Array.from(analysisMap.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return updatedAnalyses;
    });
  }, [alyzitronTasks, queryClient, initialAnalyses]);


  const handleAnalysisUpdate = (analysisId: string, analysis: Analysis) => {
    if (!analysisId) return;
    
    queryClient.setQueryData<AlyzitronAnalysis[]>(['analyses'], old => {
      const currentData = old || [];
      const existingIndex = currentData.findIndex(a => a._id === analysisId);
      
      // Handle new analysis with optimistic update
      if (existingIndex === -1) {
        const optimisticAnalysis: AlyzitronAnalysis = {
          _id: analysisId, // Will be replaced by server response
          clerkUserId: 'pending',
          type: analysis.type as VideoType,
          status: analysis.status as AnalysisStatus,
          taskId: analysis.taskId || '',
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

          // Invalidate to ensure consistency, though RTDB might handle this
          // Consider if this invalidation is still needed with RTDB updates
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