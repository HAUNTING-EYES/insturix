"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { useVideoAnalysis } from '../hooks/useVideoAnalysis';
import { useAnalysisRefresh } from '../hooks/useAnalysisRefresh';
import { AnalysisProgress } from './AnalysisProgress';
import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';

interface AnalysisListProps {
  initialAnalyses: AlyzitronAnalysis[];
}

export function AnalysisList({ initialAnalyses }: AnalysisListProps) {
  const { cancelAnalysis } = useVideoAnalysis();

  // Create a map of analysis refreshes for each active analysis
  const activeRefreshes = initialAnalyses
    .filter(analysis => ['pending', 'queued', 'processing'].includes(analysis.status))
    .reduce<Record<string, ReturnType<typeof useAnalysisRefresh>>>((acc, analysis) => {
      const id = analysis._id.toString();
      acc[id] = useAnalysisRefresh({
        analysisId: id,
        enabled: true,
      });
      return acc;
    }, {});

  const handleCancel = async (taskId: string) => {
    try {
      await cancelAnalysis(taskId);
    } catch (error) {
      console.error('Failed to cancel analysis:', error);
    }
  };

  // Get the most up-to-date version of each analysis
  const analyses = initialAnalyses.map(analysis => {
    const id = analysis._id.toString();
    const refresh = activeRefreshes[id];
    return refresh?.analysis || analysis;
  });

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
        {analyses.map((analysis) => {
          const id = analysis._id.toString();
          const refresh = activeRefreshes[id];
          
          return (
            <AnalysisProgress
              key={id}
              analysisId={id}
              taskId={analysis.taskId}
              title={analysis.metadata.originalFilename}
              type={analysis.type}
              status={analysis.status}
              progress={
                analysis.status === 'processing'
                  ? refresh?.isInProgress
                    ? 0.7 // Show indeterminate progress for in-progress items
                    : 1 // Show complete for non-refreshing items
                  : 0
              }
              estimatedTime={analysis.estimatedTime}
              queuePosition={analysis.status === 'queued' ? 1 : undefined}
              error={analysis.error}
              onCancel={handleCancel}
            />
          );
        })}

        {analyses.length === 0 && (
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