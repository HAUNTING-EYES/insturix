import { hashCanonicalJsonV1 } from './contracts-v1';
import type { GeneratedCompositionProgramV1, GeneratedCompositionSourceBundleV1 } from './generated-composition-program-v1';
import {
  buildGeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxInlineInputV1,
} from './generated-composition-sandbox-contract-v1';
import {
  executeGeneratedCompositionInSandboxV1,
  type ExecuteGeneratedCompositionSandboxOptionsV1,
  type ExecuteGeneratedCompositionSandboxResultV1,
} from './generated-composition-sandbox-runner-v1';
import { evaluateStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';
import {
  buildStage6ResearchProxyExecutionReceiptV2,
  type Stage6ResearchProxyExecutionEvidenceV2,
} from './stage6-research-proxy-contract-v2';
import { evaluateStage6ResearchProxyExecutionV2 } from './stage6-research-proxy-evaluator-v2';

type JsonRecord = Record<string, unknown>;
type MaterializedInputV2 = Omit<GeneratedCompositionSandboxInlineInputV1, 'contentSha256' | 'byteLength' | 'encoding' | 'data'> & {
  bytes: Uint8Array;
};
type SandboxExecutorV2 = (
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
) => Promise<ExecuteGeneratedCompositionSandboxResultV1>;

export interface ExecuteStage6ResearchProxyPreviewInputV2 {
  graph: unknown;
  operatorId: string;
  executionId: string;
  createdAt: string;
  materializedInputs: readonly MaterializedInputV2[];
  sandboxEnvironment: { snapshotId: string; snapshotCommit: string };
  repoRoot?: string;
  sandboxExecutor?: SandboxExecutorV2;
}

export async function executeStage6ResearchProxyPreviewV2(
  input: ExecuteStage6ResearchProxyPreviewInputV2,
): Promise<Readonly<Stage6ResearchProxyExecutionEvidenceV2>> {
  const graph = record(input.graph);
  const stage4 = evaluateStage4ResearchProxyPreviewV2(graph);
  if (stage4.disposition !== 'PASS') throw new Error(`STAGE6_RESEARCH_PROXY_STAGE4_BLOCKED:${stage4.diagnostics.join(',')}`);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  if (stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') {
    throw new Error(`STAGE6_RESEARCH_PROXY_STAGE5_BLOCKED:${stage5.reasonCode}`);
  }
  const capability = record(graph.capabilityPromotion);
  const implementation = record(capability.implementation);
  if (input.sandboxEnvironment.snapshotId !== implementation.snapshotId
    || input.sandboxEnvironment.snapshotCommit !== implementation.snapshotCommit) {
    throw new Error('STAGE6_RESEARCH_PROXY_SANDBOX_IDENTITY_NOT_PROMOTED');
  }
  const bundle = record(graph.previewInputBundle);
  const program = bundle.program as unknown as GeneratedCompositionProgramV1;
  const sourceBundle = bundle.sourceBundle as unknown as GeneratedCompositionSourceBundleV1;
  const request = buildGeneratedCompositionSandboxRequestV1({
    executionId: input.executionId,
    createdAt: input.createdAt,
    appCommit: text(implementation.snapshotCommit),
    apiImplementationHash: text(implementation.apiImplementationHash),
    workerImplementationHash: text(implementation.workerImplementationHash),
    program,
    sourceBundle,
    evidencePack: bundle.evidencePack,
    referenceBlueprint: bundle.referenceBlueprint,
    supplementalFacts: bundle.supplementalFacts,
    proofFrames: [0, 24, 108, 144, 145, 179],
    inputs: input.materializedInputs,
    resources: {
      wallTimeMs: Math.min(program.resourceBudget.maxWallTimeMs, 180_000),
      maxCpuMs: Math.min(program.resourceBudget.maxCpuMs, 120_000),
      vcpus: 1,
      memoryMiB: 2_048,
      maxOutputBytes: Math.min(program.resourceBudget.maxOutputBytes, 64 * 1_024 * 1_024),
    },
  });
  const previewNodes = records(graph.nodes).filter((node) => node.operatorId === capability.operatorId);
  if (previewNodes.length !== 1) {
    throw new Error(`STAGE6_RESEARCH_PROXY_PREVIEW_NODE_AMBIGUOUS:${previewNodes.length}`);
  }
  const previewNode = previewNodes[0];
  const previewInputs = record(previewNode.inputs);
  if (request.programHash !== previewInputs.programHash || request.sourceBundleHash !== previewInputs.sourceBundleHash
    || hashCanonicalJsonV1(request.evidencePack) !== previewInputs.evidencePackHash
    || hashCanonicalJsonV1(request.referenceBlueprint) !== previewInputs.referenceBlueprintHash
    || hashCanonicalJsonV1(request.supplementalFacts) !== previewInputs.supplementalFactsHash) {
    throw new Error('STAGE6_RESEARCH_PROXY_REQUEST_GRAPH_DRIFT');
  }
  const sandboxExecutor = input.sandboxExecutor ?? executeGeneratedCompositionInSandboxV1;
  const executed = await sandboxExecutor({
    request,
    repoRoot: input.repoRoot,
    env: {
      MG_RENDER_SANDBOX_SNAPSHOT_ID: input.sandboxEnvironment.snapshotId,
      MG_RENDER_SANDBOX_APP_COMMIT: input.sandboxEnvironment.snapshotCommit,
    },
  });
  if (executed.workerResult.status !== 'RENDERED') throw new Error('STAGE6_RESEARCH_PROXY_SANDBOX_DID_NOT_RENDER');
  const receipt = buildStage6ResearchProxyExecutionReceiptV2({
    taskId: text(graph.taskId), operatorId: input.operatorId, stage4GraphHash: text(graph.graphHash),
    stage5DecisionHash: hashCanonicalJsonV1(stage5), projectId: text(graph.projectId),
    expectedProjectRevision: text(graph.expectedProjectRevision), request, hostReceipt: executed.receipt,
    workerResult: executed.workerResult,
  });
  const evidence: Stage6ResearchProxyExecutionEvidenceV2 = Object.freeze({
    receipt,
    sandboxRequest: request,
    sandboxHostReceipt: executed.receipt,
    workerResult: executed.workerResult,
    outputBytes: Object.freeze({ ...executed.outputBytes }),
  });
  const evaluation = evaluateStage6ResearchProxyExecutionV2({ graph, evidence });
  if (evaluation.disposition !== 'PASS') {
    throw new Error(`STAGE6_RESEARCH_PROXY_POSTCONDITION_FAILED:${evaluation.diagnostics.join(',')}`);
  }
  return evidence;
}

function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
