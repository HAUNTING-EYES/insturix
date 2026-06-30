import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_DRAFT_FORM,
  buildAvatarProfileDraftRequest,
  hasRequiredAvatarDraftFields,
  toggleUsagePreset,
  type AvatarVaultDraftFormState,
} from '../../components/dashboard/AvatarVault/avatar-vault-form';

const NOW = '2026-07-01T02:00:00.000Z';

describe('Avatar Vault UI contract', () => {
  it('creates an explicit no-brand virtual-person request when the brand toggle is off', () => {
    const request = buildAvatarProfileDraftRequest(completeForm({ bindBrand: false, brandId: 'brand_ignored' }), {
      now: NOW,
      avatarId: 'avatar_contract',
    });

    expect(request.bindBrand).toBe(false);
    expect(request.brandId).toBeNull();
    expect(request.profile.avatarId).toBe('avatar_contract');
    expect(request.profile.sourceType).toBe('virtual_person_profile');
    expect(request.profile.identityPack.referenceAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'face_front', assetId: 'asset_face' }),
        expect.objectContaining({ role: 'full_body_front', assetId: 'asset_full_body' }),
      ]),
    );
    expect(request.profile.stylePack.wardrobePresets[0]).toEqual(
      expect.objectContaining({ description: 'Clean studio blazer, dark jeans, neutral sneakers.' }),
    );
    expect(request.profile.performancePack.usagePresets).toEqual(['product_shoot', 'speech_delivery']);
    expect(request.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signalPath: 'rights.consentConfirmed', sourceType: 'manual_user_entry' }),
        expect.objectContaining({ signalPath: 'identityPack.referenceAssets.full_body_front', sourceType: 'uploaded_body_reference' }),
      ]),
    );
  });

  it('sends a brand id only when the brand toggle is on', () => {
    const request = buildAvatarProfileDraftRequest(completeForm({ bindBrand: true, brandId: 'brand_avatar' }), {
      now: NOW,
    });

    expect(request.bindBrand).toBe(true);
    expect(request.brandId).toBe('brand_avatar');
  });

  it('keeps create disabled until the full virtual-person pack is present', () => {
    expect(hasRequiredAvatarDraftFields(completeForm())).toBe(true);
    expect(hasRequiredAvatarDraftFields(completeForm({ bindBrand: true, brandId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ voiceSampleAssetId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ consentConfirmed: false }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ fullBodyAssetId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ fullBodyImageUrl: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ wardrobePreset: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ usagePresets: [] }))).toBe(false);
  });

  it('toggles usage presets without duplicating them', () => {
    const enabled = toggleUsagePreset(['product_shoot'], 'speech_delivery', true);
    expect(enabled).toEqual(['product_shoot', 'speech_delivery']);
    expect(toggleUsagePreset(enabled, 'product_shoot', false)).toEqual(['speech_delivery']);
    expect(toggleUsagePreset(enabled, 'speech_delivery', true)).toEqual(['product_shoot', 'speech_delivery']);
  });
});

function completeForm(overrides: Partial<AvatarVaultDraftFormState> = {}): AvatarVaultDraftFormState {
  return {
    ...DEFAULT_AVATAR_DRAFT_FORM,
    displayName: 'Founder Presenter',
    portraitAssetId: 'asset_face',
    portraitImageUrl: 'https://cdn.example.test/avatar-face.png',
    portraitDescription: 'Recognizable face reference with natural expression.',
    fullBodyAssetId: 'asset_full_body',
    fullBodyImageUrl: 'https://cdn.example.test/avatar-full-body.png',
    sideProfileImageUrl: 'https://cdn.example.test/avatar-side.png',
    expressionReferenceUrls: 'https://cdn.example.test/avatar-smile.png',
    bodyDescription: 'Average height founder-presenter build.',
    hair: 'Short black hair',
    notableTraits: 'Warm smile\nExpressive hands',
    wardrobePreset: 'Clean studio blazer, dark jeans, neutral sneakers.',
    defaultLook: 'Smart casual presenter',
    productShootLook: 'Hands visible near product table',
    speechLook: 'Formal blazer, neutral background',
    usagePresets: ['product_shoot', 'speech_delivery'],
    gestureStyle: 'Calm presenter gestures',
    poseLibrary: 'standing presenter\nproduct hold\nseated speech',
    productInteraction: 'Can hold and point to small products without hiding labels.',
    cameraPresence: 'Direct-to-camera with relaxed posture.',
    movementConstraints: 'Avoid exaggerated runway poses.',
    voiceSampleAssetId: 'asset_voice',
    speakingStyle: 'warm and direct',
    defaultRole: 'founder-presenter',
    defaultTone: 'confident',
    consentConfirmed: true,
    commercialUseAllowed: true,
    likenessOwner: 'self',
    ...overrides,
  };
}