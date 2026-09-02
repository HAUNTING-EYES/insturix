import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyV1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import type {
  MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1,
  MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1,
  MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1,
} from './media-proxy-master-transcode-execution-budget-settlement-v1';

export interface MediaProxyMasterTranscodeExecutionBudgetAuthorizationCoreV1 {
  readonly authorizationSha256: string;
  readonly ownerVersion: string;
  readonly policySha256: string;
}

export interface MediaProxyMasterTranscodeExecutionBudgetReservationCoreV1 {
  readonly reservationId: string;
}

export interface MediaProxyMasterTranscodeExecutionBudgetSettlementCoreV1 {
  readonly settlementSha256: string;
  readonly settledAt: string;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerRecordCoreV1<
  Authorization,
  Reservation,
  Settlement,
> {
  readonly authorization: Readonly<Authorization>;
  readonly reservation: Readonly<Reservation>;
  readonly settlement: Readonly<Settlement> | null;
  readonly recordSha256: string;
}

export interface MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1 {
  resolve(input: Readonly<{
    ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
    ownerVersion: string;
    policySha256: string;
  }>): Promise<Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>>;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1<
  Record,
> {
  get(reservationId: string): Promise<Readonly<Record> | null>;
  insert(record: Readonly<Record>): Promise<void>;
  replace(input: Readonly<{
    expectedRecordSha256: string;
    record: Readonly<Record>;
  }>): Promise<void>;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1<Record> {
  transact<T>(operation: (
    transaction: Readonly<
      MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1<Record>
    >,
  ) => Promise<T>): Promise<T>;
  get(reservationId: string): Promise<Readonly<Record> | null>;
}

export interface MediaProxyMasterTranscodeExecutionBudgetSettleRequestCoreV1 {
  reservationId: string;
  bindingSha256: string;
  mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
  terminalEvidence:
    MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
  usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerAdapterCoreV1<
  Authorization,
  Reservation,
  Settlement,
  Record,
> {
  assertAuthorization(
    value: unknown,
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  ): Readonly<Authorization>;
  createReservation(input: Readonly<{
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
    authorization: Readonly<Authorization>;
    reservationId: string;
    reservedAt: string;
  }>): Readonly<Reservation>;
  reservationReference(reservation: Readonly<Reservation>): Readonly<{
    reservationId: string;
    bindingSha256: string;
  }>;
  assertRecord(
    value: unknown,
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  ): Readonly<Record>;
  createReservedRecord(
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
    authorization: Readonly<Authorization>,
    reservation: Readonly<Reservation>,
  ): Readonly<Record>;
  createSettlement(input: Readonly<{
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
    authorization: Readonly<Authorization>;
    reservation: Readonly<Reservation>;
    mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
    terminalEvidence:
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
    usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
    settledAt: string;
  }>): Readonly<Settlement>;
  createSettledRecord(
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
    authorization: Readonly<Authorization>,
    reservation: Readonly<Reservation>,
    settlement: Readonly<Settlement>,
  ): Readonly<Record>;
  fail(code: string): never;
}

export interface MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1<
  Authorization,
  Reservation,
  Settlement,
  Record,
> {
  reserve(authorization: Readonly<Authorization>): Promise<Readonly<Reservation>>;
  resolve(input: Readonly<{
    reservationId: string;
    bindingSha256: string;
  }>): Promise<Readonly<{
    policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
    record: Readonly<Record>;
  }>>;
  settle(
    input: Readonly<MediaProxyMasterTranscodeExecutionBudgetSettleRequestCoreV1>,
  ): Promise<Readonly<Settlement>>;
}

export function createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1<
  Authorization extends
    MediaProxyMasterTranscodeExecutionBudgetAuthorizationCoreV1,
  Reservation extends
    MediaProxyMasterTranscodeExecutionBudgetReservationCoreV1,
  Settlement extends MediaProxyMasterTranscodeExecutionBudgetSettlementCoreV1,
  Record extends MediaProxyMasterTranscodeExecutionBudgetLedgerRecordCoreV1<
    Authorization,
    Reservation,
    Settlement
  >,
>(input: Readonly<{
  ledger: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1<Record>
  >;
  policyLocator: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1
  >;
  adapter: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerAdapterCoreV1<
      Authorization,
      Reservation,
      Settlement,
      Record
    >
  >;
  now?: () => string;
}>): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerCoreV1<
  Authorization,
  Reservation,
  Settlement,
  Record
>> {
  const now = input.now ?? (() => new Date().toISOString());
  return Object.freeze({
    reserve: async (authorizationInput: Readonly<Authorization>) => {
      const policy = await resolvePolicy(
        input.policyLocator,
        authorizationInput,
        input.adapter.fail,
      );
      const authorization = input.adapter.assertAuthorization(
        authorizationInput,
        policy,
      );
      const reservationId = `mpmtb_${authorization.authorizationSha256}`;
      return input.ledger.transact(async (transaction) => {
        const existing = await transaction.get(reservationId);
        if (existing) {
          const record = input.adapter.assertRecord(existing, policy);
          if (record.authorization.authorizationSha256
            !== authorization.authorizationSha256) {
            input.adapter.fail('LEDGER_RESERVATION_ID_CONFLICT');
          }
          return record.reservation;
        }
        const reservation = input.adapter.createReservation({
          policy,
          authorization,
          reservationId,
          reservedAt: now(),
        });
        await transaction.insert(input.adapter.createReservedRecord(
          policy,
          authorization,
          reservation,
        ));
        return reservation;
      });
    },

    resolve: async (request: Readonly<{
      reservationId: string;
      bindingSha256: string;
    }>) => {
      const reservationId = identity(
        request.reservationId,
        'RESERVATION_ID',
        input.adapter.fail,
      );
      const bindingSha256 = sha256(
        request.bindingSha256,
        'RESERVATION_BINDING',
        input.adapter.fail,
      );
      const stored = await input.ledger.get(reservationId);
      if (!stored) input.adapter.fail('LEDGER_RESERVATION_NOT_FOUND');
      const policy = await resolvePolicy(
        input.policyLocator,
        stored.authorization,
        input.adapter.fail,
      );
      const record = input.adapter.assertRecord(stored, policy);
      assertReservationBinding(
        input.adapter,
        record,
        reservationId,
        bindingSha256,
      );
      return Object.freeze({ policy, record });
    },

    settle: async (
      request: Readonly<
        MediaProxyMasterTranscodeExecutionBudgetSettleRequestCoreV1
      >,
    ) => input.ledger.transact(async (transaction) => {
      const reservationId = identity(
        request.reservationId,
        'RESERVATION_ID',
        input.adapter.fail,
      );
      const bindingSha256 = sha256(
        request.bindingSha256,
        'RESERVATION_BINDING',
        input.adapter.fail,
      );
      const stored = await transaction.get(reservationId);
      if (!stored) input.adapter.fail('LEDGER_RESERVATION_NOT_FOUND');
      const policy = await resolvePolicy(
        input.policyLocator,
        stored.authorization,
        input.adapter.fail,
      );
      const record = input.adapter.assertRecord(stored, policy);
      assertReservationBinding(
        input.adapter,
        record,
        reservationId,
        bindingSha256,
      );
      if (record.settlement) {
        const replay = settlementFor(
          input.adapter,
          record,
          policy,
          request,
          record.settlement.settledAt,
        );
        if (replay.settlementSha256
          !== record.settlement.settlementSha256) {
          input.adapter.fail('LEDGER_SETTLEMENT_CONFLICT');
        }
        return record.settlement;
      }
      const settlement = settlementFor(
        input.adapter,
        record,
        policy,
        request,
        now(),
      );
      await transaction.replace({
        expectedRecordSha256: record.recordSha256,
        record: input.adapter.createSettledRecord(
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

function settlementFor<Authorization, Reservation, Settlement, Record>(
  adapter: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerAdapterCoreV1<
      Authorization,
      Reservation,
      Settlement,
      Record
    >
  >,
  record: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordCoreV1<
      Authorization,
      Reservation,
      Settlement
    >
  >,
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  input: Readonly<MediaProxyMasterTranscodeExecutionBudgetSettleRequestCoreV1>,
  settledAt: string,
) {
  return adapter.createSettlement({
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
  locator: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorCoreV1
  >,
  authorization: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetAuthorizationCoreV1
  >,
  fail: (code: string) => never,
) {
  const request = {
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
    ownerVersion: identity(
      authorization.ownerVersion,
      'POLICY_OWNER_VERSION',
      fail,
    ),
    policySha256: sha256(authorization.policySha256, 'POLICY', fail),
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

function assertReservationBinding<Authorization, Reservation, Settlement, Record>(
  adapter: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerAdapterCoreV1<
      Authorization,
      Reservation,
      Settlement,
      Record
    >
  >,
  record: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordCoreV1<
      Authorization,
      Reservation,
      Settlement
    >
  >,
  reservationId: string,
  bindingSha256: string,
): void {
  const reference = adapter.reservationReference(record.reservation);
  if (reference.reservationId !== reservationId
    || reference.bindingSha256 !== bindingSha256) {
    adapter.fail('LEDGER_RESERVATION_BINDING_MISMATCH');
  }
}

function identity(
  value: unknown,
  label: string,
  fail: (code: string) => never,
): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    return fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(
  value: unknown,
  label: string,
  fail: (code: string) => never,
): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    return fail(`${label}_INVALID`);
  }
  return value;
}
