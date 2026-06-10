import { describe, expect, it } from 'vitest';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';
import type { BrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { deriveBrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { createInMemoryBrandSignalProfileRepository } from '../../lib/shared/brand-signal-profile-repository';

const NOW = '2026-06-09T04:00:00.000Z';

function brand(overrides: Partial<UnifiedBrand> = {}): UnifiedBrand {
  return {
    brandId: 'brand_repo',
    userId: 'user_repo',
    name: 'Repository Brand',
    voice: {
      voiceLock: 'Warm, confident, technical voice.',
      nicheMap: 'Agency operators',
      killList: ['cheap'],
      hookArchetypes: ['proof-led hook'],
      structuralHabits: ['open with proof'],
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
    ...overrides,
  };
}

function profile(overrides: Partial<UnifiedBrand> = {}): BrandSignalProfile {
  return deriveBrandSignalProfile(brand(overrides), { generatedAt: NOW });
}

describe('BrandSignalProfile repository', () => {
  it('saves review-required drafts and returns immutable copies', () => {
    const repo = createInMemoryBrandSignalProfileRepository();
    const draft = repo.saveDraft(profile(), { id: 'draft_repo_1', now: NOW });

    draft.status = 'accepted';

    const stored = repo.getRecord('draft_repo_1');
    expect(stored?.status).toBe('draft');
    expect(stored?.review.required).toBe(true);
    expect(repo.listEvents('draft_repo_1').map((event) => event.type)).toEqual(['draft_saved']);
  });

  it('accepts a draft and makes it the latest canonical accepted profile', () => {
    const repo = createInMemoryBrandSignalProfileRepository();
    repo.saveDraft(profile(), { id: 'draft_repo_2', now: NOW });

    const accepted = repo.acceptDraft('draft_repo_2', {
      actorId: 'brand_manager_1',
      now: '2026-06-09T04:05:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected accept to succeed.');
    expect(accepted.record.status).toBe('accepted');
    expect(accepted.record.review.acceptedBy).toBe('brand_manager_1');
    expect(repo.getLatestAcceptedProfile({ brandId: 'brand_repo', userId: 'user_repo' })?.identity.brandName.value).toBe('Repository Brand');
    expect(repo.listEvents('draft_repo_2').map((event) => event.type)).toEqual(['draft_saved', 'draft_accepted']);
  });

  it('supersedes prior accepted profiles for the same brand and user', () => {
    const repo = createInMemoryBrandSignalProfileRepository();
    repo.saveDraft(profile({ name: 'Repository Brand V1' }), { id: 'draft_v1', now: NOW });
    const first = repo.acceptDraft('draft_v1', { now: '2026-06-09T04:05:00.000Z' });
    if (!first.ok) throw new Error('Expected first accept to succeed.');

    repo.saveDraft(profile({ name: 'Repository Brand V2' }), { id: 'draft_v2', now: '2026-06-09T04:10:00.000Z' });
    const second = repo.acceptDraft('draft_v2', { now: '2026-06-09T04:15:00.000Z' });

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('Expected second accept to succeed.');
    expect(second.superseded.map((record) => record.id)).toEqual(['draft_v1']);
    expect(repo.getRecord('draft_v1')?.status).toBe('superseded');
    expect(repo.getRecord('draft_v2')?.status).toBe('accepted');
    expect(repo.listRecords({ brandId: 'brand_repo', userId: 'user_repo', status: 'accepted' })).toHaveLength(1);
  });

  it('rejects drafts with reviewer metadata', () => {
    const repo = createInMemoryBrandSignalProfileRepository();
    repo.saveDraft(profile(), { id: 'draft_reject', now: NOW });

    const rejected = repo.rejectDraft('draft_reject', 'Wrong client website.', {
      actorId: 'brand_manager_2',
      now: '2026-06-09T04:20:00.000Z',
    });

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) throw new Error('Expected reject to succeed.');
    expect(rejected.record.status).toBe('rejected');
    expect(rejected.record.review.rejectedBy).toBe('brand_manager_2');
    expect(rejected.record.review.rejectionReason).toBe('Wrong client website.');
    expect(repo.listEvents('draft_reject').map((event) => event.type)).toEqual(['draft_saved', 'draft_rejected']);
  });

  it('records validation failure instead of accepting unsafe brand truth', () => {
    const unsafe = profile();
    unsafe.identity.brandName.authorityClass = 'unsafe_or_untrusted';

    const repo = createInMemoryBrandSignalProfileRepository();
    repo.saveDraft(unsafe, { id: 'draft_unsafe_repo', now: NOW });
    const accepted = repo.acceptDraft('draft_unsafe_repo', {
      actorId: 'brand_manager_3',
      now: '2026-06-09T04:25:00.000Z',
    });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) throw new Error('Unsafe profile should not be accepted.');
    expect(accepted.code).toBe('validation_failed');
    expect(repo.getRecord('draft_unsafe_repo')?.status).toBe('draft');
    expect(repo.listEvents('draft_unsafe_repo').map((event) => event.type)).toEqual(['draft_saved', 'draft_accept_failed']);
  });

  it('round-trips through snapshots without sharing mutable objects', () => {
    const repo = createInMemoryBrandSignalProfileRepository();
    repo.saveDraft(profile(), { id: 'draft_snapshot', now: NOW });
    const snapshot = repo.snapshot();
    snapshot.records[0].status = 'accepted';

    const restored = createInMemoryBrandSignalProfileRepository(snapshot);

    expect(repo.getRecord('draft_snapshot')?.status).toBe('draft');
    expect(restored.getRecord('draft_snapshot')?.status).toBe('accepted');
  });
});
