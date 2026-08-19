import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  lowerV2RBoundIntentGeneric,
  type GenericLoweringResultV2R,
} from './generic-lowerer-v2r';
import {
  assertV2RPreregistrationComplete,
  V2R_STAGE5_EXECUTION_DECISION_VERSION,
  type V2RPreregistrationManifest,
} from './v2r-preregistration-manifest';
import type {
  V2RConnectedEpisodeReceiptV2,
  V2RConnectedTaskV2,
} from './v2r-connected-episode-v2r';
import {
  evaluateV2RSemanticOperatorsV2R,
  type SemanticOperatorEvaluationV2R,
} from './v2r-semantic-operator-policy';
import {
  buildV2RStage6TaskAdapterRegistry,
  findV2RStage6TaskAdapter,
} from './v2r-stage6-task-adapter-registry';

type JsonRecord = Record<string, unknown>;
type GateDispositionV2R = 'PROCEED' | 'CAPABILITY_GAP' | 'UNVERIFIABLE' | 'FAIL';

export interface V2RStage5ExecutionDecisionV2R {
  receiptVersion: typeof V2R_STAGE5_EXECUTION_DECISION_VERSION;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  taskId: string;
  conditionId: string;
  disposition: GateDispositionV2R;
  reasonCode: string;
  preregistrationManifestSha256: string;
  connectedEpisodeReceiptHash: string;
  semanticEvaluationSha256: string | null;
  compiledGraphHash: string | null;
  stage6AdapterRegistrySha256: string;
  stage6AdapterId: string | null;
  diagnostics: readonly string[];
  executionAuthorization?: {
    scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY';
    projectMutation: 'DENY';
    fullProjectExecution: 'DENY';
  };
  receiptSha256: string;
}

export interface V2RStage5ExecutionGateResultV2R {
  decision: Readonly<V2RStage5ExecutionDecisionV2R>;
  semanticEvaluation: Readonly<SemanticOperatorEvaluationV2R> | null;
  lowering: Readonly<GenericLoweringResultV2R> | null;
}

export function decideV2RStage5ExecutionV2R(input: {
  manifest: unknown;
  task: V2RConnectedTaskV2;
  connectedEpisode: Readonly<V2RConnectedEpisodeReceiptV2>;
}): Readonly<V2RStage5ExecutionGateResultV2R> {
  const manifest = assertV2RPreregistrationComplete(input.manifest);
  const registry = buildV2RStage6TaskAdapterRegistry();
  const integrityDiagnostics = connectedIntegrityDiagnostics(input, manifest);
  if (integrityDiagnostics.length) {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'FAIL', reasonCode: 'CONNECTED_EPISODE_INTEGRITY_FAILED',
      diagnostics: integrityDiagnostics,
    }), null, null);
  }

  const editorialIntent = acceptedArtifact(input.connectedEpisode, 2);
  const evidenceBoundIntent = acceptedArtifact(input.connectedEpisode, 3);
  if (!editorialIntent || !evidenceBoundIntent) {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'UNVERIFIABLE', reasonCode: 'CONNECTED_EPISODE_INCOMPLETE',
      diagnostics: ['STAGE2_OR_STAGE3_ACCEPTED_ARTIFACT_MISSING'],
    }), null, null);
  }

  const stageDisposition = text(evidenceBoundIntent.stageDisposition);
  if (stageDisposition === 'CAPABILITY_GAP') {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'CAPABILITY_GAP', reasonCode: 'PREREGISTERED_CAPABILITY_GAP',
      diagnostics: ['STAGE3_CAPABILITY_GAP_EXECUTION_BLOCK'],
    }), null, null);
  }

  const semantic = evaluateV2RSemanticOperatorsV2R({
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    editorialIntent,
    evidenceBoundIntent,
  });
  if (semantic.disposition !== 'PASS') {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'FAIL', reasonCode: 'SEMANTIC_OPERATOR_POLICY_FAILED',
      semantic, diagnostics: semantic.diagnostics,
    }), semantic, null);
  }

  if (stageDisposition === 'UNVERIFIABLE') {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'UNVERIFIABLE', reasonCode: 'EVIDENCE_INSUFFICIENT', semantic,
      diagnostics: ['STAGE3_UNVERIFIABLE_EXECUTION_BLOCK'],
    }), semantic, null);
  }

  const lowering = lowerV2RBoundIntentGeneric({
    taskId: input.task.taskId,
    editorialIntent,
    evidenceBoundIntent,
    evidencePack: input.task.evidencePack,
    policy: input.task.loweringPolicy,
  });
  const loweringDiagnostics = connectedLoweringDiagnostics(input.connectedEpisode, lowering);
  if (loweringDiagnostics.length) {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'FAIL', reasonCode: 'CONNECTED_LOWERING_DRIFT', semantic,
      lowering, diagnostics: loweringDiagnostics,
    }), semantic, lowering);
  }

  const adapter = findV2RStage6TaskAdapter(input.task.taskId);
  const unsupported = adapter
    ? lowering.selectedOperatorIds.filter((operatorId) => !adapter.supportedOperatorIds.includes(operatorId))
    : lowering.selectedOperatorIds;
  if (!adapter || unsupported.length) {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'CAPABILITY_GAP', reasonCode: 'STAGE6_ADAPTER_COVERAGE_GAP',
      semantic, lowering,
      diagnostics: unsupported.map((operatorId) => `STAGE6_OPERATOR_UNSUPPORTED:${operatorId}`),
    }), semantic, lowering);
  }

  const compileReady = lowering.zeroAdd && lowering.zeroDrop
    && lowering.compiled.compileDisposition === 'COMPILED_RESEARCH_PROXY'
    && lowering.compiled.executionEligibility === 'RESEARCH_PROXY_ONLY'
    && lowering.diagnostics.length === 0;
  if (!compileReady) {
    return result(decision(input, manifest, registry.registrySha256, {
      disposition: 'FAIL', reasonCode: 'GENERIC_LOWERING_NOT_EXECUTABLE',
      semantic, lowering, diagnostics: lowering.diagnostics,
    }), semantic, lowering);
  }

  return result(decision(input, manifest, registry.registrySha256, {
    disposition: 'PROCEED', reasonCode: 'GENERIC_V2R_RESEARCH_PROXY_AUTHORIZED',
    semantic, lowering, adapterId: adapter.adapterId, diagnostics: [],
  }), semantic, lowering);
}

function connectedIntegrityDiagnostics(
  input: { task: V2RConnectedTaskV2; connectedEpisode: Readonly<V2RConnectedEpisodeReceiptV2> },
  manifest: Readonly<V2RPreregistrationManifest>,
): string[] {
  const receipt = input.connectedEpisode;
  const diagnostics: string[] = [];
  const { receiptHash, ...material } = receipt;
  if (hashCanonicalJsonV1(material) !== receiptHash) diagnostics.push('CONNECTED_RECEIPT_HASH_DRIFT');
  if (receipt.preregistrationManifestSha256 !== manifest.manifestSha256) diagnostics.push('CONNECTED_MANIFEST_HASH_DRIFT');
  if (receipt.taskId !== input.task.taskId || receipt.conditionId !== input.task.conditionId) diagnostics.push('CONNECTED_TASK_BINDING_DRIFT');
  if (receipt.stateEffects.length !== 0) diagnostics.push('CONNECTED_PROJECT_STATE_EFFECT_PRESENT');
  const evidenceBoundIntent = acceptedArtifact(receipt, 3);
  if (text(evidenceBoundIntent?.stageDisposition) === 'CAPABILITY_GAP') {
    if (receipt.finalDisposition !== 'CAPABILITY_GAP_BEFORE_LOWERING') {
      diagnostics.push('CONNECTED_CAPABILITY_GAP_DISPOSITION_DRIFT');
    }
    if (receipt.lowering.performed || receipt.lowering.compiledGraphHash !== null) {
      diagnostics.push('CONNECTED_CAPABILITY_GAP_WAS_LOWERED');
    }
  }
  return diagnostics;
}

function connectedLoweringDiagnostics(
  receipt: Readonly<V2RConnectedEpisodeReceiptV2>,
  lowering: Readonly<GenericLoweringResultV2R>,
): string[] {
  const connected = receipt.lowering;
  const diagnostics: string[] = [];
  if (receipt.finalDisposition !== 'STAGE3_LOWERED' || !connected.performed) diagnostics.push('CONNECTED_LOWERING_NOT_PERFORMED');
  if (connected.compiledGraphHash !== hashCanonicalJsonV1(lowering.compiled)) diagnostics.push('CONNECTED_COMPILED_GRAPH_HASH_DRIFT');
  if (connected.zeroAdd !== lowering.zeroAdd || connected.zeroDrop !== lowering.zeroDrop) diagnostics.push('CONNECTED_ZERO_ADD_DROP_DRIFT');
  if (connected.compileDisposition !== lowering.compiled.compileDisposition) diagnostics.push('CONNECTED_COMPILE_DISPOSITION_DRIFT');
  if (!same(connected.selectedOperatorIds, lowering.selectedOperatorIds)) diagnostics.push('CONNECTED_SELECTED_OPERATOR_DRIFT');
  if (!same(connected.compiledOperatorIds, lowering.compiledOperatorIds)) diagnostics.push('CONNECTED_COMPILED_OPERATOR_DRIFT');
  return diagnostics;
}

function acceptedArtifact(
  receipt: Readonly<V2RConnectedEpisodeReceiptV2>,
  stage: 2 | 3,
): JsonRecord | null {
  const run = receipt.rows.find((row) => row.stage === stage)?.providerRun;
  return run?.disposition === 'ARTIFACT_ACCEPTED' ? record(run.artifact) : null;
}

function decision(
  input: { task: V2RConnectedTaskV2; connectedEpisode: Readonly<V2RConnectedEpisodeReceiptV2> },
  manifest: Readonly<V2RPreregistrationManifest>,
  registrySha256: string,
  state: {
    disposition: GateDispositionV2R; reasonCode: string; diagnostics: readonly string[];
    semantic?: Readonly<SemanticOperatorEvaluationV2R>;
    lowering?: Readonly<GenericLoweringResultV2R>;
    adapterId?: string;
  },
): Readonly<V2RStage5ExecutionDecisionV2R> {
  const material = {
    receiptVersion: V2R_STAGE5_EXECUTION_DECISION_VERSION,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    taskId: input.task.taskId, conditionId: input.task.conditionId,
    disposition: state.disposition, reasonCode: state.reasonCode,
    preregistrationManifestSha256: manifest.manifestSha256,
    connectedEpisodeReceiptHash: input.connectedEpisode.receiptHash,
    semanticEvaluationSha256: state.semantic?.receiptSha256 ?? null,
    compiledGraphHash: state.lowering ? hashCanonicalJsonV1(state.lowering.compiled) : null,
    stage6AdapterRegistrySha256: registrySha256,
    stage6AdapterId: state.adapterId ?? null,
    diagnostics: [...state.diagnostics].sort(compareUtf16),
    ...(state.disposition === 'PROCEED' ? {
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY' as const,
        projectMutation: 'DENY' as const,
        fullProjectExecution: 'DENY' as const,
      },
    } : {}),
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function result(
  decisionValue: Readonly<V2RStage5ExecutionDecisionV2R>,
  semanticEvaluation: Readonly<SemanticOperatorEvaluationV2R> | null,
  lowering: Readonly<GenericLoweringResultV2R> | null,
): Readonly<V2RStage5ExecutionGateResultV2R> {
  return deepFreezeV1({ decision: decisionValue, semanticEvaluation, lowering });
}

function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
