import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createProviderNativeEpisodeResumeCheckpointV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { encodeProviderNativeCheckpointStateV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-checkpoint-state-codec-v2r';
import {
  bindProviderNativeRuntimeInputTokenBoundV2R,
  ProviderNativeRuntimeBudgetControllerV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import {
  createProviderNativeProductBudgetAuthorizationV2R,
  createProviderNativeProductBudgetReservationV2R,
  createProviderNativeProductBudgetSettlementV2R,
} from '@/lib/editron/services/provider-native-product-budget-v2r';
import {
  createProviderNativeProductTerminalSettlementOwnerV2R,
} from '@/lib/editron/services/provider-native-product-terminal-settlement-v2r';
import { createProviderNativeProductCustomerChargeReceiptV2R }
  from '@/lib/editron/services/provider-native-product-customer-charge-v2r';

const A = 'a'.repeat(64); const B = 'b'.repeat(64);
const ROUTE = { routeId: 'OPENAI_TERRA', provider: 'openai',
  model: 'gpt-5.6-terra', claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium' } as const;

describe('provider-native product terminal settlement V2R', () => {
  it('settles successful checkpoint usage even with no exceptional attempt receipt', async () => {
    const setup = await harness('completed', 'ACTUAL');
    const result = await setup.owner.settleTerminal(setup.job);
    expect(result).toMatchObject({ mode: 'ACTUAL_USAGE',
      actualProviderSpendNanoUsd: 90_000, chargedCentiCredits: 7,
      providerAttemptReceiptSha256s: [] });
    expect(setup.customerCharge).toHaveBeenCalledOnce();
    expect(setup.walletSettle).toHaveBeenCalledOnce();
  });

  it('releases the entire hold only for a terminal cancellation with no dispatch', async () => {
    const setup = await harness('cancelled', 'NONE');
    await expect(setup.owner.settleTerminal(setup.job)).resolves.toMatchObject({
      mode: 'CANCELLED_BEFORE_DISPATCH', chargedCentiCredits: 0,
      releasedCentiCredits: 900,
    });
    expect(setup.customerCharge).not.toHaveBeenCalled();
  });

  it('rejects nonterminal and copied budget bindings before wallet settlement', async () => {
    const setup = await harness('completed', 'ACTUAL');
    await expect(setup.owner.settleTerminal({ ...setup.job, status: 'running' }))
      .rejects.toThrow('PRODUCT_TERMINAL_JOB_INVALID');
    await expect(setup.owner.settleTerminal({ ...setup.job,
      budgetReservation: { ...setup.job.budgetReservation!, bindingSha256: A } }))
      .rejects.toThrow('PRODUCT_TERMINAL_JOB_BUDGET_BINDING_MISMATCH');
    expect(setup.walletSettle).not.toHaveBeenCalled();
  });
});

async function harness(
  status: 'completed' | 'cancelled',
  evidence: 'ACTUAL' | 'NONE',
) {
  const authorization = createProviderNativeProductBudgetAuthorizationV2R({
    scope: { tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
      episodeId: 'episode-1' },
    wallet: { type: 'user', clerkUserId: 'user-1' }, route: ROUTE,
    providerPricing: { ownerId: 'ProviderPricing', ownerVersion: 'v1',
      effectiveAt: '2026-08-23T00:00:00.000Z',
      expiresAt: '2026-08-24T00:00:00.000Z', tokenPricing: {
        normalInputNanoUsdPerToken: 500, cachedInputNanoUsdPerToken: 50,
        cacheWriteNanoUsdPerToken: 625, outputNanoUsdPerToken: 2_000 } },
    customerPricing: { ownerId: 'ProductPricing', ownerVersion: 'v1',
      creditPool: 'main', pricingSha256: A },
    limits: { maxProviderTurns: 8, maxSelectedOperations: 12,
      maxCandidatesPerOperation: 5, maxInputTokensPerTurn: 90_000,
      maxCumulativeOutputTokens: 32_000,
      absoluteMaxProviderSpendNanoUsd: 250_000_000,
      absoluteMaxCustomerChargeCentiCredits: 900 },
    approval: { approvedBy: 'admin', approvedAt: '2026-08-23T01:00:00.000Z',
      expiresAt: '2026-08-23T03:00:00.000Z' },
  });
  const reservation = createProviderNativeProductBudgetReservationV2R({
    authorization, reservationId: 'reservation-1',
    walletReservationTransactionId: 'txn-1', walletReservationReceiptSha256: B,
    reservedAt: '2026-08-23T01:01:00.000Z',
  });
  const resumeState = evidence === 'ACTUAL'
    ? await actualResumeState(authorization, reservation)
    : null;
  const job = terminalJob(status, reservation, resumeState);
  const walletSettle = vi.fn(async ({ requested }) => (
    createProviderNativeProductBudgetSettlementV2R({ authorization, reservation,
      ...requested, walletSettlementReceiptSha256: B,
      settledAt: '2026-08-23T01:30:00.000Z' })
  ));
  const customerCharge = vi.fn(async ({ actualProviderSpendNanoUsd,
    providerAttemptReceiptSha256s }) => (
    createProviderNativeProductCustomerChargeReceiptV2R({ authorization,
      actualProviderSpendNanoUsd, providerAttemptReceiptSha256s,
      chargedCentiCredits: 7 })
  ));
  return { job, walletSettle, customerCharge,
    owner: createProviderNativeProductTerminalSettlementOwnerV2R({
      budgetOwner: { resolveTerminal: async () => ({ authorization, reservation }),
        settle: walletSettle }, customerChargeOwner: { compute: customerCharge },
    }) };
}

async function actualResumeState(
  authorization: ReturnType<typeof createProviderNativeProductBudgetAuthorizationV2R>,
  reservation: ReturnType<typeof createProviderNativeProductBudgetReservationV2R>,
) {
  const request = providerRequest();
  const guard = new ProviderNativeRuntimeBudgetControllerV2R({
    guardKind: 'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_V2R_2',
    guardIdentitySha256: reservation.guardIdentitySha256,
    authorizationSha256: authorization.authorizationSha256,
    inputTokenBoundVersion: 'TEST_BOUND_V1', limits: { maxProviderTurns: 8,
      maxSelectedOperations: 12, maxCandidatesPerOperation: 5,
      maxInputTokensPerTurn: 90_000, maxCumulativeOutputTokens: 32_000,
      absoluteMaxSpendNanoUsd: 250_000_000 }, pricing: {
      normalInputNanoUsdPerToken: 500, cachedInputNanoUsdPerToken: 50,
      cacheWriteNanoUsdPerToken: 625, outputNanoUsdPerToken: 2_000 },
    countInputTokens: async (serialized) => bindProviderNativeRuntimeInputTokenBoundV2R({
      version: 'TEST_BOUND_V1', request: serialized,
      inputTokensUpperBound: 100, method: 'TEST' }),
  });
  const audits = [guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 }).audit,
    (await guard.beforeInvoke({ turn: 1, request, maxOutputTokens: 512 })).audit,
    guard.afterInvoke({ turn: 1, request, maxOutputTokens: 512,
      response: { status: 200, body: { usage: { input_tokens: 100,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens: 20, output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 120 } } } }).audit];
  const completedTurns = [{ turn: 1, requestHash: request.requestHash,
    responseStatus: 200, maxOutputTokens: 512, runtimeGuardAudit: audits }];
  const checkpoint = createProviderNativeEpisodeResumeCheckpointV2R({
    route: ROUTE, episodeId: 'episode-1', contextSha256: A, toolSetSha256: B,
    completedTurns, runtimeGuardResumeState: guard.createResumeState({ completedTurns }),
  });
  const encoded = encodeProviderNativeCheckpointStateV2R({
    checkpoint, projectId: 'project-1',
  });
  return { sequence: 1, schemaId: encoded.schemaId,
    stateSha256: encoded.stateSha256, payload: encoded.payload,
    committedAt: '2026-08-23T01:20:00.000Z' };
}

function terminalJob(status: 'completed' | 'cancelled',
  reservation: ReturnType<typeof createProviderNativeProductBudgetReservationV2R>,
  resumeState: DurableWorkflowJobSnapshotV1['resumeState']): DurableWorkflowJobSnapshotV1 {
  const receipt = { disposition: status === 'cancelled' ? 'CANCELLED' as const : 'PASS' as const,
    receiptId: 'receipt-1', receiptSha256: B, proofReferences: [],
    completedAt: '2026-08-23T01:25:00.000Z' };
  return { jobId: 'job-1', version: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
    tenantId: 'tenant-1', userId: 'user-1', orgId: null, projectId: 'project-1',
    operationOwner: 'PLAN_SERVICE', operationKind: 'editorial_plan_node_episode',
    operationId: 'operation-1', parentCommandId: null, parentReceiptId: null,
    idempotencyKey: 'operation-1', input: { schemaId: 'v1', bindingSha256: A,
      payload: {} }, dependencies: [], budgetReservation: {
      reservationId: reservation.reservationId,
      bindingSha256: reservation.guardIdentitySha256 }, status, attemptCount: 1,
    maxAttempts: 1, remainingAttempts: 0, retryCursor: null, leaseOwnerId: null,
    leaseExpiresAt: null, nextAttemptAt: null, cancelRequestedAt: status === 'cancelled'
      ? '2026-08-23T01:24:00.000Z' : null,
    cancelRequestedBy: status === 'cancelled' ? 'user-1' : null,
    cancelReason: status === 'cancelled' ? 'stop' : null, resumeState,
    terminalReceipt: receipt, error: null, dispatchTransport: 'QSTASH',
    dispatchMessageId: 'msg-1', dispatchCount: 1,
    createdAt: '2026-08-23T01:01:00.000Z',
    updatedAt: '2026-08-23T01:25:00.000Z', expiresAt: '2026-08-24T01:00:00.000Z' };
}

function providerRequest(): Readonly<SerializedProviderNativeTurnV2R> {
  const endpoint = 'https://api.openai.com/v1/responses';
  const body = { model: 'gpt-5.6-terra', input: [], tools: [], max_output_tokens: 512 };
  return { provider: 'openai', endpoint, authMode: 'BEARER', body,
    requestHash: hashCanonicalJsonV1({ endpoint, body }) };
}
