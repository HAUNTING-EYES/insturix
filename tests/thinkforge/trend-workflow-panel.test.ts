import { describe, expect, it } from 'vitest';

import { defaultTrendReferenceVideoUrl } from '@/components/dashboard/ThinkForge/TrendWorkflowPanel';
import type { TrendCandidate } from '@/lib/thinkforge/trends/trend-evidence';

function candidate(nextAction: TrendCandidate['nextAction'], sourceUrl: string): TrendCandidate {
  return {
    candidateId: 'candidate_1',
    candidateVersion: 1,
    title: 'Public trend evidence',
    platform: 'web',
    evidence: [{
      evidenceId: 'evidence_1',
      evidenceVersion: 1,
      kind: 'cultural_signal',
      provider: 'test-provider',
      platform: 'web',
      title: 'Public trend evidence',
      sourceUrl,
      provenance: { purpose: 'public_trend_discovery', queryFingerprint: 'query_1' },
    }],
    evidenceCompleteness: 0.7,
    freshness: 'fresh',
    trendSpecEligible: false,
    nextAction,
  };
}

describe('ThinkForge trend workflow reference defaults', () => {
  it('does not put article evidence into the video input', () => {
    expect(defaultTrendReferenceVideoUrl(
      candidate('add_reference_video', 'https://example.com/article-about-a-trend'),
    )).toBe('');
  });

  it('prefills a server-approved analyzable video source', () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=abc12345678';
    expect(defaultTrendReferenceVideoUrl(
      candidate('analyze_reference_video', youtubeUrl),
    )).toBe(youtubeUrl);
  });
});
