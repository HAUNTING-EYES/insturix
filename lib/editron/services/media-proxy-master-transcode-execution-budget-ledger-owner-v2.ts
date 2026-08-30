import {
  createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1,
} from './media-proxy-master-transcode-execution-budget-ledger-owner-core-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
  createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2,
  createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV2,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
} from './media-proxy-master-transcode-execution-budget-ledger-record-v2';
import type { MediaProxyMasterTranscodeExecutionBudgetPolicyV1 }
  from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV2,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV2,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  type MediaProxyMasterTranscodeExecutionBudgetReservationV2,
} from './media-proxy-master-transcode-execution-budget-reservation-v2';
import type {
  MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1,
  MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1,
  MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1,
} from './media-proxy-master-transcode-execution-budget-settlement-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetSettlementV2,
  type MediaProxyMasterTranscodeExecutionBudgetSettlementV2,
} from './media-proxy-master-transcode-execution-budget-settlement-v2';

export type MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV2 =
  MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1;

export type MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV2 =
  MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2
  >;

export type MediaProxyMasterTranscodeExecutionBudgetLedgerV2 =
  MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2
  >;

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 {
  reserve(
    authorization:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2>,
  ): Promise<Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV2>>;
  resolve(input: Readonly<{
    reservationId: string;
    bindingSha256: string;
  }>): Promise<Readonly<{
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
    record: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2>;
  }>>;
  settle(input: Readonly<{
    reservationId: string;
    bindingSha256: string;
    mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
    terminalEvidence:
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
    usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
  }>): Promise<Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementV2>>;
}

export function createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2(
  input: Readonly<{
    ledger: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerV2>;
    policyLocator:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV2>;
    now?: () => string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2> {
  return createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
    MediaProxyMasterTranscodeExecutionBudgetReservationV2,
    MediaProxyMasterTranscodeExecutionBudgetSettlementV2,
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2
  >({
    ...input,
    adapter: {
      assertAuthorization:
        assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
      createReservation:
        createMediaProxyMasterTranscodeExecutionBudgetReservationV2,
      reservationReference:
        mediaProxyMasterTranscodeExecutionBudgetReservationRefV2,
      assertRecord:
        assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
      createReservedRecord:
        createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2,
      createSettlement:
        createMediaProxyMasterTranscodeExecutionBudgetSettlementV2,
      createSettledRecord:
        createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV2,
      fail,
    },
  });
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2(
    code,
  );
}

export class MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2
  extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_V2_${code}`);
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2';
  }
}
