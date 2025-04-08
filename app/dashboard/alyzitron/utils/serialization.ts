import type { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
import type { ClientAlyzitronAnalysis } from '../types/client';

export function serializeAnalysis(analysis: AlyzitronAnalysis): ClientAlyzitronAnalysis {
  return {
    ...analysis,
    _id: analysis._id.toString(),
  };
}

export function serializeAnalyses(analyses: AlyzitronAnalysis[]): ClientAlyzitronAnalysis[] {
  return analyses.map(serializeAnalysis);
}