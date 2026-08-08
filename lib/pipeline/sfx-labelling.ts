/**
 * S2-L1 — internal human-labelling tooling (dev-only; NOT a production SFX
 * system and NEVER a selector input).
 *
 * Turns the seeded 64-opportunity fixtures into reviewer observations:
 *   1. Candidate builder — for each opportunity, a bounded audition set from
 *      the reviewed manifest: all entries matching the opportunity's role
 *      (+ surface where available) PLUS a few deliberate decoys from unrelated
 *      roles so a reviewer can mark absurd/unacceptable selections. Includes a
 *      silence pseudo-candidate. Deterministic (seeded by opportunityId) so
 *      candidate ORDER does not leak selector preferences to the reviewer.
 *   2. Observation schema + validation — per-reviewer independent records.
 *      REVIEWER INDEPENDENCE: observations are stored per reviewer and are
 *      never overwritten by a second reviewer.
 *   3. Adjudication — two independent observations for an opportunity produce
 *      a frozen label: consensus where they agree; explicit UNRESOLVED /
 *      ADJUDICATED-CHOICE otherwise. Adjudication is computed separately,
 *      never fused destructively into an observation.
 *
 * UNKNOWN / NOT PERCEPTIBLE / NOT MEANINGFUL are first-class states.
 * This module does not read, write, or tune the selector.
 */

import { createHash } from 'node:crypto';

import type { SfxCatalogEntry, SfxCatalogEventRole } from './sfx-catalog';

export type CorpusState = 'unlabelled' | 'reviewed' | 'adjudicated';

export interface AssessableCandidate {
  assetId: string;
  title: string;
  durationMs: number;
  audioUrl: string;
  role: SfxCatalogEventRole;
  /** true when this entry matches the opportunity role (vs a decoy). */
  matchesRole: boolean;
  isSilence: boolean;
  rights: { licenseId: string };
}

export interface LabellingCandidateSet {
  opportunityId: string;
  candidates: AssessableCandidate[];
}

/** Reviewer's field judgements; explicitly unknown where not perceptible. */
export interface OpportunityObservationV1 {
  version: 'editron-sfx-observation-v1';
  opportunityId: string;
  reviewerId: string;
  reviewedAt: string;
  acceptableAssetIds: string[];
  unacceptableAssetIds: string[];
  absurdAssetIds: string[];
  silenceAcceptable: boolean;
  /** true when no sound may be placed. If true, acceptable/unacceptable should be empty. */
  silenceRequired: boolean;
  /** Matches the opportunity context; reviewer may downgrade to unknown. */
  roleState: 'unknown' | 'not-perceptible' | CorpusState;
  surfaceState: 'unknown' | 'not-perceptible' | CorpusState;
  directionState: 'unknown' | 'not-perceptible' | 'not-meaningful' | CorpusState;
  motionSpeedState: 'unknown' | 'not-perceptible' | 'not-meaningful' | CorpusState;
  materialState: 'unknown' | 'not-perceptible' | 'not-meaningful' | CorpusState;
  contextualNote?: string;
}

export interface AdjudicationOutcome {
  opportunityId: string;
  status: 'unlabelled' | 'adjudicated';
  /** When the two reviewers agree on the same choice. */
  consensus: boolean;
  reviewers: string[];
  resolved: boolean;
  result: 'accepted-consensus' | 'adjudicated-choice' | 'unresolved';
  note?: string;
}

export interface FrozenOpportunityLabel {
  labelVersion: 'editron-sfx-evaluation-corpus-v1';
  opportunityId: string;
  acceptableAssetIds: string[];
  unacceptableAssetIds: string[];
  absurdAssetIds: string[];
  silenceAcceptable: boolean;
  silenceRequired: boolean;
  roleState?: OpportunityObservationV1['roleState'];
  surfaceState?: OpportunityObservationV1['surfaceState'];
  directionState?: OpportunityObservationV1['directionState'];
  motionSpeedState?: OpportunityObservationV1['motionSpeedState'];
  materialState?: OpportunityObservationV1['materialState'];
  reviewerId: string;
  reviewedAt: string;
  adjudication?: {
    conflictingReviewerIds: string[];
    resolved: boolean;
    result: 'accepted-consensus' | 'adjudicated-choice' | 'unresolved';
    note?: string;
  };
}

// ── Candidate builder ───────────────────────────────────────────────────────

const DECOY_COUNT = 3;

export function buildLabellingCandidateSet(
  opportunityId: string,
  role: SfxCatalogEventRole,
  surface: string | undefined,
  manifest: { entries: SfxCatalogEntry[] },
): LabellingCandidateSet {
  const roleMatches = manifest.entries.filter((e) => e.eventRoles.includes(role));
  const surfaceMatches = roleMatches.filter((e) => !surface || e.surfaces.includes(surface as typeof e.surfaces[number]));
  const pool = surfaceMatches.length >= 2 ? surfaceMatches : roleMatches;

  // Deterministic shuffle (seeded by opportunityId) so order never hints a
  // selector preference.
  const shuffled = deterministicShuffle(pool, opportunityId);

  const decoys: SfxCatalogEntry[] = [];
  for (const entry of manifest.entries) {
    if (entry.eventRoles.includes(role)) continue;
    if (decoys.length >= DECOY_COUNT) break;
    decoys.push(entry);
  }

  const candidates: AssessableCandidate[] = [
    ...shuffled.slice(0, 8).map((e) => ({
      assetId: e.assetId,
      title: e.title,
      durationMs: e.durationMs,
      audioUrl: e.audioUrl,
      role: e.eventRoles[0] as SfxCatalogEventRole,
      matchesRole: true,
      isSilence: false,
      rights: { licenseId: e.audioRights.evidence.licenseId },
    })),
    ...deterministicShuffle(decoys, `${opportunityId}:decoys`).map((e) => ({
      assetId: e.assetId,
      title: e.title,
      durationMs: e.durationMs,
      audioUrl: e.audioUrl,
      role: e.eventRoles[0] as SfxCatalogEventRole,
      matchesRole: false,
      isSilence: false,
      rights: { licenseId: e.audioRights.evidence.licenseId },
    })),
    {
      assetId: '__silence__',
      title: '— deliberate silence —',
      durationMs: 0,
      audioUrl: '',
      role,
      matchesRole: true,
      isSilence: true,
      rights: { licenseId: 'silence' },
    },
  ];
  return { opportunityId, candidates };
}

function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const hash = createHash('sha256').update(seed).digest();
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = hash[i % hash.length] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Observation validation ─────────────────────────────────────────────────

export function isValidOpportunityObservation(value: unknown): value is OpportunityObservationV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 'editron-sfx-observation-v1'
    && typeof v.opportunityId === 'string'
    && typeof v.reviewerId === 'string'
    && typeof v.reviewedAt === 'string'
    && Array.isArray(v.acceptableAssetIds)
    && Array.isArray(v.unacceptableAssetIds)
    && Array.isArray(v.absurdAssetIds)
    && typeof v.silenceAcceptable === 'boolean'
    && typeof v.silenceRequired === 'boolean'
  );
}

// ── Reviewer independence + adjudication ─────────────────────────────────────

export function sameReviewerAssessment(a: OpportunityObservationV1, b: OpportunityObservationV1): boolean {
  if (a.opportunityId !== b.opportunityId) return false;
  if (a.silenceAcceptable !== b.silenceAcceptable) return false;
  if (a.silenceRequired !== b.silenceRequired) return false;
  return (
    sameSet(a.acceptableAssetIds, b.acceptableAssetIds)
    && sameSet(a.unacceptableAssetIds, b.unacceptableAssetIds)
    && sameSet(a.absurdAssetIds, b.absurdAssetIds)
  );
}

function sameSet(x: string[], y: string[]): boolean {
  const a = new Set(x);
  const b = new Set(y);
  return a.size === b.size && [...a].every((item) => b.has(item));
}

/**
 * Adjudicate the set of independent observations for one opportunity.
 * Each observation is kept intact (never fused destructively into another
 * reviewer's record); the outcome is a separate, ordered result.
 */
export function adjudicateObservations(
  observations: OpportunityObservationV1[],
): AdjudicationOutcome | null {
  if (observations.length === 0) return null;
  const first = observations[0];
  const reviewers = observations.map((o) => o.reviewerId);

  if (observations.length === 1) {
    return {
      opportunityId: first.opportunityId,
      status: 'adjudicated',
      consensus: true,
      reviewers,
      resolved: true,
      result: 'accepted-consensus',
      note: 'single reviewer',
    };
  }

  const allAgree = observations.every((o) => sameReviewerAssessment(first, o));
  if (allAgree) {
    return {
      opportunityId: first.opportunityId,
      status: 'adjudicated',
      consensus: true,
      reviewers,
      resolved: true,
      result: 'accepted-consensus',
    };
  }

  // Disagreement: do NOT auto-merge asset sets. Require a human adjudicator.
  return {
    opportunityId: first.opportunityId,
    status: 'adjudicated',
    consensus: false,
    reviewers,
    resolved: false,
    result: 'unresolved',
    note: 'reviewer disagreement — requires adjudicated choice',
  };
}

export function toFrozenOpportunityLabel(
  adjudication: AdjudicationOutcome | null,
  observation: OpportunityObservationV1,
  otherReviewerIds: string[] = [],
): FrozenOpportunityLabel | null {
  if (!adjudication || !adjudication.resolved) return null;
  return {
    labelVersion: 'editron-sfx-evaluation-corpus-v1',
    opportunityId: observation.opportunityId,
    acceptableAssetIds: [...observation.acceptableAssetIds],
    unacceptableAssetIds: [...observation.unacceptableAssetIds],
    absurdAssetIds: [...observation.absurdAssetIds],
    silenceAcceptable: observation.silenceAcceptable,
    silenceRequired: observation.silenceRequired,
    roleState: observation.roleState,
    surfaceState: observation.surfaceState,
    directionState: observation.directionState,
    motionSpeedState: observation.motionSpeedState,
    materialState: observation.materialState,
    reviewerId: observation.reviewerId,
    reviewedAt: observation.reviewedAt,
    ...(adjudication.consensus || otherReviewerIds.length > 0
      ? {
          adjudication: {
            conflictingReviewerIds: adjudication.consensus ? [] : otherReviewerIds,
            resolved: adjudication.resolved,
            result: adjudication.result,
            ...(adjudication.note ? { note: adjudication.note } : {}),
          },
        }
      : {}),
  };
}