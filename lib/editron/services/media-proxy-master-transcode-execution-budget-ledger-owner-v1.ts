import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyV1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
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
import {
  assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
  createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1,
  createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
} from './media-proxy-master-transcode-execution-budget-ledger-record-v1';

export interface MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1 {
  resolve(input: Readonly<{
    ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
    ownerVersion: string;
    policySha256: string;
  }>): Promise<Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>>;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV1 {
  get(reservationId: string): Promise<Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  > | null>;
  insert(
    record: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1>,
  ): Promise<void>;
  replace(input: Readonly<{
    expectedRecordSha256: string;
    record: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1>;
  }>): Promise<void>;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerV1 {
  transact<T>(operation: (
    transaction:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV1>,
  ) => Promise<T>): Promise<T>;
  get(reservationId: string): Promise<Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  > | null>;
}

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

type ReserveInputV1 = Parameters<
  MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1['reserve']
>[0];
type ResolveInputV1 = Parameters<
  MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1['resolve']
>[0];
type SettleInputV1 = Parameters<
  MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1['settle']
>[0];

export function createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1(
  input: Readonly<{
    ledger: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerV1>;
    policyLocator:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1>;
    now?: () => string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1> {
  const now = input.now ?? (() => new Date().toISOString());
  return Object.freeze({
    reserve: async (authorizationInput: ReserveInputV1) => {
      const policy = await resolvePolicy(
        input.policyLocator,
        authorizationInput,
      );
      const authorization =
        assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
          authorizationInput,
          policy,
        );
      const reservationId = `mpmtb_${authorization.authorizationSha256}`;
      return input.ledger.transact(async (transaction) => {
        const existing = await transaction.get(reservationId);
        if (existing) {
          const record =
            assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1(
              existing,
              policy,
            );
          if (record.authorization.authorizationSha256
            !== authorization.authorizationSha256) {
            fail('LEDGER_RESERVATION_ID_CONFLICT');
          }
          return record.reservation;
        }
        const reservation =
          createMediaProxyMasterTranscodeExecutionBudgetReservationV1({
            policy,
            authorization,
            reservationId,
            reservedAt: now(),
          });
        await transaction.insert(
          createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
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
      const bindingSha256 = sha256(
        request.bindingSha256,
        'RESERVATION_BINDING',
      );
      const stored = await input.ledger.get(reservationId);
      if (!stored) fail('LEDGER_RESERVATION_NOT_FOUND');
      const policy = await resolvePolicy(
        input.policyLocator,
        stored!.authorization,
      );
      const record =
        assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1(
          stored,
          policy,
        );
      assertReservationBinding(record, reservationId, bindingSha256);
      return Object.freeze({ policy, record });
    },

    settle: async (request: SettleInputV1) => input.ledger.transact(
      async (transaction) => {
        const reservationId = identity(
          request.reservationId,
          'RESERVATION_ID',
        );
        const bindingSha256 = sha256(
          request.bindingSha256,
          'RESERVATION_BINDING',
        );
        const stored = await transaction.get(reservationId);
        if (!stored) fail('LEDGER_RESERVATION_NOT_FOUND');
        const policy = await resolvePolicy(
          input.policyLocator,
          stored!.authorization,
        );
        const record =
          assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1(
            stored,
            policy,
          );
        assertReservationBinding(record, reservationId, bindingSha256);
        if (record.settlement) {
          const replay = settlementFor(
            record,
            policy,
            request,
            record.settlement.settledAt,
          );
          if (replay.settlementSha256
            !== record.settlement.settlementSha256) {
            fail('LEDGER_SETTLEMENT_CONFLICT');
          }
          return record.settlement;
        }
        const settlement = settlementFor(record, policy, request, now());
        await transaction.replace({
          expectedRecordSha256: record.recordSha256,
          record:
            createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1(
              policy,
              record.authorization,
              record.reservation,
              settlement,
            ),
        });
        return settlement;
      },
    ),
  });
}

function settlementFor(
  record: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1>,
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  input: SettleInputV1,
  settledAt: string,
) {
  return createMediaProxyMasterTranscodeExecutionBudgetSettlementV1({
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
  locator: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1>,
  authorization:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1>,
) {
  const request = {
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
    ownerVersion: identity(
      authorization.ownerVersion,
      'POLICY_OWNER_VERSION',
    ),
    policySha256: sha256(authorization.policySha256, 'POLICY'),
  };
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    await locator.resolve(request),
  );
  if (policy.ownerId !== request.ownerId
    || policy.ownerVersion !== request.ownerVersion
    || policy.policySha256 !== request.policySha256) {
    fail('LEDGER_POLICY_LOOKUP_MISMATCH');
  }
  return policy;
}

function assertReservationBinding(
  record: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1>,
  reservationId: string,
  bindingSha256: string,
): void {
  const reference = mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(
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
  throw new Error(
    `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_${code}`,
  );
}
