import type {
  AvatarEvidence,
  AvatarLikenessOwner,
  AvatarProfile,
  AvatarSourceType,
  AvatarUsagePreset,
  AvatarVoiceSourceType,
} from '@/lib/avatar/avatar-profile';

export interface AvatarVaultDraftFormState {
  displayName: string;
  portraitAssetId: string;
  portraitImageUrl: string;
  portraitDescription: string;
  fullBodyAssetId: string;
  fullBodyImageUrl: string;
  sideProfileImageUrl: string;
  expressionReferenceUrls: string;
  bodyDescription: string;
  hair: string;
  notableTraits: string;
  wardrobePreset: string;
  defaultLook: string;
  productShootLook: string;
  speechLook: string;
  usagePresets: AvatarUsagePreset[];
  gestureStyle: string;
  poseLibrary: string;
  productInteraction: string;
  cameraPresence: string;
  movementConstraints: string;
  voiceMode: AvatarVoiceSourceType;
  voiceSampleAssetId: string;
  ttsVoiceId: string;
  voiceProfileId: string;
  language: string;
  speakingStyle: string;
  defaultRole: string;
  defaultTone: string;
  rightsNotes: string;
  consentConfirmed: boolean;
  commercialUseAllowed: boolean;
  likenessOwner: AvatarLikenessOwner;
  bindBrand: boolean;
  brandId: string;
}

export type AvatarProfileDraftRequestProfile = {
  avatarId?: string;
  displayName: string;
  sourceType: AvatarSourceType;
  portrait: AvatarProfile['portrait'];
  identityPack: NonNullable<AvatarProfile['identityPack']>;
  stylePack: NonNullable<AvatarProfile['stylePack']>;
  performancePack: NonNullable<AvatarProfile['performancePack']>;
  voice: AvatarProfile['voice'];
  persona: AvatarProfile['persona'];
  rights: AvatarProfile['rights'];
  evidence: AvatarEvidence[];
};

export interface AvatarProfileDraftRequest {
  bindBrand: boolean;
  brandId?: string | null;
  recordId?: string;
  profile: AvatarProfileDraftRequestProfile;
}

export interface BuildAvatarProfileDraftRequestOptions {
  avatarId?: string;
  recordId?: string;
  now?: string;
}

const DEFAULT_USAGE_PRESETS: AvatarUsagePreset[] = ['product_shoot', 'speech_delivery'];
const DEFAULT_WARDROBE_PRESET = 'Neutral presenter outfit; clean, production-safe, no visible logos.';

export const DEFAULT_AVATAR_DRAFT_FORM: AvatarVaultDraftFormState = {
  displayName: '',
  portraitAssetId: '',
  portraitImageUrl: '',
  portraitDescription: '',
  fullBodyAssetId: '',
  fullBodyImageUrl: '',
  sideProfileImageUrl: '',
  expressionReferenceUrls: '',
  bodyDescription: '',
  hair: '',
  notableTraits: '',
  wardrobePreset: DEFAULT_WARDROBE_PRESET,
  defaultLook: '',
  productShootLook: '',
  speechLook: '',
  usagePresets: DEFAULT_USAGE_PRESETS,
  gestureStyle: '',
  poseLibrary: '',
  productInteraction: '',
  cameraPresence: '',
  movementConstraints: '',
  voiceMode: 'uploaded_voice_sample',
  voiceSampleAssetId: '',
  ttsVoiceId: '',
  voiceProfileId: '',
  language: 'en',
  speakingStyle: '',
  defaultRole: '',
  defaultTone: '',
  rightsNotes: '',
  consentConfirmed: false,
  commercialUseAllowed: true,
  likenessOwner: 'self',
  bindBrand: false,
  brandId: '',
};

export function buildAvatarProfileDraftRequest(
  form: AvatarVaultDraftFormState,
  options: BuildAvatarProfileDraftRequestOptions = {},
): AvatarProfileDraftRequest {
  const now = options.now ?? new Date().toISOString();
  const brandId = form.bindBrand ? form.brandId.trim() : null;

  return {
    bindBrand: form.bindBrand,
    brandId,
    ...(options.recordId ? { recordId: options.recordId } : {}),
    profile: {
      avatarId: options.avatarId ?? buildAvatarId(form.displayName, now),
      displayName: form.displayName.trim(),
      sourceType: 'virtual_person_profile',
      portrait: {
        assetId: form.portraitAssetId.trim(),
        imageUrl: form.portraitImageUrl.trim(),
        ...(optional(form.portraitDescription) ? { identityDescription: optional(form.portraitDescription) } : {}),
      },
      identityPack: buildIdentityPack(form),
      stylePack: buildStylePack(form),
      performancePack: buildPerformancePack(form),
      voice: buildVoice(form),
      persona: {
        ...(optional(form.defaultRole) ? { defaultRole: optional(form.defaultRole) } : {}),
        ...(optional(form.defaultTone) ? { defaultTone: optional(form.defaultTone) } : {}),
      },
      rights: {
        consentConfirmed: form.consentConfirmed,
        likenessOwner: form.likenessOwner,
        commercialUseAllowed: form.commercialUseAllowed,
        ...(optional(form.rightsNotes) ? { notes: optional(form.rightsNotes) } : {}),
      },
      evidence: buildEvidence(form, now),
    },
  };
}

export function hasRequiredAvatarDraftFields(form: AvatarVaultDraftFormState): boolean {
  return Boolean(
    form.displayName.trim() &&
      hasReference(form.portraitAssetId, form.portraitImageUrl) &&
      hasReference(form.fullBodyAssetId, form.fullBodyImageUrl) &&
      (!form.bindBrand || form.brandId.trim()),
  );
}

export function toggleUsagePreset(
  current: AvatarUsagePreset[],
  preset: AvatarUsagePreset,
  enabled: boolean,
): AvatarUsagePreset[] {
  const next = new Set(current);
  if (enabled) next.add(preset);
  else next.delete(preset);
  return [...next];
}

function buildIdentityPack(form: AvatarVaultDraftFormState): NonNullable<AvatarProfile['identityPack']> {
  return {
    referenceAssets: [
      {
        role: 'face_front',
        ...referenceFields(form.portraitAssetId, form.portraitImageUrl),
        label: 'Primary face reference',
        ...(optional(form.portraitDescription) ? { note: optional(form.portraitDescription) } : {}),
      },
      {
        role: 'full_body_front',
        ...referenceFields(form.fullBodyAssetId, form.fullBodyImageUrl),
        label: 'Primary full-body reference',
      },
      ...(optional(form.sideProfileImageUrl)
        ? [{ role: 'face_side' as const, imageUrl: optional(form.sideProfileImageUrl), label: 'Side profile reference' }]
        : []),
      ...parseLines(form.expressionReferenceUrls).map((imageUrl, index) => ({
        role: 'expression' as const,
        imageUrl,
        label: `Expression reference ${index + 1}`,
      })),
    ],
    bodyProfile: {
      ...(optional(form.bodyDescription) ? { description: optional(form.bodyDescription) } : {}),
      ...(optional(form.hair) ? { hair: optional(form.hair) } : {}),
      ...(parseLines(form.notableTraits).length > 0 ? { notableTraits: parseLines(form.notableTraits) } : {}),
    },
  };
}

function buildStylePack(form: AvatarVaultDraftFormState): NonNullable<AvatarProfile['stylePack']> {
  return {
    wardrobePresets: optional(form.wardrobePreset)
      ? [{ id: 'default_wardrobe', label: 'Default wardrobe', description: form.wardrobePreset.trim() }]
      : [],
    ...(optional(form.defaultLook) ? { defaultLook: optional(form.defaultLook) } : {}),
    ...(optional(form.productShootLook) ? { productShootLook: optional(form.productShootLook) } : {}),
    ...(optional(form.speechLook) ? { speechLook: optional(form.speechLook) } : {}),
  };
}

function buildPerformancePack(form: AvatarVaultDraftFormState): NonNullable<AvatarProfile['performancePack']> {
  return {
    usagePresets: form.usagePresets.length > 0 ? form.usagePresets : DEFAULT_USAGE_PRESETS,
    ...(optional(form.gestureStyle) ? { gestureStyle: optional(form.gestureStyle) } : {}),
    ...(parseLines(form.poseLibrary).length > 0 ? { poseLibrary: parseLines(form.poseLibrary) } : {}),
    ...(optional(form.productInteraction) ? { productInteraction: optional(form.productInteraction) } : {}),
    ...(optional(form.cameraPresence) ? { cameraPresence: optional(form.cameraPresence) } : {}),
    ...(parseLines(form.movementConstraints).length > 0 ? { movementConstraints: parseLines(form.movementConstraints) } : {}),
  };
}

function buildVoice(form: AvatarVaultDraftFormState): AvatarProfile['voice'] {
  if (form.voiceMode === 'selected_tts_voice') {
    return {
      sourceType: 'selected_tts_voice',
      ttsVoiceId: form.ttsVoiceId.trim(),
      ...(optional(form.language) ? { language: optional(form.language) } : {}),
      ...(optional(form.speakingStyle) ? { speakingStyle: optional(form.speakingStyle) } : {}),
    };
  }

  if (form.voiceMode === 'imported_voice_profile') {
    return {
      sourceType: 'imported_voice_profile',
      voiceProfileId: form.voiceProfileId.trim(),
      ...(optional(form.language) ? { language: optional(form.language) } : {}),
      ...(optional(form.speakingStyle) ? { speakingStyle: optional(form.speakingStyle) } : {}),
    };
  }

  return {
    sourceType: 'uploaded_voice_sample',
    sampleAssetId: form.voiceSampleAssetId.trim(),
    ...(optional(form.language) ? { language: optional(form.language) } : {}),
    ...(optional(form.speakingStyle) ? { speakingStyle: optional(form.speakingStyle) } : {}),
  };
}


function buildEvidence(form: AvatarVaultDraftFormState, now: string): AvatarEvidence[] {
  return [
    ...(form.consentConfirmed ? [buildConsentEvidence(now)] : []),
    {
      id: `avatar_full_body_${Date.parse(now) || 0}`,
      signalPath: 'identityPack.referenceAssets.full_body_front',
      sourceType: 'uploaded_body_reference',
      ...(optional(form.fullBodyAssetId) ? { sourceAssetId: form.fullBodyAssetId.trim() } : {}),
      ...(optional(form.fullBodyImageUrl) ? { sourceUrl: form.fullBodyImageUrl.trim() } : {}),
      confidence: 1,
      observedAt: now,
      extractor: 'avatar-vault-ui.v1',
      consentRequired: true,
    },
  ];
}

function buildConsentEvidence(now: string): AvatarEvidence {
  return {
    id: `avatar_consent_${Date.parse(now) || 0}`,
    signalPath: 'rights.consentConfirmed',
    sourceType: 'manual_user_entry',
    confidence: 1,
    observedAt: now,
    extractor: 'avatar-vault-ui.v1',
    consentRequired: true,
  };
}

function buildAvatarId(displayName: string, now: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
  return `avatar_${slug || 'draft'}_${Date.parse(now) || 'manual'}`;
}

function hasReference(assetId: string, imageUrl: string): boolean {
  return Boolean(assetId.trim() || imageUrl.trim());
}

function referenceFields(assetId: string, imageUrl: string): { assetId?: string; imageUrl?: string } {
  return {
    ...(optional(assetId) ? { assetId: assetId.trim() } : {}),
    ...(optional(imageUrl) ? { imageUrl: imageUrl.trim() } : {}),
  };
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}