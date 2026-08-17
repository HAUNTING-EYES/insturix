import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  runConnectedDevelopmentStage123V2,
  type ConnectedDevelopmentStage123ReceiptV2,
} from './development-connected-stage123-runner-v2';
import {
  delegateConnectedDevelopmentStage4V2,
  type ConnectedDevelopmentStage4OwnerV2,
  type ConnectedDevelopmentStage4ReceiptV2,
} from './development-connected-stage4-delegator-v2';
import type { DevelopmentModelRouteV2, DevelopmentTaskCaseV2 } from './development-cohort-runner-v2';

export interface ConnectedDevelopmentStage14ReceiptV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE14_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_STAGE1_TO_EXISTING_STAGE4_OWNER';
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  stage4Receipt: Readonly<ConnectedDevelopmentStage4ReceiptV2> | null;
  finalDisposition: 'STAGE4_EVALUATED' | 'BLOCKED_BEFORE_STAGE4';
  blockReasonCode: string | null;
  actualProviderCostUsd: number;
  providerCostCoverage: ConnectedDevelopmentStage123ReceiptV2['providerCostCoverage'];
  stateEffects: readonly [];
  receiptHash: string;
}

export async function runConnectedDevelopmentStage14V2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  owner: ConnectedDevelopmentStage4OwnerV2;
}): Promise<Readonly<ConnectedDevelopmentStage14ReceiptV2>> {
  const stage123Receipt = await runConnectedDevelopmentStage123V2({
    task: input.task,
    route: input.route,
  });
  return continueConnectedDevelopmentStage14V2({ ...input, stage123Receipt });
}

export async function continueConnectedDevelopmentStage14V2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  owner: ConnectedDevelopmentStage4OwnerV2;
  stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
}): Promise<Readonly<ConnectedDevelopmentStage14ReceiptV2>> {
  validateHandoffBinding(input);
  const stage123Receipt = input.stage123Receipt;
  if (!isStage4Eligible(stage123Receipt)) {
    return buildReceipt(input, stage123Receipt, null, 'BLOCKED_BEFORE_STAGE4', stage4BlockReason(stage123Receipt));
  }
  const stage4Receipt = await delegateConnectedDevelopmentStage4V2({
    task: input.task,
    stage123Receipt,
    owner: input.owner,
  });
  return buildReceipt(input, stage123Receipt, stage4Receipt, 'STAGE4_EVALUATED', null);
}

function validateHandoffBinding(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
}): void {
  const { receiptHash, ...unsigned } = input.stage123Receipt;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || input.stage123Receipt.taskId !== input.task.taskId
    || input.stage123Receipt.conditionId !== input.task.conditionId
    || input.stage123Receipt.routeId !== input.route.routeId
    || input.stage123Receipt.claimedModelIdentity !== input.route.claimedModelIdentity
    || input.stage123Receipt.costBasis !== input.route.costBasis) {
    throw new Error('CONNECTED_STAGE14_STAGE123_HANDOFF_INVALID');
  }
}

function isStage4Eligible(receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>): boolean {
  const stageThree = receipt.rows.find(({ stage }) => stage === 3);
  return receipt.finalDisposition === 'STAGE3_EVALUATED'
    && Boolean(stageThree)
    && ['PASS', 'EXPECTED_CAPABILITY_GAP'].includes(stageThree!.evaluation.disposition);
}

function stage4BlockReason(receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>): string {
  if (receipt.finalDisposition !== 'STAGE3_EVALUATED') return receipt.finalDisposition;
  const stageThree = receipt.rows.find(({ stage }) => stage === 3);
  return `STAGE3_${stageThree?.evaluation.disposition ?? 'MISSING'}`;
}

function buildReceipt(
  input: { task: DevelopmentTaskCaseV2; route: DevelopmentModelRouteV2; owner: ConnectedDevelopmentStage4OwnerV2 },
  stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>,
  stage4Receipt: Readonly<ConnectedDevelopmentStage4ReceiptV2> | null,
  finalDisposition: ConnectedDevelopmentStage14ReceiptV2['finalDisposition'],
  blockReasonCode: string | null,
): Readonly<ConnectedDevelopmentStage14ReceiptV2> {
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE14_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_STAGE1_TO_EXISTING_STAGE4_OWNER' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    stage123Receipt,
    stage4Receipt,
    finalDisposition,
    blockReasonCode,
    actualProviderCostUsd: stage123Receipt.actualProviderCostUsd,
    providerCostCoverage: stage123Receipt.providerCostCoverage,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}
