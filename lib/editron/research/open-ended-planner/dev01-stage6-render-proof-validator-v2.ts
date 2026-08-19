import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6RenderProofV2,
} from './dev01-stage6-native-proxy-contract-v2';

type JsonRecord = Record<string, unknown>;
type ProofDimensionV2 = 'PASS' | 'FAIL';

export const DEV01_STAGE6_RENDER_PROOF_POLICY_V2 =
  'EDITRON_OE_DEV01_STAGE6_RENDER_PROOF_POLICY_V2' as const;

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
  if (!positive(audio.bgmSoloBeforeRms) || !positive(audio.bgmDuckedRms)
    || !positive(audio.bgmSoloAfterRms) || !within(audio.duckReductionDb, 10, 14)
    || !within(audio.soloRecoveryRatio, 0.97, 1.03)) diagnostics.push('AUDIO_DUCK_ENVELOPE_INVALID');
  if (!positive(audio.fullSpeechRms) || !atLeast(audio.dialogueLiftOverDuckedBgmDb, 6)
    || !withinExclusive(audio.fullMixPeak, 0, 0.99)) diagnostics.push('AUDIO_DIALOGUE_OR_PEAK_INVALID');

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
): Readonly<Dev01Stage6RenderProofValidationV2> {
  const validation = validateDev01Stage6RenderProofV2(proof);
  if (validation.assessment !== 'PASS') {
    throw new Error(`DEV01_STAGE6_RENDER_PROOF_INVALID:${validation.diagnostics.join('|')}`);
  }
  return validation;
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as JsonRecord : {};
}
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
