import { resolve } from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { renderTrustedGeneratedCompositionProxyV1 }
  from './generated-composition-proxy-renderer-v1';
import { hashGeneratedCompositionSourceBundleV1 }
  from './generated-composition-program-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import {
  buildSealedH03GeneratedProgramArtifactsV2R,
  SEALED_H03_FONT_PATH_V2R,
} from './sealed-holdout-h03-generated-program-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV2R }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import {
  bindSealedH03SourceArtifactsV2R,
  executeSealedH03RenderedHybridMechanicsV2R,
} from './sealed-holdout-h03-rendered-mechanics-v2r';
import { bindSealedHoldoutProofInputV2R } from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV2R }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H03_RENDERED_HYBRID_PROOF_V2R_1' as const;

export interface SealedHoldoutH03HybridProofReceiptV2R {
  version: typeof SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V2R;
  authority: 'RESEARCH_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-03:C1'; taskId: 'HOLD-03'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string; evaluationReceiptSha256: string;
  executionBoundary: Readonly<{
    selectedOperationForm: 'GENERATED_COMPOSITION';
    projectRangeForm: 'HYBRID_NATIVE_SURROUND_GENERATED_ISLAND';
    generatedProgramSource: 'HUMAN_AUTHORED_FIXTURE_NOT_MODEL_OUTPUT';
    sandboxStatus: 'TRUSTED_LOCAL_PROCESS_NOT_PRODUCTION_SECURITY_SANDBOX';
  }>;
  sourceArtifacts: Readonly<{ sourceA: string; sourceB: string }>;
  generatedIsland: Readonly<{
    projectRange: { startFrame: 90; endFrame: 270 };
    programHash: string; sourceBundleHash: string; proxySha256: string;
    layout: {
      detectedPanelCount: 6; minimumPanelFillRatio: number; titleYellowPixels: number;
      titleYellowBounds: { left: number; right: number; top: number; bottom: number };
      sourcePanelTitleFootprintIntersectionPixels: number;
    };
    motion: { entryEdgeLumaDelta: number; exitEdgeLumaDelta: number };
    referenceAssetRendered: false;
  }>;
  nativeSurround: Readonly<{
    segments: readonly [
      { assetId: 'h03-a'; sourceStartFrame: 0; sourceEndFrame: 90 },
      { generatedProgramId: 'gcp-hold-03-six-window-v2r-1'; localStartFrame: 0; localEndFrame: 180 },
      { assetId: 'h03-a'; sourceStartFrame: 270; sourceEndFrame: 420 },
    ];
    sampledOutsideRangeMaxMeanAbsoluteRgbError: number;
    returnFrame270MeanAbsoluteRgbError: number;
    structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION';
  }>;
  outputArtifact: Readonly<{ sha256: string; bytes: number }>;
  video: Readonly<{ codec: string; width: number; height: number; averageFrameRate: string; decodedFrameCount: number; audioStreamCount: number }>;
  assessment: 'PASS_RESEARCH_RENDERED_HYBRID_PROXY'; stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH03HybridOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-03:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH03HybridProofReceiptV2R>> {
  const bound = bindSealedHoldoutProofInputV2R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-03'],
    allowedAssessments: ['READY_FOR_PROOF'],
    allowedExecutionForms: ['GENERATED_COMPOSITION', 'HYBRID'],
  });
  const generated = bound.trace.nodes.filter(({ executionDisposition, operatorKind }) =>
    executionDisposition === 'OK' && operatorKind === 'GENERATED_COMPOSITION');
  if (generated.length !== 1 || generated[0].selectedOperatorId !== 'generated_composition_program') {
    fail('SEALED_H03_PROOF_GENERATED_NODE_INVALID');
  }
  assertGeneratedArguments(generated[0].normalizedArguments);
  if (!['E1', 'E2', 'E3'].every((ref) => generated[0].executionEvidenceRefs.includes(ref))) {
    fail('SEALED_H03_PROOF_EVIDENCE_BINDING_INVALID');
  }
  const publicMedia = record(input.manifest.cases
    .find(({ caseId }) => caseId === input.caseId)?.publicCase).media;
  const sources = await bindSealedH03SourceArtifactsV2R({
    mediaManifest: input.mediaManifest,
    publicMedia,
  });
  const artifacts = buildSealedH03GeneratedProgramArtifactsV2R({
    sourceAArtifactSha256: sources.sourceA.artifactSha256,
    sourceBArtifactSha256: sources.sourceB.artifactSha256,
  });
  const programHash = hashCanonicalJsonV1(artifacts.program);
  const sourceBundleHash = hashGeneratedCompositionSourceBundleV1(artifacts.sourceBundle);
  const generatedReceipt = await renderTrustedGeneratedCompositionProxyV1({
    ...artifacts, expectedProgramHash: programHash, expectedSourceBundleHash: sourceBundleHash,
    materializedInputs: {
      assetPaths: {
        'h03-a': sources.sourceA.artifactPath,
        'h03-b': sources.sourceB.artifactPath,
      },
      fontPaths: { 'font-noto-sans-v27-regular': resolve(SEALED_H03_FONT_PATH_V2R) },
    },
  }, {
    workspaceRoot: resolve(input.outputDirectory, 'generated'),
    proofFrames: [0, 24, 90, 150, 179], includePlayableProxy: true,
  });
  const playable = generatedReceipt.playableProxy;
  if (!playable || playable.durationInFrames !== 180 || playable.width !== 1080
    || playable.height !== 1920 || playable.frameRate.numerator !== '30'
    || playable.frameRate.denominator !== '1') fail('SEALED_H03_PROOF_GENERATED_PROXY_INVALID');
  const mechanics = await executeSealedH03RenderedHybridMechanicsV2R({
    sources,
    generated: {
      programId: artifacts.program.programId,
      programHash,
      sourceBundleHash,
      playableProxyPath: playable.path,
      playableProxySha256: playable.sha256,
    },
    outputDirectory: resolve(input.outputDirectory, 'hybrid'),
    outputFilename: 'sealed-holdout-h03-hybrid-proxy.mp4',
    ffprobePath: input.ffprobePath,
  });
  if (mechanics.generatedIsland.programId !== 'gcp-hold-03-six-window-v2r-1') {
    fail('SEALED_H03_PROOF_PROGRAM_IDENTITY_DRIFT');
  }
  const material = {
    version: SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V2R,
    authority: 'RESEARCH_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-03' as const,
    manifestSha256: input.manifest.manifestSha256, publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    executionBoundary: {
      selectedOperationForm: 'GENERATED_COMPOSITION' as const,
      projectRangeForm: 'HYBRID_NATIVE_SURROUND_GENERATED_ISLAND' as const,
      generatedProgramSource: 'HUMAN_AUTHORED_FIXTURE_NOT_MODEL_OUTPUT' as const,
      sandboxStatus: 'TRUSTED_LOCAL_PROCESS_NOT_PRODUCTION_SECURITY_SANDBOX' as const,
    },
    sourceArtifacts: mechanics.sourceArtifacts,
    generatedIsland: {
      projectRange: mechanics.generatedIsland.projectRange,
      programHash: mechanics.generatedIsland.programHash,
      sourceBundleHash: mechanics.generatedIsland.sourceBundleHash,
      proxySha256: mechanics.generatedIsland.proxySha256,
      layout: mechanics.generatedIsland.layout,
      motion: mechanics.generatedIsland.motion,
      referenceAssetRendered: mechanics.generatedIsland.referenceAssetRendered,
    },
    nativeSurround: {
      segments: [
        { assetId: 'h03-a' as const, sourceStartFrame: 0 as const, sourceEndFrame: 90 as const },
        { generatedProgramId: 'gcp-hold-03-six-window-v2r-1' as const, localStartFrame: 0 as const, localEndFrame: 180 as const },
        { assetId: 'h03-a' as const, sourceStartFrame: 270 as const, sourceEndFrame: 420 as const },
      ] as const,
      sampledOutsideRangeMaxMeanAbsoluteRgbError:
        mechanics.nativeSurround.sampledOutsideRangeMaxMeanAbsoluteRgbError,
      returnFrame270MeanAbsoluteRgbError:
        mechanics.nativeSurround.returnFrame270MeanAbsoluteRgbError,
      structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION' as const,
    },
    outputArtifact: mechanics.outputArtifact,
    video: mechanics.video,
    assessment: 'PASS_RESEARCH_RENDERED_HYBRID_PROXY' as const, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertGeneratedArguments(args: Readonly<JsonRecord>): void {
  const target = record(args.targetRange);
  const assets = strings(args.assetIds);
  if (args.projectId !== 'oe-hold-03' || args.expectedProjectRevision !== 'R12'
    || target.startFrame !== 90 || target.endFrame !== 270
    || assets.length !== 2 || assets[0] !== 'h03-a' || assets[1] !== 'h03-b'
    || args.referenceBlueprintId !== 'HOLD-03-REFERENCE-BLUEPRINT-V2R-1') {
    fail('SEALED_H03_PROOF_GENERATED_ARGUMENTS_INVALID');
  }
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function fail(code: string): never { throw new Error(code); }
