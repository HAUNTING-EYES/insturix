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
  it('creates an upload-backed no-brand virtual-person draft from minimum fields', () => {
    const request = buildAvatarProfileDraftRequest(minimumForm({ bindBrand: false, brandId: 'brand_ignored' }), {
      now: NOW,
      avatarId: 'avatar_contract',
    });

    expect(request.bindBrand).toBe(false);
    expect(request.brandId).toBeNull();
    expect(request.profile.avatarId).toBe('avatar_contract');
    expect(request.profile.sourceType).toBe('virtual_person_profile');
    expect(request.profile.portrait.assetId).toBe('avatar_face_asset');
    expect(request.profile.portrait.imageUrl).toBe('https://cdn.example.test/avatar-face.png');
    expect(request.profile.identityPack.referenceAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'face_front', assetId: 'avatar_face_asset', imageUrl: 'https://cdn.example.test/avatar-face.png' }),
        expect.objectContaining({ role: 'full_body_front', assetId: 'avatar_body_asset', imageUrl: 'https://cdn.example.test/avatar-full-body.png' }),
      ]),
    );
    expect(request.profile.stylePack.wardrobePresets[0]).toEqual(
      expect.objectContaining({ description: 'Neutral presenter outfit; clean, production-safe, no visible logos.' }),
    );
    expect(request.profile.performancePack.usagePresets).toEqual(['product_shoot', 'speech_delivery']);
    expect(request.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'identityPack.referenceAssets.full_body_front',
          sourceType: 'uploaded_body_reference',
          sourceAssetId: 'avatar_body_asset',
        }),
      ]),
    );
  });

  it('includes consent evidence only after consent is confirmed', () => {
    const withoutConsent = buildAvatarProfileDraftRequest(minimumForm({ consentConfirmed: false }), { now: NOW });
    const withConsent = buildAvatarProfileDraftRequest(minimumForm({ consentConfirmed: true }), { now: NOW });

    expect(withoutConsent.profile.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ signalPath: 'identityPack.referenceAssets.full_body_front' })]),
    );
    expect(withoutConsent.profile.evidence).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ signalPath: 'rights.consentConfirmed' })]),
    );
    expect(withConsent.profile.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ signalPath: 'rights.consentConfirmed', sourceType: 'manual_user_entry' })]),
    );
  });

  it('sends a brand id only when the brand toggle is on', () => {
    const request = buildAvatarProfileDraftRequest(minimumForm({ bindBrand: true, brandId: 'brand_avatar' }), {
      now: NOW,
    });

    expect(request.bindBrand).toBe(true);
    expect(request.brandId).toBe('brand_avatar');
  });

  it('keeps create disabled only until minimum draft fields are present', () => {
    expect(hasRequiredAvatarDraftFields(minimumForm())).toBe(true);
    expect(hasRequiredAvatarDraftFields(minimumForm({ displayName: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(minimumForm({ portraitImageUrl: '', portraitAssetId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(minimumForm({ fullBodyImageUrl: '', fullBodyAssetId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(minimumForm({ portraitImageUrl: '', portraitAssetId: 'asset_face' }))).toBe(true);
    expect(hasRequiredAvatarDraftFields(minimumForm({ fullBodyImageUrl: '', fullBodyAssetId: 'asset_full_body' }))).toBe(true);
    expect(hasRequiredAvatarDraftFields(minimumForm({ voiceSampleAssetId: '' }))).toBe(true);
    expect(hasRequiredAvatarDraftFields(minimumForm({ consentConfirmed: false }))).toBe(true);
    expect(hasRequiredAvatarDraftFields(minimumForm({ bindBrand: true, brandId: '' }))).toBe(false);
  });

  it('toggles usage presets without duplicating them', () => {
    const enabled = toggleUsagePreset(['product_shoot'], 'speech_delivery', true);
    expect(enabled).toEqual(['product_shoot', 'speech_delivery']);
    expect(toggleUsagePreset(enabled, 'product_shoot', false)).toEqual(['speech_delivery']);
    expect(toggleUsagePreset(enabled, 'speech_delivery', true)).toEqual(['product_shoot', 'speech_delivery']);
  });
});

function minimumForm(overrides: Partial<AvatarVaultDraftFormState> = {}): AvatarVaultDraftFormState {
  return {
    ...DEFAULT_AVATAR_DRAFT_FORM,
    displayName: 'Founder Presenter',
    portraitAssetId: 'avatar_face_asset',
    portraitImageUrl: 'https://cdn.example.test/avatar-face.png',
    fullBodyAssetId: 'avatar_body_asset',
    fullBodyImageUrl: 'https://cdn.example.test/avatar-full-body.png',
    ...overrides,
  };
}