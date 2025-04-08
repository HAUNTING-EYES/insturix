import type { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
import type { ClientAlyzitronAnalysis } from '../types/client';

export function serializeAnalysis(analysis: AlyzitronAnalysis): ClientAlyzitronAnalysis {
  // Estimate expected duration based on video duration, default to 60s if unavailable
  const expectedDuration = analysis.metadata?.videoDuration && analysis.metadata.videoDuration > 0
    ? Math.round(analysis.metadata.videoDuration) // Use video duration if available
    : 60; // Default to 60 seconds otherwise

  return {
    ...analysis,
    _id: analysis._id.toString(),
    expectedDurationSeconds: expectedDuration, // Add the calculated duration
    // Ensure createdAt and updatedAt are Date objects if they aren't already
    // (though they should be coming from MongoDB)
    createdAt: new Date(analysis.createdAt),
    updatedAt: new Date(analysis.updatedAt),
  };
}

export function serializeAnalyses(analyses: AlyzitronAnalysis[]): ClientAlyzitronAnalysis[] {
  return analyses.map(serializeAnalysis);
}