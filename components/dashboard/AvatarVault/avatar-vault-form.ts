import type {
  AvatarEvidence,
  AvatarLikenessOwner,
  AvatarProfile,
  AvatarSourceType,
  AvatarVoiceSourceType,
} from '@/lib/avatar/avatar-profile';

export interface AvatarVaultDraftFormState {
  displayName: string;
  portraitAssetId: string;
  portraitImageUrl: string;
  portraitDescription: string;
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

export const DEFAULT_AVATAR_DRAFT_FORM: AvatarVaultDraftFormState = {
  displayName: '',
  portraitAssetId: '',
  portraitImageUrl: '',
  portraitDescription: '',
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
      sourceType: 'uploaded_portrait',
      portrait: {
        assetId: form.portraitAssetId.trim(),
        imageUrl: form.portraitImageUrl.trim(),
        ...(optional(form.portraitDescription) ? { identityDescription: optional(form.portraitDescription) } : {}),
      },
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
      evidence: form.consentConfirmed ? [buildConsentEvidence(now)] : [],
    },
  };
}

export function hasRequiredAvatarDraftFields(form: AvatarVaultDraftFormState): boolean {
  return Boolean(
    form.displayName.trim() &&
      form.portraitAssetId.trim() &&
      form.portraitImageUrl.trim() &&
      hasRequiredVoiceSource(form) &&
      form.consentConfirmed &&
      form.commercialUseAllowed &&
      form.likenessOwner !== 'unknown' &&
      (!form.bindBrand || form.brandId.trim()),
  );
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

function hasRequiredVoiceSource(form: AvatarVaultDraftFormState): boolean {
  if (form.voiceMode === 'selected_tts_voice') return Boolean(form.ttsVoiceId.trim());
  if (form.voiceMode === 'imported_voice_profile') return Boolean(form.voiceProfileId.trim());
  return Boolean(form.voiceSampleAssetId.trim());
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

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
