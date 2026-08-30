import type { MediaProxyMasterTranscodeExecutionBudgetPolicyV1 }
  from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  assertMediaProxyMasterTranscodeExecutionBudgetReservationV1,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  type MediaProxyMasterTranscodeExecutionBudgetReservationV1,
} from './media-proxy-master-transcode-execution-budget-reservation-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetSettlementV1,
  type MediaProxyMasterTranscodeExecutionBudgetSettlementV1,
} from './media-proxy-master-transcode-execution-budget-settlement-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_V1' as const;

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1;
  recordVersion: 1 | 2;
  reservationId: string;
  status: 'RESERVED' | 'SETTLED';
  authorization:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1>;
  reservation: Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV1>;
  settlement:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementV1> | null;
  recordSha256: string;
}

export function createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  authorizationInput: unknown,
  reservationInput: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1> {
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
      authorizationInput,
      policy,
    );
  const reservation =
    assertMediaProxyMasterTranscodeExecutionBudgetReservationV1(
      reservationInput,
      authorization,
      policy,
    );
  return freezeRecord({
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
    recordVersion: 1,
    reservationId: reservation.reservationId,
    status: 'RESERVED',
    authorization,
    reservation,
    settlement: null,
  });
}

export function createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  authorizationInput: unknown,
  reservationInput: unknown,
  settlementInput: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1> {
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
      authorizationInput,
      policy,
    );
  const reservation =
    assertMediaProxyMasterTranscodeExecutionBudgetReservationV1(
      reservationInput,
      authorization,
      policy,
    );
  const settlement =
    assertMediaProxyMasterTranscodeExecutionBudgetSettlementV1(
      settlementInput,
      authorization,
      reservation,
      policy,
    );
  return freezeRecord({
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
    recordVersion: 2,
    reservationId: reservation.reservationId,
    status: 'SETTLED',
    authorization,
    reservation,
    settlement,
  });
}

export function assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1(
  value: unknown,
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('LEDGER_RECORD_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  const rebound = candidate.settlement === null
    ? createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
      policy,
      candidate.authorization,
      candidate.reservation,
    )
    : createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1(
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
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
    'recordSha256'
  >,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1> {
  return deepFreezeEditronJsonV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function fail(code: string): never {
  throw new Error(
    `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_${code}`,
  );
}
