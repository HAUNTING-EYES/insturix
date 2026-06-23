import { collectBrandSignals, createBrandSignalProfileDraft, type BrandSignalProfileRecord } from '@/lib/shared/brand-signal-lifecycle';
import {
  deriveBrandSignalProfile,
  sanitizeEvidenceExcerpt,
  type BrandSignal,
  type BrandSignalAuthorityClass,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';
import { resolveBrandSignalEditLearningWeight } from '@/lib/shared/brand-signal-edit-weighting';
import { createBrandVaultDraftReviewPayload } from '@/lib/shared/brand-vault-draft-orchestrator';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';
import type { BrandEvidenceCandidate, BrandRefineryJob } from '@/lib/shared/brand-website-refinery-types';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';

const EDITRON_BRAND_VAULT_EXTRACTOR = 'editron-brand-settings-dual-write.v1';

export interface EditronBrandSettingsSnapshot {
  brandId: string;
  userId: string;
  orgId?: string;
  name?: string;
  industry?: string;
  colors?: unknown;
  voiceDescription?: string;
  visualStyle?: string;
  typography?: string;
}

export type EditronBrandVaultEvidenceSource = 'manual_brand_create' | 'manual_brand_update';

export type EditronBrandVaultEvidenceWriteResult =
  | { ok: true; skipped?: false; jobId: string; recordId: string; candidateCount: number }
  | { ok: true; skipped: true; reason: 'no_supported_updates' }
  | { ok: false; error: string };

export interface EditronBrandVaultEvidenceWriteInput {
  userId: string;
  actorId?: string;
  brand: EditronBrandSettingsSnapshot;
  source: EditronBrandVaultEvidenceSource;
  changedFields?: string[];
  now?: string;
  store?: BrandVaultRefineryStore;
}

export async function writeEditronBrandSettingsToBrandVault(
  input: EditronBrandVaultEvidenceWriteInput,
): Promise<EditronBrandVaultEvidenceWriteResult> {
  try {
    const now = input.now ?? new Date().toISOString();
    const fieldSet = changedFieldSet(input);
    const profile = deriveProfileFromEditronBrand(input.brand, now);
    const candidates = createEditronBrandSettingsCandidates(input, profile, fieldSet, now);
    if (candidates.length === 0) return { ok: true, skipped: true, reason: 'no_supported_updates' };

    const attachedCandidates = attachCandidatesToProfile(profile, candidates);
    if (attachedCandidates.length === 0) return { ok: true, skipped: true, reason: 'no_supported_updates' };

    const actorId = input.actorId ?? input.userId;
    const record = createBrandSignalProfileDraft(profile, {
      id: `brand_signal_profile_${idPart(input.brand.brandId)}_editron_${Date.parse(now) || Date.now()}`,
      now,
      actorId,
    });
    const store = input.store ?? getDefaultBrandVaultRefineryStore();
    const savedRecord = await store.saveRecord(record, { now, actorId });
    const job = createEditronBrandSettingsJob(input, savedRecord, attachedCandidates, now);
    const normalizedUrl = `editron-brand-settings://${idPart(input.brand.brandId)}/${idPart(input.source)}`;
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
    console.warn('[Editron:BrandVault] Brand settings dual-write failed:', message);
    return { ok: false, error: message };
  }
}

function deriveProfileFromEditronBrand(brand: EditronBrandSettingsSnapshot, generatedAt: string): BrandSignalProfile {
  const colors = cleanStrings(Array.isArray(brand.colors) ? brand.colors : []);
  const voiceDescription = cleanString(brand.voiceDescription);
  const visualStyle = cleanString(brand.visualStyle);
  const unified: UnifiedBrand = {
    brandId: brand.brandId,
    userId: brand.userId,
    orgId: brand.orgId,
    name: cleanString(brand.name) ?? 'Editron Brand',
    voice: {
      voiceLock: voiceDescription,
      nicheMap: cleanString(brand.industry),
      killList: [],
      hookArchetypes: [],
      structuralHabits: voiceDescription ? [voiceDescription] : [],
    },
    visual: {
      industry: cleanString(brand.industry),
      colors,
      visualStyle,
      typography: cleanString(brand.typography),
    },
    learning: { banditProjectCount: 0 },
  };

  return deriveBrandSignalProfile(unified, {
    generatedAt,
    extractor: EDITRON_BRAND_VAULT_EXTRACTOR,
  });
}

function createEditronBrandSettingsCandidates(
  input: EditronBrandVaultEvidenceWriteInput,
  profile: BrandSignalProfile,
  fieldSet: Set<string>,
  observedAt: string,
): BrandEvidenceCandidate[] {
  const candidates: BrandEvidenceCandidate[] = [];
  const push = (signalPath: string, sourceField: string, rawValue: unknown, normalizedValue: unknown, confidence: number, excerpt?: string) => {
    if (normalizedValue === undefined || normalizedValue === null) return;
    if (typeof normalizedValue === 'string' && !normalizedValue.trim()) return;
    if (Array.isArray(normalizedValue) && normalizedValue.length === 0) return;
    candidates.push({
      id: `candidate_editron_${idPart(signalPath)}_${candidates.length + 1}`,
      brandId: input.brand.brandId,
      sourceType: 'manual_user',
      sourceField,
      signalPath,
      rawValue,
      normalizedValue,
      excerpt: excerpt ? sanitizeEvidenceExcerpt(excerpt) : undefined,
      confidence,
      trustLevel: 'manual_user_entry',
      authorityClass: 'manual',
      learningWeight: resolveBrandSignalEditLearningWeight({
        service: 'editron',
        signalPath,
        editType: 'manual_brand_dna_edit',
        scope: 'brand',
        polarity: 'replace',
      }),
      observedAt,
      extractorId: EDITRON_BRAND_VAULT_EXTRACTOR,
    });
  };

  const colors = cleanStrings(Array.isArray(input.brand.colors) ? input.brand.colors : []);
  if (fieldSet.has('name')) {
    push('identity.brandName', 'editron.brand.name', input.brand.name, cleanString(input.brand.name), 0.98, input.brand.name);
  }
  if (fieldSet.has('industry')) {
    const industry = cleanString(input.brand.industry);
    push('identity.industry', 'editron.brand.industry', input.brand.industry, industry, 0.94, industry);
    push('identity.category', 'editron.brand.industry', input.brand.industry, industry, 0.9, industry);
    push('identity.audience', 'editron.brand.industry', input.brand.industry, industry ? [industry] : [], 0.72, industry);
  }
  if (fieldSet.has('colors')) {
    push('palette.primary', 'editron.brand.colors.0', colors[0], colors[0], 0.96, colors[0]);
    push('palette.accent', 'editron.brand.colors.1', colors[1] ?? colors[0], colors[1] ?? colors[0], colors[1] ? 0.9 : 0.72, colors.join(', '));
    push('palette.supporting', 'editron.brand.colors', input.brand.colors, colors.slice(2), 0.78, colors.join(', '));
  }
  if (fieldSet.has('typography')) {
    push('typography.raw', 'editron.brand.typography', input.brand.typography, cleanString(input.brand.typography), 0.9, input.brand.typography);
  }
  if (fieldSet.has('voiceDescription')) {
    const voice = cleanString(input.brand.voiceDescription);
    push('voice.recurringPhrases', 'editron.brand.voiceDescription', input.brand.voiceDescription, voice ? [voice] : [], 0.88, voice);
  }
  if (fieldSet.has('visualStyle')) {
    attachDerivedStyleDialCandidates(input, profile, candidates, observedAt);
  }

  return candidates;
}

function attachDerivedStyleDialCandidates(
  input: EditronBrandVaultEvidenceWriteInput,
  profile: BrandSignalProfile,
  candidates: BrandEvidenceCandidate[],
  observedAt: string,
): void {
  const visualStyle = cleanString(input.brand.visualStyle);
  if (!visualStyle) return;
  const signals = collectBrandSignals(profile)
    .filter(({ path }) => path.startsWith('visual.') || path.startsWith('motion.'))
    .filter(({ signal }) => typeof signal.value === 'number');
  for (const { path, signal } of signals) {
    candidates.push({
      id: `candidate_editron_${idPart(path)}_${candidates.length + 1}`,
      brandId: input.brand.brandId,
      sourceType: 'manual_user',
      sourceField: 'editron.brand.visualStyle',
      signalPath: path,
      rawValue: visualStyle,
      normalizedValue: signal.value,
      excerpt: sanitizeEvidenceExcerpt(visualStyle),
      confidence: 0.64,
      trustLevel: 'manual_user_entry',
      authorityClass: 'manual',
      learningWeight: resolveBrandSignalEditLearningWeight({
        service: 'editron',
        signalPath: path,
        editType: 'manual_brand_dna_edit',
        scope: 'brand',
        polarity: 'replace',
      }),
      observedAt,
      extractorId: EDITRON_BRAND_VAULT_EXTRACTOR,
    });
  }
}

function attachCandidatesToProfile(profile: BrandSignalProfile, candidates: BrandEvidenceCandidate[]): BrandEvidenceCandidate[] {
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
    const incoming = uniquePrimitiveValues(Array.isArray(value) ? value : [value]);
    if (incoming.length === 0) return false;
    signal.value = uniquePrimitiveValues([...signal.value, ...incoming]) as typeof signal.value;
    return true;
  }
  return false;
}

function createEditronBrandSettingsJob(
  input: EditronBrandVaultEvidenceWriteInput,
  record: BrandSignalProfileRecord,
  candidates: BrandEvidenceCandidate[],
  now: string,
): BrandRefineryJob {
  const fields = Array.from(changedFieldSet(input)).join(', ') || 'brand settings';
  return {
    id: `brand_refinery_job_${idPart(input.userId)}_${idPart(input.brand.brandId)}_editron_${Date.parse(now) || Date.now()}`,
    userId: input.userId,
    orgId: input.brand.orgId,
    brandId: input.brand.brandId,
    status: 'needs_review',
    inputs: {
      socialLinks: [],
      sourceEvidence: [
        {
          kind: 'legacy_brand_intelligence',
          name: 'Editron brand settings',
          text: candidates.map((candidate) => candidate.excerpt).filter(Boolean).join('\n'),
          note: `Editron ${input.source} staged fields as Brand Vault evidence for review. Record: ${record.id}. Fields: ${fields}.`,
          evidenceOrigin: 'connected_metadata',
        },
      ],
    },
    warnings: [
      'Editron brand settings were staged as a Brand Vault draft and must be reviewed before becoming accepted brand truth.',
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function changedFieldSet(input: EditronBrandVaultEvidenceWriteInput): Set<string> {
  if (input.source === 'manual_brand_create') {
    return new Set(['name', 'industry', 'colors', 'voiceDescription', 'visualStyle', 'typography']);
  }
  return new Set(input.changedFields ?? []);
}

function authorityClassForSignalPath(signalPath: string): BrandSignalAuthorityClass {
  if (signalPath === 'identity.brandName' || signalPath === 'identity.industry') return 'brand_fact';
  if (signalPath.startsWith('palette.') || signalPath.startsWith('typography.')) return 'brand_preference';
  if (signalPath.startsWith('visual.') || signalPath.startsWith('motion.')) return 'brand_preference';
  if (signalPath.startsWith('voice.')) return 'voice_default';
  if (signalPath.startsWith('identity.')) return 'brand_preference';
  return 'inferred_hint';
}

function uniqueEvidenceId(existing: Set<string>, candidate: BrandEvidenceCandidate): string {
  const base = `editron_${idPart(candidate.sourceField)}_${idPart(candidate.signalPath)}`;
  let next = base;
  let index = 1;
  while (existing.has(next)) {
    index += 1;
    next = `${base}_${index}`;
  }
  return next;
}

function cleanStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map(cleanString).filter((value): value is string => Boolean(value))));
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

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function idPart(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 64) || 'unknown';
}
