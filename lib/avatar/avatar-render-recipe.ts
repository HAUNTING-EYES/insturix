import type { AvatarProfile, AvatarReferenceAsset, AvatarUsagePreset } from './avatar-profile';
import type { AvatarProfileRecord } from './avatar-lifecycle';

export type AvatarRenderUseCase = AvatarUsagePreset | 'generic_clip';

export type AvatarRenderAudioMode =
  | 'silent'
  | 'tts_voiceover'
  | 'uploaded_voiceover'
  | 'copied_reference_audio'
  | 'external_mix';

export type AvatarRenderIssueSeverity = 'error' | 'warning';

export interface AvatarRenderIssue {
  severity: AvatarRenderIssueSeverity;
  code:
    | 'profile_not_accepted'
    | 'missing_prompt'
    | 'missing_identity_reference'
    | 'missing_full_body_reference'
    | 'missing_speech_audio'
    | 'audio_copy_not_authorized'
    | 'sound_copy_not_authorized'
    | 'commercial_use_disallowed'
    | 'missing_product_reference'
    | 'missing_usage_preset';
  path: string;
  message: string;
}

export interface AvatarRenderReadiness {
  ready: boolean;
  errors: AvatarRenderIssue[];
  warnings: AvatarRenderIssue[];
}

export interface AvatarRenderAudioInput {
  mode?: AvatarRenderAudioMode;
  sourceAssetId?: string;
  sourceUrl?: string;
  voiceoverText?: string;
  description?: string;
  copyAllowed?: boolean;
  consentConfirmed?: boolean;
}

export interface AvatarRenderSoundCueInput {
  id?: string;
  label?: string;
  description: string;
  sourceAssetId?: string;
  sourceUrl?: string;
  copyAllowed?: boolean;
}

export interface AvatarRenderTarget {
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
}

export interface BuildAvatarRenderRecipeInput {
  profileRecord: AvatarProfileRecord;
  useCase: AvatarRenderUseCase;
  prompt: string;
  script?: string;
  negativePrompt?: string;
  audio?: AvatarRenderAudioInput;
  soundCues?: AvatarRenderSoundCueInput[];
  productImageUrls?: string[];
  target?: AvatarRenderTarget;
}

export interface AvatarRenderReferenceImage {
  role: AvatarReferenceAsset['role'] | 'portrait' | 'product';
  imageUrl: string;
  assetId?: string;
  label?: string;
  note?: string;
}

export interface AvatarRenderRecipe {
  version: 1;
  avatarRecordId: string;
  avatarId: string;
  userId: string;
  orgId?: string | null;
  brandId?: string | null;
  useCase: AvatarRenderUseCase;
  readiness: AvatarRenderReadiness;
  visual: {
    displayName: string;
    identityDescription?: string;
    referenceImages: AvatarRenderReferenceImage[];
    bodyDescription?: string;
    wardrobe?: string;
  };
  creative: {
    prompt: string;
    script?: string;
    negativePrompt?: string;
    personaRole?: string;
    personaTone?: string;
    gestureStyle?: string;
    cameraPresence?: string;
    productInteraction?: string;
  };
  audio: {
    mode: AvatarRenderAudioMode;
    voiceSource: AvatarProfile['voice'];
    voiceoverText?: string;
    sourceAssetId?: string;
    sourceUrl?: string;
    description?: string;
    copiedReference: boolean;
    soundCues: AvatarRenderResolvedSoundCue[];
  };
  target: Required<AvatarRenderTarget>;
  editronContract: {
    requiresVideoGeneration: boolean;
    requiresAudioMix: boolean;
    acceptsExternalProviderVideo: boolean;
    canMaterializeAsTimelineOverlays: boolean;
  };
}

export interface AvatarRenderResolvedSoundCue {
  id: string;
  label: string;
  description: string;
  sourceAssetId?: string;
  sourceUrl?: string;
  copiedReference: boolean;
}

const DEFAULT_TARGET: Required<AvatarRenderTarget> = {
  aspectRatio: '9:16',
  durationSeconds: 8,
  resolution: '720p',
};

const SPEECH_USE_CASES = new Set<AvatarRenderUseCase>([
  'speech_delivery',
  'explainer_host',
  'social_presenter',
]);

export function buildAvatarRenderRecipe(input: BuildAvatarRenderRecipeInput): AvatarRenderRecipe {
  const profile = input.profileRecord.profile;
  const audioMode = resolveAudioMode(input.audio, profile);
  const referenceImages = buildReferenceImages(profile, input.productImageUrls);
  const soundCues = buildSoundCues(input.soundCues);
  const target = { ...DEFAULT_TARGET, ...(input.target ?? {}) };
  const readiness = evaluateAvatarRenderReadiness({
    ...input,
    audio: input.audio ? { ...input.audio, mode: audioMode } : { mode: audioMode },
  });

  return {
    version: 1,
    avatarRecordId: input.profileRecord.id,
    avatarId: profile.avatarId,
    userId: profile.userId,
    orgId: profile.orgId,
    brandId: profile.brandId,
    useCase: input.useCase,
    readiness,
    visual: {
      displayName: profile.displayName,
      identityDescription: profile.portrait.identityDescription,
      referenceImages,
      bodyDescription: profile.identityPack?.bodyProfile?.description,
      wardrobe: resolveWardrobe(profile, input.useCase),
    },
    creative: {
      prompt: input.prompt.trim(),
      script: optionalTrim(input.script),
      negativePrompt: optionalTrim(input.negativePrompt),
      personaRole: profile.persona.defaultRole,
      personaTone: profile.persona.defaultTone,
      gestureStyle: profile.performancePack?.gestureStyle,
      cameraPresence: profile.performancePack?.cameraPresence,
      productInteraction: profile.performancePack?.productInteraction,
    },
    audio: {
      mode: audioMode,
      voiceSource: profile.voice,
      voiceoverText: optionalTrim(input.audio?.voiceoverText) ?? optionalTrim(input.script),
      sourceAssetId: optionalTrim(input.audio?.sourceAssetId),
      sourceUrl: optionalTrim(input.audio?.sourceUrl),
      description: optionalTrim(input.audio?.description),
      copiedReference: audioMode === 'copied_reference_audio',
      soundCues,
    },
    target,
    editronContract: {
      requiresVideoGeneration: true,
      requiresAudioMix: audioMode !== 'silent' || soundCues.length > 0,
      acceptsExternalProviderVideo: true,
      canMaterializeAsTimelineOverlays: true,
    },
  };
}

export function evaluateAvatarRenderReadiness(input: BuildAvatarRenderRecipeInput): AvatarRenderReadiness {
  const issues: AvatarRenderIssue[] = [];
  const profile = input.profileRecord.profile;
  const prompt = optionalTrim(input.prompt);
  const audioMode = resolveAudioMode(input.audio, profile);

  if (input.profileRecord.status !== 'accepted' || profile.status !== 'accepted') {
    issues.push(error('profile_not_accepted', 'profileRecord.status', 'Avatar profile must be accepted before it can be used for generation.'));
  }
  if (!prompt) {
    issues.push(error('missing_prompt', 'prompt', 'A visual prompt or scene direction is required.'));
  }
  if (!hasIdentityReference(profile)) {
    issues.push(error('missing_identity_reference', 'profile.portrait.imageUrl', 'At least one avatar identity image URL is required.'));
  }
  if (profile.sourceType === 'virtual_person_profile' && !hasFullBodyReference(profile)) {
    issues.push(error('missing_full_body_reference', 'profile.identityPack.referenceAssets', 'A full-body avatar reference is required for virtual-person generation.'));
  }
  if (!profile.rights.commercialUseAllowed) {
    issues.push(error('commercial_use_disallowed', 'profile.rights.commercialUseAllowed', 'Commercial use must be allowed before avatar video generation.'));
  }
  if (requiresSpeech(input.useCase, input.audio, input.script) && !hasSpeechAudio(profile, input.audio)) {
    issues.push(error('missing_speech_audio', 'audio', 'Speech avatars need TTS voice, uploaded voiceover audio, imported voice profile, or authorized copied reference audio.'));
  }
  if (audioMode === 'copied_reference_audio' && !isCopyAuthorized(input.audio)) {
    issues.push(error('audio_copy_not_authorized', 'audio.copyAllowed', 'Copied reference audio requires explicit copy permission and consent confirmation.'));
  }

  for (const [index, cue] of (input.soundCues ?? []).entries()) {
    if (hasSoundReference(cue) && !isSoundCopyAuthorized(cue)) {
      issues.push(error('sound_copy_not_authorized', `soundCues.${index}.copyAllowed`, 'Copied sound references require explicit copy permission.'));
    }
  }

  if (input.useCase === 'product_shoot' && !hasProductReference(profile, input.productImageUrls)) {
    issues.push(warning('missing_product_reference', 'productImageUrls', 'Product-shoot avatars should include product-context or product image references.'));
  }

  if (!profile.performancePack?.usagePresets?.includes(input.useCase as AvatarUsagePreset) && input.useCase !== 'generic_clip') {
    issues.push(warning('missing_usage_preset', 'profile.performancePack.usagePresets', `Avatar was not explicitly approved for ${input.useCase}.`));
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { ready: errors.length === 0, errors, warnings };
}

function buildReferenceImages(profile: AvatarProfile, productImageUrls: string[] | undefined): AvatarRenderReferenceImage[] {
  const refs: AvatarRenderReferenceImage[] = [];
  addReference(refs, {
    role: 'portrait',
    imageUrl: profile.portrait.imageUrl,
    assetId: profile.portrait.assetId,
    label: 'Primary portrait',
    note: profile.portrait.identityDescription,
  });

  for (const asset of profile.identityPack?.referenceAssets ?? []) {
    addReference(refs, {
      role: asset.role,
      imageUrl: asset.imageUrl ?? '',
      assetId: asset.assetId,
      label: asset.label,
      note: asset.note,
    });
  }

  for (const [index, imageUrl] of (productImageUrls ?? []).entries()) {
    addReference(refs, {
      role: 'product',
      imageUrl,
      label: `Product reference ${index + 1}`,
    });
  }

  return refs;
}

function addReference(refs: AvatarRenderReferenceImage[], ref: AvatarRenderReferenceImage): void {
  if (!isNonEmptyString(ref.imageUrl)) return;
  const alreadyPresent = refs.some((existing) => existing.imageUrl === ref.imageUrl && existing.role === ref.role);
  if (!alreadyPresent) refs.push(ref);
}

function buildSoundCues(soundCues: AvatarRenderSoundCueInput[] | undefined): AvatarRenderResolvedSoundCue[] {
  return (soundCues ?? []).map((cue, index) => ({
    id: optionalTrim(cue.id) ?? `sound_cue_${index + 1}`,
    label: optionalTrim(cue.label) ?? `Sound cue ${index + 1}`,
    description: cue.description.trim(),
    sourceAssetId: optionalTrim(cue.sourceAssetId),
    sourceUrl: optionalTrim(cue.sourceUrl),
    copiedReference: hasSoundReference(cue),
  }));
}

function resolveAudioMode(audio: AvatarRenderAudioInput | undefined, profile: AvatarProfile): AvatarRenderAudioMode {
  if (audio?.mode) return audio.mode;
  if (isNonEmptyString(audio?.sourceAssetId) || isNonEmptyString(audio?.sourceUrl)) return 'uploaded_voiceover';
  if (isNonEmptyString(profile.voice.ttsVoiceId)) return 'tts_voiceover';
  if (isNonEmptyString(profile.voice.sampleAssetId) || isNonEmptyString(profile.voice.voiceProfileId)) return 'uploaded_voiceover';
  return 'silent';
}

function resolveWardrobe(profile: AvatarProfile, useCase: AvatarRenderUseCase): string | undefined {
  if (useCase === 'product_shoot') return optionalTrim(profile.stylePack?.productShootLook) ?? optionalTrim(profile.stylePack?.defaultLook);
  if (useCase === 'speech_delivery' || useCase === 'explainer_host') return optionalTrim(profile.stylePack?.speechLook) ?? optionalTrim(profile.stylePack?.defaultLook);
  return optionalTrim(profile.stylePack?.defaultLook);
}

function requiresSpeech(
  useCase: AvatarRenderUseCase,
  audio: AvatarRenderAudioInput | undefined,
  script: string | undefined,
): boolean {
  if (SPEECH_USE_CASES.has(useCase)) return true;
  return isNonEmptyString(script) || isNonEmptyString(audio?.voiceoverText);
}

function hasSpeechAudio(profile: AvatarProfile, audio: AvatarRenderAudioInput | undefined): boolean {
  if (isNonEmptyString(audio?.voiceoverText) && profile.voice.sourceType === 'selected_tts_voice' && isNonEmptyString(profile.voice.ttsVoiceId)) return true;
  if (isNonEmptyString(audio?.sourceAssetId) || isNonEmptyString(audio?.sourceUrl)) return true;
  if (isNonEmptyString(profile.voice.ttsVoiceId)) return true;
  if (isNonEmptyString(profile.voice.sampleAssetId)) return true;
  return isNonEmptyString(profile.voice.voiceProfileId);
}

function hasIdentityReference(profile: AvatarProfile): boolean {
  return isNonEmptyString(profile.portrait.imageUrl)
    || Boolean(profile.identityPack?.referenceAssets.some((asset) => isNonEmptyString(asset.imageUrl)));
}

function hasFullBodyReference(profile: AvatarProfile): boolean {
  return Boolean(profile.identityPack?.referenceAssets.some((asset) => {
    return (asset.role === 'full_body_front' || asset.role === 'full_body_side') && isNonEmptyString(asset.imageUrl);
  }));
}

function hasProductReference(profile: AvatarProfile, productImageUrls: string[] | undefined): boolean {
  return Boolean(productImageUrls?.some(isNonEmptyString))
    || Boolean(profile.identityPack?.referenceAssets.some((asset) => asset.role === 'product_context' && isNonEmptyString(asset.imageUrl)));
}

function hasSoundReference(cue: AvatarRenderSoundCueInput): boolean {
  return isNonEmptyString(cue.sourceAssetId) || isNonEmptyString(cue.sourceUrl);
}

function isCopyAuthorized(audio: AvatarRenderAudioInput | undefined): boolean {
  return audio?.copyAllowed === true && audio.consentConfirmed === true && (
    isNonEmptyString(audio.sourceAssetId) || isNonEmptyString(audio.sourceUrl)
  );
}

function isSoundCopyAuthorized(cue: AvatarRenderSoundCueInput): boolean {
  return cue.copyAllowed === true && hasSoundReference(cue);
}

function optionalTrim(value: string | undefined): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  return value.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function error(code: AvatarRenderIssue['code'], path: string, message: string): AvatarRenderIssue {
  return { severity: 'error', code, path, message };
}

function warning(code: AvatarRenderIssue['code'], path: string, message: string): AvatarRenderIssue {
  return { severity: 'warning', code, path, message };
}
