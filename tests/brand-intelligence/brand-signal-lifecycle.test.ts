import { describe, expect, it } from 'vitest';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';
import type { BrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { deriveBrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import {
  createBrandSignalLearningEvent,
  resolveBrandSignalEditLearningWeight,
} from '../../lib/shared/brand-signal-edit-weighting';
import {
  acceptBrandSignalProfileDraft,
  collectBrandSignals,
  createBrandSignalProfileDraft,
  rejectBrandSignalProfileDraft,
  supersedeBrandSignalProfileRecord,
  validateBrandSignalProfile,
} from '../../lib/shared/brand-signal-lifecycle';
import { applyBrandVaultSignalValueEditsToDraftRecord } from '../../lib/shared/brand-vault-draft-orchestrator';

const NOW = '2026-06-09T01:00:00.000Z';

function brand(): UnifiedBrand {
  return {
    brandId: 'brand_core',
    userId: 'user_core',
    name: 'Core Brand',
    voice: {
      voiceLock: 'Warm, premium, confident brand voice.',
      nicheMap: 'Agency owners and creative operators',
      killList: ['cheap'],
      hookArchetypes: ['proof-led hook'],
      structuralHabits: ['start with the result'],
    },
    visual: {
      industry: 'creative operations',
      colors: ['#111111', '#22cc88', '#f8f8f8'],
      visualStyle: 'minimal premium structured high contrast',
      typography: 'Sans, title case',
    },
    learning: {
      banditProjectCount: 0,
    },
  };
}

function profile(): BrandSignalProfile {
  return deriveBrandSignalProfile(brand(), { generatedAt: NOW });
}

function cloneProfile(input: BrandSignalProfile): BrandSignalProfile {
  return JSON.parse(JSON.stringify(input)) as BrandSignalProfile;
}

describe('BrandSignalProfile lifecycle', () => {
  it('validates a derived shared profile while keeping review warnings', () => {
    const result = validateBrandSignalProfile(profile());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((issue) => issue.code === 'review_required')).toBe(true);
  });

  it('collects all nested brand signals for service adapters to inspect later', () => {
    const signals = collectBrandSignals(profile());
    const paths = signals.map((item) => item.path);

    expect(paths).toContain('identity.brandName');
    expect(paths).toContain('palette.accent');
    expect(paths).toContain('visual.minimalism');
    expect(paths).toContain('motion.motionEnergy');
    expect(paths).toContain('voice.killList');
    expect(signals.length).toBeGreaterThan(25);
  });

  it('rejects missing evidence references and invalid confidence', () => {
    const invalid = cloneProfile(profile());
    invalid.identity.brandName.evidenceIds = ['missing_evidence'];
    invalid.voice.killList.confidence = 1.5;

    const result = validateBrandSignalProfile(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('unknown_evidence_id');
    expect(result.errors.map((issue) => issue.code)).toContain('invalid_confidence');
  });

  it('allows fallback placeholders without evidence while still blocking actionable evidence-free signals', () => {
    const draftProfile = cloneProfile(profile());
    draftProfile.identity.productServices = {
      value: [],
      confidence: 0,
      trustLevel: 'fallback_default',
      authorityClass: 'inferred_hint',
      evidenceIds: [],
      fallbackReason: 'No reviewed evidence for identity.productServices.',
    };

    const fallbackResult = validateBrandSignalProfile(draftProfile);
    expect(fallbackResult.valid).toBe(true);
    expect(fallbackResult.errors).toEqual([]);
    expect(fallbackResult.warnings.map((issue) => issue.code)).toContain('review_required');

    const accepted = acceptBrandSignalProfileDraft(
      createBrandSignalProfileDraft(draftProfile, { id: 'draft_fallback_placeholder', now: NOW }),
      { actorId: 'brand_manager_1', now: '2026-06-09T01:07:00.000Z' },
    );
    expect(accepted.ok).toBe(true);

    const invalid = cloneProfile(profile());
    invalid.identity.brandName.evidenceIds = [];

    const invalidResult = validateBrandSignalProfile(invalid);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContainEqual(
      expect.objectContaining({
        code: 'missing_evidence',
        path: 'identity.brandName',
      }),
    );
  });

  it('blocks unsafe or untrusted signals from accepted brand truth', () => {
    const invalid = cloneProfile(profile());
    invalid.identity.brandName.authorityClass = 'unsafe_or_untrusted';

    const draft = createBrandSignalProfileDraft(invalid, { id: 'draft_unsafe', now: NOW });
    const accepted = acceptBrandSignalProfileDraft(draft, {
      actorId: 'reviewer_1',
      now: '2026-06-09T01:05:00.000Z',
    });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) throw new Error('Unsafe profile should not be accepted.');
    expect(accepted.issues.map((issue) => issue.code)).toContain('unsafe_signal');
  });

  it('creates a review-required draft before acceptance', () => {
    const draft = createBrandSignalProfileDraft(profile(), { id: 'draft_1', now: NOW });

    expect(draft.id).toBe('draft_1');
    expect(draft.status).toBe('draft');
    expect(draft.review.required).toBe(true);
    expect(draft.review.reasons).toContain('Brand signal profiles must be reviewed before they become accepted brand truth.');
  });

  it('accepts a valid draft and records reviewer metadata', () => {
    const draft = createBrandSignalProfileDraft(profile(), { id: 'draft_2', now: NOW });
    const result = acceptBrandSignalProfileDraft(draft, {
      actorId: 'brand_manager_1',
      now: '2026-06-09T01:10:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid draft to be accepted.');
    expect(result.record.status).toBe('accepted');
    expect(result.record.review.required).toBe(false);
    expect(result.record.review.acceptedBy).toBe('brand_manager_1');
    expect(result.record.review.acceptedAt).toBe('2026-06-09T01:10:00.000Z');
  });

  it('rejects and supersedes records without touching service code', () => {
    const draft = createBrandSignalProfileDraft(profile(), { id: 'draft_3', now: NOW });
    const rejected = rejectBrandSignalProfileDraft(draft, 'Wrong client brand.', {
      actorId: 'brand_manager_2',
      now: '2026-06-09T01:15:00.000Z',
    });
    const superseded = supersedeBrandSignalProfileRecord(rejected, {
      now: '2026-06-09T01:20:00.000Z',
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.review.rejectionReason).toBe('Wrong client brand.');
    expect(superseded.status).toBe('superseded');
  });

  it('uses invented service-wide learning weights for manual signal edits', () => {
    const brandVaultKillList = resolveBrandSignalEditLearningWeight({
      service: 'brand_vault',
      signalPath: 'voice.killList',
      editType: 'direct_review_edit',
      scope: 'brand',
      polarity: 'replace',
    });
    const editronFrameMotionCorrection = resolveBrandSignalEditLearningWeight({
      service: 'editron',
      signalPath: 'motion.motionEnergy',
      editType: 'generated_output_correction',
      scope: 'frame',
      polarity: 'replace',
    });
    const clickatronProjectPaletteCorrection = resolveBrandSignalEditLearningWeight({
      service: 'clickatron',
      signalPath: 'palette.accent',
      editType: 'generated_output_correction',
      scope: 'project',
      polarity: 'replace',
      repetitionCount: 3,
    });
    const alyzitronPassiveVoice = resolveBrandSignalEditLearningWeight({
      service: 'alyzitron',
      signalPath: 'voice.recurringPhrases',
      editType: 'passive_voice_exemplar',
      scope: 'video',
      polarity: 'affirm',
    });

    expect(brandVaultKillList).toMatchObject({
      category: 'invented',
      service: 'brand_vault',
      signalClass: 'hard_constraint',
      value: 1,
    });
    expect(editronFrameMotionCorrection.category).toBe('invented');
    expect(editronFrameMotionCorrection.value).toBeLessThan(0.1);
    expect(clickatronProjectPaletteCorrection.value).toBeGreaterThan(editronFrameMotionCorrection.value);
    expect(alyzitronPassiveVoice.value).toBeGreaterThan(0);
    expect(alyzitronPassiveVoice.rationale).toContain('invented v1 weight');
  });

  it('builds service-wide learning event envelopes for corrections, acceptances, and rejections', () => {
    const editronCorrection = createBrandSignalLearningEvent({
      service: 'editron',
      signalPath: 'motion.motionEnergy',
      editType: 'generated_output_correction',
      observedAt: '2026-06-09T01:30:00.000Z',
      actorId: 'editor_1',
      context: { brandId: 'brand_core', projectId: 'edit_project_1', frame: 120, campaignId: undefined },
      beforeValue: 0.8,
      afterValue: 0.45,
      note: 'User reduced motion after render review.',
    });
    const clickatronRejection = createBrandSignalLearningEvent({
      service: 'clickatron',
      signalPath: 'palette.accent',
      editType: 'rejected_candidate',
      observedAt: '2026-06-09T01:31:00.000Z',
      context: { brandId: 'brand_core', projectId: 'image_project_1', sourceId: 'thumb_candidate_7' },
      observedValue: '#f2c94c',
    });
    const alyzitronAcceptance = createBrandSignalLearningEvent({
      service: 'alyzitron',
      signalPath: 'voice.recurringPhrases',
      editType: 'accepted_output_confirmation',
      observedAt: '2026-06-09T01:32:00.000Z',
      context: { brandId: 'brand_core', contentId: 'analysis_video_1', timestampMs: 42000 },
      observedValue: ['one platform, not ten'],
    });
    const thinkForgeManual = createBrandSignalLearningEvent({
      service: 'thinkforge',
      signalPath: 'voice.killList',
      editType: 'manual_brand_dna_edit',
      observedAt: '2026-06-09T01:33:00.000Z',
      context: { brandId: 'brand_core', userId: 'user_core' },
      afterValue: ['cheap'],
    });

    expect(editronCorrection).toMatchObject({
      version: 1,
      service: 'editron',
      signalPath: 'motion.motionEnergy',
      scope: 'frame',
      polarity: 'replace',
      beforeValue: 0.8,
      afterValue: 0.45,
      context: { brandId: 'brand_core', projectId: 'edit_project_1', frame: 120 },
    });
    expect(editronCorrection.context).not.toHaveProperty('campaignId');
    expect(editronCorrection.id).toContain('brand_signal_learning_editron_generated_output_correction_motion_motionenergy');
    expect(clickatronRejection.learningWeight).toMatchObject({
      category: 'invented',
      service: 'clickatron',
      editType: 'rejected_candidate',
      polarity: 'reject',
      signalClass: 'visual_identity',
    });
    expect(alyzitronAcceptance).toMatchObject({
      scope: 'project',
      polarity: 'affirm',
      learningWeight: { category: 'invented', service: 'alyzitron', editType: 'accepted_output_confirmation' },
    });
    expect(thinkForgeManual).toMatchObject({
      scope: 'brand',
      polarity: 'replace',
      learningWeight: { category: 'invented', service: 'thinkforge', signalClass: 'hard_constraint' },
    });
    expect(thinkForgeManual.learningWeight.value).toBeGreaterThan(editronCorrection.learningWeight.value);
    expect(() => createBrandSignalLearningEvent({
      service: 'editron',
      signalPath: '   ',
      editType: 'generated_output_correction',
      observedAt: '2026-06-09T01:34:00.000Z',
    })).toThrow('signalPath');
    expect(() => createBrandSignalLearningEvent({
      service: 'clickatron',
      signalPath: 'palette.accent',
      editType: 'accepted_output_confirmation',
      observedAt: 'not-a-date',
    })).toThrow('observedAt');
  });

  it('records invented learning weight metadata on Brand Vault review edits', () => {
    const draft = createBrandSignalProfileDraft(profile(), { id: 'draft_weighted_edit', now: NOW });
    const result = applyBrandVaultSignalValueEditsToDraftRecord(
      draft,
      [{ path: 'palette.accent', value: '#00aa66' }],
      { actorId: 'brand_manager_3', now: '2026-06-09T01:25:00.000Z' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected signal edit to succeed.');
    expect(result.record.profile.palette.accent?.value).toBe('#00aa66');

    const evidence = result.record.profile.evidence.find((item) => item.sourceField === 'brandVault.review.signalEdits');
    expect(evidence?.learningWeight).toMatchObject({
      category: 'invented',
      service: 'brand_vault',
      editType: 'direct_review_edit',
      scope: 'brand',
      polarity: 'replace',
      signalClass: 'visual_identity',
    });
    expect(evidence?.learningWeight?.value).toBeGreaterThan(0.85);
    expect(validateBrandSignalProfile(result.record.profile).valid).toBe(true);
  });
});
