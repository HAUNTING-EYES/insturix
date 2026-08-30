import {
  createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1,
} from './media-proxy-master-transcode-execution-budget-ledger-owner-core-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
  createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1,
  createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
} from './media-proxy-master-transcode-execution-budget-ledger-record-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetPolicyV1 }
  from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV1,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV1,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  type MediaProxyMasterTranscodeExecutionBudgetReservationV1,
} from './media-proxy-master-transcode-execution-budget-reservation-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetSettlementV1,
  type MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1,
  type MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1,
  type MediaProxyMasterTranscodeExecutionBudgetSettlementV1,
  type MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1,
} from './media-proxy-master-transcode-execution-budget-settlement-v1';

export type MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1 =
  MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1;

export type MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV1 =
  MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >;

export type MediaProxyMasterTranscodeExecutionBudgetLedgerV1 =
  MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >;

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 {
  reserve(
    authorization:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1>,
  ): Promise<Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV1>>;
  resolve(input: Readonly<{
    reservationId: string;
    bindingSha256: string;
  }>): Promise<Readonly<{
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
    record: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1>;
  }>>;
  settle(input: Readonly<{
    reservationId: string;
    bindingSha256: string;
    mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
    terminalEvidence:
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
    usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
  }>): Promise<Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementV1>>;
}

export function createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1(
  input: Readonly<{
    ledger: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerV1>;
    policyLocator:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1>;
    now?: () => string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1> {
  return createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
    MediaProxyMasterTranscodeExecutionBudgetReservationV1,
    MediaProxyMasterTranscodeExecutionBudgetSettlementV1,
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >({
    ...input,
    adapter: {
      assertAuthorization:
        assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
      createReservation:
        createMediaProxyMasterTranscodeExecutionBudgetReservationV1,
      reservationReference:
        mediaProxyMasterTranscodeExecutionBudgetReservationRefV1,
      assertRecord:
        assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
      createReservedRecord:
        createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1,
      createSettlement:
        createMediaProxyMasterTranscodeExecutionBudgetSettlementV1,
      createSettledRecord:
        createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1,
      fail,
    },
  });
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1(
    code,
  );
}

export class MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_${code}`);
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1';
  }
}
