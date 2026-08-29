import {
  assertNativeMediaFinalRenderExecutionBudgetPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
  type NativeMediaFinalRenderExecutionBudgetPolicyV1,
  type NativeMediaFinalRenderExecutionBudgetUsageV1,
} from './native-media-final-render-execution-budget-policy-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  createNativeMediaFinalRenderExecutionBudgetReservationV1,
  nativeMediaFinalRenderExecutionBudgetReservationRefV1,
  type NativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  type NativeMediaFinalRenderExecutionBudgetReservationV1,
} from './native-media-final-render-execution-budget-reservation-v1';
import {
  createNativeMediaFinalRenderExecutionBudgetSettlementV1,
  type NativeMediaFinalRenderExecutionBudgetSettlementModeV1,
  type NativeMediaFinalRenderExecutionBudgetSettlementV1,
  type NativeMediaFinalRenderExecutionBudgetTerminalEvidenceV1,
} from './native-media-final-render-execution-budget-settlement-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetLedgerRecordV1,
  createNativeMediaFinalRenderExecutionBudgetReservedRecordV1,
  createNativeMediaFinalRenderExecutionBudgetSettledRecordV1,
  type NativeMediaFinalRenderExecutionBudgetLedgerRecordV1,
} from './native-media-final-render-execution-budget-ledger-record-v1';

type SettlementUsageV1 = Readonly<Omit<
  NativeMediaFinalRenderExecutionBudgetUsageV1,
  'usageEvidenceSha256'
>>;

export interface NativeMediaFinalRenderExecutionBudgetPolicyLocatorV1 {
  resolve(input: Readonly<{
    ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1;
    ownerVersion: string;
    policySha256: string;
  }>): Promise<Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1>>;
}

export interface NativeMediaFinalRenderExecutionBudgetLedgerTransactionV1 {
  get(reservationId: string): Promise<Readonly<
    NativeMediaFinalRenderExecutionBudgetLedgerRecordV1
  > | null>;
  insert(record: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1>): Promise<void>;
  replace(input: Readonly<{
    expectedRecordSha256: string;
    record: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1>;
  }>): Promise<void>;
}

export interface NativeMediaFinalRenderExecutionBudgetLedgerV1 {
  transact<T>(operation: (
    transaction: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerTransactionV1>,
  ) => Promise<T>): Promise<T>;
  get(reservationId: string): Promise<Readonly<
    NativeMediaFinalRenderExecutionBudgetLedgerRecordV1
  > | null>;
}

export interface NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1 {
  reserve(
    authorization: Readonly<NativeMediaFinalRenderExecutionBudgetAuthorizationV1>,
  ): Promise<Readonly<NativeMediaFinalRenderExecutionBudgetReservationV1>>;
  resolve(input: Readonly<{ reservationId: string; bindingSha256: string }>): Promise<Readonly<{
    policy: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1>;
    record: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1>;
  }>>;
  settle(input: Readonly<{
    reservationId: string;
    bindingSha256: string;
    mode: NativeMediaFinalRenderExecutionBudgetSettlementModeV1;
    terminalEvidence: NativeMediaFinalRenderExecutionBudgetTerminalEvidenceV1;
    usage: SettlementUsageV1 | null;
  }>): Promise<Readonly<NativeMediaFinalRenderExecutionBudgetSettlementV1>>;
}

type ReserveInputV1 = Parameters<
  NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1['reserve']
>[0];
type ResolveInputV1 = Parameters<
  NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1['resolve']
>[0];
type SettleInputV1 = Parameters<
  NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1['settle']
>[0];

export function createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1(
  input: Readonly<{
    ledger: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerV1>;
    policyLocator: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyLocatorV1>;
    now?: () => string;
  }>,
): Readonly<NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1> {
  const now = input.now ?? (() => new Date().toISOString());
  return Object.freeze({
    reserve: async (authorizationInput: ReserveInputV1) => {
      const policy = await resolvePolicy(input.policyLocator, authorizationInput);
      const authorization = assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
        authorizationInput,
        policy,
      );
      const reservationId = `nmfrb_${authorization.authorizationSha256}`;
      return input.ledger.transact(async (transaction) => {
        const existing = await transaction.get(reservationId);
        if (existing) {
          const record = assertNativeMediaFinalRenderExecutionBudgetLedgerRecordV1(
            existing,
            policy,
          );
          if (record.authorization.authorizationSha256
            !== authorization.authorizationSha256) {
            fail('LEDGER_RESERVATION_ID_CONFLICT');
          }
          return record.reservation;
        }
        const reservation = createNativeMediaFinalRenderExecutionBudgetReservationV1({
          policy,
          authorization,
          reservationId,
          reservedAt: now(),
        });
        await transaction.insert(
          createNativeMediaFinalRenderExecutionBudgetReservedRecordV1(
            policy,
            authorization,
            reservation,
          ),
        );
        return reservation;
      });
    },

    resolve: async (request: ResolveInputV1) => {
      const reservationId = identity(request.reservationId, 'RESERVATION_ID');
      const bindingSha256 = sha256(request.bindingSha256, 'RESERVATION_BINDING');
      const stored = await input.ledger.get(reservationId);
      if (!stored) fail('LEDGER_RESERVATION_NOT_FOUND');
      const policy = await resolvePolicy(input.policyLocator, stored!.authorization);
      const record = assertNativeMediaFinalRenderExecutionBudgetLedgerRecordV1(
        stored,
        policy,
      );
      assertReservationBinding(record, reservationId, bindingSha256);
      return Object.freeze({ policy, record });
    },

    settle: async (request: SettleInputV1) => input.ledger.transact(async (transaction) => {
      const reservationId = identity(request.reservationId, 'RESERVATION_ID');
      const bindingSha256 = sha256(request.bindingSha256, 'RESERVATION_BINDING');
      const stored = await transaction.get(reservationId);
      if (!stored) fail('LEDGER_RESERVATION_NOT_FOUND');
      const policy = await resolvePolicy(input.policyLocator, stored!.authorization);
      const record = assertNativeMediaFinalRenderExecutionBudgetLedgerRecordV1(
        stored,
        policy,
      );
      assertReservationBinding(record, reservationId, bindingSha256);
      if (record.settlement) {
        const replay = settlementFor(record, policy, request, record.settlement.settledAt);
        if (replay.settlementSha256 !== record.settlement.settlementSha256) {
          fail('LEDGER_SETTLEMENT_CONFLICT');
        }
        return record.settlement;
      }
      const settlement = settlementFor(record, policy, request, now());
      await transaction.replace({
        expectedRecordSha256: record.recordSha256,
        record: createNativeMediaFinalRenderExecutionBudgetSettledRecordV1(
          policy,
          record.authorization,
          record.reservation,
          settlement,
        ),
      });
      return settlement;
    }),
  });
}

function settlementFor(
  record: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1>,
  policy: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1>,
  input: Parameters<NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1['settle']>[0],
  settledAt: string,
) {
  return createNativeMediaFinalRenderExecutionBudgetSettlementV1({
    policy,
    authorization: record.authorization,
    reservation: record.reservation,
    mode: input.mode,
    terminalEvidence: input.terminalEvidence,
    usage: input.usage,
    settledAt,
  });
}

async function resolvePolicy(
  locator: Readonly<NativeMediaFinalRenderExecutionBudgetPolicyLocatorV1>,
  authorization: Readonly<NativeMediaFinalRenderExecutionBudgetAuthorizationV1>,
) {
  const request = {
    ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
    ownerVersion: identity(authorization.ownerVersion, 'POLICY_OWNER_VERSION'),
    policySha256: sha256(authorization.policySha256, 'POLICY'),
  };
  const policy = assertNativeMediaFinalRenderExecutionBudgetPolicyV1(
    await locator.resolve(request),
  );
  if (policy.ownerId !== request.ownerId || policy.ownerVersion !== request.ownerVersion
    || policy.policySha256 !== request.policySha256) {
    fail('LEDGER_POLICY_LOOKUP_MISMATCH');
  }
  return policy;
}

function assertReservationBinding(
  record: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerRecordV1>,
  reservationId: string,
  bindingSha256: string,
): void {
  const reference = nativeMediaFinalRenderExecutionBudgetReservationRefV1(
    record.reservation,
  );
  if (reference.reservationId !== reservationId
    || reference.bindingSha256 !== bindingSha256) {
    fail('LEDGER_RESERVATION_BINDING_MISMATCH');
  }
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new Error(`NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_${code}`);
}
