import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CreativeReferenceSetSchema,
  type CreativeReference,
  type CreativeReferenceSet,
} from '@/lib/thinkforge/schemas/video-treatment';
import { SelectedTrendSchema } from '@/lib/thinkforge/trends/selected-trend';
import type { SelectedTrend } from '@/lib/thinkforge/trends/selected-trend';

import type { ThinkForgeBrandAuthority } from './brand-authoring-context';

export const CREATIVE_REFERENCE_CONTEXT_VERSION = 1 as const;

const ScopeIdentifierSchema = z.string().trim().min(1).max(240);

export const CreativeReferenceScopeSchema = z.object({
  kind: z.enum(['personal', 'organization']),
  brandId: ScopeIdentifierSchema.optional(),
  orgId: ScopeIdentifierSchema.optional(),
  ownerUserId: ScopeIdentifierSchema.optional(),
}).strict().superRefine((scope, ctx) => {
  if (scope.kind === 'organization' && !scope.orgId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orgId'],
      message: 'An organization creative reference scope requires orgId.',
    });
  }
  if (scope.kind === 'personal' && scope.orgId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orgId'],
      message: 'A personal creative reference scope cannot contain orgId.',
    });
  }
  if (scope.kind === 'personal' && !scope.ownerUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ownerUserId'],
      message: 'A personal creative reference scope requires ownerUserId.',
    });
  }
});

export type CreativeReferenceScope = z.infer<typeof CreativeReferenceScopeSchema>;

export type CreativeReferenceResolutionUnknown = {
  code:
    | 'reference_analysis_pending'
    | 'reference_analysis_unavailable'
    | 'selected_trend_metadata_invalid';
  referenceId?: string;
  message: string;
};

export type ResolvedCreativeReferenceContext = {
  version: typeof CREATIVE_REFERENCE_CONTEXT_VERSION;
  referenceSet: CreativeReferenceSet;
  scope: CreativeReferenceScope;
  sources: Array<'explicit' | 'selected_trend'>;
  selectedReferenceIds: string[];
  analyzedReferenceIds: string[];
  unresolved: CreativeReferenceResolutionUnknown[];
  brandRevision: {
    brandId: string;
    recordId: string;
    profileUpdatedAt: string;
  } | null;
};

export interface ResolveCreativeReferenceContextInput {
  userId: string;
  orgId?: string | null;
  brandAuthority?: ThinkForgeBrandAuthority | null;
  /** Persisted session metadata only; browser-provided project fields are not an authority here. */
  persistedSelectedTrend?: SelectedTrend | unknown | null;
  /** Parsed server input or persisted session data. It is never factual Source Ledger evidence. */
  explicitReferenceSet?: unknown | null;
  /** Required when an explicit set has references, so it cannot cross a brand/workspace boundary. */
  explicitReferenceScope?: unknown | null;
}

export class CreativeReferenceContextError extends Error {
  constructor(
    readonly code:
      | 'creative_reference_scope_required'
      | 'creative_reference_scope_mismatch'
      | 'creative_reference_invalid',
    message: string,
  ) {
    super(message);
    this.name = 'CreativeReferenceContextError';
  }
}

type ReferenceCandidate = {
  referenceSet: CreativeReferenceSet;
  source: 'explicit' | 'selected_trend';
  unresolved: CreativeReferenceResolutionUnknown[];
};

/**
 * Resolves visual influence separately from factual evidence. This is only a
 * read model for the later treatment planner; it neither writes session data
 * nor changes a writer prompt.
 */
export function resolveCreativeReferenceContext(
  input: ResolveCreativeReferenceContextInput,
): ResolvedCreativeReferenceContext {
  const scope = expectedScope(input);
  const candidates: ReferenceCandidate[] = [];

  if (input.explicitReferenceSet !== undefined && input.explicitReferenceSet !== null) {
    const referenceSet = parseReferenceSet(input.explicitReferenceSet);
    if (referenceSet.references.length > 0) {
      assertMatchingScope(input.explicitReferenceScope, scope);
    }
    candidates.push({ referenceSet, source: 'explicit', unresolved: collectAnalysisUnknowns(referenceSet) });
  }

  const selectedTrendCandidate = adaptSelectedTrendReference(input.persistedSelectedTrend);
  if (selectedTrendCandidate) candidates.push(selectedTrendCandidate);

  const referenceSet = mergeReferenceSets(candidates);
  const unresolved = candidates.flatMap((candidate) => candidate.unresolved);

  return {
    version: CREATIVE_REFERENCE_CONTEXT_VERSION,
    referenceSet,
    scope,
    sources: candidates.map((candidate) => candidate.source),
    selectedReferenceIds: referenceSet.references.map((reference) => reference.id),
    analyzedReferenceIds: referenceSet.references
      .filter((reference) => reference.analysisStatus === 'available')
      .map((reference) => reference.id),
    unresolved,
    brandRevision: input.brandAuthority
      ? {
          brandId: input.brandAuthority.brandId,
          recordId: input.brandAuthority.recordId,
          profileUpdatedAt: input.brandAuthority.profileUpdatedAt,
        }
      : null,
  };
}

function expectedScope(input: ResolveCreativeReferenceContextInput): CreativeReferenceScope {
  const brandId = input.brandAuthority?.brandId;
  const orgId = input.orgId?.trim();
  if (orgId) {
    return {
      kind: 'organization',
      orgId,
      ...(brandId ? { brandId } : {}),
    };
  }
  return {
    kind: 'personal',
    ownerUserId: input.userId,
    ...(brandId ? { brandId } : {}),
  };
}

function parseReferenceSet(value: unknown): CreativeReferenceSet {
  const parsed = CreativeReferenceSetSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new CreativeReferenceContextError(
    'creative_reference_invalid',
    `Creative reference set is invalid: ${parsed.error.issues[0]?.message ?? 'unknown validation error'}`,
  );
}

function assertMatchingScope(value: unknown, expected: CreativeReferenceScope): void {
  const parsed = CreativeReferenceScopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new CreativeReferenceContextError(
      'creative_reference_scope_required',
      'Creative references require a valid server-owned brand/workspace scope before they can influence a treatment.',
    );
  }
  const actual = parsed.data;
  const samePersonalOwner = expected.kind !== 'personal'
    || actual.ownerUserId === expected.ownerUserId;
  if (
    actual.kind !== expected.kind
    || actual.orgId !== expected.orgId
    || actual.brandId !== expected.brandId
    || !samePersonalOwner
  ) {
    throw new CreativeReferenceContextError(
      'creative_reference_scope_mismatch',
      'Creative references belong to a different brand or workspace and cannot influence this treatment.',
    );
  }
}

function adaptSelectedTrendReference(
  selectedTrendInput: unknown,
): ReferenceCandidate | null {
  if (selectedTrendInput === undefined || selectedTrendInput === null) return null;
  const selectedTrend = SelectedTrendSchema.safeParse(selectedTrendInput);
  if (!selectedTrend.success) {
    return {
      referenceSet: emptyReferenceSet('creative_refs_invalid_trend'),
      source: 'selected_trend',
      unresolved: [{
        code: 'selected_trend_metadata_invalid',
        message: 'The selected trend metadata is incomplete, so it will not influence the visual treatment.',
      }],
    };
  }

  const trend = selectedTrend.data;
  const referenceId = `trend_ref_${fingerprint(trend.candidate.candidateId)}`;
  const analysis = trend.analysis;
  const analysisStatus = analysis?.status === 'completed'
    ? 'available'
    : analysis?.status === 'failed'
      ? 'unavailable'
      : 'pending';
  const reference: CreativeReference = {
    id: referenceId,
    kind: 'video',
    title: `Selected trend reference: ${safeText(trend.candidate.title, 320)}`,
    ...(analysis?.status === 'completed'
      ? { sourceId: `trend_source_${fingerprint(analysis.source.referenceId)}` }
      : {}),
    rightsStatus: analysis?.status === 'completed' ? 'user-provided' : 'unknown',
    analysisStatus,
    ...(analysis?.status === 'completed'
      ? { analysis: adaptCompletedTrendAnalysis(analysis.trendSpec) }
      : {}),
  };
  const parsedReferenceSet = parseReferenceSet({
    version: 1,
    referenceSetId: `creative_refs_trend_${fingerprint(trend.candidate.candidateId)}`,
    references: [reference],
  });

  const unresolved = analysisStatus === 'available'
    ? []
    : [{
        referenceId,
        code: analysisStatus === 'pending' ? 'reference_analysis_pending' : 'reference_analysis_unavailable',
        message: analysisStatus === 'pending'
          ? 'The selected trend has not completed approved reference analysis, so no visual facts were inferred from it.'
          : 'The selected trend reference analysis is unavailable, so no visual facts were inferred from it.',
      } as CreativeReferenceResolutionUnknown];

  return { referenceSet: parsedReferenceSet, source: 'selected_trend', unresolved };
}

function adaptCompletedTrendAnalysis(trendSpec: {
  beatGrid: { sections: Array<{ id: string; role: string; start: number; end: number }> };
  performanceScript: string;
}) {
  const sections = trendSpec.beatGrid.sections.slice(0, 20);
  return {
    visualRhythm: `Use only the analyzed timing envelope across ${sections.length} section${sections.length === 1 ? '' : 's'}; reinterpret subject matter, imagery, and wording for this brand.`,
    informationHierarchy: 'Treat the analyzed sections as a structural progression, not as reusable source expression or layout.',
    visualVerbalRelationship: 'Use the reference only for transferable format mechanics; the new work must make its own visual-verbal argument.',
    recurringMotifs: [],
    evidence: sections.map((section, index) => ({
      id: `trend_section_${index + 1}`,
      observation: `Approved timing section ${index + 1}: ${safeText(section.role, 160)}.`,
      startSeconds: roundSeconds(section.start),
      endSeconds: roundSeconds(section.end),
    })),
    nonCopyConstraints: [
      'Use transferable timing and structural mechanics only; do not reuse the reference creator\'s words, named people, logos, claims, assets, layouts, or recognizable execution.',
      'Do not reproduce the source performance cue verbatim; write an original performance direction for the new work.',
    ],
  };
}

function collectAnalysisUnknowns(referenceSet: CreativeReferenceSet): CreativeReferenceResolutionUnknown[] {
  return referenceSet.references.flatMap((reference) => {
    if (reference.analysisStatus === 'available') return [];
    return [{
      referenceId: reference.id,
      code: reference.analysisStatus === 'pending'
        ? 'reference_analysis_pending'
        : 'reference_analysis_unavailable',
      message: reference.analysisStatus === 'pending'
        ? `Reference "${reference.title}" has no completed analysis; it contributes no inferred visual facts.`
        : `Reference "${reference.title}" has unavailable analysis; it contributes no inferred visual facts.`,
    }];
  });
}

function mergeReferenceSets(candidates: readonly ReferenceCandidate[]): CreativeReferenceSet {
  if (candidates.length === 0) return emptyReferenceSet('creative_refs_empty');
  const references = candidates.flatMap((candidate) => candidate.referenceSet.references);
  const seed = candidates.map((candidate) => candidate.referenceSet.referenceSetId).sort().join('|');
  return parseReferenceSet({
    version: 1,
    referenceSetId: candidates.length === 1
      ? candidates[0]!.referenceSet.referenceSetId
      : `creative_refs_merged_${fingerprint(seed)}`,
    references,
  });
}

function emptyReferenceSet(referenceSetId: string): CreativeReferenceSet {
  return parseReferenceSet({ version: 1, referenceSetId, references: [] });
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function safeText(value: string, maxChars: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function roundSeconds(milliseconds: number): number {
  return Math.round((milliseconds / 1_000) * 1_000) / 1_000;
}
