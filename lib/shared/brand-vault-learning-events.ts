import {
  deriveBrandSignalProfile,
  sanitizeEvidenceExcerpt,
  type BrandSignal,
  type BrandSignalAuthorityClass,
  type BrandSignalProfile,
  type BrandSignalTrustLevel,
} from '@/lib/shared/brand-signal-profile';
import { collectBrandSignals, createBrandSignalProfileDraft } from '@/lib/shared/brand-signal-lifecycle';
import { createBrandVaultDraftReviewPayload } from '@/lib/shared/brand-vault-draft-orchestrator';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';
import type {
  BrandEvidenceCandidate,
  BrandEvidenceCandidateAuthority,
  BrandRefineryJob,
} from '@/lib/shared/brand-website-refinery-types';
import type {
  BrandSignalEditEventType,
  BrandSignalEditPolarity,
  BrandSignalEditScope,
  BrandSignalLearningClass,
  BrandSignalLearningEventContext,
  BrandSignalLearningEvent,
  BrandSignalLearningWeight,
  BrandSignalWeightingService,
} from '@/lib/shared/brand-signal-edit-weighting';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';

const LEARNING_EVENTS_EXTRACTOR = 'brand-vault-learning-events.v1';
const LEARNING_EVENTS_BASE_EXTRACTOR = 'brand-vault-learning-events.base.v1';
const SUPPORTED_SERVICES: ReadonlySet<BrandSignalWeightingService> = new Set([
  'brand_vault',
  'thinkforge',
  'editron',
  'clickatron',
  'alyzitron',
]);
const SUPPORTED_EDIT_TYPES: ReadonlySet<BrandSignalEditEventType> = new Set([
  'direct_review_edit',
  'manual_brand_dna_edit',
  'passive_voice_fingerprint',
  'passive_voice_exemplar',
  'generated_output_correction',
  'accepted_output_confirmation',
  'rejected_candidate',
]);
const SUPPORTED_SCOPES: ReadonlySet<BrandSignalEditScope> = new Set([
  'frame',
  'scene',
  'video',
  'project',
  'campaign',
  'brand',
  'user',
]);
const SUPPORTED_POLARITIES: ReadonlySet<BrandSignalEditPolarity> = new Set([
  'affirm',
  'replace',
  'reject',
  'suppress',
]);
const SUPPORTED_SIGNAL_CLASSES: ReadonlySet<BrandSignalLearningClass> = new Set([
  'hard_fact',
  'hard_constraint',
  'visual_identity',
  'typography_identity',
  'strategic_identity',
  'voice_rule',
  'voice_dial',
  'visual_dial',
  'motion_dial',
  'derived_process',
  'soft_preference',
]);

export type BrandVaultLearningEventWriteResult =
  | { ok: true; skipped?: false; jobId: string; recordId: string; candidateCount: number }
  | { ok: true; skipped: true; reason: 'no_learning_events' | 'no_supported_candidates' }
  | { ok: false; error: string };

export interface BrandVaultLearningEventWriteInput {
  userId: string;
  brandId?: string;
  projectId?: string;
  sourceEventId?: string;
  learningEvents: unknown;
  now?: string;
  actorId?: string;
  store?: BrandVaultRefineryStore;
}

export async function writeBrandSignalLearningEventsToBrandVault(
  input: BrandVaultLearningEventWriteInput,
): Promise<BrandVaultLearningEventWriteResult> {
  try {
    const learningEvents = parseBrandSignalLearningEvents(input.learningEvents);
    if (learningEvents.length === 0) return { ok: true, skipped: true, reason: 'no_learning_events' };

    const now = input.now ?? new Date().toISOString();
    const profile = createLearningProfile(input, now);
    const candidates = learningEvents
      .map((event, index) => createLearningEventCandidate(input, event, index, now))
      .filter((candidate): candidate is BrandEvidenceCandidate => Boolean(candidate));
    if (candidates.length === 0) return { ok: true, skipped: true, reason: 'no_supported_candidates' };

    const attachedCandidates = attachCandidatesToProfile(profile, candidates);
    if (attachedCandidates.length === 0) return { ok: true, skipped: true, reason: 'no_supported_candidates' };

    const actorId = input.actorId ?? input.userId;
    const record = createBrandSignalProfileDraft(profile, {
      id: `brand_signal_profile_${idPart(input.brandId ?? input.userId)}_learning_${Date.parse(now) || Date.now()}`,
      now,
      actorId,
    });
    const store = input.store ?? getDefaultBrandVaultRefineryStore();
    const savedRecord = await store.saveRecord(record, { now, actorId });
    const job = createLearningEventJob(input, savedRecord.id, attachedCandidates, now);
    const normalizedUrl = `brand-learning://${idPart(input.sourceEventId ?? savedRecord.id)}`;
    const reviewPayload = createBrandVaultDraftReviewPayload({
      job,
      record: savedRecord,
      candidates: attachedCandidates,
      normalizedUrl,
      warnings: job.warnings,
    });

    await store.saveJobSnapshot({
      job,
      recordId: savedRecord.id,
      normalizedUrl,
      candidates: attachedCandidates,
      reviewPayload,
    });

    return {
      ok: true,
      jobId: job.id,
      recordId: savedRecord.id,
      candidateCount: attachedCandidates.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[BrandVault:LearningEvents] write failed:', message);
    return { ok: false, error: message };
  }
}

export function parseBrandSignalLearningEvents(value: unknown): BrandSignalLearningEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseBrandSignalLearningEvent)
    .filter((event): event is BrandSignalLearningEvent => Boolean(event));
}

function parseBrandSignalLearningEvent(value: unknown): BrandSignalLearningEvent | null {
  const record = asRecord(value);
  if (!record || record.version !== 1) return null;

  const service = stringEnum(record.service, SUPPORTED_SERVICES);
  const editType = stringEnum(record.editType, SUPPORTED_EDIT_TYPES);
  const scope = stringEnum(record.scope, SUPPORTED_SCOPES);
  const polarity = stringEnum(record.polarity, SUPPORTED_POLARITIES);
  const signalPath = nonEmptyString(record.signalPath);
  const observedAt = nonEmptyString(record.observedAt);
  const learningWeight = parseLearningWeight(record.learningWeight);
  if (!service || !editType || !scope || !polarity || !signalPath || !observedAt || !learningWeight) return null;
  if (!isIsoDate(observedAt)) return null;

  return {
    version: 1,
    id: nonEmptyString(record.id) ?? `brand_signal_learning_${service}_${editType}_${idPart(signalPath)}_${Date.parse(observedAt) || 0}`,
    service,
    signalPath,
    editType,
    scope,
    polarity,
    learningWeight,
    observedAt,
    actorId: nonEmptyString(record.actorId),
    context: parseLearningEventContext(record.context),
    beforeValue: record.beforeValue,
    afterValue: record.afterValue,
    observedValue: record.observedValue,
    note: nonEmptyString(record.note),
  };
}

function createLearningEventCandidate(
  input: BrandVaultLearningEventWriteInput,
  event: BrandSignalLearningEvent,
  index: number,
  observedAt: string,
): BrandEvidenceCandidate | null {
  const normalizedValue = normalizeLearningEventValue(event);
  if (normalizedValue === undefined) return null;

  const excerpt = learningEventExcerpt(event, normalizedValue);
  return {
    id: `candidate_${idPart(event.service)}_${idPart(event.signalPath)}_${index + 1}`,
    brandId: input.brandId,
    jobId: input.sourceEventId,
    sourceType: 'manual_user',
    sourceField: `brandLearning.${event.service}.${event.editType}.${event.signalPath}`,
    signalPath: event.signalPath,
    rawValue: {
      beforeValue: event.beforeValue,
      afterValue: event.afterValue,
      observedValue: event.observedValue,
      note: event.note,
      context: event.context,
    },
    normalizedValue,
    excerpt,
    confidence: confidenceForLearningEvent(event),
    trustLevel: trustLevelForLearningEvent(event),
    authorityClass: authorityForLearningEvent(event),
    learningWeight: event.learningWeight,
    observedAt: event.observedAt || observedAt,
    extractorId: LEARNING_EVENTS_EXTRACTOR,
  };
}

function createLearningProfile(input: BrandVaultLearningEventWriteInput, generatedAt: string): BrandSignalProfile {
  const brand: UnifiedBrand = {
    brandId: input.brandId ?? `learning_user_${idPart(input.userId)}`,
    userId: input.userId,
    name: input.brandId ? 'Brand learning events' : 'User brand learning events',
    voice: {
      killList: [],
      hookArchetypes: [],
      structuralHabits: [],
    },
    visual: { colors: [] },
    learning: { banditProjectCount: 0 },
  };
  const profile = deriveBrandSignalProfile(brand, {
    generatedAt,
    extractor: LEARNING_EVENTS_BASE_EXTRACTOR,
  });
  if (!input.brandId) profile.brandId = undefined;
  return profile;
}

function attachCandidatesToProfile(
  profile: BrandSignalProfile,
  candidates: BrandEvidenceCandidate[],
): BrandEvidenceCandidate[] {
  const signalsByPath = new Map(collectBrandSignals(profile).map(({ path, signal }) => [path, signal]));
  const existingEvidenceIds = new Set(profile.evidence.map((item) => item.id));
  const attached: BrandEvidenceCandidate[] = [];

  for (const candidate of candidates) {
    const signal = signalsByPath.get(candidate.signalPath);
    if (!signal || !applyCandidateValue(signal, candidate.normalizedValue)) continue;

    const evidenceId = uniqueEvidenceId(existingEvidenceIds, candidate);
    existingEvidenceIds.add(evidenceId);
    profile.evidence.push({
      id: evidenceId,
      signalPath: candidate.signalPath,
      sourceType: candidate.trustLevel ?? 'manual_user_entry',
      sourceField: candidate.sourceField,
      sourceUrl: candidate.sourceUrl,
      excerpt: candidate.excerpt,
      confidence: candidate.confidence,
      trustLevel: candidate.trustLevel ?? 'manual_user_entry',
      authorityClass: authorityClassForSignalPath(candidate.signalPath),
      learningWeight: candidate.learningWeight,
      observedAt: candidate.observedAt,
      extractor: candidate.extractorId,
    });

    signal.confidence = Math.max(signal.confidence, candidate.confidence);
    signal.trustLevel = candidate.trustLevel ?? 'manual_user_entry';
    signal.authorityClass = authorityClassForSignalPath(candidate.signalPath);
    signal.evidenceIds = [evidenceId, ...signal.evidenceIds.filter((id) => id !== evidenceId)];
    delete signal.fallbackReason;
    attached.push(candidate);
  }

  return attached;
}

function applyCandidateValue(signal: BrandSignal<unknown>, value: unknown): boolean {
  if (typeof signal.value === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    signal.value = clamp01(value) as typeof signal.value;
    return true;
  }
  if (typeof signal.value === 'string') {
    if (typeof value !== 'string' || !value.trim()) return false;
    signal.value = value.trim() as typeof signal.value;
    return true;
  }
  if (Array.isArray(signal.value)) {
    const incoming = Array.isArray(value) ? value : [value];
    const merged = uniquePrimitiveValues([...signal.value, ...incoming]);
    if (merged.length === signal.value.length) return false;
    signal.value = merged as typeof signal.value;
    return true;
  }
  return false;
}

function normalizeLearningEventValue(event: BrandSignalLearningEvent): unknown {
  if (event.polarity === 'reject' || event.polarity === 'suppress') {
    return normalizeNegativePreferenceValue(event);
  }

  const value = event.afterValue ?? event.observedValue;
  if (event.signalPath === 'motion.transitionSharpness') {
    return normalizeTransitionSharpness(value);
  }
  if (event.signalPath === 'visual.contrastPreference') {
    return normalizeContrastPreference(value);
  }
  if (isNumberSignalPath(event.signalPath)) {
    return normalizeNumber(value);
  }
  if (isStringArraySignalPath(event.signalPath)) {
    return cleanStrings(Array.isArray(value) ? value : [value]);
  }
  if (isStringSignalPath(event.signalPath)) {
    return nonEmptyString(value);
  }
  return value;
}

function normalizeNegativePreferenceValue(event: BrandSignalLearningEvent): unknown {
  if (event.signalPath === 'voice.killList') {
    return cleanStrings([event.afterValue, event.observedValue, event.beforeValue]);
  }
  return undefined;
}

function normalizeTransitionSharpness(value: unknown): number | undefined {
  const numeric = normalizeNumber(value);
  if (numeric !== undefined) return numeric;
  const text = nonEmptyString(value)?.toLowerCase();
  if (!text) return undefined;
  if (text.includes('whip') || text.includes('zoom') || text.includes('glitch')) return 0.9;
  if (text.includes('hard') || text.includes('cut')) return 0.86;
  if (text.includes('wipe') || text.includes('slide')) return 0.68;
  if (text.includes('soft') || text.includes('dissolve')) return 0.38;
  if (text.includes('fade') || text.includes('dip')) return 0.24;
  return undefined;
}

function normalizeContrastPreference(value: unknown): number | undefined {
  const numeric = normalizeNumber(value);
  if (numeric !== undefined) return numeric;
  const text = nonEmptyString(value)?.toLowerCase();
  if (!text) return undefined;
  if (text.includes('vivid') || text.includes('neon') || text.includes('high') || text.includes('teal')) return 0.78;
  if (text.includes('clean') || text.includes('corporate') || text.includes('warm') || text.includes('cinematic')) return 0.58;
  if (text.includes('muted') || text.includes('desatur') || text.includes('doc')) return 0.34;
  if (text.includes('film') || text.includes('retro') || text.includes('portra')) return 0.48;
  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1 && value <= 100 ? clamp01(value / 100) : clamp01(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed > 1 && parsed <= 100 ? clamp01(parsed / 100) : clamp01(parsed);
  }
  return undefined;
}

function createLearningEventJob(
  input: BrandVaultLearningEventWriteInput,
  recordId: string,
  candidates: BrandEvidenceCandidate[],
  now: string,
): BrandRefineryJob {
  return {
    id: `brand_refinery_job_${idPart(input.userId)}_${idPart(input.brandId ?? input.projectId ?? 'learning')}_learning_${Date.parse(now) || Date.now()}`,
    userId: input.userId,
    brandId: input.brandId,
    status: 'needs_review',
    inputs: {
      socialLinks: [],
      sourceEvidence: [
        {
          kind: 'legacy_brand_intelligence',
          name: 'Service learning events',
          text: candidates.map((candidate) => candidate.excerpt).filter(Boolean).join('\n'),
          note: `Service-side edits were staged as Brand Vault evidence for review. Record: ${recordId}${input.projectId ? ` Project: ${input.projectId}` : ''}`,
          evidenceOrigin: 'connected_metadata',
        },
      ],
    },
    warnings: [
      'Service learning events were staged as a Brand Vault draft and must be reviewed before becoming accepted brand truth.',
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function confidenceForLearningEvent(event: BrandSignalLearningEvent): number {
  const base = event.editType === 'manual_brand_dna_edit' || event.editType === 'direct_review_edit' ? 0.62 : 0.4;
  const weight = clamp01(event.learningWeight.value);
  return round(clamp(base + weight * 0.6, 0.35, 0.9));
}

function trustLevelForLearningEvent(event: BrandSignalLearningEvent): BrandSignalTrustLevel {
  if (event.editType.startsWith('passive_')) return 'llm_inference';
  return 'manual_user_entry';
}

function authorityForLearningEvent(event: BrandSignalLearningEvent): BrandEvidenceCandidateAuthority {
  if (event.editType.startsWith('passive_')) return 'inferred';
  if (event.editType === 'accepted_output_confirmation') return 'owned';
  return 'manual';
}

function authorityClassForSignalPath(signalPath: string): BrandSignalAuthorityClass {
  if (signalPath === 'voice.killList') return 'brand_constraint';
  if (signalPath.startsWith('voice.')) return 'voice_default';
  if (signalPath.startsWith('palette.') || signalPath.startsWith('assets.')) return 'brand_preference';
  if (signalPath.startsWith('visual.') || signalPath.startsWith('motion.')) return 'brand_preference';
  if (signalPath.startsWith('identity.')) return 'brand_preference';
  return 'inferred_hint';
}

function learningEventExcerpt(event: BrandSignalLearningEvent, normalizedValue: unknown): string {
  const before = previewValue(event.beforeValue);
  const after = previewValue(event.afterValue ?? event.observedValue ?? normalizedValue);
  return sanitizeEvidenceExcerpt([
    `${event.service} ${event.editType} for ${event.signalPath}.`,
    before ? `Before: ${before}.` : undefined,
    after ? `After: ${after}.` : undefined,
    event.note,
  ].filter(Boolean).join(' '), 240);
}

function isNumberSignalPath(signalPath: string): boolean {
  return signalPath.startsWith('visual.') ||
    signalPath.startsWith('motion.') ||
    [
      'voice.assertiveness',
      'voice.warmth',
      'voice.jargonDensity',
      'voice.humor',
      'voice.defaultFormality',
      'voice.ctaDirectness',
      'palette.contrastBias',
    ].includes(signalPath);
}

function isStringArraySignalPath(signalPath: string): boolean {
  return [
    'identity.audience',
    'identity.productServices',
    'palette.neutrals',
    'palette.supporting',
    'palette.unsafeOnDark',
    'palette.unsafeOnLight',
    'voice.recurringPhrases',
    'voice.killList',
    'voice.hookArchetypes',
    'assets.productImages',
  ].includes(signalPath);
}

function isStringSignalPath(signalPath: string): boolean {
  return [
    'identity.brandName',
    'identity.industry',
    'identity.category',
    'identity.proofStyle',
    'palette.primary',
    'palette.accent',
    'palette.harmony',
    'typography.raw',
    'typography.category',
    'typography.casingBias',
  ].includes(signalPath);
}

function parseLearningWeight(value: unknown): BrandSignalLearningWeight | null {
  const record = asRecord(value);
  if (!record) return null;
  const service = stringEnum(record.service, SUPPORTED_SERVICES);
  const editType = stringEnum(record.editType, SUPPORTED_EDIT_TYPES);
  const scope = stringEnum(record.scope, SUPPORTED_SCOPES);
  const polarity = stringEnum(record.polarity, SUPPORTED_POLARITIES);
  if (!service || !editType || !scope || !polarity || typeof record.value !== 'number') return null;
  return {
    version: 1,
    value: clamp01(record.value),
    category: record.category === 'calibrated' ? 'calibrated' : 'invented',
    service,
    editType,
    scope,
    polarity,
    signalClass: stringEnum(record.signalClass, SUPPORTED_SIGNAL_CLASSES) ?? 'soft_preference',
    rationale: nonEmptyString(record.rationale) ?? 'Imported BrandSignalLearningEvent weight.',
  };
}

function parseLearningEventContext(value: unknown): BrandSignalLearningEventContext {
  const record = asRecord(value);
  if (!record) return {};
  return {
    userId: nonEmptyString(record.userId),
    brandId: nonEmptyString(record.brandId),
    projectId: nonEmptyString(record.projectId),
    campaignId: nonEmptyString(record.campaignId),
    contentId: nonEmptyString(record.contentId),
    sourceId: nonEmptyString(record.sourceId),
    sourceUrl: nonEmptyString(record.sourceUrl),
    frame: finiteNumber(record.frame),
    timestampMs: finiteNumber(record.timestampMs),
  };
}

function uniqueEvidenceId(existing: Set<string>, candidate: BrandEvidenceCandidate): string {
  const base = `learning_${idPart(candidate.sourceField)}_${idPart(candidate.signalPath)}`;
  let next = base;
  let index = 1;
  while (existing.has(next)) {
    index += 1;
    next = `${base}_${index}`;
  }
  return next;
}

function uniquePrimitiveValues(values: unknown[]): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const key = typeof value === 'string' ? value.trim() : JSON.stringify(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(typeof value === 'string' ? value.trim() : value);
  }
  return result;
}

function cleanStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => nonEmptyString(value)).filter((value): value is string => Boolean(value))));
}

function previewValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function stringEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>): T | undefined {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : undefined;
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function idPart(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 80) || 'unknown';
}
