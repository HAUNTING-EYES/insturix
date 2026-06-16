import { describe, expect, it } from 'vitest';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';
import type { BrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { deriveBrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import {
  acceptBrandSignalProfileDraft,
  collectBrandSignals,
  createBrandSignalProfileDraft,
  rejectBrandSignalProfileDraft,
  supersedeBrandSignalProfileRecord,
  validateBrandSignalProfile,
} from '../../lib/shared/brand-signal-lifecycle';

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
});
