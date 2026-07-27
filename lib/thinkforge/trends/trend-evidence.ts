import { z } from 'zod';

export const TREND_EVIDENCE_VERSION = 1 as const;
export const TREND_CANDIDATE_VERSION = 1 as const;

export const TrendEvidenceKindSchema = z.enum([
  'cultural_signal',
  'format_candidate',
  'user_submitted_reference',
]);

export const TrendPlatformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'web',
  'unknown',
]);

export const PublicTrendEvidenceSchema = z.object({
  evidenceId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  evidenceVersion: z.literal(TREND_EVIDENCE_VERSION),
  kind: TrendEvidenceKindSchema,
  provider: z.string().min(1).max(80),
  platform: TrendPlatformSchema,
  title: z.string().min(1).max(240),
  summary: z.string().max(800).optional(),
  sourceUrl: z.string().url().max(2_000).optional(),
  sourceScore: z.number().finite().optional(),
  capturedAt: z.string().datetime().optional(),
  location: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(20).optional(),
  provenance: z.object({
    purpose: z.literal('public_trend_discovery'),
    queryFingerprint: z.string().min(1).max(128),
  }),
});

export const TrendCandidateSchema = z.object({
  candidateId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  candidateVersion: z.literal(TREND_CANDIDATE_VERSION),
  title: z.string().min(1).max(240),
  summary: z.string().max(800).optional(),
  platform: TrendPlatformSchema,
  evidence: z.array(PublicTrendEvidenceSchema).min(1).max(12),
  evidenceCompleteness: z.number().min(0).max(1),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  trendSpecEligible: z.boolean(),
  nextAction: z.enum(['use_as_timed_angle', 'add_reference_video', 'analyze_reference_video']),
});

export const PublicTrendDiscoveryInputSchema = z.object({
  niche: z.string().trim().min(2).max(300),
  platforms: z.array(TrendPlatformSchema).max(5).optional(),
  location: z.string().trim().min(2).max(120).optional(),
  limit: z.number().int().min(1).max(12).optional(),
}).strict();

export type TrendEvidenceKind = z.infer<typeof TrendEvidenceKindSchema>;
export type TrendPlatform = z.infer<typeof TrendPlatformSchema>;
export type PublicTrendEvidence = z.infer<typeof PublicTrendEvidenceSchema>;
export type TrendCandidate = z.infer<typeof TrendCandidateSchema>;
export type PublicTrendDiscoveryInput = z.infer<typeof PublicTrendDiscoveryInputSchema>;
