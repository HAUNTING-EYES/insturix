import { describe, expect, it } from 'vitest';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import type { ProductionBrief } from '../../lib/editron/production-brief/production-brief';
import { resolveThinkForgeAvatarCasting } from '../../lib/thinkforge/casting/resolve-casting';

const NOW = '2026-07-01T00:00:00.000Z';

describe('resolveThinkForgeAvatarCasting', () => {
  it('leaves the brief untouched when avatar casting was not requested', async () => {
    const brief = briefFixture();

    const result = await resolveThinkForgeAvatarCasting({
      brief,
      project: { preferences: {} } as any,
      userId: 'user_avatar',
      orgId: null,
      dependencies: { store: createInMemoryAvatarProfileRepository() },
    });

    expect(result.metadata).toEqual({ status: 'not_requested', warnings: [] });
    expect(result.brief).toBe(brief);
    expect(result.brief.casting).toBeUndefined();
  });

  it('uses the accepted brand avatar before a user-global avatar', async () => {
    const store = createInMemoryAvatarProfileRepository();
    store.saveRecord(acceptedRecord({
      id: 'global_profile',
      avatarId: 'avatar_global',
      brandId: null,
      updatedAt: '2026-07-01T00:02:00.000Z',
    }));
    store.saveRecord(acceptedRecord({
      id: 'brand_profile',
      avatarId: 'avatar_brand',
      brandId: 'brand_insturix',
      updatedAt: '2026-07-01T00:01:00.000Z',
    }));

    const result = await resolveThinkForgeAvatarCasting({
      brief: briefFixture(),
      project: {
        preferences: {
          casting: { requested: true, target: 'self', characterId: 'host' },
        },
      } as any,
      userId: 'user_avatar',
      orgId: null,
      brandId: 'brand_insturix',
      dependencies: { store },
    });

    expect(result.metadata.status).toBe('resolved');
    expect(result.metadata.source).toBe('brand');
    expect(result.metadata.selectedAvatarProfileId).toBe('brand_profile');
    expect(result.brief.casting?.map.host).toEqual({
      avatarProfileId: 'brand_profile',
      voice: { mode: 'cloned', voiceReferenceUrl: 'https://cdn.example.test/avatar/voice.wav' },
    });
  });

  it('falls back to a user-global avatar when the requested brand has none', async () => {
    const store = createInMemoryAvatarProfileRepository();
    store.saveRecord(acceptedRecord({
      id: 'global_profile',
      avatarId: 'avatar_global',
      brandId: null,
    }));

    const result = await resolveThinkForgeAvatarCasting({
      brief: briefFixture(),
      project: { casting: { requested: true, target: 'self' } } as any,
      userId: 'user_avatar',
      orgId: null,
      brandId: 'missing_brand',
      dependencies: { store },
    });

    expect(result.metadata.status).toBe('resolved');
    expect(result.metadata.source).toBe('user_global');
    expect(result.metadata.warnings).toContain('no_brand_avatar_available');
    expect(result.brief.casting?.map.host?.avatarProfileId).toBe('global_profile');
  });

  it('falls back to voiceover instead of silently casting an unusable avatar', async () => {
    const store = createInMemoryAvatarProfileRepository();
    store.saveRecord(acceptedRecord({
      id: 'muted_profile',
      avatarId: 'avatar_muted',
      brandId: 'brand_insturix',
      voice: { sourceType: 'uploaded_voice_sample', sampleAssetId: 'asset_voice_sample' },
      evidence: [
        consentEvidence(),
      ],
    }));

    const result = await resolveThinkForgeAvatarCasting({
      brief: briefFixture(),
      project: { avatarCasting: { requested: true, target: 'self', characterId: 'presenter' } } as any,
      userId: 'user_avatar',
      orgId: null,
      brandId: 'brand_insturix',
      dependencies: { store },
    });

    expect(result.metadata.status).toBe('voiceover_fallback');
    expect(result.metadata.characterId).toBe('presenter');
    expect(result.metadata.warnings).toContain('avatar_voice_reference_missing');
    expect(result.metadata.offer).toContain('Attach a cloned voice sample');
    expect(result.brief.casting).toBeUndefined();
  });
});

function briefFixture(): ProductionBrief {
  return {
    entryPoint: 'thinkforge',
    output: {
      format: 'reel',
      platform: 'instagram-reels',
      aspectRatio: '9:16',
      targetDurationSec: 30,
      count: 1,
    },
    resolution: {
      fieldConfidence: {},
      inferred: [],
      confirmed: [],
    },
  };
}

function acceptedRecord(
  overrides: Partial<AvatarProfile> & { id: string; updatedAt?: string },
): AvatarProfileRecord {
  const profile = avatar(overrides);
  return {
    id: overrides.id,
    status: profile.status,
    profile,
    createdAt: NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    review: {
      required: false,
      reasons: [],
      acceptedAt: NOW,
      acceptedBy: 'avatar_reviewer',
    },
  };
}

function avatar(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  const base: AvatarProfile = {
    version: 1,
    avatarId: 'avatar_primary',
    userId: 'user_avatar',
    orgId: null,
    brandId: null,
    displayName: 'Primary Presenter',
    status: 'accepted',
    sourceType: 'virtual_person_profile',
    portrait: {
      assetId: 'asset_portrait',
      imageUrl: 'https://cdn.example.test/avatar/portrait.png',
      identityDescription: 'Front-facing studio portrait.',
    },
    identityPack: {
      referenceAssets: [
        {
          role: 'face_front',
          assetId: 'asset_face',
          imageUrl: 'https://cdn.example.test/avatar/face.png',
        },
        {
          role: 'full_body_front',
          assetId: 'asset_body',
          imageUrl: 'https://cdn.example.test/avatar/full-body.png',
        },
      ],
      bodyProfile: {
        description: 'Adult presenter, average build, camera-ready posture.',
      },
    },
    stylePack: {
      wardrobePresets: [],
      defaultLook: 'navy sweater, dark trousers',
      speechLook: 'clean founder-presenter outfit',
    },
    performancePack: {
      usagePresets: ['speech_delivery', 'social_presenter'],
      gestureStyle: 'measured founder gestures',
      cameraPresence: 'direct-to-camera but natural',
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
      consentEvidence(),
      {
        id: 'e_voice',
        signalPath: 'voice.sampleAssetId',
        sourceType: 'uploaded_voice_sample',
        sourceAssetId: 'asset_voice_sample',
        sourceUrl: 'https://cdn.example.test/avatar/voice.wav',
        confidence: 1,
        observedAt: NOW,
        extractor: 'thinkforge-resolve-casting.test',
        consentRequired: true,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    acceptedAt: NOW,
    acceptedBy: 'avatar_reviewer',
  };

  return {
    ...base,
    ...overrides,
    portrait: { ...base.portrait, ...(overrides.portrait ?? {}) },
    identityPack: overrides.identityPack ?? base.identityPack,
    stylePack: overrides.stylePack ?? base.stylePack,
    performancePack: overrides.performancePack ?? base.performancePack,
    voice: { ...base.voice, ...(overrides.voice ?? {}) },
    persona: { ...base.persona, ...(overrides.persona ?? {}) },
    rights: { ...base.rights, ...(overrides.rights ?? {}) },
    evidence: overrides.evidence ?? base.evidence,
  };
}

function consentEvidence(): AvatarProfile['evidence'][number] {
  return {
    id: 'e_consent',
    signalPath: 'rights.consentConfirmed',
    sourceType: 'manual_user_entry',
    excerpt: 'User confirmed avatar consent.',
    confidence: 1,
    observedAt: NOW,
    extractor: 'thinkforge-resolve-casting.test',
    consentRequired: true,
  };
}
