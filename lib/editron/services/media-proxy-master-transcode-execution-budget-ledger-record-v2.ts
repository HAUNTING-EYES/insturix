import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetPolicyV1 }
  from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  assertMediaProxyMasterTranscodeExecutionBudgetReservationV2,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  type MediaProxyMasterTranscodeExecutionBudgetReservationV2,
} from './media-proxy-master-transcode-execution-budget-reservation-v2';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetSettlementV2,
  type MediaProxyMasterTranscodeExecutionBudgetSettlementV2,
} from './media-proxy-master-transcode-execution-budget-settlement-v2';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_V2' as const;

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V2;
  recordVersion: 1 | 2;
  reservationId: string;
  status: 'RESERVED' | 'SETTLED';
  authorization:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2>;
  reservation: Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV2>;
  settlement:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementV2> | null;
  recordSha256: string;
}

export function createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  authorizationInput: unknown,
  reservationInput: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2> {
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(
      authorizationInput,
      policy,
    );
  const reservation =
    assertMediaProxyMasterTranscodeExecutionBudgetReservationV2(
      reservationInput,
      authorization,
      policy,
    );
  return freezeRecord({
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V2,
    recordVersion: 1,
    reservationId: reservation.reservationId,
    status: 'RESERVED',
    authorization,
    reservation,
    settlement: null,
  });
}

export function createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV2(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  authorizationInput: unknown,
  reservationInput: unknown,
  settlementInput: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2> {
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(
      authorizationInput,
      policy,
    );
  const reservation =
    assertMediaProxyMasterTranscodeExecutionBudgetReservationV2(
      reservationInput,
      authorization,
      policy,
    );
  const settlement =
    assertMediaProxyMasterTranscodeExecutionBudgetSettlementV2(
      settlementInput,
      authorization,
      reservation,
      policy,
    );
  return freezeRecord({
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V2,
    recordVersion: 2,
    reservationId: reservation.reservationId,
    status: 'SETTLED',
    authorization,
    reservation,
    settlement,
  });
}

export function assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2(
  value: unknown,
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('LEDGER_RECORD_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  const rebound = candidate.settlement === null
    ? createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2(
      policy,
      candidate.authorization,
      candidate.reservation,
    )
    : createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV2(
      policy,
      candidate.authorization,
      candidate.reservation,
      candidate.settlement,
    );
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('LEDGER_RECORD_INVALID');
  }
  return rebound;
}

function freezeRecord(
  material: Omit<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
    'recordSha256'
  >,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2> {
  return deepFreezeEditronJsonV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function fail(code: string): never {
  throw new Error(
    `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_V2_${code}`,
  );
}
