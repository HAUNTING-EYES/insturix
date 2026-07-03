export type AvatarProfileStatus = 'draft' | 'accepted' | 'rejected' | 'disabled' | 'superseded';

export type AvatarSourceType =
  | 'virtual_person_profile'
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
  | 'uploaded_body_reference'
  | 'uploaded_style_reference'
  | 'uploaded_motion_reference'
  | 'uploaded_voice_sample'
  | 'generated_asset'
  | 'provider_receipt'
  | 'fallback_default';

export type AvatarLikenessOwner = 'self' | 'client' | 'licensed' | 'unknown';

export type AvatarReferenceRole =
  | 'face_front'
  | 'face_side'
  | 'full_body_front'
  | 'full_body_side'
  | 'expression'
  | 'pose'
  | 'wardrobe'
  | 'product_context';

export type AvatarUsagePreset =
  | 'product_shoot'
  | 'speech_delivery'
  | 'explainer_host'
  | 'ad_actor'
  | 'social_presenter';

export interface AvatarReferenceAsset {
  role: AvatarReferenceRole;
  assetId?: string;
  imageUrl?: string;
  label?: string;
  note?: string;
}

export interface AvatarWardrobePreset {
  id: string;
  label: string;
  description: string;
  referenceAssetIds?: string[];
}

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
  identityPack?: {
    referenceAssets: AvatarReferenceAsset[];
    bodyProfile?: {
      description?: string;
      build?: string;
      heightRange?: string;
      hair?: string;
      skinTone?: string;
      notableTraits?: string[];
      doNotChange?: string[];
    };
  };
  stylePack?: {
    wardrobePresets: AvatarWardrobePreset[];
    defaultLook?: string;
    productShootLook?: string;
    speechLook?: string;
    grooming?: string;
  };
  performancePack?: {
    usagePresets: AvatarUsagePreset[];
    gestureStyle?: string;
    poseLibrary?: string[];
    productInteraction?: string;
    cameraPresence?: string;
    movementConstraints?: string[];
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
