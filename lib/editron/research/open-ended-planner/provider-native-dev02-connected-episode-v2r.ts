import path from 'node:path';

import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { executeConnectedDev02HybridMechanicsV2 } from './dev02-connected-hybrid-mechanics-v2';
import { compileDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-compiler-v2';
import { readDev02Stage4RoleSymbolsFromBlockedGraphV2 } from './dev02-stage4-role-resolver-v2';
import {
  materializeDev02GeneratedCompositionModelCandidateV1,
  type GeneratedCompositionModelRepairV1,
} from './generated-composition-model-candidate-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from './generated-composition-research-proxy-capability-v1';
import type { GeneratedCompositionProgramV1 } from './generated-composition-program-v1';
import {
  ProviderNativeDev02IsolatedSessionV2R,
} from './provider-native-dev02-session-v2r';
import {
  isProviderNativeProofGateEligibleV2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeRouteV2R, SerializedProviderNativeTurnV2R } from './provider-native-tool-codecs-v2r';
import {
  mapProviderNativeNonProofTerminalToProductOutcomeV2R,
  type ProviderNativeProductOutcomeV2R,
} from './provider-native-product-outcome-v2r';
import { compileStage4DeterministicBaselineV2 } from './stage4-deterministic-compiler-v2';
import { compileStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-compiler-v2';

type JsonRecord = Record<string, unknown>;
type Mechanics = typeof executeConnectedDev02HybridMechanicsV2;

export const PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_V2R_6' as const;

export interface ProviderNativeDev02GeneratedSourceV2R {
  source: string;
  modelId: string;
  promptHash: string;
  orchestratorSpecSha256: string;
  generationReceipt: Readonly<JsonRecord>;
}

export interface ProviderNativeDev02ConnectedReceiptV2R {
  version: typeof PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  execution: Readonly<JsonRecord>;
  productOutcome: ProviderNativeProductOutcomeV2R;
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runProviderNativeDev02ConnectedEpisodeV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  outputRoot: string;
  executionId: string;
  createdAt: string;
  generateSource: (request: Readonly<{
    route: Readonly<ProviderNativeRouteV2R>;
    arguments: Readonly<JsonRecord>;
    orchestratorSpecSha256: string;
    candidateOrdinal: 0 | 1;
    repair?: GeneratedCompositionModelRepairV1;
  }>) => Promise<Readonly<ProviderNativeDev02GeneratedSourceV2R>>;
  executeMechanics?: Mechanics;
}): Promise<Readonly<ProviderNativeDev02ConnectedReceiptV2R>> {
  let generatedExecution: JsonRecord | null = null;
  const mechanics = input.executeMechanics ?? executeConnectedDev02HybridMechanicsV2;
  const session = new ProviderNativeDev02IsolatedSessionV2R(
    input.context,
    async (args, turn) => {
      const result = await executeGenerated(args, turn, input, mechanics);
      if (result.execution.disposition === 'OK') generatedExecution = result.summary;
      return result.execution;
    },
  );
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route, context: input.context,
    eligibleOperatorIds: [
      'read_project_file', 'get_timeline_view', 'list_user_assets', 'search_user_assets',
      'inspect_user_asset', 'resolve_user_asset_overlay', 'add_overlay', 'update_overlay',
      'set_keyframes', 'reorder_layer', 'move_retime_overlay', 'generated_composition_program',
    ],
    invoke: input.invoke,
    executeIsolated: (call) => session.execute(call),
  });
  const snapshot = session.snapshot();
  const finalized = finalize(providerEpisode, snapshot, generatedExecution);
  const material = {
    version: PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    providerEpisode, execution: finalized.execution,
    productOutcome: finalized.productOutcome, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function executeGenerated(
  args: Readonly<JsonRecord>, turn: number,
  input: Parameters<typeof runProviderNativeDev02ConnectedEpisodeV2R>[0],
  mechanics: Mechanics,
): Promise<Readonly<{ execution: ProviderNativeToolExecutionV2R; summary: JsonRecord }>> {
  try { validateGeneratedArguments(args); }
  catch (error) { return failedExecution(error); }
  const orchestratorSpecSha256 = hashCanonicalJsonV1(args);
  let repair: GeneratedCompositionModelRepairV1 | undefined;
  let priorSource = '';
  const attempts: JsonRecord[] = [];
  for (const candidateOrdinal of [0, 1] as const) {
    try {
      const generated = await input.generateSource({
        route: input.route, arguments: args, orchestratorSpecSha256, candidateOrdinal,
        ...(repair ? { repair } : {}),
      });
      validateGeneratedSource(generated, orchestratorSpecSha256);
      priorSource = generated.source;
      const candidate = materializeDev02GeneratedCompositionModelCandidateV1({
        source: generated.source, modelId: generated.modelId,
        promptHash: generated.promptHash, candidateOrdinal,
      });
      const hybridGraph = compileHybridGraph(candidate.program, candidate.sourceBundle);
      const mechanicsResult = await mechanics({
        outputRoot: path.join(input.outputRoot, `turn-${turn}-candidate-${candidateOrdinal}`),
        runId: `${input.executionId}-turn-${turn}-candidate-${candidateOrdinal}`,
        createdAt: input.createdAt, hybridGraph,
      });
      const generationReceiptSha256 = hashCanonicalJsonV1(generated.generationReceipt);
      const summary = {
        candidateOrdinal, orchestratorSpecSha256,
        programHash: hashCanonicalJsonV1(candidate.program),
        sourceBundleHash: candidate.program.sourceBundleHash,
        generationReceiptSha256, mechanicsResult,
        attempts: [...attempts, { candidateOrdinal, disposition: 'PASS' }],
      };
      return {
        summary,
        execution: {
          authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
          output: {
            codeBundle: {
              programHash: summary.programHash, sourceBundleHash: summary.sourceBundleHash,
              modelId: generated.modelId, promptHash: generated.promptHash,
              orchestratorSpecSha256, generationReceiptSha256,
            },
            renderContract: {
              hybridStage6ReceiptHash: mechanicsResult.hybridStage6ReceiptHash,
              hybridVideoPath: mechanicsResult.hybridVideoPath,
              projectMutation: 'DENY',
            },
            cueMap: [],
            proofPlan: {
              sourceStage6ReceiptHash: mechanicsResult.sourceStage6ReceiptHash,
              hybridStage6ReceiptHash: mechanicsResult.hybridStage6ReceiptHash,
              diagnostics: mechanicsResult.diagnostics,
            },
          },
          evidenceIds: ['EV-DEV02-R1', 'EV-DEV02-S1', 'EV-DEV02-C1'],
        },
      };
    } catch (error) {
      const diagnostic = boundedError(error);
      attempts.push({ candidateOrdinal, disposition: 'FAIL', diagnostic });
      if (candidateOrdinal === 1 || !priorSource) return failedExecution(error, attempts);
      repair = { repairOrdinal: 1, failureStage: failureStage(error), diagnostics: [diagnostic], priorSource };
    }
  }
  return failedExecution(new Error('PROVIDER_NATIVE_DEV02_GENERATION_EXHAUSTED'), attempts);
}

function compileHybridGraph(
  sourceProgram: ReturnType<typeof materializeDev02GeneratedCompositionModelCandidateV1>['program'],
  sourceBundle: ReturnType<typeof materializeDev02GeneratedCompositionModelCandidateV1>['sourceBundle'],
): Readonly<JsonRecord> {
  const editorialIntent = canonicalEditorialIntentJson as unknown as JsonRecord;
  const evidenceBoundIntent = canonicalEvidenceBoundIntentJson as unknown as JsonRecord;
  const sourceCompilationSource = {
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
    editorialIntent,
    evidenceBoundIntent,
    evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  };
  const sourceBlockedGraph = compileStage4DeterministicBaselineV2(sourceCompilationSource);
  const roles = readDev02Stage4RoleSymbolsFromBlockedGraphV2(sourceBlockedGraph);
  const generatedIntent = records(editorialIntent.nodes)
    .find(({ intentNodeId }) => intentNodeId === roles.generatedIslandIntentNodeId);
  if (!generatedIntent) throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_INTENT_MISSING');
  const program = structuredClone(sourceProgram) as GeneratedCompositionProgramV1;
  program.projectBinding = {
    ...program.projectBinding,
    evidencePackHash: hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1),
  };
  program.referenceBinding = {
    ...program.referenceBinding,
    blueprintHash: hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1),
  };
  program.expectedMeasurementRefs = strings(generatedIntent.targetClaimIds);
  const islandGraph = compileStage4ResearchProxyPreviewV2({
    program, sourceBundle,
    evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
    sourceBlockedGraph, sourceCompilationSource,
  });
  return compileDev02HybridStage4GraphV2({
    islandGraph,
    islandEvaluationSource: { sourceBlockedGraph, sourceCompilationSource },
  });
}

function validateGeneratedArguments(args: Readonly<JsonRecord>): void {
  const range = record(args.targetRange);
  if (args.projectId !== 'oe-dev-02' || args.expectedProjectRevision !== 'R3') throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_IDENTITY_DRIFT');
  if (!sameSet(strings(args.assetIds), ['dev02-wide', 'dev02-close'])) throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_ASSET_SET_INVALID');
  if (range.startFrame !== 0 || range.endFrame !== 180) throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_RANGE_INVALID');
  if (args.referenceBlueprintId !== DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1.blueprintId) {
    throw new Error('PROVIDER_NATIVE_DEV02_BLUEPRINT_ID_INVALID');
  }
  for (const field of ['layoutSpec', 'motionSpec', 'typographySpec', 'constraints']) {
    if (!Object.keys(record(args[field])).length) throw new Error(`PROVIDER_NATIVE_DEV02_${field.toUpperCase()}_EMPTY`);
  }
  if (!sameSet(strings(args.evidenceIds), ['EV-DEV02-R1', 'EV-DEV02-S1', 'EV-DEV02-C1'])) throw new Error('PROVIDER_NATIVE_DEV02_EVIDENCE_SET_INVALID');
  if (Array.isArray(args.audioCueIntents) && args.audioCueIntents.length) throw new Error('PROVIDER_NATIVE_DEV02_AUDIO_EVIDENCE_UNAVAILABLE');
}

function validateGeneratedSource(value: Readonly<ProviderNativeDev02GeneratedSourceV2R>, specSha256: string): void {
  if (!value.source.trim() || !value.modelId.trim() || !isSha(value.promptHash)) throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_SOURCE_IDENTITY_INVALID');
  if (value.orchestratorSpecSha256 !== specSha256) throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_SPEC_BINDING_DRIFT');
}

function failedExecution(error: unknown, attempts: readonly JsonRecord[] = []): Readonly<{ execution: ProviderNativeToolExecutionV2R; summary: JsonRecord }> {
  const message = boundedError(error);
  return {
    summary: { disposition: 'FAIL', attempts },
    execution: {
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'FAIL',
      output: { code: message.split(':', 1)[0], message, details: { attempts } }, evidenceIds: [],
    },
  };
}

function finalize(episode: Readonly<ProviderNativeEpisodeReceiptV2R>, snapshot: ReturnType<ProviderNativeDev02IsolatedSessionV2R['snapshot']>, generated: JsonRecord | null): Readonly<{ execution: JsonRecord; productOutcome: ProviderNativeProductOutcomeV2R }> {
  const unsafe = snapshot.attemptedUnsafeSubstitutes;
  const stateUnchanged = snapshot.initialStateHash === snapshot.finalStateHash;
  const pass = isProviderNativeProofGateEligibleV2R(episode.terminal.disposition) && snapshot.generatedSucceeded
    && Boolean(generated) && !unsafe.length && stateUnchanged;
  const productOutcome: ProviderNativeProductOutcomeV2R = pass ? 'PASS'
    : mapProviderNativeNonProofTerminalToProductOutcomeV2R(episode.terminal.disposition);
  return deepFreezeV1({
    productOutcome,
    execution: {
      disposition: pass ? 'PASS' : 'FAIL',
      reasonCodes: pass ? ['MODEL_SELECTED_GENERATED_OWNER_AND_RENDER_PROOF_PASSED'] : [
        unsafe.length ? 'UNAUTHORIZED_NATIVE_SUBSTITUTE_ATTEMPTED' : 'GENERATED_EXECUTION_NOT_PROVEN',
      ],
      stateUnchanged, generated, session: snapshot,
    },
  });
}

function failureStage(error: unknown): GeneratedCompositionModelRepairV1['failureStage'] {
  const message = boundedError(error);
  return /PROGRAM|CONTRACT|SOURCE_/.test(message) ? 'CONTRACT_VERIFIER'
    : /PROOF|HARD_GATE|HYBRID_NOT_PASS/.test(message) ? 'RENDERED_HARD_GATE' : 'SANDBOX_RENDER';
}
function boundedError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'UNKNOWN_DEV02_ERROR'; }
function isSha(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry) => Object.keys(record(entry)).length > 0) as JsonRecord[] : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value) => right.includes(value)); }
