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

/**
 * Field-specific state vocabulary (S2-L1-R follow-up).
 * role/surface: reviewed | unknown | not-perceptible.
 * direction/motionSpeed/material: additionally may be 'not-meaningful'.
 */
export type LabellingFieldState =
  | 'reviewed'
  | 'unknown'
  | 'not-perceptible'
  | 'not-meaningful';

export type RoleSurfaceState = 'reviewed' | 'unknown' | 'not-perceptible';
export type DirectionMotionMaterialState = RoleSurfaceState | 'not-meaningful';

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
  /** true when no sound may be placed. If true, acceptable/unacceptable must be empty. */
  silenceRequired: boolean;
  /** role/surface may NOT be 'not-meaningful'. */
  roleState: RoleSurfaceState;
  surfaceState: RoleSurfaceState;
  /** direction/motionSpeed/material may additionally be 'not-meaningful'. */
  directionState: DirectionMotionMaterialState;
  motionSpeedState: DirectionMotionMaterialState;
  materialState: DirectionMotionMaterialState;
  contextualNote?: string;
}

/**
 * Sidecar manifest of NON-AUTHORITATIVE observations (tooling-validation /
 * persona-generated). Kept OUTSIDE the observation schema so observations stay
 * pure contract. Adjudication excludes every entry listed here BY CONSTRUCTION:
 * a listed (opportunityId, reviewerId) can never contribute to a frozen label.
 */
export interface ToolingValidationManifestV1 {
  version: 'editron-sfx-tooling-validation-manifest-v1';
  entries: Array<{
    opportunityId: string;
    reviewerId: string;
    reason: string;
    generatedAt: string;
  }>;
}

export function isToolingValidationEntry(
  manifest: ToolingValidationManifestV1 | null | undefined,
  opportunityId: string,
  reviewerId: string,
): boolean {
  if (!manifest) return false;
  return manifest.entries.some(
    (e) => e.opportunityId === opportunityId && e.reviewerId === reviewerId,
  );
}

/** By-construction filter: drop every observation listed in the sidecar manifest. */
export function filterToolingValidationObservations(
  observations: OpportunityObservationV1[],
  manifest: ToolingValidationManifestV1 | null | undefined,
): OpportunityObservationV1[] {
  return observations.filter((o) => !isToolingValidationEntry(manifest, o.opportunityId, o.reviewerId));
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

const ROLE_SURFACE_STATES = new Set(['reviewed', 'unknown', 'not-perceptible']);
const DIRECTION_MOTION_MATERIAL_STATES = new Set(['reviewed', 'unknown', 'not-perceptible', 'not-meaningful']);

const ASSET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

function isValidAssetIdArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && ASSET_ID_PATTERN.test(id));
}

/** Field-specific enum + structural validation; no policy change, only enforcement. */
export function isValidOpportunityObservation(value: unknown): value is OpportunityObservationV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 'editron-sfx-observation-v1') return false;
  if (typeof v.opportunityId !== 'string' || typeof v.reviewerId !== 'string' || typeof v.reviewedAt !== 'string') return false;
  if (!isValidAssetIdArray(v.acceptableAssetIds)) return false;
  if (!isValidAssetIdArray(v.unacceptableAssetIds)) return false;
  if (!isValidAssetIdArray(v.absurdAssetIds)) return false;
  if (typeof v.silenceAcceptable !== 'boolean' || typeof v.silenceRequired !== 'boolean') return false;
  // Contradictory silence-required: no asset may be accepted/unacceptable when
  // silence is required (absurd can still be marked for audit, but placement
  // sets must be empty).
  if (v.silenceRequired === true && ((v.acceptableAssetIds as string[]).length > 0 || (v.unacceptableAssetIds as string[]).length > 0)) {
    return false;
  }
  // Field-specific enum domains (role/surface exclude 'not-meaningful').
  if (typeof v.roleState !== 'string' || !ROLE_SURFACE_STATES.has(v.roleState)) return false;
  if (typeof v.surfaceState !== 'string' || !ROLE_SURFACE_STATES.has(v.surfaceState)) return false;
  if (typeof v.directionState !== 'string' || !DIRECTION_MOTION_MATERIAL_STATES.has(v.directionState)) return false;
  if (typeof v.motionSpeedState !== 'string' || !DIRECTION_MOTION_MATERIAL_STATES.has(v.motionSpeedState)) return false;
  if (typeof v.materialState !== 'string' || !DIRECTION_MOTION_MATERIAL_STATES.has(v.materialState)) return false;
  if (v.contextualNote !== undefined && typeof v.contextualNote !== 'string') return false;
  return true;
}

/**
 * Adjudication operates ONLY on authoritative observations. This is enforced
 * BY CONSTRUCTION: every observation listed in the tooling-validation sidecar
 * manifest is filtered out before any agreement/consensus computation. A
 * tooling-validation observation can never produce a frozen label, regardless
 * of how the caller passes it in.
 */
export function adjudicateObservations(
  observations: OpportunityObservationV1[],
  toolingValidationManifest?: ToolingValidationManifestV1 | null,
): AdjudicationOutcome | null {
  // BY CONSTRUCTION: only observations NOT in the tooling-validation manifest
  // may be adjudicated. Listed entries are excluded here, so they can never
  // contribute to a frozen label regardless of caller behavior.
  const authoritative = filterToolingValidationObservations(observations, toolingValidationManifest);
  if (authoritative.length === 0) {
    return {
      opportunityId: observations[0]?.opportunityId ?? 'unknown',
      status: 'unlabelled',
      consensus: false,
      reviewers: [],
      resolved: false,
      result: 'unresolved',
      note: 'no authoritative observations — tooling-validation entries excluded by construction',
    };
  }
  observations = authoritative;

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
  toolingValidationManifest?: ToolingValidationManifestV1 | null,
): FrozenOpportunityLabel | null {
  // BY CONSTRUCTION: observations listed in the tooling-validation manifest can
  // never become frozen labels.
  if (isToolingValidationEntry(toolingValidationManifest, observation.opportunityId, observation.reviewerId)) {
    return null;
  }
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