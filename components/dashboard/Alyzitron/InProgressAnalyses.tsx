"use client";

import { AnalysisProgress } from './AnalysisProgress';
import type { AlyzitronAnalysis, AnalysisStatus } from '@/app/api/services/alyzitron/types';
import { useAlyzitronPolling } from '@/app/dashboard/alyzitron/hooks/useAlyzitronPolling';

// Define the statuses considered "in-progress"
const inProgressStatuses: AnalysisStatus[] = ['listed', 'queued', 'processing'];

export function InProgressAnalyses() {
  // Use polling hook 
  const { analyses: allAnalyses } = useAlyzitronPolling();

  // Filter for in-progress analyses
  const inProgressAnalyses = ((Array.isArray(allAnalyses) ? allAnalyses : [])
    .filter(a => inProgressStatuses.includes(a.status)) as AlyzitronAnalysis[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Show newest first


  if (inProgressAnalyses.length === 0) {
    return null; // Don't render the section if there's nothing in progress
  }

  return (
    <div>
      <h2 className="text-lg sm:text-[18px] font-medium text-zinc-100 mb-4 sm:mb-6">
        In Progress
      </h2>
      <div className="space-y-3 sm:space-y-4">
        {inProgressAnalyses.map((analysis) => {
          return (
            <AnalysisProgress
              key={analysis._id}
              analysisId={analysis._id.toString()}
              title={analysis.metadata?.originalFilename}
              status={analysis.status}
              queuePosition={analysis.status === 'queued' ? analysis.queuePosition : undefined}
              expectedDurationSeconds={analysis.expectedDurationSeconds}
              processingStartTime={analysis.processingStartTime}
              error={analysis.error}
              videoUrl={analysis.videoUrl}
              metadata={analysis.metadata}
            />
          );
        })}
      </div>
    </div>
  );
}