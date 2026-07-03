import { describe, expect, it } from 'vitest';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';
import { validateAvatarProfile } from '../../lib/avatar/avatar-lifecycle';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';

const NOW = '2026-07-01T00:00:00.000Z';

function avatar(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  const base: AvatarProfile = {
    version: 1,
    avatarId: 'avatar_primary',
    userId: 'user_avatar',
    orgId: null,
    brandId: null,
    displayName: 'Primary Presenter',
    status: 'draft',
    sourceType: 'uploaded_portrait',
    portrait: {
      assetId: 'asset_portrait',
      imageUrl: 'https://cdn.example.test/avatar/portrait.png',
      thumbnailUrl: 'https://cdn.example.test/avatar/thumb.png',
      faceDetected: true,
      identityDescription: 'Front-facing studio portrait.',
    },
    voice: {
      sourceType: 'uploaded_voice_sample',
      sampleAssetId: 'asset_voice_sample',
      language: 'en',
      speakingStyle: 'clear and warm',
    },
    persona: {
      defaultRole: 'founder-presenter',
      defaultTone: 'confident',
      speakingConstraints: ['do not claim unsupported metrics'],
      killList: ['cheap'],
    },
    rights: {
      consentConfirmed: true,
      likenessOwner: 'self',
      commercialUseAllowed: true,
      notes: 'User confirmed own likeness and voice rights.',
    },
    evidence: [
      {
        id: 'e_consent',
        signalPath: 'rights.consentConfirmed',
        sourceType: 'manual_user_entry',
        excerpt: 'User confirmed avatar consent.',
        confidence: 1,
        observedAt: NOW,
        extractor: 'avatar-vault.test',
        consentRequired: true,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };

  return {
    ...base,
    ...overrides,
    portrait: { ...base.portrait, ...(overrides.portrait ?? {}) },
    voice: { ...base.voice, ...(overrides.voice ?? {}) },
    persona: { ...base.persona, ...(overrides.persona ?? {}) },
    rights: { ...base.rights, ...(overrides.rights ?? {}) },
    evidence: overrides.evidence ?? base.evidence,
  };
}

describe('AvatarProfile lifecycle', () => {
  it('accepts personal no-brand avatar profiles without inheriting a brand id', () => {
    const repo = createInMemoryAvatarProfileRepository();
    const draft = repo.saveDraft(avatar({ brandId: null }), { id: 'draft_personal', now: NOW });

    expect(draft.review.required).toBe(true);
    expect(draft.profile.brandId).toBeNull();

    const accepted = repo.acceptDraft('draft_personal', {
      actorId: 'avatar_reviewer',
      now: '2026-07-01T00:05:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected avatar acceptance to succeed.');
    expect(accepted.record.status).toBe('accepted');
    expect(accepted.record.profile.status).toBe('accepted');
    expect(accepted.record.profile.brandId).toBeNull();
    expect(accepted.record.review.acceptedBy).toBe('avatar_reviewer');
    expect(repo.getLatestAcceptedProfile({ userId: 'user_avatar', orgId: null, brandId: null })?.avatarId).toBe('avatar_primary');
    expect(repo.listEvents('draft_personal').map((event) => event.type)).toEqual(['draft_saved', 'draft_accepted']);
  });

  it('allows accepted avatar profiles to be explicitly brand bound', () => {
    const repo = createInMemoryAvatarProfileRepository();
    repo.saveDraft(avatar({ brandId: 'brand_avatar' }), { id: 'draft_brand_bound', now: NOW });

    const accepted = repo.acceptDraft('draft_brand_bound', {
      now: '2026-07-01T00:05:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected brand-bound avatar acceptance to succeed.');
    expect(accepted.record.profile.brandId).toBe('brand_avatar');
    expect(repo.getLatestAcceptedRecord({ userId: 'user_avatar', brandId: 'brand_avatar' })?.id).toBe('draft_brand_bound');
  });

  it('blocks acceptance when consent is missing', () => {
    const repo = createInMemoryAvatarProfileRepository();
    repo.saveDraft(
      avatar({
        rights: { consentConfirmed: false, likenessOwner: 'self', commercialUseAllowed: true },
      }),
      { id: 'draft_no_consent', now: NOW },
    );

    const accepted = repo.acceptDraft('draft_no_consent', {
      actorId: 'avatar_reviewer',
      now: '2026-07-01T00:05:00.000Z',
    });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) throw new Error('Missing consent should fail acceptance.');
    expect(accepted.code).toBe('validation_failed');
    expect(accepted.issues.map((issue) => issue.code)).toContain('missing_consent');
    expect(repo.getRecord('draft_no_consent')?.status).toBe('draft');
    expect(repo.listEvents('draft_no_consent').map((event) => event.type)).toEqual(['draft_saved', 'draft_accept_failed']);
  });

  it('validates portrait assets and voice source before acceptance', () => {
    const result = validateAvatarProfile(
      avatar({
        portrait: { assetId: '', imageUrl: '' },
        voice: { sourceType: 'selected_tts_voice', sampleAssetId: undefined, ttsVoiceId: undefined },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missing_portrait_asset', 'missing_portrait_url', 'missing_voice_source']),
    );
  });

  it('accepts URL-first virtual person references without internal asset ids', () => {
    const result = validateAvatarProfile(
      avatar({
        sourceType: 'virtual_person_profile',
        portrait: { assetId: '', imageUrl: 'https://cdn.example.test/avatar/face.png' },
        identityPack: {
          referenceAssets: [
            { role: 'face_front', imageUrl: 'https://cdn.example.test/avatar/face.png' },
            { role: 'full_body_front', imageUrl: 'https://cdn.example.test/avatar/full-body.png' },
          ],
        },
      }),
    );

    expect(result.valid).toBe(true);
  });

  it('accepts virtual person image references before a voice source is attached', () => {
    const repo = createInMemoryAvatarProfileRepository();
    const draft = repo.saveDraft(
      avatar({
        sourceType: 'virtual_person_profile',
        portrait: { assetId: 'avatar_face_asset', imageUrl: 'https://cdn.example.test/avatar/face.png' },
        identityPack: {
          referenceAssets: [
            { role: 'face_front', assetId: 'avatar_face_asset', imageUrl: 'https://cdn.example.test/avatar/face.png' },
            { role: 'full_body_front', assetId: 'avatar_body_asset', imageUrl: 'https://cdn.example.test/avatar/full-body.png' },
          ],
        },
        voice: { sourceType: 'uploaded_voice_sample', sampleAssetId: '' },
      }),
      { id: 'draft_virtual_no_voice', now: NOW },
    );

    expect(draft.review.reasons).toContain('Profile has optional or review-only evidence.');

    const accepted = repo.acceptDraft('draft_virtual_no_voice', {
      actorId: 'avatar_reviewer',
      now: '2026-07-01T00:05:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected virtual person acceptance to succeed without a voice source.');
    expect(accepted.record.status).toBe('accepted');
    expect(accepted.record.review.reasons).toEqual([]);
    expect(accepted.record.profile.voice.sourceType).toBe('uploaded_voice_sample');
  });
  it('blocks virtual person acceptance without a full-body reference', () => {
    const result = validateAvatarProfile(
      avatar({
        sourceType: 'virtual_person_profile',
        portrait: { assetId: '', imageUrl: 'https://cdn.example.test/avatar/face.png' },
        identityPack: {
          referenceAssets: [{ role: 'face_front', imageUrl: 'https://cdn.example.test/avatar/face.png' }],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('missing_full_body_reference');
    expect(result.errors.map((issue) => issue.code)).not.toContain('missing_portrait_asset');
  });

  it('rejects drafts with reviewer metadata', () => {
    const repo = createInMemoryAvatarProfileRepository();
    repo.saveDraft(avatar(), { id: 'draft_reject', now: NOW });

    const rejected = repo.rejectDraft('draft_reject', 'Wrong speaker identity.', {
      actorId: 'avatar_reviewer',
      now: '2026-07-01T00:10:00.000Z',
    });

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) throw new Error('Expected rejection to succeed.');
    expect(rejected.record.status).toBe('rejected');
    expect(rejected.record.profile.status).toBe('rejected');
    expect(rejected.record.review.rejectedBy).toBe('avatar_reviewer');
    expect(rejected.record.review.rejectionReason).toBe('Wrong speaker identity.');
    expect(repo.listEvents('draft_reject').map((event) => event.type)).toEqual(['draft_saved', 'draft_rejected']);
  });

  it('supersedes prior accepted records for the same user, org, and avatar id', () => {
    const repo = createInMemoryAvatarProfileRepository();
    repo.saveDraft(avatar({ displayName: 'Presenter V1', orgId: 'org_avatar', brandId: 'brand_old' }), {
      id: 'draft_v1',
      now: NOW,
    });
    const first = repo.acceptDraft('draft_v1', { now: '2026-07-01T00:05:00.000Z' });
    if (!first.ok) throw new Error('Expected first avatar acceptance to succeed.');

    repo.saveDraft(avatar({ displayName: 'Presenter V2', orgId: 'org_avatar', brandId: null }), {
      id: 'draft_v2',
      now: '2026-07-01T00:10:00.000Z',
    });
    const second = repo.acceptDraft('draft_v2', { now: '2026-07-01T00:15:00.000Z' });

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('Expected second avatar acceptance to succeed.');
    expect(second.superseded.map((record) => record.id)).toEqual(['draft_v1']);
    expect(repo.getRecord('draft_v1')?.status).toBe('superseded');
    expect(repo.getRecord('draft_v2')?.status).toBe('accepted');
    expect(repo.listRecords({ avatarId: 'avatar_primary', userId: 'user_avatar', orgId: 'org_avatar', status: 'accepted' }).map((record) => record.id)).toEqual(['draft_v2']);
  });

  it('does not accept an already accepted record again', () => {
    const repo = createInMemoryAvatarProfileRepository();
    repo.saveDraft(avatar(), { id: 'draft_once', now: NOW });
    const accepted = repo.acceptDraft('draft_once', { now: '2026-07-01T00:05:00.000Z' });
    if (!accepted.ok) throw new Error('Expected avatar acceptance to succeed.');

    const secondAccept = repo.acceptDraft('draft_once', { now: '2026-07-01T00:10:00.000Z' });

    expect(secondAccept.ok).toBe(false);
    if (secondAccept.ok) throw new Error('Already accepted record should not be accepted twice.');
    expect(secondAccept.code).toBe('not_draft');
  });
});
