import { createHash } from 'node:crypto';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  parseGeneratedCompositionSandboxRequestV1,
  parseGeneratedCompositionSandboxWorkerResultV1,
} from './generated-composition-sandbox-contract-v1';
import { evaluateStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';
import {
  hasValidStage6ResearchProxyReceiptHashV2,
  type Stage6ResearchProxyExecutionEvidenceV2,
} from './stage6-research-proxy-contract-v2';

type JsonRecord = Record<string, unknown>;
type DimensionV2 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Stage6ResearchProxyEvaluationV2 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  stageAuthorization: DimensionV2;
  requestBinding: DimensionV2;
  sandboxAttestation: DimensionV2;
  outputMaterialization: DimensionV2;
  projectIsolation: DimensionV2;
  receiptIntegrity: DimensionV2;
  diagnostics: readonly string[];
}

export function evaluateStage6ResearchProxyExecutionV2(input: {
  graph: unknown;
  evidence: unknown;
}): Readonly<Stage6ResearchProxyEvaluationV2> {
  const graph = record(input.graph);
  const evidence = record(input.evidence) as unknown as Stage6ResearchProxyExecutionEvidenceV2;
  if (!Object.keys(graph).length || !isRecord(evidence) || !isRecord(evidence.receipt)) return emptyEvaluation();
  const diagnostics: string[] = [];
  const stage4 = evaluateStage4ResearchProxyPreviewV2(graph);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  if (stage4.disposition !== 'PASS' || stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') diagnostics.push('STAGE_AUTHORIZATION_INVALID');

  let request: ReturnType<typeof parseGeneratedCompositionSandboxRequestV1> | undefined;
  let worker: ReturnType<typeof parseGeneratedCompositionSandboxWorkerResultV1> | undefined;
  try { request = parseGeneratedCompositionSandboxRequestV1(evidence.sandboxRequest); }
  catch { diagnostics.push('REQUEST_BINDING_REQUEST_INVALID'); }
  try { worker = parseGeneratedCompositionSandboxWorkerResultV1(evidence.workerResult); }
  catch { diagnostics.push('SANDBOX_ATTESTATION_WORKER_RESULT_INVALID'); }
  const receipt = record(evidence.receipt);
  const host = record(evidence.sandboxHostReceipt);
  const capability = record(graph.capabilityPromotion);
  const implementation = record(capability.implementation);
  const previewNode = records(graph.nodes).find((node) => node.operatorId === capability.operatorId) ?? {};
  const previewInputs = record(previewNode.inputs);
  if (request && (request.programHash !== previewInputs.programHash
    || request.sourceBundleHash !== previewInputs.sourceBundleHash
    || hashCanonicalJsonV1(request.evidencePack) !== previewInputs.evidencePackHash
    || hashCanonicalJsonV1(request.referenceBlueprint) !== previewInputs.referenceBlueprintHash
    || hashCanonicalJsonV1(request.supplementalFacts) !== previewInputs.supplementalFactsHash
    || request.apiImplementationHash !== implementation.apiImplementationHash
    || request.workerImplementationHash !== implementation.workerImplementationHash
    || request.appCommit !== implementation.snapshotCommit)) diagnostics.push('REQUEST_BINDING_GRAPH_OR_IMPLEMENTATION_DRIFT');
  if (request && (request.policy.network !== 'DENY_ALL' || request.policy.environment !== 'EMPTY'
    || request.policy.secrets !== 'NONE' || request.policy.database !== 'DENY'
    || request.policy.projectMutation !== 'DENY' || request.policy.persistent || request.stateEffects.length)) {
    diagnostics.push('PROJECT_ISOLATION_REQUEST_POLICY_DRIFT');
  }

  const hostUnsigned = { ...host }; delete hostUnsigned.receiptHash;
  if (host.receiptHash !== hashCanonicalJsonV1(hostUnsigned)
    || host.snapshotId !== implementation.snapshotId || host.appCommit !== implementation.snapshotCommit
    || host.workerImplementationHash !== implementation.workerImplementationHash
    || host.networkPolicy !== 'DENY_ALL' || host.persistent !== false || host.sandboxDeleted !== true
    || record(host.proof).productionSandbox !== 'PASS' || record(host.proof).outputMaterialization !== 'PASS'
    || record(host.proof).projectMutation !== 'NONE' || strings(host.stateEffects).length) {
    diagnostics.push('SANDBOX_ATTESTATION_HOST_RECEIPT_DRIFT');
  }
  if (request && worker && (worker.status !== 'RENDERED' || host.requestId !== request.requestId
    || host.requestHash !== hashCanonicalJsonV1(request) || host.resultHash !== hashCanonicalJsonV1(worker)
    || worker.requestId !== request.requestId || worker.executionId !== request.executionId
    || worker.programHash !== request.programHash || worker.sourceBundleHash !== request.sourceBundleHash
    || host.proxyReceiptHash !== (worker.status === 'RENDERED' ? worker.proxyReceiptHash : '')
    || strings(worker.stateEffects).length)) diagnostics.push('SANDBOX_ATTESTATION_EXECUTION_IDENTITY_DRIFT');

  const outputs = records(host.outputs);
  const bytes = isRecord(evidence.outputBytes) ? evidence.outputBytes : {};
  const expectedPaths = new Set(outputs.map((output) => text(output.path)));
  if (Object.keys(bytes).length !== expectedPaths.size || Object.keys(bytes).some((path) => !expectedPaths.has(path))) {
    diagnostics.push('OUTPUT_MATERIALIZATION_SET_DRIFT');
  }
  for (const output of outputs) {
    const outputPath = text(output.path); const value = bytes[outputPath];
    if (!(value instanceof Uint8Array) || value.byteLength !== Number(output.byteLength)
      || sha256(value) !== output.contentSha256 || !request
      || !outputPath.startsWith(`/tmp/editron-gcp/${request.requestId}/`) || outputPath.includes('..')) {
      diagnostics.push(`OUTPUT_MATERIALIZATION_HASH_OR_PATH_DRIFT:${outputPath || 'missing'}`);
    }
  }
  if (worker && worker.status === 'RENDERED'
    && hashCanonicalJsonV1(outputs) !== hashCanonicalJsonV1(worker.outputs)) diagnostics.push('OUTPUT_MATERIALIZATION_WORKER_SET_DRIFT');
  validateProxyReceiptOutput(outputs, bytes, request, diagnostics);

  if (!hasValidStage6ResearchProxyReceiptHashV2(receipt)
    || receipt.stage4GraphHash !== graph.graphHash
    || receipt.stage5DecisionHash !== hashCanonicalJsonV1(stage5)
    || receipt.requestHash !== host.requestHash || receipt.requestId !== host.requestId
    || receipt.programHash !== request?.programHash || receipt.sourceBundleHash !== request?.sourceBundleHash
    || record(receipt.sandboxBinding).hostReceiptHash !== host.receiptHash
    || record(receipt.sandboxBinding).workerResultHash !== host.resultHash
    || hashCanonicalJsonV1(receipt.outputBindings) !== hashCanonicalJsonV1(outputs)) {
    diagnostics.push('RECEIPT_INTEGRITY_BINDING_DRIFT');
  }
  const projectBinding = record(receipt.projectBinding); const proof = record(receipt.proof);
  if (projectBinding.projectId !== graph.projectId || projectBinding.expectedProjectRevision !== graph.expectedProjectRevision
    || projectBinding.revisionDisposition !== 'NOT_READ_OR_MUTATED' || strings(projectBinding.changedProjectPaths).length
    || proof.projectMutation !== 'NONE' || receipt.fullProjectExecutionEligibility !== 'NOT_EXECUTABLE'
    || strings(receipt.stateEffects).length) diagnostics.push('PROJECT_ISOLATION_RECEIPT_DRIFT');

  const stageAuthorization = dimension(diagnostics, /^STAGE_AUTHORIZATION_/);
  const requestBinding = dimension(diagnostics, /^REQUEST_BINDING_/);
  const sandboxAttestation = dimension(diagnostics, /^SANDBOX_ATTESTATION_/);
  const outputMaterialization = dimension(diagnostics, /^OUTPUT_MATERIALIZATION_/);
  const projectIsolation = dimension(diagnostics, /^PROJECT_ISOLATION_/);
  const receiptIntegrity = dimension(diagnostics, /^RECEIPT_INTEGRITY_/);
  const dimensions = [stageAuthorization, requestBinding, sandboxAttestation, outputMaterialization, projectIsolation, receiptIntegrity];
  return deepFreezeV1({
    disposition: dimensions.includes('FAIL') ? 'FAIL' : 'PASS', stageAuthorization, requestBinding,
    sandboxAttestation, outputMaterialization, projectIsolation, receiptIntegrity,
    diagnostics: unique(diagnostics).sort(compareUtf16),
  });
}

function validateProxyReceiptOutput(
  outputs: JsonRecord[], bytes: Record<string, unknown>, request: ReturnType<typeof parseGeneratedCompositionSandboxRequestV1> | undefined,
  diagnostics: string[],
): void {
  const receiptOutputs = outputs.filter((output) => output.kind === 'PROXY_RECEIPT');
  if (receiptOutputs.length !== 1 || !request) { diagnostics.push('OUTPUT_MATERIALIZATION_PROXY_RECEIPT_MISSING'); return; }
  const value = bytes[text(receiptOutputs[0].path)];
  try {
    const parsed = JSON.parse(Buffer.from(value as Uint8Array).toString('utf8')) as JsonRecord;
    const receiptHash = text(parsed.receiptHash); const unsigned = { ...parsed }; delete unsigned.receiptHash;
    const playable = record(parsed.playableProxy);
    if (receiptHash !== hashCanonicalJsonV1(unsigned) || parsed.programHash !== request.programHash
      || parsed.sourceBundleHash !== request.sourceBundleHash || parsed.apiImplementationHash !== request.apiImplementationHash
      || parsed.executionClass !== 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS'
      || playable.width !== request.program.canvas.width || playable.height !== request.program.canvas.height
      || playable.durationInFrames !== Number(request.program.duration.compositionEndExclusiveTick)) {
      diagnostics.push('OUTPUT_MATERIALIZATION_PROXY_RECEIPT_DRIFT');
    }
  } catch { diagnostics.push('OUTPUT_MATERIALIZATION_PROXY_RECEIPT_INVALID'); }
}

function emptyEvaluation(): Readonly<Stage6ResearchProxyEvaluationV2> {
  return deepFreezeV1({
    disposition: 'UNVERIFIABLE', stageAuthorization: 'UNVERIFIABLE', requestBinding: 'UNVERIFIABLE',
    sandboxAttestation: 'UNVERIFIABLE', outputMaterialization: 'UNVERIFIABLE', projectIsolation: 'UNVERIFIABLE',
    receiptIntegrity: 'UNVERIFIABLE', diagnostics: ['NO_ACCEPTED_EXECUTION_EVIDENCE'],
  });
}
function dimension(diagnostics: string[], pattern: RegExp): DimensionV2 { return diagnostics.some((entry) => pattern.test(entry)) ? 'FAIL' : 'PASS'; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
