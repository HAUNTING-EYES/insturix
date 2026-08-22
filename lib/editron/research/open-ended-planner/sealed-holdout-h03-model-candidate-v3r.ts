import { deepFreezeV1, hashCanonicalJsonV1, sha256TextV1 } from './contracts-v1';
import {
  GENERATED_COMPOSITION_MODEL_API_SURFACE_V1,
  type GeneratedCompositionModelRepairV1,
} from './generated-composition-model-candidate-v1';
import {
  GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from './generated-composition-program-v1';
import {
  buildSealedH03GeneratedProgramArtifactsV2R,
} from './sealed-holdout-h03-generated-program-v2r';
import {
  SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R,
  SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
} from './sealed-holdout-h03-target-contract-v3r';
import type { HashedStagePacketV2, ProviderStagePacketV2 }
  from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const SEALED_H03_MODEL_SOURCE_CONTRACT_VERSION_V3R =
  'EDITRON_OE_SEALED_H03_MODEL_SOURCE_CONTRACT_V3R_1' as const;

export const SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R = deepFreezeV1({
  maxInputTokens: 40_000,
  maxVisibleOutputTokens: 14_000,
  maxReasoningTokens: 16_000,
  maxWallClockMs: 240_000,
  maxProviderCostUsd: 0.75,
});

export interface SealedH03ModelCandidateInputV3R {
  source: string;
  modelId: string;
  promptHash: string;
  candidateOrdinal: 0 | 1;
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
  orchestratorArguments: Readonly<JsonRecord>;
}

export function buildSealedH03GeneratedCompositionModelPacketV3R(input: {
  apiImplementationHash: string;
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
  orchestratorArguments: Readonly<JsonRecord>;
  repair?: GeneratedCompositionModelRepairV1;
}): Readonly<HashedStagePacketV2> {
  requireSha(input.apiImplementationHash, 'SEALED_H03_MODEL_API_HASH_INVALID');
  validateOrchestratorArguments(input.orchestratorArguments);
  if (input.repair) validateRepair(input.repair);
  const artifacts = buildModelBoundArtifacts({
    sourceAArtifactSha256: input.sourceAArtifactSha256,
    sourceBArtifactSha256: input.sourceBArtifactSha256,
  });
  const packet: ProviderStagePacketV2 = {
    packetVersion: 'EDITRON_OE_PROVIDER_STAGE_PACKET_V2',
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_OR_PROJECT_MUTATION',
    stage: 4,
    stageName: 'HOLD_03_GENERATED_COMPOSITION_SOURCE_SYNTHESIS',
    taskId: 'HOLD-03',
    conditionId: 'BASELINE',
    inputArm: 'TEXT_EVIDENCE_ONLY',
    executionFormArm: 'FORCED_GENERATED_COMPOSITION',
    instructions: [
      'Write the complete GeneratedComposition.tsx implementation against only the closed API surface.',
      'Implement the hash-bound public target and orchestrator operation; do not reproduce prose or emit Markdown fences.',
      'Do not use reference pixels as media and do not claim success; verifier, render gates and editor review decide it.',
      'Keep the complete UTF-8 TSX source within the declared one-file source budget.',
      'Return source code only in the outputContract source field.',
      ...(input.repair
        ? ['Repair only the supplied prior source against the bounded diagnostics; preserve already valid behavior.']
        : []),
    ],
    stageBudget: SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R,
    modelInput: {
      benchmarkContract: SEALED_H03_MODEL_SOURCE_CONTRACT_VERSION_V3R,
      publicReferenceTarget: SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R,
      targetBlueprint: artifacts.referenceBlueprint,
      evidencePack: artifacts.evidencePack,
      supplementalFacts: artifacts.supplementalFacts,
      programManifest: promptProgramManifest(artifacts.program),
      allowedApiSurface: GENERATED_COMPOSITION_MODEL_API_SURFACE_V1,
      apiImplementationHash: input.apiImplementationHash,
      orchestratorOperationRequest: {
        arguments: input.orchestratorArguments,
        argumentsSha256: hashCanonicalJsonV1(input.orchestratorArguments),
      },
      renderedAcceptanceContract: {
        contractId: 'EDITRON_OE_SEALED_H03_RENDERED_ACCEPTANCE_V3R_1',
        requiredLocalFrames: [0, 24, 90, 150, 179],
        requiredProjectContinuityFrames: [0, 89, 270, 419],
        requiredClaims: [
          'six-filled-panels',
          'title-inside-safe-band',
          'zero-panel-title-footprint-intersection',
          'bounded-entry-and-exit-motion',
          'native-frame-270-return',
          'reference-asset-excluded',
        ],
      },
      sourceAcceptanceContract: {
        maxSourceBytes: artifacts.program.resourceBudget.maxSourceBytes,
        encoding: 'UTF-8',
        fileCount: artifacts.program.resourceBudget.maxSourceFiles,
      },
      ...(input.repair ? { repair: input.repair } : {}),
    },
    outputContract: {
      type: 'object',
      required: ['artifactType', 'taskId', 'source'],
      properties: {
        artifactType: { const: 'GeneratedCompositionSourceCandidateV1' },
        taskId: { const: 'HOLD-03' },
        source: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  };
  const transportAttachments: [] = [];
  return deepFreezeV1({
    packet: deepFreezeV1(packet),
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments,
    transportHash: hashCanonicalJsonV1(transportAttachments),
  });
}

export function materializeSealedH03GeneratedCompositionModelCandidateV3R(
  input: SealedH03ModelCandidateInputV3R,
): Readonly<{
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: Readonly<JsonRecord>;
  referenceBlueprint: Readonly<JsonRecord>;
  supplementalFacts: readonly Readonly<JsonRecord>[];
}> {
  validateOrchestratorArguments(input.orchestratorArguments);
  if (!input.source.trim()) fail('SEALED_H03_MODEL_SOURCE_EMPTY');
  if (!input.modelId.trim()) fail('SEALED_H03_MODEL_IDENTITY_MISSING');
  requireSha(input.promptHash, 'SEALED_H03_MODEL_PROMPT_HASH_INVALID');
  const artifacts = buildModelBoundArtifacts({
    sourceAArtifactSha256: input.sourceAArtifactSha256,
    sourceBArtifactSha256: input.sourceBArtifactSha256,
  });
  if (Buffer.byteLength(input.source, 'utf8') > artifacts.program.resourceBudget.maxSourceBytes) {
    fail('SEALED_H03_MODEL_SOURCE_TOO_LARGE');
  }
  const sourceBundle: GeneratedCompositionSourceBundleV1 = {
    bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
    entryFile: 'GeneratedComposition.tsx',
    files: [{
      path: 'GeneratedComposition.tsx',
      sha256: sha256TextV1(input.source),
      source: input.source,
    }],
  };
  const program = structuredClone(artifacts.program) as GeneratedCompositionProgramV1;
  const programId = `gcp-hold-03-model-${sha256TextV1(
    `${input.modelId}:${input.candidateOrdinal}:${input.source}`,
  ).slice(0, 16)}`;
  program.programId = programId;
  program.sourceBundleHash = hashGeneratedCompositionSourceBundleV1(sourceBundle);
  program.generator = {
    kind: 'MODEL_GENERATED',
    modelId: input.modelId,
    promptHash: input.promptHash,
    toolVersions: [
      'typescript@5.9.3',
      'remotion@4.0.509',
      '@editron/generated-composition-api/v1',
    ],
  };
  program.compositionTimebase = {
    ...program.compositionTimebase,
    timebaseId: `${programId}:local`,
  };
  return deepFreezeV1({
    program,
    sourceBundle,
    evidencePack: artifacts.evidencePack,
    referenceBlueprint: artifacts.referenceBlueprint,
    supplementalFacts: artifacts.supplementalFacts,
  });
}

function buildModelBoundArtifacts(input: {
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
}) {
  const historical = buildSealedH03GeneratedProgramArtifactsV2R(input);
  const referenceBlueprint = deepFreezeV1({
    blueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    taskId: 'HOLD-03',
    publicTargetContractSha256: SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R.contractSha256,
    targetClaims: [
      { claimId: 'claim-h03-six-asymmetric-windows', disposition: 'MUST' },
      { claimId: 'claim-h03-centred-title-safe-band', disposition: 'MUST' },
      { claimId: 'claim-h03-bounded-entry-exit', disposition: 'MUST' },
      { claimId: 'claim-h03-native-return-frame-270', disposition: 'MUST' },
      { claimId: 'claim-h03-reference-is-evidence-only', disposition: 'MUST_NOT_RENDER' },
    ],
  });
  const program = structuredClone(historical.program) as GeneratedCompositionProgramV1;
  program.referenceBinding = {
    blueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    blueprintHash: hashCanonicalJsonV1(referenceBlueprint),
  };
  program.expectedMeasurementRefs = (referenceBlueprint.targetClaims)
    .map(({ claimId }) => claimId);
  return deepFreezeV1({
    evidencePack: historical.evidencePack,
    referenceBlueprint,
    supplementalFacts: historical.supplementalFacts,
    program,
  });
}

function promptProgramManifest(program: Readonly<GeneratedCompositionProgramV1>): JsonRecord {
  const manifest = structuredClone(program) as unknown as JsonRecord;
  delete manifest.sourceBundleHash;
  delete manifest.generator;
  return manifest;
}

function validateOrchestratorArguments(args: Readonly<JsonRecord>): void {
  const target = record(args.targetRange);
  const layout = record(args.layoutSpec);
  const motion = record(args.motionSpec);
  const typography = record(args.typographySpec);
  const constraints = record(args.constraints);
  const returnBinding = record(constraints.returnBinding);
  if (args.projectId !== 'oe-hold-03' || args.expectedProjectRevision !== 'R12'
    || target.startFrame !== 90 || target.endFrame !== 270
    || !sameSet(strings(args.assetIds), ['h03-a', 'h03-b'])
    || args.referenceBlueprintId !== SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R
    || layout.panelCount !== 6 || layout.geometry !== 'ASYMMETRIC_NORMALIZED_BOUNDS'
    || layout.gutters !== true
    || hashCanonicalJsonV1(layout.titleSafeBand)
      !== hashCanonicalJsonV1({ left: 0.15, top: 0.43, width: 0.70, height: 0.14 })
    || hashCanonicalJsonV1(motion.entryFrames) !== hashCanonicalJsonV1([0, 24])
    || hashCanonicalJsonV1(motion.stableFrames) !== hashCanonicalJsonV1([24, 150])
    || hashCanonicalJsonV1(motion.exitFrames) !== hashCanonicalJsonV1([150, 180])
    || motion.relationship !== 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE'
    || typography.text !== 'EVENT\nMOMENT' || typography.alignment !== 'CENTER'
    || typography.fontAssetId !== 'font-noto-sans-v27-regular'
    || constraints.referencePixelsForbidden !== true
    || constraints.preserveOutsideRange !== true
    || constraints.titleFaceOverlapMaximumPixels !== 0
    || hashCanonicalJsonV1(returnBinding)
      !== hashCanonicalJsonV1({ overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 })
    || !sameSet(strings(args.evidenceIds), ['E1', 'E2', 'E3'])) {
    fail('SEALED_H03_MODEL_ORCHESTRATOR_ARGUMENTS_INVALID');
  }
}

function validateRepair(repair: GeneratedCompositionModelRepairV1): void {
  if (repair.repairOrdinal !== 1 || !repair.priorSource.trim()
    || repair.diagnostics.length < 1 || repair.diagnostics.length > 64
    || repair.diagnostics.some((value) => !value.trim() || value.length > 500)
    || Buffer.byteLength(repair.priorSource, 'utf8') > 64 * 1024) {
    fail('SEALED_H03_MODEL_REPAIR_INVALID');
  }
}
function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function fail(code: string): never { throw new Error(code); }
