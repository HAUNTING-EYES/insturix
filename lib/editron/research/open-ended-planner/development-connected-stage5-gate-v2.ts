import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ConnectedDevelopmentStage14ReceiptV2 } from './development-connected-stage14-runner-v2';
import type { ProceedOrStopDecisionV2, Stage5DispositionV2 } from './stage5-proceed-stop-gate-v2';

type JsonRecord = Record<string, unknown>;

export interface ConnectedProceedOrStopDecisionV2 extends ProceedOrStopDecisionV2 {
  decisionVersion: 'EDITRON_OE_CONNECTED_STAGE5_DECISION_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  sourceStage14ReceiptHash: string;
  decisionHash: string;
}

export function decideConnectedDevelopmentStage5V2(
  receipt: Readonly<ConnectedDevelopmentStage14ReceiptV2>,
): Readonly<ConnectedProceedOrStopDecisionV2> {
  const integrityDiagnostics = validateReceipt(receipt);
  if (integrityDiagnostics.length) {
    return decision(receipt.taskId || 'UNBOUND_TASK', receipt.receiptHash, 'UNVERIFIABLE',
      'CONNECTED_STAGE14_RECEIPT_INVALID', [], [],
      `The connected planning receipt is invalid: ${integrityDiagnostics.join(', ')}. Nothing was executed.`);
  }
  const stage4 = receipt.stage4Receipt;
  if (!stage4) {
    const lastEvaluation = receipt.stage123Receipt.rows.at(-1)?.evaluation.disposition;
    const disposition: Stage5DispositionV2 = lastEvaluation === 'FAIL' ? 'FAIL' : 'UNVERIFIABLE';
    return decision(receipt.taskId, receipt.receiptHash, disposition, receipt.blockReasonCode ?? 'BLOCKED_BEFORE_STAGE4',
      [], [], 'The model chain did not reach an independently verified Stage-4 artifact. Nothing was executed.');
  }
  if (stage4.evaluation.disposition === 'EXPECTED_CAPABILITY_GAP') {
    return decision(receipt.taskId, receipt.receiptHash, 'CAPABILITY_GAP', 'REQUIRED_CAPABILITY_NOT_IMPLEMENTED',
      [], collectMissingCapabilityIds(record(stage4.compiledArtifact)),
      'The requested edit still requires an unavailable capability. Nothing was executed.');
  }
  if (stage4.evaluation.disposition !== 'PASS') {
    const disposition: Stage5DispositionV2 = stage4.evaluation.disposition === 'FAIL' ? 'FAIL' : 'UNVERIFIABLE';
    return decision(receipt.taskId, receipt.receiptHash, disposition, 'CONNECTED_STAGE4_NOT_VERIFIED', [], [],
      'The source-bound Stage-4 artifact did not pass independent evaluation. Nothing was executed.');
  }
  const graph = record(stage4.compiledArtifact);
  if (graph.executionEligibility !== 'RESEARCH_PROXY_ONLY'
    || strings(graph.stateEffects).length) {
    return decision(receipt.taskId, receipt.receiptHash, 'POLICY_BLOCKED', 'CONNECTED_STAGE4_NOT_RESEARCH_ISOLATED',
      [], [], 'The compiled artifact is not an isolated research proxy. Nothing was executed.');
  }
  return decision(receipt.taskId, receipt.receiptHash, 'PROCEED', 'CONNECTED_STAGE4_SOURCE_BOUND_AND_VERIFIED', [], [],
    'The actual same-model chain passed source-bound compilation and may run only as a bounded research proxy.',
    { scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY', projectMutation: 'DENY', fullProjectExecution: 'DENY' });
}

function validateReceipt(receipt: Readonly<ConnectedDevelopmentStage14ReceiptV2>): string[] {
  const diagnostics: string[] = [];
  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || receipt.receiptVersion !== 'EDITRON_OE_CONNECTED_STAGE14_RECEIPT_V2'
    || receipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receipt.handoffMode !== 'CONNECTED_SAME_ROUTE_ACTUAL_STAGE1_TO_EXISTING_STAGE4_OWNER'
    || receipt.stateEffects.length) diagnostics.push('STAGE14_INTEGRITY');
  const stage123 = receipt.stage123Receipt;
  const { receiptHash: stage123Hash, ...stage123Unsigned } = stage123;
  if (stage123Hash !== hashCanonicalJsonV1(stage123Unsigned)
    || stage123.taskId !== receipt.taskId || stage123.conditionId !== receipt.conditionId
    || stage123.routeId !== receipt.routeId || stage123.claimedModelIdentity !== receipt.claimedModelIdentity
    || stage123.stateEffects.length) diagnostics.push('STAGE123_INTEGRITY');
  const stage4 = receipt.stage4Receipt;
  if (receipt.finalDisposition === 'STAGE4_EVALUATED' && !stage4) diagnostics.push('STAGE4_MISSING');
  if (receipt.finalDisposition === 'BLOCKED_BEFORE_STAGE4' && stage4) diagnostics.push('STAGE4_UNEXPECTED');
  if (stage4) {
    const { receiptHash: stage4Hash, ...stage4Unsigned } = stage4;
    if (stage4Hash !== hashCanonicalJsonV1(stage4Unsigned)
      || stage4.sourceStage123ReceiptHash !== stage123.receiptHash
      || stage4.taskId !== receipt.taskId || stage4.conditionId !== receipt.conditionId
      || stage4.routeId !== receipt.routeId || stage4.claimedModelIdentity !== receipt.claimedModelIdentity
      || stage4.stateEffects.length) diagnostics.push('STAGE4_INTEGRITY');
    if (!stage4.compiledArtifact || !stage4.compiledArtifactHash
      || stage4.compiledArtifactHash !== hashCanonicalJsonV1(stage4.compiledArtifact)
      || stage4.compiledArtifact.artifactType !== stage4.compiledArtifactType) diagnostics.push('STAGE4_ARTIFACT_INTEGRITY');
  }
  return unique(diagnostics).sort(compareUtf16);
}

function decision(
  taskId: string,
  sourceStage14ReceiptHash: string,
  disposition: Stage5DispositionV2,
  reasonCode: string,
  missingEvidenceIds: string[],
  missingCapabilityIds: string[],
  userMessage: string,
  executionAuthorization?: ProceedOrStopDecisionV2['executionAuthorization'],
): Readonly<ConnectedProceedOrStopDecisionV2> {
  const material = {
    artifactType: 'ProceedOrStopDecisionV2' as const,
    decisionVersion: 'EDITRON_OE_CONNECTED_STAGE5_DECISION_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    sourceStage14ReceiptHash,
    taskId,
    disposition,
    reasonCode,
    missingEvidenceIds: unique(missingEvidenceIds).sort(compareUtf16),
    missingCapabilityIds: unique(missingCapabilityIds).sort(compareUtf16),
    userMessage,
    ...(executionAuthorization ? { executionAuthorization } : {}),
  };
  return deepFreezeV1({ ...material, decisionHash: hashCanonicalJsonV1(material) });
}

function collectMissingCapabilityIds(graph: JsonRecord): string[] {
  return unique(records(graph.diagnostics)
    .filter((entry) => entry.code === 'CAPABILITY_NOT_IMPLEMENTED')
    .flatMap((entry) => [...strings(entry.capabilityIds), ...strings(entry.operatorIds)]))
    .sort(compareUtf16);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
