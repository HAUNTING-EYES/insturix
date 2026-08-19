import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6RenderProofV2,
} from './dev03-stage6-native-proxy-contract-v2';

type JsonRecord = Record<string, unknown>;
type ProofDimensionV2 = 'PASS' | 'FAIL';

export const DEV03_STAGE6_RENDER_PROOF_POLICY_V2 =
  'EDITRON_OE_DEV03_STAGE6_RENDER_PROOF_POLICY_V2' as const;

export interface Dev03Stage6RenderProofValidationV2 {
  policyVersion: typeof DEV03_STAGE6_RENDER_PROOF_POLICY_V2;
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

const EXPECTED_BOUNDARY_SAMPLES = [
  [118, [33, 82, 145]], [119, [111, 54, 124]],
  [238, [111, 54, 124]], [239, [33, 82, 145]],
  [478, [111, 54, 124]], [479, [151, 72, 48]],
] as const;

export function validateDev03Stage6RenderProofV2(
  candidate: unknown,
): Readonly<Dev03Stage6RenderProofValidationV2> {
  const proof = record(candidate);
  const diagnostics: string[] = [];
  const video = record(proof.video);
  const visual = record(proof.visual);
  const audio = record(proof.audio);

  if (proof.schemaVersion !== DEV03_STAGE6_NATIVE_PROXY_V2
    || !same(proof.renderer, EXPECTED_RENDERER)
    || !same(proof.composition, {
      width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600,
    })
    || !same(proof.sourceBindings, {
      videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats',
    })) diagnostics.push('VISUAL_RENDER_BINDING_INVALID');

  if (video.codec !== 'h264' || !exact(video.width, 320) || !exact(video.height, 180)
    || video.averageFrameRate !== '30/1' || !exact(video.decodedFrameCount, 600)
    || !within(video.durationSeconds, 19.94, 20.06) || !exact(video.audioStreamCount, 1)) {
    diagnostics.push('VISUAL_VIDEO_PROBE_INVALID');
  }

  const boundarySamples = array(visual.boundarySamples);
  if (boundarySamples.length !== EXPECTED_BOUNDARY_SAMPLES.length
    || EXPECTED_BOUNDARY_SAMPLES.some(([expectedFrame, expectedRgb], index) => {
      const sample = record(boundarySamples[index]);
      const rgb = array(sample.rgb);
      return sample.frame !== expectedFrame || rgb.length !== 3
        || rgb.some((channel, channelIndex) => !within(
          channel,
          expectedRgb[channelIndex] - 22,
          expectedRgb[channelIndex] + 22,
        ));
    })) diagnostics.push('VISUAL_BOUNDARY_SAMPLE_INVALID');

  const boundaryDiffs = array(visual.boundaryMeanAbsDiffs);
  if (boundaryDiffs.length !== 3 || boundaryDiffs.some((value) => !atLeast(value, 20))) {
    diagnostics.push('VISUAL_BOUNDARY_CHANGE_NOT_VISIBLE');
  }
  if (!exact(visual.shakeActiveFrame, 480) || !exact(visual.shakeNeutralFrame, 490)
    || !atLeast(visual.shakeActiveMeanAbsDiff, 0.1)
    || !atMost(visual.shakeNeutralMeanAbsDiff, 0.05)) {
    diagnostics.push('VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID');
  }

  if (!exact(audio.sampleRateHz, 48_000) || !exact(audio.sourceChannels, 1)
    || !exact(audio.baselineChannels, 2) || !exact(audio.renderedChannels, 2)
    || !exact(audio.sourceSampleFrames, 960_000)
    || !within(audio.baselineSampleFrames, 959_000, 961_000)
    || !within(audio.renderedSampleFrames, 959_000, 961_000)
    || !exact(audio.protectedStartFrame, 250) || !exact(audio.protectedEndFrame, 350)) {
    diagnostics.push('AUDIO_DURATION_OR_RANGE_INVALID');
  }
  if (!positive(audio.sourceProtectedRms) || !positive(audio.baselineProtectedRms)
    || !positive(audio.renderedProtectedRms)
    || !within(audio.sourceToRenderedGainRatio, 0.69, 0.72)
    || !atLeast(audio.sourceToRenderedCorrelation, 0.995)
    || !within(audio.baselineToRenderedGainRatio, 0.999, 1.001)
    || !atLeast(audio.baselineToRenderedCorrelation, 0.99999)
    || !withinExclusive(audio.renderedPeak, 0, 0.99)) {
    diagnostics.push('AUDIO_PROTECTED_CONTENT_INVALID');
  }

  const browserErrors = proof.browserErrors;
  const externalCallsValid = same(proof.externalCalls, {
    providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0,
  });
  if (!Array.isArray(browserErrors) || browserErrors.length > 0 || !externalCallsValid) {
    diagnostics.push('VISUAL_RENDER_SIDE_EFFECT_OR_BROWSER_ERROR');
    diagnostics.push('AUDIO_RENDER_SIDE_EFFECT_OR_BROWSER_ERROR');
  }

  const unique = [...new Set(diagnostics)].sort(compareUtf16);
  return Object.freeze({
    policyVersion: DEV03_STAGE6_RENDER_PROOF_POLICY_V2,
    assessment: unique.length ? 'FAIL' : 'PASS',
    renderedVisual: dimension(unique, 'VISUAL_'),
    renderedAudio: dimension(unique, 'AUDIO_'),
    diagnostics: Object.freeze(unique),
  });
}

export function assertValidDev03Stage6RenderProofV2(
  proof: Dev03Stage6RenderProofV2,
): Readonly<Dev03Stage6RenderProofValidationV2> {
  const validation = validateDev03Stage6RenderProofV2(proof);
  if (validation.assessment !== 'PASS') {
    throw new Error(`DEV03_STAGE6_RENDER_PROOF_INVALID:${validation.diagnostics.join('|')}`);
  }
  return validation;
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as JsonRecord : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
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
function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
