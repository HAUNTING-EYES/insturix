import type { AvatarRenderAudioMode, AvatarRenderRecipe, AvatarRenderUseCase } from './avatar-render-recipe';

export type AvatarProviderId = 'a2e' | 'd_id' | 'omnihuman_fal' | 'minimax_s2v_fal';

export type AvatarProviderIntegrationStatus = 'planned_adapter' | 'stub_only';

export type AvatarProviderBodySupport =
  | 'talking_head'
  | 'talking_head_with_background'
  | 'partial_full_body'
  | 'cinematic_stub';

export type AvatarProviderJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export type AvatarProviderSelectionMode = 'single' | 'benchmark';

export interface AvatarProviderCapabilities {
  scriptInput: boolean;
  ssmlInput: boolean;
  audioUpload: boolean;
  voiceClone: boolean;
  backgroundComposite: boolean;
  nativeConsentTracking: boolean;
  bodySupport: AvatarProviderBodySupport;
  maxDurationSeconds?: number;
  maxAudioBytes?: number;
  supportedUseCases: AvatarRenderUseCase[];
  supportedAudioModes: AvatarRenderAudioMode[];
}

export interface AvatarProviderDescriptor {
  id: AvatarProviderId;
  displayName: string;
  integrationStatus: AvatarProviderIntegrationStatus;
  docsVerifiedAt: string;
  capabilities: AvatarProviderCapabilities;
  notes: string[];
}

export interface AvatarProviderArtifactRef {
  providerId: AvatarProviderId;
  providerArtifactId: string;
  kind: 'avatar' | 'voice' | 'background' | 'render';
  sourceAssetId?: string;
  sourceUrl?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AvatarProviderIdentityInput {
  recipe: AvatarRenderRecipe;
  consentArtifactId?: string;
  trainingVideoUrl?: string;
  referenceImageUrl?: string;
}

export interface AvatarProviderVoiceInput {
  sampleUrl: string;
  consentArtifactId?: string;
  language?: string;
  gender?: string;
}

export interface AvatarProviderRenderInput {
  recipe: AvatarRenderRecipe;
  avatarRef?: AvatarProviderArtifactRef;
  voiceRef?: AvatarProviderArtifactRef;
  backgroundRef?: AvatarProviderArtifactRef;
  benchmarkRunId?: string;
}

export interface AvatarProviderRenderJob {
  providerId: AvatarProviderId;
  jobId: string;
  status: AvatarProviderJobStatus;
  providerRequestId?: string;
}

export interface AvatarProviderRenderResult {
  providerId: AvatarProviderId;
  jobId: string;
  url: string;
  format: 'mp4';
  durationSeconds?: number;
}

export interface AvatarProviderAdapter {
  descriptor: AvatarProviderDescriptor;
  enrollIdentity(input: AvatarProviderIdentityInput): Promise<AvatarProviderArtifactRef>;
  cloneVoice?(input: AvatarProviderVoiceInput): Promise<AvatarProviderArtifactRef>;
  render(input: AvatarProviderRenderInput): Promise<AvatarProviderRenderJob>;
  pollStatus(jobId: string): Promise<AvatarProviderJobStatus>;
  fetchResult(jobId: string): Promise<AvatarProviderRenderResult>;
}

export interface AvatarProviderReadinessIssue {
  severity: 'error' | 'warning';
  code:
    | 'recipe_not_ready'
    | 'provider_stub_only'
    | 'unsupported_use_case'
    | 'unsupported_audio_mode'
    | 'audio_upload_unsupported'
    | 'voice_clone_unsupported'
    | 'duration_exceeds_provider_limit'
    | 'provider_uses_external_consent';
  providerId: AvatarProviderId;
  path: string;
  message: string;
}

export interface AvatarProviderReadiness {
  ready: boolean;
  errors: AvatarProviderReadinessIssue[];
  warnings: AvatarProviderReadinessIssue[];
}

export interface AvatarProviderRejection {
  providerId: AvatarProviderId;
  reasons: AvatarProviderReadinessIssue[];
}

export interface AvatarProviderSelectionOptions {
  mode?: AvatarProviderSelectionMode;
  preferredProviderId?: AvatarProviderId;
  includeProviderIds?: AvatarProviderId[];
}

export interface AvatarProviderSelection {
  mode: AvatarProviderSelectionMode;
  selectedProviderIds: AvatarProviderId[];
  candidateProviderIds: AvatarProviderId[];
  rejectedProviders: AvatarProviderRejection[];
  readinessByProvider: Partial<Record<AvatarProviderId, AvatarProviderReadiness>>;
}

export const AVATAR_PROVIDER_DESCRIPTORS: Record<AvatarProviderId, AvatarProviderDescriptor> = {
  a2e: {
    id: 'a2e',
    displayName: 'A2E',
    integrationStatus: 'planned_adapter',
    docsVerifiedAt: '2026-07-03',
    capabilities: {
      scriptInput: true,
      ssmlInput: false,
      audioUpload: true,
      voiceClone: true,
      backgroundComposite: true,
      nativeConsentTracking: false,
      bodySupport: 'partial_full_body',
      supportedUseCases: [
        'product_shoot',
        'speech_delivery',
        'explainer_host',
        'ad_actor',
        'social_presenter',
        'generic_clip',
      ],
      supportedAudioModes: [
        'silent',
        'tts_voiceover',
        'uploaded_voiceover',
        'copied_reference_audio',
        'external_mix',
      ],
    },
    notes: [
      'Bearer-auth API supports voice clone, custom avatars, audioSrc lip-sync, and background IDs.',
      'Product Avatar endpoint is documented as developing, so product_shoot should use standard avatar video first.',
      'Consent remains enforced by Avatar Vault because A2E has no native consent object.',
    ],
  },
  d_id: {
    id: 'd_id',
    displayName: 'D-ID',
    integrationStatus: 'planned_adapter',
    docsVerifiedAt: '2026-07-03',
    capabilities: {
      scriptInput: true,
      ssmlInput: true,
      audioUpload: true,
      voiceClone: true,
      backgroundComposite: false,
      nativeConsentTracking: true,
      bodySupport: 'talking_head',
      maxDurationSeconds: 300,
      maxAudioBytes: 15 * 1024 * 1024,
      supportedUseCases: [
        'speech_delivery',
        'explainer_host',
        'social_presenter',
        'generic_clip',
      ],
      supportedAudioModes: [
        'silent',
        'tts_voiceover',
        'uploaded_voiceover',
        'copied_reference_audio',
      ],
    },
    notes: [
      'HTTP Basic auth, not Bearer auth.',
      'Premium+ avatar and clip APIs are suitable for persistent talking-head avatar renders.',
      'Clip audio has a 15MB limit and 5 minute audio limit; talks have different limits.',
    ],
  },
  omnihuman_fal: {
    id: 'omnihuman_fal',
    displayName: 'OmniHuman on Fal',
    integrationStatus: 'stub_only',
    docsVerifiedAt: '2026-07-03',
    capabilities: {
      scriptInput: false,
      ssmlInput: false,
      audioUpload: false,
      voiceClone: false,
      backgroundComposite: false,
      nativeConsentTracking: false,
      bodySupport: 'cinematic_stub',
      supportedUseCases: ['product_shoot', 'ad_actor', 'generic_clip'],
      supportedAudioModes: ['silent', 'external_mix'],
    },
    notes: [
      'Stub-only cinematic/full-body bucket; do not call for V1 avatar renders.',
    ],
  },
  minimax_s2v_fal: {
    id: 'minimax_s2v_fal',
    displayName: 'MiniMax S2V on Fal',
    integrationStatus: 'stub_only',
    docsVerifiedAt: '2026-07-03',
    capabilities: {
      scriptInput: false,
      ssmlInput: false,
      audioUpload: false,
      voiceClone: false,
      backgroundComposite: false,
      nativeConsentTracking: false,
      bodySupport: 'cinematic_stub',
      supportedUseCases: ['product_shoot', 'ad_actor', 'generic_clip'],
      supportedAudioModes: ['silent', 'external_mix'],
    },
    notes: [
      'Stub-only image/video diffusion bucket for future full-body and cinematic scenes.',
    ],
  },
};

export const DEFAULT_AVATAR_PROVIDER_ORDER: AvatarProviderId[] = [
  'a2e',
  'd_id',
  'omnihuman_fal',
  'minimax_s2v_fal',
];

export function evaluateAvatarProviderReadiness(
  recipe: AvatarRenderRecipe,
  descriptor: AvatarProviderDescriptor,
): AvatarProviderReadiness {
  const issues: AvatarProviderReadinessIssue[] = [];
  const capabilities = descriptor.capabilities;

  if (!recipe.readiness.ready) {
    issues.push(providerError(
      descriptor.id,
      'recipe_not_ready',
      'recipe.readiness',
      'Avatar render recipe must pass Avatar Vault readiness before provider routing.',
    ));
  }

  if (descriptor.integrationStatus === 'stub_only') {
    issues.push(providerError(
      descriptor.id,
      'provider_stub_only',
      'provider.integrationStatus',
      `${descriptor.displayName} is registered as a future stub and must not receive V1 render jobs.`,
    ));
  }

  if (!capabilities.supportedUseCases.includes(recipe.useCase)) {
    issues.push(providerError(
      descriptor.id,
      'unsupported_use_case',
      'recipe.useCase',
      `${descriptor.displayName} does not support ${recipe.useCase} renders through the V1 adapter.`,
    ));
  }

  if (!capabilities.supportedAudioModes.includes(recipe.audio.mode)) {
    issues.push(providerError(
      descriptor.id,
      'unsupported_audio_mode',
      'recipe.audio.mode',
      `${descriptor.displayName} does not support ${recipe.audio.mode} audio in V1.`,
    ));
  }

  if (usesUploadedAudio(recipe.audio.mode) && !capabilities.audioUpload) {
    issues.push(providerError(
      descriptor.id,
      'audio_upload_unsupported',
      'recipe.audio',
      `${descriptor.displayName} cannot lip-sync to uploaded or copied audio.`,
    ));
  }

  if (recipe.audio.voiceSource.sourceType === 'uploaded_voice_sample' && !capabilities.voiceClone) {
    issues.push(providerError(
      descriptor.id,
      'voice_clone_unsupported',
      'recipe.audio.voiceSource.sourceType',
      `${descriptor.displayName} cannot clone avatar voices from user samples.`,
    ));
  }

  if (
    typeof capabilities.maxDurationSeconds === 'number'
    && recipe.target.durationSeconds > capabilities.maxDurationSeconds
  ) {
    issues.push(providerError(
      descriptor.id,
      'duration_exceeds_provider_limit',
      'recipe.target.durationSeconds',
      `${descriptor.displayName} supports up to ${capabilities.maxDurationSeconds} seconds for this adapter.`,
    ));
  }

  if (!capabilities.nativeConsentTracking) {
    issues.push(providerWarning(
      descriptor.id,
      'provider_uses_external_consent',
      'provider.capabilities.nativeConsentTracking',
      `${descriptor.displayName} relies on Avatar Vault consent and does not maintain its own consent object.`,
    ));
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { ready: errors.length === 0, errors, warnings };
}

export function planAvatarProviderRender(
  recipe: AvatarRenderRecipe,
  options: AvatarProviderSelectionOptions = {},
  descriptors: Record<AvatarProviderId, AvatarProviderDescriptor> = AVATAR_PROVIDER_DESCRIPTORS,
): AvatarProviderSelection {
  const mode = options.mode ?? 'single';
  const includeProviderIds = options.includeProviderIds ? new Set(options.includeProviderIds) : undefined;
  const orderedProviderIds = orderProviderIds(options.preferredProviderId);
  const readinessByProvider: Partial<Record<AvatarProviderId, AvatarProviderReadiness>> = {};
  const candidateProviderIds: AvatarProviderId[] = [];
  const rejectedProviders: AvatarProviderRejection[] = [];

  for (const providerId of orderedProviderIds) {
    if (includeProviderIds && !includeProviderIds.has(providerId)) continue;

    const descriptor = descriptors[providerId];
    const readiness = evaluateAvatarProviderReadiness(recipe, descriptor);
    readinessByProvider[providerId] = readiness;

    if (readiness.ready) {
      candidateProviderIds.push(providerId);
    } else {
      rejectedProviders.push({ providerId, reasons: readiness.errors });
    }
  }

  return {
    mode,
    selectedProviderIds: mode === 'benchmark'
      ? candidateProviderIds
      : candidateProviderIds.slice(0, 1),
    candidateProviderIds,
    rejectedProviders,
    readinessByProvider,
  };
}

function orderProviderIds(preferredProviderId: AvatarProviderId | undefined): AvatarProviderId[] {
  if (!preferredProviderId) return DEFAULT_AVATAR_PROVIDER_ORDER;
  return [
    preferredProviderId,
    ...DEFAULT_AVATAR_PROVIDER_ORDER.filter((providerId) => providerId !== preferredProviderId),
  ];
}

function usesUploadedAudio(mode: AvatarRenderAudioMode): boolean {
  return mode === 'uploaded_voiceover' || mode === 'copied_reference_audio';
}

function providerError(
  providerId: AvatarProviderId,
  code: AvatarProviderReadinessIssue['code'],
  path: string,
  message: string,
): AvatarProviderReadinessIssue {
  return { severity: 'error', providerId, code, path, message };
}

function providerWarning(
  providerId: AvatarProviderId,
  code: AvatarProviderReadinessIssue['code'],
  path: string,
  message: string,
): AvatarProviderReadinessIssue {
  return { severity: 'warning', providerId, code, path, message };
}
