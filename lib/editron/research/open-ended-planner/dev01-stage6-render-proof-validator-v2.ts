import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6RenderProofV2,
} from './dev01-stage6-native-proxy-contract-v2';

type JsonRecord = Record<string, unknown>;
type ProofDimensionV2 = 'PASS' | 'FAIL';

export const DEV01_STAGE6_RENDER_PROOF_POLICY_V2 =
  'EDITRON_OE_DEV01_STAGE6_RENDER_PROOF_POLICY_V2' as const;

export const DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R = Object.freeze({
  policyVersion: 'EDITRON_OE_DEV01_PROVIDER_NATIVE_AUDIO_PROOF_V2R_1' as const,
  minimumEffectiveDuckReductionDb: 1,
  maximumRenderedToExpectedDeviationDb: 0.75,
  soloRecoveryRatio: Object.freeze({ minimum: 0.97, maximum: 1.03 }),
  minimumDialogueLiftOverDuckedBgmDb: 6,
  fullMixPeakExclusiveMaximum: 0.99,
});

export interface Dev01BoundAudioProofPolicyV2R {
  policyVersion: typeof DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R.policyVersion;
  minimumEffectiveDuckReductionDb: number;
  maximumRenderedToExpectedDeviationDb: number;
  soloRecoveryRatio: Readonly<{ minimum: number; maximum: number }>;
  minimumDialogueLiftOverDuckedBgmDb: number;
  fullMixPeakExclusiveMaximum: number;
  expectedDuckReductionDb: number;
}

export interface Dev01Stage6RenderProofValidationV2 {
  policyVersion: typeof DEV01_STAGE6_RENDER_PROOF_POLICY_V2;
  assessment: ProofDimensionV2;
  renderedVisual: ProofDimensionV2;
  renderedAudio: ProofDimensionV2;
  diagnostics: readonly string[];
}

const EXPECTED_RENDERER = {
  root: 'components/editron/editor/version-7.0.0/remotion/index.ts',
  assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
  visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx',
  audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
} as const;

export function validateDev01Stage6RenderProofV2(
  candidate: unknown,
  boundAudioPolicy?: Readonly<Dev01BoundAudioProofPolicyV2R>,
): Readonly<Dev01Stage6RenderProofValidationV2> {
  const proof = record(candidate);
  const diagnostics: string[] = [];
  const video = record(proof.video);
  const visual = record(proof.visual);
  const audio = record(proof.audio);

  if (proof.schemaVersion !== DEV01_STAGE6_NATIVE_PROXY_V2
    || !same(proof.renderer, EXPECTED_RENDERER)
    || !same(proof.composition, {
      width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 435,
    })
    || !same(proof.sourceBindings, {
      hostVideoAssetId: 'dev01-host-truth-v2',
      dialogueAssetId: 'dev01-dialogue-truth-v2',
      bgmAssetId: 'dev01-bgm-truth-v2',
    })) diagnostics.push('VISUAL_RENDER_BINDING_INVALID');

  if (video.codec !== 'h264' || !exact(video.width, 320) || !exact(video.height, 180)
    || video.averageFrameRate !== '30/1' || !exact(video.decodedFrameCount, 435)
    || !within(video.durationSeconds, 14.44, 14.56) || !exact(video.audioStreamCount, 1)) {
    diagnostics.push('VISUAL_VIDEO_PROBE_INVALID');
  }
  if (!exact(visual.preRevealFrame, 159) || !exact(visual.revealFrame, 160)
    || !exact(visual.zoomedFrame, 171) || !atMost(visual.preRevealYellowPixels, 32)
    || !atLeast(visual.revealYellowPixels, 1_000)) diagnostics.push('VISUAL_REVEAL_TIMING_INVALID');
  if (!within(visual.widthScale, 1.07, 1.17) || !within(visual.heightScale, 1.07, 1.17)
    || !atMost(visual.centerDriftPixels, 3)) diagnostics.push('VISUAL_PUSH_GEOMETRY_INVALID');

  if (!exact(audio.sampleRateHz, 48_000) || !exact(audio.bgmProofSampleFrames, 696_000)
    || !within(audio.fullMixSampleFrames, 696_000, 700_000)) diagnostics.push('AUDIO_DURATION_OR_RATE_INVALID');
  const envelopeValid = boundAudioPolicy
    ? matchesBoundAudioPolicy(audio, boundAudioPolicy)
    : within(audio.duckReductionDb, 10, 14) && within(audio.soloRecoveryRatio, 0.97, 1.03);
  if (!positive(audio.bgmSoloBeforeRms) || !positive(audio.bgmDuckedRms)
    || !positive(audio.bgmSoloAfterRms) || !envelopeValid) diagnostics.push('AUDIO_DUCK_ENVELOPE_INVALID');
  const minimumDialogueLift = boundAudioPolicy?.minimumDialogueLiftOverDuckedBgmDb ?? 6;
  const peakMaximum = boundAudioPolicy?.fullMixPeakExclusiveMaximum ?? 0.99;
  if (!positive(audio.fullSpeechRms) || !atLeast(audio.dialogueLiftOverDuckedBgmDb, minimumDialogueLift)
    || !withinExclusive(audio.fullMixPeak, 0, peakMaximum)) diagnostics.push('AUDIO_DIALOGUE_OR_PEAK_INVALID');

  const browserErrors = proof.browserErrors;
  const externalCallsValid = same(proof.externalCalls, {
    providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0,
  });
  if (!Array.isArray(browserErrors) || browserErrors.length > 0 || !externalCallsValid) {
    diagnostics.push('VISUAL_RENDER_SIDE_EFFECT_OR_BROWSER_ERROR');
    diagnostics.push('AUDIO_RENDER_SIDE_EFFECT_OR_BROWSER_ERROR');
  }

  const unique = [...new Set(diagnostics)].sort(compareUtf16);
  const renderedVisual = dimension(unique, 'VISUAL_');
  const renderedAudio = dimension(unique, 'AUDIO_');
  return Object.freeze({
    policyVersion: DEV01_STAGE6_RENDER_PROOF_POLICY_V2,
    assessment: unique.length ? 'FAIL' : 'PASS',
    renderedVisual,
    renderedAudio,
    diagnostics: Object.freeze(unique),
  });
}

export function assertValidDev01Stage6RenderProofV2(
  proof: Dev01Stage6RenderProofV2,
  boundAudioPolicy?: Readonly<Dev01BoundAudioProofPolicyV2R>,
): Readonly<Dev01Stage6RenderProofValidationV2> {
  const validation = validateDev01Stage6RenderProofV2(proof, boundAudioPolicy);
  if (validation.assessment !== 'PASS') {
    throw new Error(`DEV01_STAGE6_RENDER_PROOF_INVALID:${validation.diagnostics.join('|')}`);
  }
  return validation;
}

export function bindDev01ProviderNativeAudioProofPolicyV2R(
  projectSnapshot: unknown,
): Readonly<Dev01BoundAudioProofPolicyV2R> {
  const bgmOverlays = records(record(projectSnapshot).overlays)
    .filter((overlay) => overlay.assetId === 'dev01-bgm-truth-v2');
  if (bgmOverlays.length !== 1) throw new Error('DEV01_PROVIDER_NATIVE_AUDIO_POLICY_BGM_IDENTITY_INVALID');
  const styles = record(bgmOverlays[0].styles);
  const duckingConfig = record(styles.duckingConfig);
  const baseVolume = number(styles.volume);
  const duckLevel = number(duckingConfig.duckLevel);
  if (duckingConfig.enabled !== true || baseVolume === undefined || duckLevel === undefined
    || baseVolume <= 0 || duckLevel <= 0 || duckLevel >= baseVolume) {
    throw new Error('DEV01_PROVIDER_NATIVE_AUDIO_POLICY_DUCK_CONFIG_INVALID');
  }
  return Object.freeze({
    ...DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R,
    expectedDuckReductionDb: round(20 * Math.log10(baseVolume / duckLevel)),
  });
}

function matchesBoundAudioPolicy(
  audio: Readonly<JsonRecord>,
  policy: Readonly<Dev01BoundAudioProofPolicyV2R>,
): boolean {
  const reduction = number(audio.duckReductionDb);
  if (reduction === undefined || reduction < policy.minimumEffectiveDuckReductionDb) return false;
  if (Math.abs(reduction - policy.expectedDuckReductionDb) > policy.maximumRenderedToExpectedDeviationDb) return false;
  return within(
    audio.soloRecoveryRatio,
    policy.soloRecoveryRatio.minimum,
    policy.soloRecoveryRatio.maximum,
  );
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function exact(value: unknown, expected: number): boolean { return number(value) === expected; }
function positive(value: unknown): boolean { const parsed = number(value); return parsed !== undefined && parsed > 0; }
function atLeast(value: unknown, minimum: number): boolean { const parsed = number(value); return parsed !== undefined && parsed >= minimum; }
function atMost(value: unknown, maximum: number): boolean { const parsed = number(value); return parsed !== undefined && parsed <= maximum; }
function within(value: unknown, minimum: number, maximum: number): boolean {
  const parsed = number(value);
  return parsed !== undefined && parsed >= minimum && parsed <= maximum;
}
function withinExclusive(value: unknown, minimum: number, maximum: number): boolean {
  const parsed = number(value);
  return parsed !== undefined && parsed > minimum && parsed < maximum;
}
function same(left: unknown, right: unknown): boolean {
  try {
    return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
  } catch {
    return false;
  }
}
function dimension(diagnostics: readonly string[], prefix: string): ProofDimensionV2 {
  return diagnostics.some((diagnostic) => diagnostic.startsWith(prefix)) ? 'FAIL' : 'PASS';
}
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function round(value: number): number { return Number(value.toFixed(6)); }
