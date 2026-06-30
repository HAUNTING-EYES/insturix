export type AvatarProfileStatus = 'draft' | 'accepted' | 'rejected' | 'disabled' | 'superseded';

export type AvatarSourceType =
  | 'uploaded_portrait'
  | 'generated_portrait'
  | 'stock_avatar'
  | 'imported_avatar';

export type AvatarVoiceSourceType =
  | 'uploaded_voice_sample'
  | 'selected_tts_voice'
  | 'imported_voice_profile';

export type AvatarEvidenceSourceType =
  | 'manual_user_entry'
  | 'uploaded_portrait'
  | 'uploaded_voice_sample'
  | 'generated_asset'
  | 'provider_receipt'
  | 'fallback_default';

export type AvatarLikenessOwner = 'self' | 'client' | 'licensed' | 'unknown';

export interface AvatarEvidence {
  id: string;
  signalPath: string;
  sourceType: AvatarEvidenceSourceType;
  sourceAssetId?: string;
  sourceUrl?: string;
  excerpt?: string;
  confidence: number;
  observedAt: string;
  extractor: string;
  consentRequired: boolean;
}

export interface AvatarProfile {
  version: 1;
  avatarId: string;
  userId: string;
  orgId?: string | null;
  brandId?: string | null;
  displayName: string;
  status: AvatarProfileStatus;
  sourceType: AvatarSourceType;
  portrait: {
    assetId: string;
    imageUrl: string;
    thumbnailUrl?: string;
    gcsPath?: string;
    r2Key?: string;
    faceDetected?: boolean;
    identityDescription?: string;
  };
  voice: {
    sourceType: AvatarVoiceSourceType;
    voiceProfileId?: string;
    sampleAssetId?: string;
    ttsVoiceId?: string;
    language?: string;
    speakingStyle?: string;
  };
  persona: {
    defaultRole?: string;
    defaultTone?: string;
    speakingConstraints?: string[];
    killList?: string[];
  };
  rights: {
    consentConfirmed: boolean;
    likenessOwner: AvatarLikenessOwner;
    commercialUseAllowed: boolean;
    consentArtifactAssetId?: string;
    notes?: string;
  };
  evidence: AvatarEvidence[];
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export function cloneAvatarProfile(profile: AvatarProfile): AvatarProfile {
  return JSON.parse(JSON.stringify(profile)) as AvatarProfile;
}
