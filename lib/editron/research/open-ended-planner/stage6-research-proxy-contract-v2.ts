import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  GeneratedCompositionSandboxHostReceiptV1,
  GeneratedCompositionSandboxRequestV1,
  GeneratedCompositionSandboxWorkerResultV1,
} from './generated-composition-sandbox-contract-v1';

export const STAGE6_RESEARCH_PROXY_EXECUTION_VERSION_V2 =
  'EDITRON_STAGE6_RESEARCH_PROXY_EXECUTION_V2' as const;

type RenderedWorkerResultV1 = Extract<GeneratedCompositionSandboxWorkerResultV1, { status: 'RENDERED' }>;

export interface Stage6ResearchProxyExecutionReceiptV2 {
  artifactType: 'Stage6ResearchProxyExecutionReceiptV2';
  contractVersion: typeof STAGE6_RESEARCH_PROXY_EXECUTION_VERSION_V2;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  taskId: string;
  operatorId: string;
  stage4GraphHash: string;
  stage5DecisionHash: string;
  executionId: string;
  requestId: string;
  requestHash: string;
  programHash: string;
  sourceBundleHash: string;
  projectBinding: {
    projectId: string;
    expectedProjectRevision: string;
    revisionDisposition: 'NOT_READ_OR_MUTATED';
    changedProjectPaths: readonly [];
  };
  sandboxBinding: {
    hostReceiptHash: string;
    workerResultHash: string;
    proxyReceiptHash: string;
    snapshotId: string;
    appCommit: string;
    workerImplementationHash: string;
  };
  outputBindings: readonly {
    kind: 'STILL' | 'CONTACT_SHEET' | 'PLAYABLE_PROXY' | 'PROXY_RECEIPT';
    path: string;
    contentSha256: string;
    byteLength: number;
  }[];
  proof: {
    stage4Compilation: 'PASS';
    stage5Authorization: 'PASS';
    productionSandbox: 'PASS';
    outputMaterialization: 'PASS';
    projectMutation: 'NONE';
    renderedEvidence: 'CAPTURED_UNJUDGED';
  };
  fullProjectExecutionEligibility: 'NOT_EXECUTABLE';
  stateEffects: readonly [];
  completedAt: string;
  receiptHash: string;
}

export interface Stage6ResearchProxyExecutionEvidenceV2 {
  receipt: Readonly<Stage6ResearchProxyExecutionReceiptV2>;
  sandboxRequest: Readonly<GeneratedCompositionSandboxRequestV1>;
  sandboxHostReceipt: Readonly<GeneratedCompositionSandboxHostReceiptV1>;
  workerResult: Readonly<RenderedWorkerResultV1>;
  outputBytes: Readonly<Record<string, Uint8Array>>;
}

export function buildStage6ResearchProxyExecutionReceiptV2(input: {
  taskId: string;
  operatorId: string;
  stage4GraphHash: string;
  stage5DecisionHash: string;
  projectId: string;
  expectedProjectRevision: string;
  request: Readonly<GeneratedCompositionSandboxRequestV1>;
  hostReceipt: Readonly<GeneratedCompositionSandboxHostReceiptV1>;
  workerResult: Readonly<RenderedWorkerResultV1>;
}): Readonly<Stage6ResearchProxyExecutionReceiptV2> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(input.operatorId)) {
    throw new Error('STAGE6_RESEARCH_PROXY_OPERATOR_ID_INVALID');
  }
  const { receiptHash: hostReceiptHash, ...hostUnsigned } = input.hostReceipt;
  if (hostReceiptHash !== hashCanonicalJsonV1(hostUnsigned)
    || input.hostReceipt.requestHash !== hashCanonicalJsonV1(input.request)
    || input.hostReceipt.resultHash !== hashCanonicalJsonV1(input.workerResult)
    || input.hostReceipt.requestId !== input.request.requestId
    || input.hostReceipt.executionId !== input.request.executionId
    || input.workerResult.status !== 'RENDERED'
    || input.hostReceipt.proxyReceiptHash !== input.workerResult.proxyReceiptHash) {
    throw new Error('STAGE6_RESEARCH_PROXY_SANDBOX_IDENTITY_DRIFT');
  }
  if (input.hostReceipt.networkPolicy !== 'DENY_ALL' || input.hostReceipt.persistent
    || !input.hostReceipt.sandboxDeleted || input.hostReceipt.proof.projectMutation !== 'NONE'
    || input.hostReceipt.stateEffects.length || input.workerResult.stateEffects.length) {
    throw new Error('STAGE6_RESEARCH_PROXY_SANDBOX_POLICY_DRIFT');
  }
  const unsigned = {
    artifactType: 'Stage6ResearchProxyExecutionReceiptV2' as const,
    contractVersion: STAGE6_RESEARCH_PROXY_EXECUTION_VERSION_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
    taskId: input.taskId,
    operatorId: input.operatorId,
    stage4GraphHash: input.stage4GraphHash,
    stage5DecisionHash: input.stage5DecisionHash,
    executionId: input.request.executionId,
    requestId: input.request.requestId,
    requestHash: input.hostReceipt.requestHash,
    programHash: input.request.programHash,
    sourceBundleHash: input.request.sourceBundleHash,
    projectBinding: {
      projectId: input.projectId,
      expectedProjectRevision: input.expectedProjectRevision,
      revisionDisposition: 'NOT_READ_OR_MUTATED' as const,
      changedProjectPaths: [] as const,
    },
    sandboxBinding: {
      hostReceiptHash,
      workerResultHash: input.hostReceipt.resultHash,
      proxyReceiptHash: input.hostReceipt.proxyReceiptHash,
      snapshotId: input.hostReceipt.snapshotId,
      appCommit: input.hostReceipt.appCommit,
      workerImplementationHash: input.hostReceipt.workerImplementationHash,
    },
    outputBindings: input.hostReceipt.outputs.map((output) => ({ ...output })),
    proof: {
      stage4Compilation: 'PASS' as const,
      stage5Authorization: 'PASS' as const,
      productionSandbox: 'PASS' as const,
      outputMaterialization: 'PASS' as const,
      projectMutation: 'NONE' as const,
      renderedEvidence: 'CAPTURED_UNJUDGED' as const,
    },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE' as const,
    stateEffects: [] as const,
    completedAt: input.workerResult.completedAt,
  };
  return deepFreezeV1({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) });
}

export function hasValidStage6ResearchProxyReceiptHashV2(value: unknown): boolean {
  if (!isRecord(value) || typeof value.receiptHash !== 'string') return false;
  const { receiptHash, ...unsigned } = value;
  return receiptHash === hashCanonicalJsonV1(unsigned);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
