import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_DRAFT_FORM,
  buildAvatarProfileDraftRequest,
  hasRequiredAvatarDraftFields,
  type AvatarVaultDraftFormState,
} from '../../components/dashboard/AvatarVault/avatar-vault-form';

const NOW = '2026-07-01T02:00:00.000Z';

describe('Avatar Vault UI contract', () => {
  it('creates an explicit no-brand request when the brand toggle is off', () => {
    const request = buildAvatarProfileDraftRequest(completeForm({ bindBrand: false, brandId: 'brand_ignored' }), {
      now: NOW,
      avatarId: 'avatar_contract',
    });

    expect(request.bindBrand).toBe(false);
    expect(request.brandId).toBeNull();
    expect(request.profile.avatarId).toBe('avatar_contract');
    expect(request.profile.displayName).toBe('Founder Presenter');
    expect(request.profile.evidence).toEqual([
      expect.objectContaining({
        signalPath: 'rights.consentConfirmed',
        sourceType: 'manual_user_entry',
      }),
    ]);
  });

  it('sends a brand id only when the brand toggle is on', () => {
    const request = buildAvatarProfileDraftRequest(completeForm({ bindBrand: true, brandId: 'brand_avatar' }), {
      now: NOW,
    });

    expect(request.bindBrand).toBe(true);
    expect(request.brandId).toBe('brand_avatar');
  });

  it('keeps create disabled until the voice, portrait, rights, and brand requirements are present', () => {
    expect(hasRequiredAvatarDraftFields(completeForm())).toBe(true);
    expect(hasRequiredAvatarDraftFields(completeForm({ bindBrand: true, brandId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ voiceSampleAssetId: '' }))).toBe(false);
    expect(hasRequiredAvatarDraftFields(completeForm({ consentConfirmed: false }))).toBe(false);
  });
});

function completeForm(overrides: Partial<AvatarVaultDraftFormState> = {}): AvatarVaultDraftFormState {
  return {
    ...DEFAULT_AVATAR_DRAFT_FORM,
    displayName: 'Founder Presenter',
    portraitAssetId: 'asset_portrait',
    portraitImageUrl: 'https://cdn.example.test/avatar.png',
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
