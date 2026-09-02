import type { MusicGenerationPolicy } from '@/lib/pipeline/bgm-conditioning-contract';
import type { AudioDispatchResult } from './audio-worker-dispatch';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { EditorialDecisionPolicy } from './editorial-decision-policy';

export type AutoBgmDecisionStatus =
  | 'missing-recommendation'
  | 'user-disabled'
  | 'not-recommended'
  | 'storyboard-owned'
  | 'provider-unavailable'
  | 'too-short'
  | 'dispatched'
  | 'dispatch-failed'
  | 'eligible-not-dispatched';

export interface AutoBgmRecommendationInput {
  shouldAddBgm?: boolean;
  reason?: string;
  params?: {
    tempoBpm?: [number, number];
    mood?: string;
    genre?: string;
    levelDb?: number;
  };
}

export interface AutoBgmDecisionEvidence {
  version: 'auto-bgm-decision-v1';
  status: AutoBgmDecisionStatus;
  shouldAddBgm: boolean | null;
  signalShouldAddBgm: boolean | null;
  reason: string;
  recommendationReason?: string;
  params?: AutoBgmRecommendationInput['params'];
  storyboardOwned: boolean;
  providerAvailable?: boolean;
  durationSec?: number;
  totalFrames?: number;
  fps?: number;
  mood?: string;
  pacing?: string;
  musicPrompt?: string;
  dispatch?: AudioDispatchResult;
  editorialPolicy?: EditorialDecisionPolicy;
  musicGenerationPolicy?: MusicGenerationPolicy;
  error?: string;
  evaluatedAt: string;
}

export function buildAutoBgmDecisionEvidence(input: {
  recommendation?: AutoBgmRecommendationInput | null;
  isStoryboardProject?: boolean;
  providerAvailable?: boolean;
  durationSec?: number;
  totalFrames?: number;
  fps?: number;
  mood?: string;
  pacing?: string;
  musicPrompt?: string;
  dispatchResult?: AudioDispatchResult | null;
  editorialPolicy?: EditorialDecisionPolicy;
  musicGenerationPolicy?: MusicGenerationPolicy;
  error?: unknown;
  evaluatedAt?: string | Date;
}): AutoBgmDecisionEvidence {
  const recommendation = input.recommendation ?? null;
  const signalShouldAddBgm = typeof recommendation?.shouldAddBgm === 'boolean' ? recommendation.shouldAddBgm : null;
  const generationBlocked = input.musicGenerationPolicy?.allowed === false;
  const editorialBlocked = input.editorialPolicy?.executionAllowed === false;
  const userBlocked = generationBlocked || editorialBlocked;
  const shouldAddBgm = userBlocked ? false : signalShouldAddBgm;
  const storyboardOwned = input.isStoryboardProject === true;
  const durationSec = finitePositiveNumber(input.durationSec);
  const dispatchError = errorMessage(input.error) ?? input.dispatchResult?.error;
  const evaluatedAt = input.evaluatedAt instanceof Date
    ? input.evaluatedAt.toISOString()
    : input.evaluatedAt ?? new Date().toISOString();

  let status: AutoBgmDecisionStatus;
  let reason: string;

  if (userBlocked) {
    status = 'user-disabled';
    reason = input.musicGenerationPolicy?.reason
      ?? input.editorialPolicy?.reason
      ?? 'user-policy-off:music';
  } else if (!recommendation) {
    status = 'missing-recommendation';
    reason = 'No BGM recommendation was available from signal-computed genre parameters.';
  } else if (shouldAddBgm === false) {
    status = 'not-recommended';
    reason = recommendation.reason || 'Signal-computed BGM recommendation chose silence.';
  } else if (storyboardOwned) {
    status = 'storyboard-owned';
    reason = 'Storyboard projects own BGM dispatch in finalize; Director auto-edit must not double-dispatch.';
  } else if (input.providerAvailable === false) {
    status = 'provider-unavailable';
    reason = 'BGM was recommended, but the generation provider is unavailable in this environment.';
  } else if (durationSec !== undefined && durationSec < 10) {
    status = 'too-short';
    reason = `BGM was recommended, but the edited timeline is too short for generation (${durationSec}s).`;
  } else if (dispatchError) {
    status = 'dispatch-failed';
    reason = `BGM was recommended, but audio worker dispatch failed: ${dispatchError}`;
  } else if (input.dispatchResult?.dispatched === true) {
    status = 'dispatched';
    reason = 'BGM was recommended and the async audio worker was dispatched.';
  } else {
    status = 'eligible-not-dispatched';
    reason = 'BGM was recommended and eligible, but no dispatch result was recorded.';
  }

  return {
    version: 'auto-bgm-decision-v1',
    status,
    shouldAddBgm,
    signalShouldAddBgm,
    reason,
    ...(recommendation?.reason ? { recommendationReason: recommendation.reason } : {}),
    ...(recommendation?.params ? { params: recommendation.params } : {}),
    storyboardOwned,
    ...(input.providerAvailable !== undefined ? { providerAvailable: input.providerAvailable } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(Number.isFinite(input.totalFrames) ? { totalFrames: Math.max(0, Math.round(input.totalFrames as number)) } : {}),
    ...(Number.isFinite(input.fps) ? { fps: Math.max(1, Math.round(input.fps as number)) } : {}),
    ...(input.mood ? { mood: input.mood } : {}),
    ...(input.pacing ? { pacing: input.pacing } : {}),
    ...(input.musicPrompt ? { musicPrompt: input.musicPrompt.slice(0, 500) } : {}),
    ...(input.dispatchResult ? { dispatch: input.dispatchResult } : {}),
    ...(input.editorialPolicy ? { editorialPolicy: input.editorialPolicy } : {}),
    ...(input.musicGenerationPolicy ? { musicGenerationPolicy: input.musicGenerationPolicy } : {}),
    ...(dispatchError ? { error: dispatchError } : {}),
    evaluatedAt,
  };
}

export function assertAutoBgmDecisionEvidenceV1(
  evidence: AutoBgmDecisionEvidence,
): void {
  const stringFields = [
    evidence.reason,
    evidence.recommendationReason,
    evidence.mood,
    evidence.pacing,
    evidence.musicPrompt,
    evidence.error,
  ].filter((value): value is string => value !== undefined);
  const validDispatch = evidence.dispatch === undefined || (
    evidence.dispatch.version === 'audio-dispatch-result-v1'
    && typeof evidence.dispatch.label === 'string'
    && evidence.dispatch.label.length > 0
    && evidence.dispatch.label.length <= 500
    && typeof evidence.dispatch.url === 'string'
    && evidence.dispatch.url.length > 0
    && evidence.dispatch.url.length <= 2_000
    && typeof evidence.dispatch.dispatched === 'boolean'
    && ['qstash', 'fetch', 'none'].includes(evidence.dispatch.method)
  );
  const dispatchStateMatches = evidence.status !== 'dispatched'
    ? evidence.status !== 'dispatch-failed'
      || (evidence.dispatch?.dispatched === false && typeof evidence.error === 'string')
    : evidence.shouldAddBgm === true
      && evidence.dispatch?.dispatched === true
      && evidence.dispatch.method !== 'none';
  const disabledStateMatches = !['user-disabled', 'not-recommended'].includes(evidence.status)
    || evidence.shouldAddBgm === false;
  const numericFields = [evidence.durationSec, evidence.totalFrames, evidence.fps]
    .filter((value): value is number => value !== undefined);
  const evaluatedAtMs = Date.parse(evidence.evaluatedAt);
  const canonicalByteLength = Buffer.byteLength(JSON.stringify(evidence), 'utf8');

  if (
    evidence.version !== 'auto-bgm-decision-v1'
    || !AUTO_BGM_DECISION_STATUSES.has(evidence.status)
    || (evidence.shouldAddBgm !== null && typeof evidence.shouldAddBgm !== 'boolean')
    || (evidence.signalShouldAddBgm !== null && typeof evidence.signalShouldAddBgm !== 'boolean')
    || typeof evidence.storyboardOwned !== 'boolean'
    || stringFields.some((value) => value.length === 0 || value.length > 8_000)
    || numericFields.some((value) => !Number.isFinite(value) || value < 0)
    || (evidence.fps !== undefined && evidence.fps < 1)
    || !Number.isFinite(evaluatedAtMs)
    || new Date(evaluatedAtMs).toISOString() !== evidence.evaluatedAt
    || !validDispatch
    || !dispatchStateMatches
    || !disabledStateMatches
    || canonicalByteLength > 64 * 1_024
  ) {
    throw new Error('AUTO_BGM_DECISION_EVIDENCE_INVALID');
  }

  hashEditronCanonicalJsonV1(evidence);
}

export function autoBgmDecisionEvidenceHashV1(
  evidence: AutoBgmDecisionEvidence,
): string {
  assertAutoBgmDecisionEvidenceV1(evidence);
  return hashEditronCanonicalJsonV1(evidence);
}

const AUTO_BGM_DECISION_STATUSES = new Set<AutoBgmDecisionStatus>([
  'missing-recommendation',
  'user-disabled',
  'not-recommended',
  'storyboard-owned',
  'provider-unavailable',
  'too-short',
  'dispatched',
  'dispatch-failed',
  'eligible-not-dispatched',
]);

function finitePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
}
