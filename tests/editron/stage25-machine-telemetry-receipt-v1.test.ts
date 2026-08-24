import { describe, expect, it } from 'vitest';

import {
  createBlindQualityReviewContractV1,
  finalizeBlindQualityReviewReceiptV1,
} from '@/lib/editron/research/open-ended-planner/blind-quality-review-receipt-v1';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeDurableAttemptReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-attempt-receipt-v2r';
import { bindProviderNativeExecutionBoundOutcomeProofReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';
import {
  assertStage25MachineTelemetryReceiptV1,
  createStage25MachineTelemetryReceiptV1,
  type Stage25DurationMetricV1,
  type Stage25MachineTelemetryCostMetricsV1,
  type Stage25MachineTelemetryInputV1,
  type Stage25NanoUsdCostModeV1,
} from '@/lib/editron/research/open-ended-planner/stage25-machine-telemetry-receipt-v1';
import { PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R }
  from '@/lib/editron/services/provider-native-product-budget-v2r';
import { PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R }
  from '@/lib/editron/services/provider-native-product-budget-credits-owner-v2r';

type JsonRecord = Record<string, unknown>;

describe('Stage 2.5 machine telemetry receipt V1', () => {
  it('binds timings, owner receipts and a research-only accepted-edit estimate', () => {
    const input = completeInput();
    const receipt = createStage25MachineTelemetryReceiptV1(input);

    expect(receipt).toMatchObject({
      authority: 'RESEARCH_TELEMETRY_AGGREGATOR_NO_ACCOUNTING_OR_PROOF_AUTHORITY',
      artifactBindings: {
        candidateSha256: digest('candidate-plan'),
        resultSha256: digest('candidate-result'),
        proofSubjectFinalStateSha256: digest('final-state'),
      },
      providerAccountingReconciliation: {
        disposition: 'RECONCILED_PROVIDER_REPORTED_USAGE',
        accountedOutputTokens: 35,
        accountedCostNanoUsd: 2_000_000,
      },
      retryRepair: {
        providerAttemptCount: 1,
        providerRetryCount: 0,
        renderAttemptCount: 1,
        renderRepairCount: 0,
        humanCorrectionCount: 0,
      },
      costPerAcceptedEdit: {
        disposition: 'RESEARCH_ESTIMATE_AVAILABLE',
        amountNanoUsd: 9_300_000,
        invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE',
      },
      stateEffects: [],
    });
    expect(receipt.costPerAcceptedEdit.includedModes).toEqual([
      'FROZEN_PRICE_ESTIMATE', 'RENDER_COST', 'STORAGE_COST', 'EGRESS_COST',
      'HUMAN_COST',
    ]);
    expect(receipt.costs.reservation.amount).toBe(12_000_000);
    expect(receipt.costs.subscriptionCredit.amount).toBe(75);
    expect(receipt.providerUsage.attemptReceiptSha256s).toEqual(
      receipt.providerAttempts.map(({ receiptSha256 }) => receiptSha256),
    );
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.durations.providerCompletion)).toBe(true);
    expect(() => assertStage25MachineTelemetryReceiptV1(receipt)).not.toThrow();
  });

  it('uses explicit null plus reason for every unavailable metric and withholds accepted cost', () => {
    const input = unavailableInput();
    const receipt = createStage25MachineTelemetryReceiptV1(input);

    expect(receipt.durations.providerFirstToken).toEqual({
      disposition: 'UNAVAILABLE', segments: [], durationMilliseconds: null,
      reason: 'The non-streaming transport emitted no first-token event.',
    });
    expect(receipt.providerUsage).toMatchObject({
      disposition: 'UNAVAILABLE', attemptReceiptSha256s: [],
      inputTokens: null, sourceReceiptSha256: null,
      reason: 'No provider dispatch occurred.',
    });
    expect(receipt.costs.render).toEqual({
      mode: 'RENDER_COST', disposition: 'UNAVAILABLE', unit: 'NANO_USD',
      amount: null, source: null, reason: 'No render-cost receipt exists.',
    });
    expect(receipt.costPerAcceptedEdit).toEqual({
      disposition: 'UNAVAILABLE', amountNanoUsd: null, includedModes: [],
      invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE',
      reason: 'Hard proof has not passed for this final state.',
    });
  });

  it.each([
    ['zero placeholder', (input: JsonRecord) => {
      const duration = ((input.durations as JsonRecord).tool as JsonRecord);
      duration.durationMilliseconds = 0;
    }, 'DURATION_tool_UNAVAILABLE_INVALID'],
    ['missing reason', (input: JsonRecord) => {
      const cost = ((input.costs as JsonRecord).render as JsonRecord);
      cost.reason = '';
    }, 'COST_RENDER_COST_UNAVAILABLE_INVALID'],
    ['negative cost', (input: JsonRecord) => {
      const cost = ((input.costs as JsonRecord).render as JsonRecord);
      cost.disposition = 'AVAILABLE'; cost.amount = -1; cost.reason = null;
      cost.source = source('render-negative', 'render-owner-v1');
    }, 'COST_RENDER_COST_AMOUNT_INVALID'],
  ])('rejects unavailable/negative metric abuse: %s', (_name, mutate, code) => {
    const input = mutable(unavailableInput());
    mutate(input);
    expect(() => createStage25MachineTelemetryReceiptV1(
      input as unknown as Stage25MachineTelemetryInputV1,
    )).toThrow(`STAGE25_MACHINE_TELEMETRY_${code}`);
  });

  it('rejects timestamp arithmetic drift and overlapping segments', () => {
    const arithmetic = mutable(completeInput());
    const queue = ((arithmetic.durations as JsonRecord).queue as JsonRecord);
    (queue.segments as JsonRecord[])[0].durationMilliseconds = 4_999;
    expect(() => issue(arithmetic)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_DURATION_queue_TIMESTAMP_ARITHMETIC_INVALID',
    );

    const overlap = mutable(completeInput());
    const tool = ((overlap.durations as JsonRecord).tool as JsonRecord);
    tool.segments = [
      segment('tool-1', '2026-08-25T10:00:10.000Z', '2026-08-25T10:00:18.000Z'),
      segment('tool-2', '2026-08-25T10:00:17.000Z', '2026-08-25T10:00:20.000Z'),
    ];
    tool.durationMilliseconds = 11_000;
    expect(() => issue(overlap)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_DURATION_tool_SEGMENTS_OVERLAP',
    );
  });

  it('rejects an impossible first-token/provider-completion relationship', () => {
    const input = mutable(completeInput());
    const completion = ((input.durations as JsonRecord).providerCompletion as JsonRecord);
    completion.segments = [segment(
      'different-attempt',
      '2026-08-25T10:00:05.000Z',
      '2026-08-25T10:00:10.000Z',
    )];
    expect(() => issue(input)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_TIMING_RELATIONSHIP_INVALID',
    );
  });

  it.each([
    ['cache categories exceed input', (usage: JsonRecord) => {
      usage.cachedInputTokens = 95; usage.cacheWriteInputTokens = 10;
    }],
    ['total token arithmetic drifts', (usage: JsonRecord) => { usage.totalTokens = 134; }],
  ])('rejects provider-usage arithmetic: %s', (_name, mutate) => {
    const input = mutable(completeInput());
    mutate(input.providerUsage as JsonRecord);
    expect(() => issue(input)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_USAGE_ARITHMETIC_INVALID',
    );
  });

  it('binds provider usage and frozen cost to the exact durable attempts', () => {
    const wrongHash = mutable(completeInput());
    (wrongHash.providerUsage as JsonRecord).attemptReceiptSha256s = [digest('unrelated-attempt')];
    expect(() => issue(wrongHash)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_USAGE_ATTEMPT_BINDING_INVALID',
    );

    const wrongOutput = mutable(completeInput());
    const usage = wrongOutput.providerUsage as JsonRecord;
    usage.visibleOutputTokens = 29;
    usage.totalTokens = 134;
    expect(() => issue(wrongOutput)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_USAGE_ARITHMETIC_INVALID',
    );

    const wrongCost = mutable(completeInput());
    (((wrongCost.costs as JsonRecord).frozenPriceEstimate as JsonRecord)).amount = 2_000_001;
    expect(() => issue(wrongCost)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_FROZEN_PRICE_ESTIMATE_RECONCILIATION_INVALID',
    );

    const omittedEarlierAttempt = mutable(completeInput());
    const first = providerAttemptReceipt();
    const second = chainedProviderAttemptReceipt(first);
    omittedEarlierAttempt.providerAttemptReceipts = [second];
    expect(() => issue(omittedEarlierAttempt)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_ATTEMPT_CHAIN_INVALID',
    );
  });

  it('rejects reported provider usage when no durable attempt exists', () => {
    const input = mutable(completeInput());
    input.providerAttemptReceipts = [];
    (input.providerUsage as JsonRecord).attemptReceiptSha256s = [];
    (input.retryRepair as JsonRecord).providerAttemptCount = 0;
    expect(() => issue(input)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_USAGE_UNRECONCILED',
    );
  });

  it('marks conservative attempt accounting unavailable rather than treating it as final cost', () => {
    const input = mutable(completeInput());
    const attempt = conservativeProviderAttemptReceipt();
    input.providerAttemptReceipts = [attempt];
    input.providerUsage = unavailableUsage(
      [attempt.receiptSha256],
      'The durable attempt contains only a worst-case reservation.',
    );
    ((input.costs as JsonRecord).frozenPriceEstimate) = unavailableNano(
      'FROZEN_PRICE_ESTIMATE',
      'Final provider-reported cost is unavailable.',
    );
    const receipt = issue(input);
    expect(receipt.providerAccountingReconciliation).toMatchObject({
      disposition: 'UNAVAILABLE',
      attemptReceiptSha256s: [attempt.receiptSha256],
      accountedOutputTokens: null,
      accountedCostNanoUsd: null,
    });
    expect(receipt.costPerAcceptedEdit.disposition).toBe('UNAVAILABLE');
  });

  it('binds retry and render-repair counts to real attempts', () => {
    const wrongProviderCount = mutable(completeInput());
    (wrongProviderCount.retryRepair as JsonRecord).providerAttemptCount = 2;
    expect(() => issue(wrongProviderCount)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_RETRY_REPAIR_ARITHMETIC_INVALID',
    );

    const impossibleRenderRepair = mutable(completeInput());
    (impossibleRenderRepair.retryRepair as JsonRecord).renderRepairCount = 1;
    expect(() => issue(impossibleRenderRepair)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_RETRY_REPAIR_ARITHMETIC_INVALID',
    );
  });

  it('rejects overlapping cost allocations and wrong sole-owner versions', () => {
    const overlap = mutable(completeInput());
    const costs = overlap.costs as JsonRecord;
    const frozen = ((costs.frozenPriceEstimate as JsonRecord).source as JsonRecord);
    const render = ((costs.render as JsonRecord).source as JsonRecord);
    render.allocationSha256 = frozen.allocationSha256;
    expect(() => issue(overlap)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_COST_ALLOCATION_DUPLICATE',
    );

    const wrongOwner = mutable(completeInput());
    const reservation = (((wrongOwner.costs as JsonRecord).reservation as JsonRecord).source as JsonRecord);
    reservation.ownerVersion = 'private-budget-owner-v0';
    expect(() => issue(wrongOwner)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_BUDGET_RESERVATION_OWNER_VERSION_INVALID',
    );
  });

  it('does not expose cost-per-accepted-edit without both proof and blind PASS', () => {
    const noProof = completeInput({ hardProof: false });
    expect(createStage25MachineTelemetryReceiptV1(noProof).costPerAcceptedEdit)
      .toMatchObject({ disposition: 'UNAVAILABLE', amountNanoUsd: null });

    const noBlindReview = completeInput({ blindReview: false });
    expect(createStage25MachineTelemetryReceiptV1(noBlindReview).costPerAcceptedEdit)
      .toMatchObject({ disposition: 'UNAVAILABLE', amountNanoUsd: null });

    const missingCost = mutable(completeInput());
    const render = ((missingCost.costs as JsonRecord).render as JsonRecord);
    Object.assign(render, unavailableNano('RENDER_COST', 'Render billing is unresolved.'));
    expect(issue(missingCost).costPerAcceptedEdit).toEqual({
      disposition: 'UNAVAILABLE', amountNanoUsd: null, includedModes: [],
      invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE',
      reason: 'One or more accepted-edit cost components are unavailable.',
    });
  });

  it('rejects a PASS proof for an unrelated final state in the same episode', () => {
    const input = mutable(completeInput());
    (input.artifactBindings as JsonRecord).proofSubjectFinalStateSha256 =
      digest('different-final-state');
    expect(() => issue(input)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_HARD_PROOF_FINAL_STATE_MISMATCH',
    );
  });

  it('rejects stale hashes and self-rehashed derived accepted-cost tampering', () => {
    const stale = mutable(createStage25MachineTelemetryReceiptV1(completeInput()));
    (stale.artifactBindings as JsonRecord).resultSha256 = digest('forged-result');
    expect(() => assertStage25MachineTelemetryReceiptV1(stale)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_RECEIPT_INVALID',
    );

    const rehashed = mutable(createStage25MachineTelemetryReceiptV1(completeInput()));
    (rehashed.costPerAcceptedEdit as JsonRecord).amountNanoUsd = 1;
    delete rehashed.receiptSha256;
    rehashed.receiptSha256 = hashCanonicalJsonV1(rehashed);
    expect(() => assertStage25MachineTelemetryReceiptV1(rehashed)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_MATERIAL_INVALID',
    );

    const impossibleAccounting = mutable(
      createStage25MachineTelemetryReceiptV1(completeInput()),
    );
    ((impossibleAccounting.providerAttempts as JsonRecord[])[0]).isUpperBound = true;
    delete impossibleAccounting.receiptSha256;
    impossibleAccounting.receiptSha256 = hashCanonicalJsonV1(impossibleAccounting);
    expect(() => assertStage25MachineTelemetryReceiptV1(impossibleAccounting)).toThrow(
      'STAGE25_MACHINE_TELEMETRY_PROVIDER_ATTEMPT_ACCOUNTING_INVALID',
    );
  });
});

function completeInput(options: Readonly<{
  hardProof?: boolean;
  blindReview?: boolean;
}> = {}): Stage25MachineTelemetryInputV1 {
  const proof = proofReceipt();
  const blind = blindReceipt();
  const attempt = providerAttemptReceipt();
  const hardProof = options.hardProof === false
    ? { receipt: null, reason: 'Hard proof has not been produced.' } as const
    : { receipt: proof, reason: null } as const;
  const blindReview = options.blindReview === false
    ? { receipt: null, resultId: null, reason: 'Blind review has not been performed.' } as const
    : { receipt: blind, resultId: 'candidate-result', reason: null } as const;
  return {
    scope: {
      cohortId: 'stage25-quality-cohort-01', taskId: 'stage25-quality-task-01',
      episodeId: 'stage25-quality-episode-01', candidateId: 'candidate-plan',
      resultId: 'candidate-result',
    },
    artifactBindings: {
      candidateSha256: digest('candidate-plan'), resultSha256: digest('candidate-result'),
      proofSubjectFinalStateSha256: digest('final-state'),
    },
    providerAttemptReceipts: [attempt],
    durations: completeDurations(),
    providerUsage: {
      disposition: 'PROVIDER_REPORTED_USAGE', attemptReceiptSha256s: [attempt.receiptSha256],
      inputTokens: 100, cachedInputTokens: 20,
      cacheWriteInputTokens: 10, visibleOutputTokens: 30, reasoningTokens: 5,
      totalTokens: 135, sourceReceiptSha256: digest('provider-stage-run'), reason: null,
    },
    costs: completeCosts(blind.receiptHash),
    retryRepair: {
      providerAttemptCount: 1, providerRetryCount: 0, modelRepairCount: 0,
      renderAttemptCount: 1, renderRepairCount: 0, humanCorrectionCount: 0,
    },
    hardProof,
    blindReview,
    issuedAt: '2026-08-25T10:11:00.000Z',
  };
}

function unavailableInput(): Stage25MachineTelemetryInputV1 {
  const unavailableDuration = (reason: string): Stage25DurationMetricV1 => ({
    disposition: 'UNAVAILABLE', segments: [], durationMilliseconds: null, reason,
  });
  return {
    scope: {
      cohortId: 'stage25-quality-cohort-02', taskId: 'stage25-quality-task-02',
      episodeId: 'stage25-quality-episode-02', candidateId: 'candidate-plan-02',
      resultId: 'candidate-result-02',
    },
    artifactBindings: {
      candidateSha256: digest('candidate-plan-02'), resultSha256: digest('candidate-result-02'),
      proofSubjectFinalStateSha256: digest('final-state-02'),
    },
    providerAttemptReceipts: [],
    durations: {
      queue: unavailableDuration('No durable queue receipt exists.'),
      providerFirstToken: unavailableDuration('The non-streaming transport emitted no first-token event.'),
      providerCompletion: unavailableDuration('No provider dispatch occurred.'),
      tool: unavailableDuration('No tool executed.'),
      execution: unavailableDuration('No proposal execution occurred.'),
      render: unavailableDuration('No render occurred.'),
      proof: unavailableDuration('No hard proof occurred.'),
      reviewReady: unavailableDuration('No review pack was produced.'),
      humanReview: unavailableDuration('No human review occurred.'),
      correction: unavailableDuration('No correction occurred.'),
      endToEnd: measured('end-to-end', '2026-08-25T11:00:00.000Z', '2026-08-25T11:00:01.000Z'),
    },
    providerUsage: {
      disposition: 'UNAVAILABLE', attemptReceiptSha256s: [],
      inputTokens: null, cachedInputTokens: null,
      cacheWriteInputTokens: null, visibleOutputTokens: null, reasoningTokens: null,
      totalTokens: null, sourceReceiptSha256: null, reason: 'No provider dispatch occurred.',
    },
    costs: {
      frozenPriceEstimate: unavailableNano('FROZEN_PRICE_ESTIMATE', 'No provider usage exists.'),
      reservation: unavailableNano('BUDGET_RESERVATION', 'No budget was reserved.'),
      subscriptionCredit: {
        mode: 'SUBSCRIPTION_CREDIT', disposition: 'UNAVAILABLE', unit: 'CENTICREDIT',
        amount: null, source: null, reason: 'No subscription credit was allocated.',
      },
      render: unavailableNano('RENDER_COST', 'No render-cost receipt exists.'),
      storage: unavailableNano('STORAGE_COST', 'No storage-cost receipt exists.'),
      egress: unavailableNano('EGRESS_COST', 'No egress-cost receipt exists.'),
      human: unavailableNano('HUMAN_COST', 'No human-review cost receipt exists.'),
    },
    retryRepair: {
      providerAttemptCount: 0, providerRetryCount: 0, modelRepairCount: 0,
      renderAttemptCount: 0, renderRepairCount: 0, humanCorrectionCount: 0,
    },
    hardProof: { receipt: null, reason: 'No hard proof exists.' },
    blindReview: { receipt: null, resultId: null, reason: 'No blind review exists.' },
    issuedAt: '2026-08-25T11:00:02.000Z',
  };
}

function completeDurations(): Stage25MachineTelemetryInputV1['durations'] {
  return {
    queue: measured('queue-1', '2026-08-25T10:00:00.000Z', '2026-08-25T10:00:05.000Z'),
    providerFirstToken: measured('provider-1', '2026-08-25T10:00:05.000Z', '2026-08-25T10:00:07.000Z'),
    providerCompletion: measured('provider-1', '2026-08-25T10:00:05.000Z', '2026-08-25T10:00:10.000Z'),
    tool: measured('tool-1', '2026-08-25T10:00:10.000Z', '2026-08-25T10:00:20.000Z'),
    execution: measured('execution-1', '2026-08-25T10:00:10.000Z', '2026-08-25T10:00:30.000Z'),
    render: measured('render-1', '2026-08-25T10:00:30.000Z', '2026-08-25T10:01:00.000Z'),
    proof: measured('proof-1', '2026-08-25T10:01:00.000Z', '2026-08-25T10:01:10.000Z'),
    reviewReady: measured('review-ready-1', '2026-08-25T10:01:10.000Z', '2026-08-25T10:01:20.000Z'),
    humanReview: measured('human-review-1', '2026-08-25T10:01:20.000Z', '2026-08-25T10:02:20.000Z'),
    correction: { disposition: 'UNAVAILABLE', segments: [], durationMilliseconds: null, reason: 'No correction was performed.' },
    endToEnd: measured('end-to-end', '2026-08-25T10:00:00.000Z', '2026-08-25T10:10:00.000Z'),
  };
}

function completeCosts(blindReceiptSha256: string): Stage25MachineTelemetryCostMetricsV1 {
  return {
    frozenPriceEstimate: nano('FROZEN_PRICE_ESTIMATE', 2_000_000, 'provider-pricing-v1'),
    reservation: nano(
      'BUDGET_RESERVATION', 12_000_000,
      PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R,
    ),
    subscriptionCredit: {
      mode: 'SUBSCRIPTION_CREDIT', disposition: 'AVAILABLE', unit: 'CENTICREDIT',
      amount: 75,
      source: source(
        'subscription-credit', PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R,
      ),
      reason: null,
    },
    render: nano('RENDER_COST', 3_000_000, 'render-cost-owner-v1'),
    storage: nano('STORAGE_COST', 100_000, 'storage-cost-owner-v1'),
    egress: nano('EGRESS_COST', 200_000, 'egress-cost-owner-v1'),
    human: {
      ...nano('HUMAN_COST', 4_000_000, 'human-cost-owner-v1'),
      source: {
        ownerId: 'human-cost-owner', ownerVersion: 'human-cost-owner-v1',
        receiptSha256: blindReceiptSha256, allocationSha256: digest('allocation:HUMAN_COST'),
      },
    },
  };
}

function providerAttemptReceipt() {
  return createProviderNativeDurableAttemptReceiptV2R({
    episodeId: 'stage25-quality-episode-01', contextSha256: digest('context'),
    toolSetSha256: digest('tool-set'),
    route: {
      routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
      claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'low',
    },
    turn: 1, requestHash: digest('request'), maxOutputTokens: 1_024,
    result: {
      kind: 'RESPONSE_RECEIVED', responseStatus: 200,
      responseSha256: digest('response'), providerRequestId: 'provider-request-1',
    },
    accounting: {
      mode: 'PROVIDER_REPORTED_USAGE', accountedCostNanoUsd: 2_000_000,
      accountedOutputTokens: 35, isUpperBound: false,
      runtimeGuardAudit: [{ ordinal: 1, phase: 'AFTER_INVOKE', status: 'ALLOW' }],
    },
    retryDisposition: 'NO_RETRY_TERMINAL', occurredAt: '2026-08-25T10:00:10.000Z',
  });
}

function conservativeProviderAttemptReceipt() {
  return createProviderNativeDurableAttemptReceiptV2R({
    episodeId: 'stage25-quality-episode-01', contextSha256: digest('context'),
    toolSetSha256: digest('tool-set'),
    route: {
      routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
      claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'low',
    },
    turn: 1, requestHash: digest('conservative-request'), maxOutputTokens: 1_024,
    result: {
      kind: 'TRANSPORT_RESULT_UNAVAILABLE', transportErrorCode: 'TIMEOUT',
      errorSha256: digest('timeout-error'),
    },
    accounting: {
      mode: 'CONSERVATIVE_WORST_CASE_RESERVATION', accountedCostNanoUsd: 2_000_000,
      accountedOutputTokens: 35, isUpperBound: true,
      runtimeGuardAudit: [{ ordinal: 1, phase: 'AFTER_INVOKE', status: 'ALLOW' }],
    },
    retryDisposition: 'NO_RETRY_TERMINAL', occurredAt: '2026-08-25T10:00:10.000Z',
  });
}

function chainedProviderAttemptReceipt(previousAttempt: ReturnType<typeof providerAttemptReceipt>) {
  return createProviderNativeDurableAttemptReceiptV2R({
    episodeId: 'stage25-quality-episode-01', contextSha256: digest('context'),
    toolSetSha256: digest('tool-set'),
    route: {
      routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
      claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'low',
    },
    turn: 1, requestHash: digest('second-request'), maxOutputTokens: 1_024,
    result: {
      kind: 'RESPONSE_RECEIVED', responseStatus: 200,
      responseSha256: digest('second-response'), providerRequestId: 'provider-request-2',
    },
    accounting: {
      mode: 'PROVIDER_REPORTED_USAGE', accountedCostNanoUsd: 500_000,
      accountedOutputTokens: 10, isUpperBound: false,
      runtimeGuardAudit: [{ ordinal: 1, phase: 'AFTER_INVOKE', status: 'ALLOW' }],
    },
    retryDisposition: 'NO_RETRY_TERMINAL', occurredAt: '2026-08-25T10:00:11.000Z',
    previousAttempt,
  });
}

function proofReceipt() {
  const episodeReceiptSha256 = digest('episode-receipt');
  return bindProviderNativeExecutionBoundOutcomeProofReceiptV2R({
    tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
    episodeId: 'stage25-quality-episode-01',
    subject: {
      episodeReceiptSha256,
      executionTrace: { kind: 'FRESH_EPISODE_RECEIPT', receiptSha256: episodeReceiptSha256 },
      proposalReceiptSha256: digest('proposal'), finalStateSha256: digest('final-state'),
    },
    proofPolicy: {
      policyId: 'stage25-hard-proof', policyVersion: 'v1',
      policySha256: digest('proof-policy'),
    },
    obligations: [{
      obligationId: 'rendered-result', kind: 'render', disposition: 'PASS',
      proofReferenceIds: ['render-proof'],
    }],
    proofReferences: [{
      proofId: 'render-proof', proofSha256: digest('render-proof'), disposition: 'PASS',
    }],
    observedAt: '2026-08-25T10:01:10.000Z', summary: 'Bounded rendered proof passed.',
  });
}

function blindReceipt() {
  const contract = createBlindQualityReviewContractV1({
    taskId: 'stage25-quality-task-01', publicPackHash: digest('public-pack'),
    rubricHash: digest('rubric'),
    rubricDimensions: [{ dimensionId: 'quality', requiredForPass: true }],
    mediaBindings: [],
    resultBindings: [{
      artifactId: 'candidate-result', sha256: digest('candidate-result'),
      durationMilliseconds: 600_000,
      requiredPlaybackConfirmation: 'FULL_NORMAL_SPEED_VISUAL',
    }],
  });
  return finalizeBlindQualityReviewReceiptV1(contract, {
    contractHash: contract.contractHash, publicPackHash: contract.publicPackHash,
    rubricHash: contract.rubricHash,
    mediaBindingsHash: hashCanonicalJsonV1(contract.mediaBindings),
    resultBindingsHash: hashCanonicalJsonV1(contract.resultBindings),
    reviewer: {
      pseudonym: 'qualified-editor-01',
      qualification: { status: 'QUALIFIED_FOR_THIS_REVIEW', basis: 'Qualified professional editor.' },
      blinding: {
        candidateIdentityAccess: 'NOT_ACCESSED_BEFORE_COMPLETION',
        operatorKeyAccess: 'NOT_ACCESSED_BEFORE_COMPLETION',
        otherReviewerDecisionAccess: 'NOT_ACCESSED_BEFORE_COMPLETION',
      },
    },
    completedAt: '2026-08-25T10:02:20.000Z',
    playbackConfirmations: [{
      artifactRole: 'RESULT', artifactId: 'candidate-result',
      confirmation: 'FULL_NORMAL_SPEED_VISUAL',
    }],
    resultReviews: [{
      resultId: 'candidate-result', decision: 'PASS',
      confidence: { disposition: 'REPORTED', level: 'HIGH' },
      dimensionOutcomes: [{
        dimensionId: 'quality', disposition: 'SCORED', score: 900,
        rationale: 'The bounded result satisfies the frozen quality rubric.',
      }],
      defects: [],
      correction: {
        status: 'NOT_APPLICABLE', durationMilliseconds: null, estimatedMinutes: null,
        measuredEvidence: null, notes: 'The accepted result required no correction.',
      },
      notes: 'Blind result accepted.',
    }],
    ranking: {
      orderedResultIds: ['candidate-result'], preferredResultId: 'candidate-result',
      rationale: 'The sole bound result passed the rubric.',
      confidence: { disposition: 'REPORTED', level: 'HIGH' },
    },
    overallDecision: 'PASS', notes: 'Single-reviewer research evidence only.',
  });
}

function measured(id: string, startedAt: string, completedAt: string): Stage25DurationMetricV1 {
  const value = segment(id, startedAt, completedAt);
  return {
    disposition: 'MEASURED', segments: [value],
    durationMilliseconds: value.durationMilliseconds, reason: null,
  };
}

function segment(id: string, startedAt: string, completedAt: string) {
  return {
    segmentId: id, startedAt, completedAt,
    durationMilliseconds: Date.parse(completedAt) - Date.parse(startedAt),
    sourceEvidenceSha256: digest(`timing:${id}`),
  };
}

function nano<M extends Stage25NanoUsdCostModeV1>(
  mode: M,
  amount: number,
  ownerVersion: string,
) {
  return {
    mode, disposition: 'AVAILABLE' as const, unit: 'NANO_USD' as const, amount,
    source: source(mode, ownerVersion), reason: null,
  };
}

function unavailableNano<M extends Stage25NanoUsdCostModeV1>(mode: M, reason: string) {
  return {
    mode, disposition: 'UNAVAILABLE' as const, unit: 'NANO_USD' as const,
    amount: null, source: null, reason,
  };
}

function unavailableUsage(attemptReceiptSha256s: readonly string[], reason: string) {
  return {
    disposition: 'UNAVAILABLE' as const, attemptReceiptSha256s,
    inputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null,
    visibleOutputTokens: null, reasoningTokens: null, totalTokens: null,
    sourceReceiptSha256: null, reason,
  };
}

function source(label: string, ownerVersion: string) {
  return {
    ownerId: `${label.toLowerCase().replaceAll('_', '-')}-owner`, ownerVersion,
    receiptSha256: digest(`receipt:${label}`), allocationSha256: digest(`allocation:${label}`),
  };
}

function issue(value: JsonRecord) {
  return createStage25MachineTelemetryReceiptV1(
    value as unknown as Stage25MachineTelemetryInputV1,
  );
}

function mutable<T>(value: T): JsonRecord {
  return structuredClone(value) as JsonRecord;
}

function digest(value: string): string {
  return hashCanonicalJsonV1(value);
}
