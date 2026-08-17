import { deriveBrandSignalProfile, sanitizeEvidenceExcerpt, type BrandSignal, type BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import {
  bindBrandSignalDraftToAcceptedRevision,
  collectBrandSignals,
  createBrandSignalProfileDraft,
} from '@/lib/shared/brand-signal-lifecycle';
import {
  resolveBrandSignalEditLearningWeight,
  type BrandSignalEditEventType,
} from '@/lib/shared/brand-signal-edit-weighting';
import { createBrandVaultDraftReviewPayload } from '@/lib/shared/brand-vault-draft-orchestrator';
import { getDefaultBrandVaultRefineryStore, type BrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import { authorizeBrandScope, BrandScopeAuthorizationError } from '@/lib/shared/brand-scope';
import type { BrandEvidenceCandidate, BrandRefineryJob } from '@/lib/shared/brand-website-refinery-types';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import type { BrandDNA, VoiceExemplar, VoiceFingerprint } from './db';

const THINKFORGE_VAULT_EXTRACTOR = 'thinkforge-brand-dna-dual-write.v1';

export type ThinkForgeBrandVaultVoiceSource =
  | 'manual_brand_dna_edit'
  | 'voice_fingerprint_extract'
  | 'passive_voice_exemplar';

export type ThinkForgeBrandVaultVoiceWriteResult =
  | { ok: true; skipped?: false; jobId: string; recordId: string; candidateCount: number }
  | { ok: true; skipped: true; reason: 'no_supported_updates' }
  | {
      ok: false;
      code: 'brand_not_found' | 'brand_scope_unavailable' | 'write_failed';
      error: string;
    };

export interface ThinkForgeBrandVaultVoiceWriteInput {
  userId: string;
  orgId?: string | null;
  isOrgAdmin?: boolean;
  brandId?: string;
  sessionId?: string;
  updates: Partial<BrandDNA>;
  source: ThinkForgeBrandVaultVoiceSource;
  actorId?: string;
  now?: string;
  store?: BrandVaultRefineryStore;
}

export async function writeThinkForgeBrandDNAToBrandVault(
  input: ThinkForgeBrandVaultVoiceWriteInput,
): Promise<ThinkForgeBrandVaultVoiceWriteResult> {
  try {
    const now = input.now ?? new Date().toISOString();
    const store = input.store ?? getDefaultBrandVaultRefineryStore();
    const authorizedBrand = input.brandId
      ? await authorizeBrandScope({
          userId: input.userId,
          orgId: input.orgId ?? null,
          isOrgAdmin: input.isOrgAdmin,
          brandId: input.brandId,
          store,
        })
      : null;
    const candidates = createThinkForgeBrandDNACandidates(input, now);
    if (candidates.length === 0) return { ok: true, skipped: true, reason: 'no_supported_updates' };

    const profile = authorizedBrand
      ? cloneAcceptedProfile(authorizedBrand.acceptedRecord.profile, now)
      : deriveProfileFromBrandDNA(input, candidates, now);
    attachCandidatesToProfile(profile, candidates);

    let record = createBrandSignalProfileDraft(profile, {
      id: `brand_signal_profile_${idPart(input.brandId ?? input.userId)}_thinkforge_${Date.parse(now) || Date.now()}`,
      now,
      actorId: input.actorId ?? input.userId,
    });
    if (authorizedBrand) {
      record = bindBrandSignalDraftToAcceptedRevision(record, authorizedBrand.acceptedRecord);
    }

    const savedRecord = await store.saveRecord(record, { now, actorId: input.actorId ?? input.userId });
    const job = createThinkForgeBrandDNAJob(input, savedRecord.id, candidates, now);
    const reviewPayload = createBrandVaultDraftReviewPayload({
      job,
      record: savedRecord,
      candidates,
      normalizedUrl: `thinkforge://brand-dna/${idPart(input.brandId ?? input.userId)}`,
      warnings: job.warnings,
    });

    await store.saveJobSnapshot({
      job,
      recordId: savedRecord.id,
      normalizedUrl: `thinkforge://brand-dna/${idPart(input.brandId ?? input.userId)}`,
      candidates,
      reviewPayload,
    });

    return {
      ok: true,
      jobId: job.id,
      recordId: savedRecord.id,
      candidateCount: candidates.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[ThinkForge:BrandVault] BrandDNA dual-write failed:', message);
    if (error instanceof BrandScopeAuthorizationError) {
      return { ok: false, code: error.code, error: message };
    }
    return { ok: false, code: 'write_failed', error: message };
  }
}

function createThinkForgeBrandDNACandidates(
  input: ThinkForgeBrandVaultVoiceWriteInput,
  observedAt: string,
): BrandEvidenceCandidate[] {
  const confidence = confidenceForSource(input.source);
  const candidates: BrandEvidenceCandidate[] = [];
  const push = (args: {
    signalPath: string;
    sourceField: string;
    rawValue: unknown;
    normalizedValue: unknown;
    excerpt?: string;
  }) => {
    const editType = editTypeForSource(input.source);
    const learningWeight = resolveBrandSignalEditLearningWeight({
      service: 'thinkforge',
      signalPath: args.signalPath,
      editType,
      scope: input.source === 'manual_brand_dna_edit' ? 'brand' : 'user',
      polarity: input.source === 'manual_brand_dna_edit' ? 'replace' : 'affirm',
    });
    candidates.push({
      id: `candidate_${idPart(input.source)}_${idPart(args.signalPath)}_${candidates.length + 1}`,
      brandId: input.brandId,
      sourceType: 'legacy_brand_intelligence',
      sourceField: args.sourceField,
      signalPath: args.signalPath,
      rawValue: args.rawValue,
      normalizedValue: args.normalizedValue,
      excerpt: args.excerpt ? sanitizeEvidenceExcerpt(args.excerpt) : undefined,
      confidence,
      trustLevel: 'manual_user_entry',
      authorityClass: 'manual',
      learningWeight,
      observedAt,
      extractorId: THINKFORGE_VAULT_EXTRACTOR,
    });
  };

  if (input.updates.nicheMap !== undefined) {
    const audience = cleanStrings([input.updates.nicheMap]);
    push({
      signalPath: 'identity.audience',
      sourceField: 'thinkforge.brandDNA.nicheMap',
      rawValue: input.updates.nicheMap,
      normalizedValue: audience,
      excerpt: audience[0],
    });
  }
  if (input.updates.killList !== undefined) {
    push({
      signalPath: 'voice.killList',
      sourceField: 'thinkforge.brandDNA.killList',
      rawValue: input.updates.killList,
      normalizedValue: cleanStrings(input.updates.killList),
      excerpt: input.updates.killList.join(', '),
    });
  }
  if (input.updates.hookArchetypes !== undefined) {
    push({
      signalPath: 'voice.hookArchetypes',
      sourceField: 'thinkforge.brandDNA.hookArchetypes',
      rawValue: input.updates.hookArchetypes,
      normalizedValue: cleanStrings(input.updates.hookArchetypes),
      excerpt: input.updates.hookArchetypes.join(', '),
    });
  }

  const recurring = cleanStrings([
    input.updates.voiceLock,
    ...(input.updates.structuralHabits ?? []),
    ...(input.updates.recurringAssets ?? []),
    ...fingerprintVoiceRules(input.updates.voiceFingerprint),
    ...exemplarVoiceRules(input.updates.voiceExemplars),
  ]);
  if (recurring.length > 0) {
    push({
      signalPath: 'voice.recurringPhrases',
      sourceField: sourceFieldForRecurring(input.source),
      rawValue: {
        voiceLock: input.updates.voiceLock,
        structuralHabits: input.updates.structuralHabits,
        recurringAssets: input.updates.recurringAssets,
        voiceFingerprint: input.updates.voiceFingerprint,
        voiceExemplars: input.updates.voiceExemplars,
      },
      normalizedValue: recurring,
      excerpt: recurring.join(' | '),
    });
  }

  return candidates;
}

function cloneAcceptedProfile(profile: BrandSignalProfile, generatedAt: string): BrandSignalProfile {
  const clone = structuredClone(profile);
  clone.generatedAt = generatedAt;
  return clone;
}

function deriveProfileFromBrandDNA(
  input: ThinkForgeBrandVaultVoiceWriteInput,
  candidates: BrandEvidenceCandidate[],
  generatedAt: string,
): BrandSignalProfile {
  const recurringCandidate = candidates.find((candidate) => candidate.signalPath === 'voice.recurringPhrases');
  const recurringPhrases = Array.isArray(recurringCandidate?.normalizedValue)
    ? recurringCandidate.normalizedValue.filter((value): value is string => typeof value === 'string')
    : [];

  const brand: UnifiedBrand = {
    brandId: input.brandId ?? `thinkforge_user_${idPart(input.userId)}`,
    userId: input.userId,
    name: input.brandId ? 'ThinkForge BrandDNA' : 'ThinkForge User Voice',
    voice: {
      voiceLock: input.updates.voiceLock,
      nicheMap: input.updates.nicheMap,
      killList: cleanStrings(input.updates.killList ?? []),
      hookArchetypes: cleanStrings(input.updates.hookArchetypes ?? []),
      structuralHabits: recurringPhrases,
    },
    visual: {
      colors: [],
    },
    learning: {
      banditProjectCount: 0,
    },
  };

  const profile = deriveBrandSignalProfile(brand, {
    generatedAt,
    extractor: THINKFORGE_VAULT_EXTRACTOR,
  });
  if (!input.brandId) profile.brandId = undefined;
  return profile;
}

function attachCandidatesToProfile(profile: BrandSignalProfile, candidates: BrandEvidenceCandidate[]): void {
  const signalsByPath = new Map(collectBrandSignals(profile).map(({ path, signal }) => [path, signal]));
  const existingEvidenceIds = new Set(profile.evidence.map((item) => item.id));

  for (const candidate of candidates) {
    const signal = signalsByPath.get(candidate.signalPath);
    if (!signal) continue;

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

    const replacesWholeSignal = candidate.learningWeight?.polarity === 'replace'
      && candidate.signalPath !== 'voice.recurringPhrases';
    applyCandidateValue(signal, candidate.normalizedValue, replacesWholeSignal);
    signal.confidence = Math.max(signal.confidence, candidate.confidence);
    signal.trustLevel = candidate.trustLevel ?? 'manual_user_entry';
    signal.authorityClass = authorityClassForSignalPath(candidate.signalPath);
    signal.evidenceIds = [evidenceId, ...signal.evidenceIds.filter((id) => id !== evidenceId)];
    delete signal.fallbackReason;
  }
}

function applyCandidateValue(signal: BrandSignal<unknown>, value: unknown, replaceArray = false): void {
  if (Array.isArray(signal.value)) {
    const incoming = Array.isArray(value) ? value : [value];
    signal.value = uniquePrimitiveValues(replaceArray ? incoming : [...signal.value, ...incoming]) as typeof signal.value;
    return;
  }
  if (value !== undefined && value !== null && !Array.isArray(value) && typeof value !== 'object') {
    signal.value = value as typeof signal.value;
  }
}

function createThinkForgeBrandDNAJob(
  input: ThinkForgeBrandVaultVoiceWriteInput,
  recordId: string,
  candidates: BrandEvidenceCandidate[],
  now: string,
): BrandRefineryJob {
  return {
    id: `brand_refinery_job_${idPart(input.userId)}_${idPart(input.brandId ?? 'user_voice')}_thinkforge_${Date.parse(now) || Date.now()}`,
    userId: input.userId,
    brandId: input.brandId,
    status: 'needs_review',
    inputs: {
      socialLinks: [],
      sourceEvidence: [
        {
          kind: 'legacy_brand_intelligence',
          name: 'ThinkForge BrandDNA',
          text: candidates.map((candidate) => candidate.excerpt).filter(Boolean).join('\n'),
          note: `ThinkForge ${input.source} staged as Brand Vault evidence for review. Record: ${recordId}${input.sessionId ? ` Session: ${input.sessionId}` : ''}`,
          evidenceOrigin: 'connected_metadata',
        },
      ],
    },
    warnings: [
      'ThinkForge BrandDNA evidence was staged as a Brand Vault draft and must be reviewed before becoming accepted brand truth.',
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function sourceFieldForRecurring(source: ThinkForgeBrandVaultVoiceSource): string {
  if (source === 'voice_fingerprint_extract') return 'thinkforge.brandDNA.voiceFingerprint';
  if (source === 'passive_voice_exemplar') return 'thinkforge.brandDNA.voiceExemplars';
  return 'thinkforge.brandDNA.voiceRules';
}

function editTypeForSource(source: ThinkForgeBrandVaultVoiceSource): BrandSignalEditEventType {
  if (source === 'voice_fingerprint_extract') return 'passive_voice_fingerprint';
  if (source === 'passive_voice_exemplar') return 'passive_voice_exemplar';
  return 'manual_brand_dna_edit';
}

function fingerprintVoiceRules(fingerprint?: VoiceFingerprint): string[] {
  if (!fingerprint) return [];
  return cleanStrings([
    `average sentence length: ${fingerprint.avgWordsPerSentence} words`,
    `sentence rhythm: ${fingerprint.sentenceRhythm.join(', ')}`,
    `opening pattern: ${fingerprint.openingPattern}`,
    `transition style: ${fingerprint.transitionStyle}`,
    `closing pattern: ${fingerprint.closingPattern}`,
    `list style: ${fingerprint.listStyle}`,
  ]);
}

function exemplarVoiceRules(exemplars?: VoiceExemplar[]): string[] {
  return (exemplars ?? [])
    .slice(0, 5)
    .map((exemplar) => exemplar.text)
    .filter(Boolean)
    .map((text) => sanitizeEvidenceExcerpt(text, 180));
}

function confidenceForSource(source: ThinkForgeBrandVaultVoiceSource): number {
  if (source === 'manual_brand_dna_edit') return 0.95;
  if (source === 'voice_fingerprint_extract') return 0.9;
  return 0.82;
}

function authorityClassForSignalPath(signalPath: string) {
  if (signalPath === 'voice.killList') return 'brand_constraint' as const;
  if (signalPath.startsWith('identity.')) return 'brand_preference' as const;
  if (signalPath.startsWith('voice.')) return 'voice_default' as const;
  return 'inferred_hint' as const;
}

function uniqueEvidenceId(existing: Set<string>, candidate: BrandEvidenceCandidate): string {
  const base = `tf_${idPart(candidate.sourceField)}_${idPart(candidate.signalPath)}`;
  let next = base;
  let index = 1;
  while (existing.has(next)) {
    index += 1;
    next = `${base}_${index}`;
  }
  return next;
}

function cleanStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
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

function idPart(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 64) || 'unknown';
}
