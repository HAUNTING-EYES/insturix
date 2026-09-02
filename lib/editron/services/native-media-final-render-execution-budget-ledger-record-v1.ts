import type { NativeMediaFinalRenderExecutionBudgetPolicyV1 }
  from './native-media-final-render-execution-budget-policy-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  assertNativeMediaFinalRenderExecutionBudgetReservationV1,
  type NativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  type NativeMediaFinalRenderExecutionBudgetReservationV1,
} from './native-media-final-render-execution-budget-reservation-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetSettlementV1,
  type NativeMediaFinalRenderExecutionBudgetSettlementV1,
} from './native-media-final-render-execution-budget-settlement-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_LEDGER_RECORD_V1' as const;

export interface NativeMediaFinalRenderExecutionBudgetLedgerRecordV1 {
  version: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1;
  recordVersion: 1 | 2;
  reservationId: string;
  status: 'RESERVED' | 'SETTLED';
  authorization: Readonly<NativeMediaFinalRenderExecutionBudgetAuthorizationV1>;
  reservation: Readonly<NativeMediaFinalRenderExecutionBudgetReservationV1>;
  settlement: Readonly<NativeMediaFinalRenderExecutionBudgetSettlementV1> | null;
  recordSha256: string;
}

export function createNativeMediaFinalRenderExecutionBudgetReservedRecordV1(
  policy: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1>,
  authorizationInput: unknown,
  reservationInput: unknown,
): Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1> {
  const authorization = assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
    authorizationInput,
    policy,
  );
  const reservation = assertNativeMediaFinalRenderExecutionBudgetReservationV1(
    reservationInput,
    authorization,
    policy,
  );
  return freezeRecord({
    version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
    recordVersion: 1,
    reservationId: reservation.reservationId,
    status: 'RESERVED',
    authorization,
    reservation,
    settlement: null,
  });
}

export function createNativeMediaFinalRenderExecutionBudgetSettledRecordV1(
  policy: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1>,
  authorizationInput: unknown,
  reservationInput: unknown,
  settlementInput: unknown,
): Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1> {
  const authorization = assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
    authorizationInput,
    policy,
  );
  const reservation = assertNativeMediaFinalRenderExecutionBudgetReservationV1(
    reservationInput,
    authorization,
    policy,
  );
  const settlement = assertNativeMediaFinalRenderExecutionBudgetSettlementV1(
    settlementInput,
    authorization,
    reservation,
    policy,
  );
  return freezeRecord({
    version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
    recordVersion: 2,
    reservationId: reservation.reservationId,
    status: 'SETTLED',
    authorization,
    reservation,
    settlement,
  });
}

export function assertNativeMediaFinalRenderExecutionBudgetLedgerRecordV1(
  value: unknown,
  policy: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1>,
): Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('LEDGER_RECORD_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  const rebound = candidate.settlement === null
    ? createNativeMediaFinalRenderExecutionBudgetReservedRecordV1(
      policy,
      candidate.authorization,
      candidate.reservation,
    )
    : createNativeMediaFinalRenderExecutionBudgetSettledRecordV1(
      policy,
      candidate.authorization,
      candidate.reservation,
      candidate.settlement,
    );
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('LEDGER_RECORD_INVALID');
  }
  return rebound;
}

function freezeRecord(
  material: Omit<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1, 'recordSha256'>,
): Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1> {
  return deepFreezeEditronJsonV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function fail(code: string): never {
  throw new Error(`NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_${code}`);
}
