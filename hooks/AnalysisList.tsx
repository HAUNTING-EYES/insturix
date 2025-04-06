"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { useVideoAnalysis } from "@/hooks/useVideoAnalysis";
import { AnalysisProgress } from "@/components/dashboard/Alyzitron/AnalysisProgress";
import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';

import type { Analysis } from "@/hooks/useAnalysisState";

interface AnalysisListProps {
  initialAnalyses: AlyzitronAnalysis[];
  onAnalysisUpdate?: (analysisId: string, analysis: Analysis) => void;
}

export function AnalysisList({ initialAnalyses, onAnalysisUpdate }: AnalysisListProps) {

  // Single query with aggressive polling
  const { data: analyses = initialAnalyses } = useQuery<AlyzitronAnalysis[], Error>({
    queryKey: ['analyses'],
    queryFn: async () => {
      const response = await fetch('/api/services/alyzitron/analyses');
      if (!response.ok) throw new Error('Failed to fetch analyses');
      return response.json();
    },
    initialData: initialAnalyses,
    refetchInterval: (query) => {
      const currentAnalyses = query.state.data;
      if (!currentAnalyses) return 200;

      // Poll frequently if any analysis is in progress or recently created
      const hasActive = currentAnalyses.some(
        (analysis: AlyzitronAnalysis) => {
          // Check if analysis is active or recently created (within last minute)
          const isRecent = (Date.now() - new Date(analysis.createdAt).getTime()) < 60000;
          return ['queued', 'processing'].includes(analysis.status) || isRecent;
        }
      );
  
      // Poll every 200ms if active analyses, otherwise poll slower
      return hasActive ? 200 : 2000;
    },
    gcTime: 0, // Don't cache to ensure fresh data
    staleTime: 0, // Always consider data stale to enable refetching
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { cancelAnalysis } = useVideoAnalysis();

  // Update progress and notify parent of status changes
  // Store last update time for each analysis to prevent too frequent updates
  const lastUpdateRef = React.useRef<Record<string, number>>({});
  
  // Debounced update function
  const debouncedUpdate = React.useCallback((analysis: AlyzitronAnalysis, progress: number) => {
    const now = Date.now();
    const lastUpdate = lastUpdateRef.current[analysis._id.toString()] || 0;
    
    // Only update if enough time has passed (500ms)
    if (now - lastUpdate > 500 && onAnalysisUpdate) {
      lastUpdateRef.current[analysis._id.toString()] = now;
      onAnalysisUpdate(analysis._id.toString(), {
        analysisId: analysis._id.toString(),
        taskId: analysis.taskId,
        type: analysis.type,
        title: analysis.metadata.originalFilename,
        videoUrl: analysis.videoUrl,
        status: analysis.status === 'pending' ? 'queued' : analysis.status,
        progress,
        estimatedTime: analysis.estimatedTime
      });
    }
  }, [onAnalysisUpdate]);

  const analysesWithProgress = React.useMemo(() => {
    return analyses.map((analysis: AlyzitronAnalysis) => {
      const startTime = new Date(analysis.createdAt).getTime();
      const elapsed = (Date.now() - startTime) / 1000;
      const estimatedTime = analysis.estimatedTime || 60;

      // Don't assume failure state during transitions
      if (elapsed < 60) { // Within first minute
        if (analysis.status === 'failed') {
          // Keep showing as queued for recently created analyses that appear failed
          const updatedAnalysis = {
            ...analysis,
            status: 'queued' as const,
            progress: 0,
            error: undefined // Clear any error state
          };
          debouncedUpdate(updatedAnalysis, 0);
          return updatedAnalysis;
        }
      }

      switch (analysis.status) {
        case 'queued':
          if (elapsed >= 2) {
            // Transition to processing after short delay
            const updatedAnalysis = {
              ...analysis,
              status: 'processing' as const,
              progress: 0
            };
            debouncedUpdate(updatedAnalysis, 0);
            return updatedAnalysis;
          }
          return analysis;

        case 'processing':
          // Simulate progress with asymptotic approach
          const progressRatio = elapsed / estimatedTime;
          const progress = Math.min(
            1 - 1 / (1 + progressRatio * 2),
            0.95
          );
          
          const updatedAnalysis = {
            ...analysis,
            progress
          };
          debouncedUpdate(updatedAnalysis, progress);
          return updatedAnalysis;

        case 'completed':
          return { ...analysis, progress: 1 };

        default:
          return analysis;
      }

      return analysis;
    });
  }, [analyses, debouncedUpdate]);

  const handleCancel = async (taskId: string) => {
    try {
      await cancelAnalysis(taskId);
    } catch (error) {
      console.error('Failed to cancel analysis:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-medium text-zinc-100">Recent Analysis</h2>
        <Button variant="ghost" className="text-zinc-400 hover:text-zinc-300">
          View All
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-4">
        {analysesWithProgress.map((analysis) => (
          <AnalysisProgress
            key={analysis._id.toString()}
            analysisId={analysis._id.toString()}
            taskId={analysis.taskId}
            title={analysis.metadata.originalFilename}
            type={analysis.type}
            status={analysis.status}
            progress={
              analysis.status === 'processing'
                ? analysis.progress
                : analysis.status === 'completed'
                  ? 1
                  : 0
            }
            estimatedTime={analysis.estimatedTime}
            queuePosition={analysis.status === 'queued' ? 1 : undefined}
            error={analysis.error}
            onCancel={handleCancel}
          />
        ))}

        {analysesWithProgress.length === 0 && (
          <div className="text-center py-8">
            <p className="text-zinc-500">No analyses yet</p>
            <p className="text-sm text-zinc-600">
              Upload a video to start analyzing
            </p>
          </div>
        )}
      </div>
    </div>
  );
}