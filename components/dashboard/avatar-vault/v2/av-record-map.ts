import { DEFAULT_AVATAR_DRAFT_FORM, type AvatarVaultDraftFormState } from '@/components/dashboard/AvatarVault/avatar-vault-form';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';

/* ═══ Avatar Vault v2 · record → form ═════════════════════════════════
   Hydrates the forge from an existing record so "Edit" loads the real
   avatar (the reverse of buildAvatarProfileDraftRequest; that mapping is
   form→request only). Closes gap #15. */

export function recordToForm(record: AvatarProfileRecord): AvatarVaultDraftFormState {
  const p = record.profile;
  const refs = p.identityPack?.referenceAssets ?? [];
  const fullBody = refs.find((r) => r.role === 'full_body_front');
  const side = refs.find((r) => r.role === 'face_side');
  const expressions = refs.filter((r) => r.role === 'expression').map((r) => r.imageUrl).filter((u): u is string => Boolean(u));
  const wardrobe = p.stylePack?.wardrobePresets?.[0]?.description;
  const body = p.identityPack?.bodyProfile;
  const perf = p.performancePack;
  const voiceEvidenceUrl = p.evidence.find((item) => item.sourceType === 'uploaded_voice_sample' && item.sourceUrl)?.sourceUrl ?? '';

  return {
    ...DEFAULT_AVATAR_DRAFT_FORM,
    displayName: p.displayName ?? '',
    portraitAssetId: p.portrait?.assetId ?? '',
    portraitImageUrl: p.portrait?.imageUrl ?? '',
    portraitDescription: p.portrait?.identityDescription ?? '',
    fullBodyAssetId: fullBody?.assetId ?? '',
    fullBodyImageUrl: fullBody?.imageUrl ?? '',
    sideProfileImageUrl: side?.imageUrl ?? '',
    expressionReferenceUrls: expressions.join('\n'),
    bodyDescription: body?.description ?? '',
    hair: body?.hair ?? '',
    notableTraits: (body?.notableTraits ?? []).join('\n'),
    wardrobePreset: wardrobe ?? DEFAULT_AVATAR_DRAFT_FORM.wardrobePreset,
    defaultLook: p.stylePack?.defaultLook ?? '',
    productShootLook: p.stylePack?.productShootLook ?? '',
    speechLook: p.stylePack?.speechLook ?? '',
    usagePresets: perf?.usagePresets?.length ? perf.usagePresets : DEFAULT_AVATAR_DRAFT_FORM.usagePresets,
    gestureStyle: perf?.gestureStyle ?? '',
    poseLibrary: (perf?.poseLibrary ?? []).join('\n'),
    productInteraction: perf?.productInteraction ?? '',
    cameraPresence: perf?.cameraPresence ?? '',
    movementConstraints: (perf?.movementConstraints ?? []).join('\n'),
    voiceMode: p.voice?.sourceType ?? 'uploaded_voice_sample',
    voiceSampleAssetId: p.voice?.sampleAssetId ?? '',
    voiceSampleUrl: voiceEvidenceUrl,
    ttsVoiceId: p.voice?.ttsVoiceId ?? '',
    voiceProfileId: p.voice?.voiceProfileId ?? '',
    language: p.voice?.language ?? 'en',
    speakingStyle: p.voice?.speakingStyle ?? '',
    defaultRole: p.persona?.defaultRole ?? '',
    defaultTone: p.persona?.defaultTone ?? '',
    rightsNotes: p.rights?.notes ?? '',
    consentConfirmed: p.rights?.consentConfirmed ?? false,
    commercialUseAllowed: p.rights?.commercialUseAllowed ?? true,
    likenessOwner: p.rights?.likenessOwner ?? 'self',
    bindBrand: Boolean(p.brandId),
    brandId: p.brandId ?? '',
  };
}
