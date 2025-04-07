"use client";

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSSEConnection } from '@/hooks/useSSEConnection';
import { VideoUpload } from './VideoUpload';
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
  
  // Track all active analyses with their states
  const [activeAnalyses, setActiveAnalyses] = useState<Set<string>>(new Set());

  // Initialize SSE connection
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

  return (
    <div className="space-y-8">
      <VideoUpload
        onSubmit={(analysisId: string, analysis) => {
          handleAnalysisUpdate(analysisId, {
            ...analysis,
            status: 'queued',
            progress: 0
          });
          setActiveAnalyses(prev => {
            const newSet = new Set(prev);
            newSet.add(analysisId);
            return newSet;
          });
        }}
        onComplete={(analysisId: string, analysis) => {
          if (!analysisId) return;
          
          // Update with completed status before invalidating
          handleAnalysisUpdate(analysisId, {
            ...analysis,
            status: 'completed',
            progress: 1
          });
          
          // Remove from active analyses
          setActiveAnalyses(prev => {
            const newSet = new Set(prev);
            newSet.delete(analysisId);
            return newSet;
          });
          
          // Then refresh to get server data
          queryClient.invalidateQueries({ queryKey: ['analyses'] });
        }}
        activeAnalyses={activeAnalyses}
      />
      <AnalysisList
        initialAnalyses={initialAnalyses}
        maxDisplayItems={5}
      />
    </div>
  );
}