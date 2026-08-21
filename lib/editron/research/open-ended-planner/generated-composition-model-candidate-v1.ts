import { deepFreezeV1, hashCanonicalJsonV1, sha256TextV1 } from './contracts-v1';
import {
  GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from './generated-composition-program-v1';
import { DEV02_GENERATED_SOURCE_ACCEPTANCE_CONTRACT_V1 } from './generated-composition-dev02-rendered-proof-v1';
import type { HashedStagePacketV2, ProviderStagePacketV2 } from './staged-packet-v2';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

type JsonRecord = Record<string, unknown>;

export interface GeneratedCompositionModelRepairV1 {
  repairOrdinal: 1;
  failureStage: 'CONTRACT_VERIFIER' | 'SANDBOX_RENDER' | 'RENDERED_HARD_GATE';
  diagnostics: readonly string[];
  priorSource: string;
}

export interface MaterializeGeneratedCompositionModelCandidateInputV1 {
  source: string;
  modelId: string;
  promptHash: string;
  candidateOrdinal: 0 | 1;
}

export interface Dev02HostExecutionPolicyAmendmentV1 {
  artifactType: 'Dev02HostExecutionPolicyAmendmentV1';
  policyId: 'DEV02_PLAYABLE_PROXY_BUDGET_CORRECTION_V1';
  reason: 'HOST_FIXTURE_BUDGET_UNDERCALIBRATED_NOT_MODEL_AUTHORED';
  changedPaths: readonly ['resourceBudget.maxCpuMs', 'resourceBudget.maxWallTimeMs'];
  sourceProgramHash: string;
  executionProgramHash: string;
  sourceBudget: GeneratedCompositionProgramV1['resourceBudget'];
  executionBudget: GeneratedCompositionProgramV1['resourceBudget'];
  stateEffects: readonly [];
  amendmentHash: string;
}

const API_SURFACE_V1 = deepFreezeV1({
  module: '@editron/generated-composition-api/v1',
  imports: {
    remotion: ['interpolate', 'useCurrentFrame', 'useVideoConfig'],
    generatedApi: ['AssetSlot', 'CompositionStage', 'Panel', 'TextSlot', 'useCompositionParameter'],
  },
  signatures: {
    CompositionStage: '{ background: string; gutter: number; children }',
    Panel: "{ layerId; column: 'left'|'centre'|'right'; row: 'top'|'centre'|'bottom'; translateY; entryScale?; takeoverProgress?: 0..1; children }",
    AssetSlot: "{ slotId; sourceFrame: integer inside declared absolute source range; crop: 'portrait-left'|'centre'|'portrait-right' }",
    TextSlot: '{ slotId; fontSlotId; parameterId; value; color; size; fixedToCanvas?; visibleUntilFrame? }',
    useCompositionParameter: 'useCompositionParameter<string|number>(literalParameterId)',
  },
  runtimeRules: [
    'Export exactly one React component named GeneratedComposition.',
    'Use every declared layer, source slot, font slot, text slot, and exposed parameter at least once.',
    'All identity arguments must be string literals matching the manifest.',
    'Use only declared imports; no network, filesystem, timers, randomness, dates, dynamic imports, or project state.',
    'The composition has 180 local frames: build 0-107, settled hold 108-144, release 145-179.',
    'Source frames are absolute in each slot range, not composition-relative aliases.',
  ],
});

export function buildDev02GeneratedCompositionModelPacketV1(input: {
  apiImplementationHash: string;
  repair?: GeneratedCompositionModelRepairV1;
  orchestratorSpec?: Readonly<JsonRecord>;
}): Readonly<HashedStagePacketV2> {
  if (!/^[a-f0-9]{64}$/.test(input.apiImplementationHash)) throw new Error('MODEL_PACKET_API_HASH_INVALID');
  if (input.repair) validateRepair(input.repair);
  if (input.orchestratorSpec && !Object.keys(input.orchestratorSpec).length) {
    throw new Error('MODEL_PACKET_ORCHESTRATOR_SPEC_EMPTY');
  }
  const orchestratorSpec = input.orchestratorSpec
    ? structuredClone(input.orchestratorSpec)
    : undefined;
  const packet: ProviderStagePacketV2 = {
    packetVersion: 'EDITRON_OE_PROVIDER_STAGE_PACKET_V2',
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_OR_PROJECT_MUTATION',
    stage: 4,
    stageName: 'STAGE_6_GENERATED_COMPOSITION_SOURCE_SYNTHESIS_USING_STAGE4_TRANSPORT',
    taskId: 'DEV-02',
    conditionId: 'BASELINE',
    inputArm: 'TEXT_EVIDENCE_ONLY',
    executionFormArm: 'FORCED_GENERATED_COMPOSITION',
    instructions: [
      'Write the complete GeneratedComposition.tsx implementation against only the closed API surface.',
      'Satisfy the target blueprint and program manifest; do not reproduce prose or emit Markdown fences.',
      'Do not claim success: the host verifier, deny-all render, rendered hard gates, and editor review decide it.',
      'Treat renderedAcceptanceContract as the declared tests for this operation; satisfy them without copying or gaming a known implementation.',
      'Keep the complete UTF-8 TSX source at or below sourceAcceptanceContract.maxSourceBytes.',
      'Return source code only in the outputContract source field.',
      ...(input.repair ? ['Repair only the supplied prior source against the bounded diagnostics; preserve already valid behavior.'] : []),
    ],
    stageBudget: {
      maxInputTokens: 40_000,
      maxVisibleOutputTokens: 14_000,
      maxReasoningTokens: 16_000,
      maxWallClockMs: 240_000,
      maxProviderCostUsd: 0.75,
    },
    modelInput: {
      benchmarkContract: 'EDITRON_DEV02_MODEL_GENERATED_SOURCE_V2',
      targetBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1 as unknown as JsonRecord,
      evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1 as unknown as JsonRecord,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1 as unknown as JsonRecord[],
      programManifest: promptProgramManifest(),
      allowedApiSurface: API_SURFACE_V1,
      apiImplementationHash: input.apiImplementationHash,
      renderedAcceptanceContract: DEV02_GENERATED_SOURCE_ACCEPTANCE_CONTRACT_V1,
      sourceAcceptanceContract: {
        maxSourceBytes: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxSourceBytes,
        encoding: 'UTF-8',
        fileCount: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxSourceFiles,
      },
      ...(orchestratorSpec ? {
        orchestratorOperationRequest: {
          arguments: orchestratorSpec,
          argumentsSha256: hashCanonicalJsonV1(orchestratorSpec),
        },
      } : {}),
      ...(input.repair ? { repair: input.repair } : {}),
    },
    outputContract: {
      type: 'object',
      required: ['artifactType', 'taskId', 'source'],
      properties: {
        artifactType: { const: 'GeneratedCompositionSourceCandidateV1' },
        taskId: { const: 'DEV-02' },
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

export function materializeDev02GeneratedCompositionModelCandidateV1(
  input: MaterializeGeneratedCompositionModelCandidateInputV1,
): Readonly<{ program: GeneratedCompositionProgramV1; sourceBundle: GeneratedCompositionSourceBundleV1 }> {
  const source = input.source;
  if (!source.trim()) throw new Error('MODEL_CANDIDATE_SOURCE_EMPTY');
  if (Buffer.byteLength(source, 'utf8') > DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxSourceBytes) {
    throw new Error('MODEL_CANDIDATE_SOURCE_TOO_LARGE');
  }
  if (!input.modelId.trim()) throw new Error('MODEL_CANDIDATE_IDENTITY_MISSING');
  if (!/^[a-f0-9]{64}$/.test(input.promptHash)) throw new Error('MODEL_CANDIDATE_PROMPT_HASH_INVALID');
  const sourceBundle: GeneratedCompositionSourceBundleV1 = {
    bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
    entryFile: 'GeneratedComposition.tsx',
    files: [{ path: 'GeneratedComposition.tsx', sha256: sha256TextV1(source), source }],
  };
  const program = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) as GeneratedCompositionProgramV1;
  program.programId = `gcp-dev02-model-${sha256TextV1(`${input.modelId}:${input.candidateOrdinal}:${source}`).slice(0, 16)}`;
  program.sourceBundleHash = hashGeneratedCompositionSourceBundleV1(sourceBundle);
  program.generator = {
    kind: 'MODEL_GENERATED', modelId: input.modelId, promptHash: input.promptHash,
    toolVersions: ['typescript@5.9.3', 'remotion@4.0.509', '@editron/generated-composition-api/v1'],
  };
  return deepFreezeV1({ program, sourceBundle });
}

export function applyDev02HostExecutionPolicyCorrectionV1(input: {
  sourceProgram: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  candidateOrdinal: 0 | 1;
}): Readonly<{
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  amendment: Dev02HostExecutionPolicyAmendmentV1;
}> {
  const { sourceProgram, sourceBundle } = input;
  if (sourceProgram.generator.kind !== 'MODEL_GENERATED') throw new Error('DEV02_HOST_POLICY_SOURCE_NOT_MODEL_GENERATED');
  const expectedSourceBudget = {
    ...DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget,
    maxCpuMs: 60_000,
    maxWallTimeMs: 90_000,
  };
  if (hashCanonicalJsonV1(sourceProgram.resourceBudget) !== hashCanonicalJsonV1(expectedSourceBudget)) {
    throw new Error('DEV02_HOST_POLICY_SOURCE_BUDGET_MISMATCH');
  }
  if (hashGeneratedCompositionSourceBundleV1(sourceBundle) !== sourceProgram.sourceBundleHash) {
    throw new Error('DEV02_HOST_POLICY_SOURCE_BUNDLE_MISMATCH');
  }
  const entry = sourceBundle.files.find(({ path }) => path === sourceBundle.entryFile);
  if (!entry) throw new Error('DEV02_HOST_POLICY_ENTRY_SOURCE_MISSING');
  const execution = materializeDev02GeneratedCompositionModelCandidateV1({
    source: entry.source,
    modelId: sourceProgram.generator.modelId,
    promptHash: sourceProgram.generator.promptHash,
    candidateOrdinal: input.candidateOrdinal,
  });
  const expectedExecutionProgram = structuredClone(sourceProgram);
  expectedExecutionProgram.resourceBudget = structuredClone(execution.program.resourceBudget);
  if (hashCanonicalJsonV1(expectedExecutionProgram) !== hashCanonicalJsonV1(execution.program)) {
    throw new Error('DEV02_HOST_POLICY_NON_BUDGET_DRIFT');
  }
  if (hashCanonicalJsonV1(sourceBundle) !== hashCanonicalJsonV1(execution.sourceBundle)) {
    throw new Error('DEV02_HOST_POLICY_SOURCE_BUNDLE_DRIFT');
  }
  const material = {
    artifactType: 'Dev02HostExecutionPolicyAmendmentV1' as const,
    policyId: 'DEV02_PLAYABLE_PROXY_BUDGET_CORRECTION_V1' as const,
    reason: 'HOST_FIXTURE_BUDGET_UNDERCALIBRATED_NOT_MODEL_AUTHORED' as const,
    changedPaths: ['resourceBudget.maxCpuMs', 'resourceBudget.maxWallTimeMs'] as const,
    sourceProgramHash: hashCanonicalJsonV1(sourceProgram),
    executionProgramHash: hashCanonicalJsonV1(execution.program),
    sourceBudget: sourceProgram.resourceBudget,
    executionBudget: execution.program.resourceBudget,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...execution, amendment: { ...material, amendmentHash: hashCanonicalJsonV1(material) } });
}

function promptProgramManifest(): JsonRecord {
  const manifest = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) as unknown as JsonRecord;
  delete manifest.sourceBundleHash;
  delete manifest.generator;
  return manifest;
}

function validateRepair(repair: GeneratedCompositionModelRepairV1): void {
  if (repair.repairOrdinal !== 1 || !repair.priorSource.trim()) throw new Error('MODEL_REPAIR_INVALID');
  if (!repair.diagnostics.length || repair.diagnostics.length > 64
    || repair.diagnostics.some((value) => !value.trim() || value.length > 500)) {
    throw new Error('MODEL_REPAIR_DIAGNOSTICS_INVALID');
  }
  if (Buffer.byteLength(repair.priorSource, 'utf8') > DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxSourceBytes) {
    throw new Error('MODEL_REPAIR_SOURCE_TOO_LARGE');
  }
}
