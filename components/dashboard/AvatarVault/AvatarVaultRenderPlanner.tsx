'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, Video, Wand2 } from 'lucide-react';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type { AvatarRenderJobStatus } from '@/lib/avatar/avatar-render-job';
import type { AvatarProviderId, AvatarProviderReadinessIssue, AvatarProviderSelection } from '@/lib/avatar/avatar-provider-adapter';
import type { AvatarRenderAudioMode, AvatarRenderIssue, AvatarRenderUseCase } from '@/lib/avatar/avatar-render-recipe';
import { type PlanAvatarRenderInput, useAvatarRenderJobMutation, useAvatarRenderPlanMutation } from './useAvatarVault';
import { VoiceRecorder } from './VoiceRecorder';

type PlannerProviderChoice = 'auto' | AvatarProviderId;

interface PlannerState {
  useCase: AvatarRenderUseCase;
  prompt: string;
  script: string;
  audioMode: AvatarRenderAudioMode;
  audioSourceUrl: string;
  voiceReferenceUrl: string;
  audioRightsConfirmed: boolean;
  productImageUrls: string;
  providerMode: 'single' | 'benchmark';
  preferredProviderId: PlannerProviderChoice;
  aspectRatio: string;
  durationSeconds: string;
  resolution: string;
}

const USE_CASE_OPTIONS: Array<{ id: AvatarRenderUseCase; label: string }> = [
  { id: 'speech_delivery', label: 'Speech' },
  { id: 'product_shoot', label: 'Product shoot' },
  { id: 'explainer_host', label: 'Explainer host' },
  { id: 'ad_actor', label: 'Ad actor' },
  { id: 'social_presenter', label: 'Social host' },
  { id: 'generic_clip', label: 'Generic clip' },
];

const AUDIO_MODE_OPTIONS: Array<{ id: AvatarRenderAudioMode; label: string }> = [
  { id: 'tts_voiceover', label: 'TTS / profile voice' },
  { id: 'uploaded_voiceover', label: 'Voiceover URL' },
  { id: 'copied_reference_audio', label: 'Copied reference audio' },
  { id: 'silent', label: 'Silent' },
  { id: 'external_mix', label: 'External mix' },
];

const PROVIDER_OPTIONS: Array<{ id: PlannerProviderChoice; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'a2e', label: 'A2E' },
  { id: 'd_id', label: 'D-ID' },
];

const BENCHMARK_PROVIDER_IDS: AvatarProviderId[] = ['a2e', 'd_id'];

export function AvatarVaultRenderPlanner({ record }: { record: AvatarProfileRecord }) {
  const planRender = useAvatarRenderPlanMutation();
  const createRenderJob = useAvatarRenderJobMutation();
  const [state, setState] = useState<PlannerState>(() => initialPlannerState(record));
  const [clientError, setClientError] = useState<string | null>(null);

  const availableUseCaseOptions = useMemo(() => useCaseOptionsForRecord(record), [record]);
  const providerWarnings = useMemo(() => {
    const plan = planRender.data?.providerPlan;
    if (!plan) return [];
    if (planRender.data?.recipe.readiness.errors.length) return [];
    return plan.selectedProviderIds.flatMap((providerId) => plan.readinessByProvider[providerId]?.warnings ?? []);
  }, [planRender.data?.providerPlan, planRender.data?.recipe.readiness.errors.length]);

  function handlePlan() {
    const input = validatedPlanInput();
    if (!input) return;
    setClientError(null);
    planRender.mutate(input);
  }

  function handleGenerate() {
    const input = validatedPlanInput();
    if (!input) return;
    setClientError(null);
    createRenderJob.mutate(input);
  }
  const recipe = planRender.data?.recipe;
  const providerPlan = planRender.data?.providerPlan;
  const renderJob = createRenderJob.data?.job;
  const errorMessage =
    clientError
    ?? (planRender.error instanceof Error ? planRender.error.message : null)
    ?? (createRenderJob.error instanceof Error ? createRenderJob.error.message : null);
  const hasProviderSelection = Boolean(providerPlan?.selectedProviderIds.length);
  const resultIssues = recipe ? [...recipe.readiness.errors, ...recipe.readiness.warnings] : [];
  const providerIssues = providerPlan && recipe ? visibleProviderIssues(providerPlan, recipe.readiness.errors.length > 0) : [];
  const resultTitle = providerPlan && recipe ? providerResultTitle(providerPlan, recipe.readiness.errors) : null;

  return (
    <div className="mt-5 border-t border-[#293034] pt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Video size={17} className="text-[#74D6C6]" />
          <h4 className="text-base font-semibold tracking-normal text-[#F7F1E3]">Plan Video</h4>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#74D6C6] px-4 text-sm font-semibold text-[#081211] hover:bg-[#8BE0D3] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handlePlan}
          disabled={planRender.isPending}
        >
          {planRender.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          Plan video
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Use case</span>
          <select className="avatar-vault-input" value={state.useCase} onChange={(event) => updateState('useCase', event.target.value as AvatarRenderUseCase)}>
            {availableUseCaseOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Provider</span>
            <select className="avatar-vault-input" value={state.preferredProviderId} onChange={(event) => updateState('preferredProviderId', event.target.value as PlannerProviderChoice)}>
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Mode</span>
            <select className="avatar-vault-input" value={state.providerMode} onChange={(event) => updateState('providerMode', event.target.value as PlannerState['providerMode'])}>
              <option value="single">Single</option>
              <option value="benchmark">Benchmark</option>
            </select>
          </label>
        </div>

        <label className="block xl:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Scene prompt</span>
          <textarea
            className="avatar-vault-input"
            value={state.prompt}
            onChange={(event) => updateState('prompt', event.target.value)}
          />
        </label>

        <label className="block xl:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Script</span>
          <textarea
            className="avatar-vault-input"
            value={state.script}
            onChange={(event) => updateState('script', event.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Audio</span>
            <select className="avatar-vault-input" value={state.audioMode} onChange={(event) => updateState('audioMode', event.target.value as AvatarRenderAudioMode)}>
              {AUDIO_MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Audio URL</span>
            <input
              className="avatar-vault-input"
              value={state.audioSourceUrl}
              onChange={(event) => updateState('audioSourceUrl', event.target.value)}
            />
          </label>
        </div>

        <div className="block xl:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Voice to clone</span>
          <VoiceRecorder
            onUploaded={(url) => {
              updateState('voiceReferenceUrl', url);
              updateState('audioMode', 'tts_voiceover');
            }}
          />
          <input
            className="avatar-vault-input mt-2"
            placeholder="…or paste a voice-sample URL to clone"
            value={state.voiceReferenceUrl}
            onChange={(event) => updateState('voiceReferenceUrl', event.target.value)}
          />
        </div>

        {isSpeechUseCase(state.useCase) && !hasSavedSpeechVoice(record) && !state.voiceReferenceUrl.trim() && (
          <div className="rounded-lg border border-[#7C6735] bg-[#211B0F] px-3 py-2 text-xs text-[#EDD494] xl:col-span-2">
            This avatar has no saved voice yet. Paste a voiceover URL for speech, or add a TTS voice / voice sample to the avatar profile.
          </div>
        )}

        {state.audioMode === 'copied_reference_audio' && (
          <label className="flex items-center gap-2 rounded-lg border border-[#293034] bg-[#0F1213] px-3 py-2 text-sm text-[#D7D2C4] xl:col-span-2">
            <input
              type="checkbox"
              checked={state.audioRightsConfirmed}
              onChange={(event) => updateState('audioRightsConfirmed', event.target.checked)}
            />
            Copy permission confirmed
          </label>
        )}

        <label className="block xl:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Product image URLs</span>
          <textarea
            className="avatar-vault-input"
            value={state.productImageUrls}
            onChange={(event) => updateState('productImageUrls', event.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3 xl:col-span-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Aspect</span>
            <select className="avatar-vault-input" value={state.aspectRatio} onChange={(event) => updateState('aspectRatio', event.target.value)}>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Seconds</span>
            <input
              className="avatar-vault-input"
              inputMode="decimal"
              value={state.durationSeconds}
              onChange={(event) => updateState('durationSeconds', event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">Resolution</span>
            <select className="avatar-vault-input" value={state.resolution} onChange={(event) => updateState('resolution', event.target.value)}>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#73453F] bg-[#211312] px-3 py-2 text-sm text-[#F0B3AC]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {providerPlan && (
        <div className={`mt-4 rounded-lg border px-3 py-3 text-sm ${hasProviderSelection ? 'border-[#4D7D62] bg-[#112019] text-[#CFEED8]' : 'border-[#73453F] bg-[#211312] text-[#F0B3AC]'}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              {hasProviderSelection ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {hasProviderSelection ? `Selected: ${providerPlan.selectedProviderIds.map(providerLabel).join(', ')}` : resultTitle}
            </div>
            {hasProviderSelection && (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#74D6C6] px-3 text-xs font-semibold text-[#E7FFFB] hover:bg-[#12302B] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleGenerate}
                disabled={createRenderJob.isPending}
              >
                {createRenderJob.isPending ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                Generate video
              </button>
            )}
          </div>
          {recipe && (
            <div className="text-xs text-[#AEB6B3]">
              {recipe.useCase} / {recipe.audio.mode} / {recipe.target.aspectRatio} / {recipe.target.durationSeconds}s / {recipe.target.resolution}
            </div>
          )}
          <IssueList issues={resultIssues} />
          <ProviderIssueList issues={providerIssues} />
          <ProviderIssueList issues={providerWarnings} />
          {renderJob && (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${renderJobTone(renderJob.status)}`}>
              <div className="font-semibold">Render job: {renderJob.status}</div>
              <div className="mt-1 break-all text-[#AEB6B3]">
                {providerLabel(renderJob.providerId)} / {renderJob.id}
              </div>
              <div className="mt-1">{renderJob.statusReason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function updateState<K extends keyof PlannerState>(key: K, value: PlannerState[K]) {
    setState((current) => ({ ...current, [key]: value }));
    setClientError(null);
  }

  function validatedPlanInput(): PlanAvatarRenderInput | null {
    const prompt = state.prompt.trim();
    if (!prompt) {
      setClientError('Scene prompt is required.');
      return null;
    }

    const speechProblem = speechInputProblem(record, state);
    if (speechProblem) {
      setClientError(speechProblem);
      return null;
    }

    return buildPlanInput(record.id, state, prompt);
  }
}

function initialPlannerState(record: AvatarProfileRecord): PlannerState {
  return {
    useCase: defaultUseCase(record),
    prompt: defaultPrompt(record),
    script: '',
    audioMode: defaultAudioMode(record),
    audioSourceUrl: '',
    voiceReferenceUrl: '',
    audioRightsConfirmed: false,
    productImageUrls: '',
    providerMode: 'single',
    preferredProviderId: 'auto',
    aspectRatio: '9:16',
    durationSeconds: '8',
    resolution: '720p',
  };
}

function buildPlanInput(recordId: string, state: PlannerState, prompt: string): PlanAvatarRenderInput {
  const audioSourceUrl = state.audioSourceUrl.trim();
  const voiceReferenceUrl = state.voiceReferenceUrl.trim();
  const script = state.script.trim();
  const durationSeconds = Number(state.durationSeconds);
  const includeProviderIds = providerIdsForRequest(state);
  return {
    recordId,
    useCase: state.useCase,
    prompt,
    ...(script ? { script } : {}),
    audio: {
      mode: state.audioMode,
      ...(audioSourceUrl ? { sourceUrl: audioSourceUrl } : {}),
      ...(voiceReferenceUrl ? { voiceReferenceUrl } : {}),
      ...(script ? { voiceoverText: script } : {}),
      copyAllowed: state.audioMode === 'copied_reference_audio' && state.audioRightsConfirmed,
      consentConfirmed: state.audioMode !== 'copied_reference_audio' || state.audioRightsConfirmed,
    },
    productImageUrls: parseLines(state.productImageUrls),
    target: {
      aspectRatio: state.aspectRatio,
      resolution: state.resolution,
      ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? { durationSeconds } : {}),
    },
    provider: {
      mode: state.providerMode,
      ...(state.preferredProviderId !== 'auto' ? { preferredProviderId: state.preferredProviderId } : {}),
      includeProviderIds,
    },
  };
}

function IssueList({ issues }: { issues: AvatarRenderIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {issues.map((issue) => (
        <li key={`${issue.path}-${issue.code}`} className={issue.severity === 'error' ? 'text-[#F0B3AC]' : 'text-[#EDD494]'}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function ProviderIssueList({ issues }: { issues: AvatarProviderReadinessIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {issues.map((issue) => (
        <li key={`${issue.providerId}-${issue.path}-${issue.code}`} className={issue.severity === 'error' ? 'text-[#F0B3AC]' : 'text-[#EDD494]'}>
          {providerLabel(issue.providerId)}: {issue.message}
        </li>
      ))}
    </ul>
  );
}

function defaultUseCase(record: AvatarProfileRecord): AvatarRenderUseCase {
  const presets = record.profile.performancePack?.usagePresets ?? [];
  if (presets.includes('speech_delivery')) return 'speech_delivery';
  return presets[0] ?? 'generic_clip';
}

function useCaseOptionsForRecord(record: AvatarProfileRecord): Array<{ id: AvatarRenderUseCase; label: string }> {
  const approved = new Set<AvatarRenderUseCase>(record.profile.performancePack?.usagePresets ?? []);
  const options = USE_CASE_OPTIONS.filter((option) => approved.has(option.id) || option.id === 'generic_clip');
  return options.length > 0 ? options : USE_CASE_OPTIONS.filter((option) => option.id === 'generic_clip');
}

function defaultPrompt(record: AvatarProfileRecord): string {
  const role = record.profile.persona.defaultRole ?? 'presenter';
  return `${record.profile.displayName} appears as a ${role} in a clean room background.`;
}

function defaultAudioMode(record: AvatarProfileRecord): AvatarRenderAudioMode {
  if (hasTtsVoice(record)) return 'tts_voiceover';
  return 'uploaded_voiceover';
}

function speechInputProblem(record: AvatarProfileRecord, state: PlannerState): string | null {
  if (!isSpeechUseCase(state.useCase)) return null;
  // A recorded/pasted voice reference is cloneable by Chatterbox, so it satisfies speech.
  if (state.voiceReferenceUrl.trim() && state.audioMode !== 'copied_reference_audio') return null;
  const hasAudioUrl = Boolean(state.audioSourceUrl.trim());
  if (state.audioMode === 'tts_voiceover' && !hasTtsVoice(record)) {
    return 'This avatar has no TTS voice ID. Paste a voiceover URL, or add a TTS voice to the avatar profile.';
  }
  if (state.audioMode === 'uploaded_voiceover' && !hasAudioUrl && !hasSavedSpeechVoice(record)) {
    return 'Speech needs a voice. Paste an Audio URL, or add a voice sample / imported voice / TTS voice to the avatar profile.';
  }
  if (state.audioMode === 'copied_reference_audio' && (!hasAudioUrl || !state.audioRightsConfirmed)) {
    return 'Copied reference audio needs an Audio URL and copy permission confirmation.';
  }
  if (state.audioMode === 'silent' || state.audioMode === 'external_mix') {
    return 'Speech use cases need TTS, a voiceover URL, a saved avatar voice, or authorized copied reference audio.';
  }
  return null;
}

function providerIdsForRequest(state: PlannerState): AvatarProviderId[] {
  if (state.providerMode === 'benchmark') return BENCHMARK_PROVIDER_IDS;
  if (state.preferredProviderId !== 'auto') return [state.preferredProviderId];
  return BENCHMARK_PROVIDER_IDS;
}

function visibleProviderIssues(plan: AvatarProviderSelection, recipeHasErrors: boolean): AvatarProviderReadinessIssue[] {
  if (recipeHasErrors) return [];
  return plan.rejectedProviders
    .flatMap((provider) => provider.reasons)
    .filter((issue) => issue.code !== 'recipe_not_ready' && issue.code !== 'provider_stub_only');
}

function providerResultTitle(plan: AvatarProviderSelection, recipeErrors: AvatarRenderIssue[]): string {
  if (plan.selectedProviderIds.length > 0) return `Selected: ${plan.selectedProviderIds.map(providerLabel).join(', ')}`;
  if (recipeErrors.some((issue) => issue.code === 'missing_speech_audio')) return 'Needs voice or audio';
  if (recipeErrors.length > 0) return 'Needs input';
  return 'No provider selected';
}

function renderJobTone(status: AvatarRenderJobStatus): string {
  if (status === 'blocked') return 'border-[#7C6735] bg-[#211B0F] text-[#EDD494]';
  if (status === 'failed') return 'border-[#73453F] bg-[#211312] text-[#F0B3AC]';
  return 'border-[#4D7D62] bg-[#0F1A14] text-[#CFEED8]';
}

function isSpeechUseCase(useCase: AvatarRenderUseCase): boolean {
  return useCase === 'speech_delivery' || useCase === 'explainer_host' || useCase === 'social_presenter';
}

function hasSavedSpeechVoice(record: AvatarProfileRecord): boolean {
  return hasTtsVoice(record) || Boolean(record.profile.voice.sampleAssetId?.trim() || record.profile.voice.voiceProfileId?.trim());
}

function hasTtsVoice(record: AvatarProfileRecord): boolean {
  return Boolean(record.profile.voice.ttsVoiceId?.trim());
}

function parseLines(value: string): string[] | undefined {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}

function providerLabel(providerId: AvatarProviderId): string {
  if (providerId === 'a2e') return 'A2E';
  if (providerId === 'd_id') return 'D-ID';
  if (providerId === 'omnihuman_fal') return 'OmniHuman Fal';
  return 'MiniMax S2V Fal';
}
