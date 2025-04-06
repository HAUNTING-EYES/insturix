"use client";

import { useQueryClient } from '@tanstack/react-query';
import { VideoUpload } from './VideoUpload';
import { AnalysisList } from '../../../hooks/AnalysisList';
import { AlyzitronAnalysis, VideoType } from '@/app/api/services/alyzitron/types';
import type { Analysis } from '@/hooks/useAnalysisState';

interface ClientWrapperProps {
  initialAnalyses: AlyzitronAnalysis[];
}

function convertToAlyzitronAnalysis(analysis: Analysis, analysisId: string): Omit<AlyzitronAnalysis, '_id'> & { _id: string } {
  return {
    _id: analysisId,
    clerkUserId: 'pending', // Will be set by server
    gcsPath: analysis.videoUrl || '',
    type: analysis.type as VideoType,
    status: 'queued',
    taskId: analysis.taskId,
    videoUrl: analysis.videoUrl,
    estimatedTime: analysis.estimatedTime || 60,
    progress: 0,
    results: null,
    metadata: {
      originalFilename: analysis.title || '',
      fileSize: 0,
      mimeType: '',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function ClientWrapper({ initialAnalyses }: ClientWrapperProps) {
  const queryClient = useQueryClient();

  const handleAnalysisUpdate = (analysisId: string, analysis: Analysis) => {
    if (!analysisId) return;
    
    queryClient.setQueryData(['analyses'], (old: AlyzitronAnalysis[] = []) => {
      const optimisticAnalysis = convertToAlyzitronAnalysis(analysis, analysisId);
      const existingIndex = old.findIndex(a => a._id.toString() === analysisId);
      
      if (existingIndex !== -1) {
        // Update existing analysis but preserve certain server-side fields
        const existing = old[existingIndex];
        const updated = {
          ...optimisticAnalysis,
          clerkUserId: existing.clerkUserId,
          createdAt: existing.createdAt,
        };
        return [
          ...old.slice(0, existingIndex),
          updated,
          ...old.slice(existingIndex + 1)
        ];
      }
      
      // Add new analysis
      return [optimisticAnalysis, ...old];
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
        }}
        onComplete={(analysisId: string, analysis) => {
          if (!analysisId) return;
          // Update with completed status before invalidating
          handleAnalysisUpdate(analysisId, {
            ...analysis,
            status: 'completed',
            progress: 1
          });
          // Then refresh to get server data
          queryClient.invalidateQueries({ queryKey: ['analyses'] });
        }}
      />
      <AnalysisList
        initialAnalyses={initialAnalyses}
        onAnalysisUpdate={handleAnalysisUpdate}
      />
    </div>
  );
}