import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type { AvatarProviderId, AvatarProviderSelection, AvatarProviderReadinessIssue } from '@/lib/avatar/avatar-provider-adapter';
import type { AvatarRenderAudioMode, AvatarRenderIssue, AvatarRenderUseCase } from '@/lib/avatar/avatar-render-recipe';
import type { PlanAvatarRenderInput } from '@/components/dashboard/AvatarVault/useAvatarVault';

/* ═══ Avatar Vault v2 · planner logic ═════════════════════════════════
   Pure render-planner logic, lifted from the proven AvatarVaultRenderPlanner
   (the reference implementation) so the v2 UI wires to the exact real
   contract: use-case gating, speech-audio validation, and PlanAvatarRenderInput
   assembly. Adds negativePrompt (PlanAvatarRenderInput supports it; the old
   planner didn't surface it). No React here. */

export interface PlannerState {
  useCase: AvatarRenderUseCase;
  prompt: string;
  script: string;
  negativePrompt: string;
  audioMode: AvatarRenderAudioMode;
  audioSourceUrl: string;
  voiceReferenceUrl: string;
  audioRightsConfirmed: boolean;
  productImageUrls: string;
  providerId: AvatarProviderId;
  aspectRatio: string;
  durationSeconds: string;
  resolution: string;
}

export const USE_CASE_OPTIONS: Array<{ id: AvatarRenderUseCase; label: string }> = [
  { id: 'speech_delivery', label: 'Speech' },
  { id: 'product_shoot', label: 'Product shoot' },
  { id: 'explainer_host', label: 'Explainer host' },
  { id: 'ad_actor', label: 'Ad actor' },
  { id: 'social_presenter', label: 'Social host' },
  { id: 'generic_clip', label: 'Generic clip' },
];

export const AUDIO_MODE_OPTIONS: Array<[AvatarRenderAudioMode, string]> = [
  ['tts_voiceover', 'TTS / profile'],
  ['uploaded_voiceover', 'Voiceover URL'],
  ['copied_reference_audio', 'Copied reference'],
  ['silent', 'Silent'],
  ['external_mix', 'External mix'],
];

export function initialPlannerState(record: AvatarProfileRecord): PlannerState {
  return {
    useCase: defaultUseCase(record),
    prompt: defaultPrompt(record),
    script: '',
    negativePrompt: '',
    audioMode: defaultAudioMode(record),
    audioSourceUrl: '',
    voiceReferenceUrl: '',
    audioRightsConfirmed: false,
    productImageUrls: '',
    providerId: 'd_id',
    aspectRatio: '9:16',
    durationSeconds: '8',
    resolution: '720p',
  };
}

export function buildPlanInput(recordId: string, state: PlannerState, prompt: string): PlanAvatarRenderInput {
  const audioSourceUrl = state.audioSourceUrl.trim();
  const voiceReferenceUrl = state.voiceReferenceUrl.trim();
  const script = state.script.trim();
  const negativePrompt = state.negativePrompt.trim();
  const durationSeconds = Number(state.durationSeconds);
  return {
    recordId,
    useCase: state.useCase,
    prompt,
    ...(script ? { script } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    audio: {
      mode: state.audioMode,
      ...(audioSourceUrl ? { sourceUrl: audioSourceUrl } : {}),
      ...(voiceReferenceUrl ? { voiceReferenceUrl } : {}),
      ...(script ? { voiceoverText: script } : {}),
      copyAllowed: state.audioMode === 'copied_reference_audio' && state.audioRightsConfirmed,
      consentConfirmed: state.audioMode !== 'copied_reference_audio' || state.audioRightsConfirmed,
    },
    ...(parseLines(state.productImageUrls) ? { productImageUrls: parseLines(state.productImageUrls) } : {}),
    target: {
      aspectRatio: state.aspectRatio,
      resolution: state.resolution,
      ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? { durationSeconds } : {}),
    },
    provider: {
      mode: 'single',
      preferredProviderId: state.providerId,
      includeProviderIds: [state.providerId],
    },
  };
}

export function useCaseOptionsForRecord(record: AvatarProfileRecord): Array<{ id: AvatarRenderUseCase; label: string }> {
  const approved = new Set<AvatarRenderUseCase>(record.profile.performancePack?.usagePresets ?? []);
  const options = USE_CASE_OPTIONS.filter((o) => approved.has(o.id) || o.id === 'generic_clip');
  return options.length > 0 ? options : USE_CASE_OPTIONS.filter((o) => o.id === 'generic_clip');
}

/** Returns a blocking message when the chosen speech setup has no usable voice, else null. */
export function speechInputProblem(record: AvatarProfileRecord, state: PlannerState): string | null {
  if (!isSpeechUseCase(state.useCase)) return null;
  // A "generate voice" (TTS/clone) render synthesizes speech from text, so it needs a script.
  if (state.audioMode === 'tts_voiceover' && !state.script.trim()) {
    return 'Add a Script — type what the avatar should say.';
  }
  if (state.voiceReferenceUrl.trim() && state.audioMode !== 'copied_reference_audio') return null;
  const hasAudioUrl = Boolean(state.audioSourceUrl.trim());
  if (state.audioMode === 'tts_voiceover' && !hasSavedSpeechVoice(record)) {
    return 'This avatar has no saved voice. Record or paste a voice sample on the avatar profile, or paste a voice sample URL here.';
  }
  if (state.audioMode === 'uploaded_voiceover' && !hasAudioUrl && !hasSavedSpeechVoice(record)) {
    return 'Speech needs a voice. Paste an Audio URL, or add a voice sample / imported voice / TTS voice to the avatar.';
  }
  if (state.audioMode === 'copied_reference_audio' && (!hasAudioUrl || !state.audioRightsConfirmed)) {
    return 'Copied reference audio needs an Audio URL and copy-permission confirmation.';
  }
  if (state.audioMode === 'silent' || state.audioMode === 'external_mix') {
    return 'Speech use cases need TTS, a voiceover URL, a saved avatar voice, or authorized copied reference audio.';
  }
  return null;
}

export function visibleProviderIssues(plan: AvatarProviderSelection, recipeHasErrors: boolean): AvatarProviderReadinessIssue[] {
  if (recipeHasErrors) return [];
  return plan.rejectedProviders
    .flatMap((provider) => provider.reasons)
    .filter((issue) => issue.code !== 'recipe_not_ready' && issue.code !== 'provider_stub_only');
}

export function providerWarnings(plan: AvatarProviderSelection | undefined, recipeErrorCount: number): AvatarProviderReadinessIssue[] {
  if (!plan || recipeErrorCount > 0) return [];
  return plan.selectedProviderIds.flatMap((id) => plan.readinessByProvider[id]?.warnings ?? []);
}

export function providerResultTitle(plan: AvatarProviderSelection, recipeErrors: AvatarRenderIssue[]): string {
  if (plan.selectedProviderIds.length > 0) return `Selected: ${plan.selectedProviderIds.join(', ')}`;
  if (recipeErrors.some((issue) => issue.code === 'missing_speech_audio')) return 'Needs voice or audio';
  if (recipeErrors.length > 0) return 'Needs input';
  return 'No provider selected';
}

export function isSpeechUseCase(useCase: AvatarRenderUseCase): boolean {
  return useCase === 'speech_delivery' || useCase === 'explainer_host' || useCase === 'social_presenter';
}
export function isProductUseCase(useCase: AvatarRenderUseCase): boolean {
  return useCase === 'product_shoot' || useCase === 'ad_actor';
}

function defaultUseCase(record: AvatarProfileRecord): AvatarRenderUseCase {
  const presets = record.profile.performancePack?.usagePresets ?? [];
  if (presets.includes('speech_delivery')) return 'speech_delivery';
  return presets[0] ?? 'generic_clip';
}
function defaultPrompt(record: AvatarProfileRecord): string {
  const role = record.profile.persona.defaultRole ?? 'presenter';
  return `${record.profile.displayName} appears as a ${role} in a clean room background.`;
}
function defaultAudioMode(record: AvatarProfileRecord): AvatarRenderAudioMode {
  return hasTtsVoice(record) || hasVoiceEvidenceUrl(record) ? 'tts_voiceover' : 'uploaded_voiceover';
}
export function hasSavedSpeechVoice(record: AvatarProfileRecord): boolean {
  return hasTtsVoice(record) || Boolean(record.profile.voice.sampleAssetId?.trim() || record.profile.voice.voiceProfileId?.trim() || hasVoiceEvidenceUrl(record));
}
function hasVoiceEvidenceUrl(record: AvatarProfileRecord): boolean {
  return Boolean(record.profile.evidence.find((item) => item.sourceType === 'uploaded_voice_sample' && item.sourceUrl?.trim()));
}
export function hasTtsVoice(record: AvatarProfileRecord): boolean {
  return Boolean(record.profile.voice.ttsVoiceId?.trim());
}
function parseLines(value: string): string[] | undefined {
  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}
