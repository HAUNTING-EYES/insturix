import type { WalletRef } from './project-ownership';
import type { ProviderNativeProductBudgetReservationLocatorV2R }
  from './provider-native-product-budget-owner-v2r';
import type { ProviderNativeProductTerminalReservationLocatorV2R }
  from './provider-native-product-terminal-settlement-v2r';
import {
  assertProviderNativeProductBudgetAuthorizationV2R,
  assertProviderNativeProductBudgetReservationV2R,
  assertProviderNativeProductBudgetSettlementV2R,
  createProviderNativeProductBudgetReservationV2R,
  createProviderNativeProductBudgetSettlementV2R,
  type ProviderNativeProductBudgetAuthorizationV2R,
  type ProviderNativeProductBudgetReservationV2R,
  type ProviderNativeProductBudgetSettlementRequestV2R,
  type ProviderNativeProductBudgetSettlementV2R,
  type ProviderNativeProductBudgetWalletPortV2R,
} from './provider-native-product-budget-v2r';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_V2R_1' as const;

export interface ProviderNativeProductBudgetWalletSnapshotV2R {
  wallet: Readonly<WalletRef>;
  subscriptionCentiCredits: number;
  topupCentiCredits: number;
  subscriptionExpiresAt: string | null;
}

export interface ProviderNativeProductBudgetCreditRecordV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R;
  recordVersion: 1 | 2;
  reservationId: string;
  status: 'RESERVED' | 'SETTLED' | 'RELEASED';
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
  reservedSplit: Readonly<{
    subscriptionCentiCredits: number;
    topupCentiCredits: number;
    subscriptionExpiresAt: string | null;
  }>;
  settlement: Readonly<ProviderNativeProductBudgetSettlementV2R> | null;
  recordSha256: string;
}

export interface ProviderNativeProductBudgetCreditLedgerTransactionV2R {
  get(reservationId: string): Promise<Readonly<ProviderNativeProductBudgetCreditRecordV2R> | null>;
  readWallet(wallet: Readonly<WalletRef>): Promise<Readonly<ProviderNativeProductBudgetWalletSnapshotV2R> | null>;
  reserveWallet(input: Readonly<{
    reservationId: string;
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    subscriptionCentiCredits: number;
    topupCentiCredits: number;
    reservedAt: string;
  }>): Promise<Readonly<{
    walletReservationTransactionId: string;
    walletReservationReceiptSha256: string;
  }>>;
  insert(record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>): Promise<void>;
  settleWallet(input: Readonly<{
    record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>;
    requested: ProviderNativeProductBudgetSettlementRequestV2R;
    returnSubscriptionCentiCredits: number;
    returnTopupCentiCredits: number;
    settledAt: string;
  }>): Promise<Readonly<{ walletSettlementReceiptSha256: string }>>;
  replaceSettlement(input: Readonly<{
    expectedRecordSha256: string;
    record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>;
  }>): Promise<void>;
}

export interface ProviderNativeProductBudgetCreditLedgerV2R {
  transact<T>(operation: (
    transaction: Readonly<ProviderNativeProductBudgetCreditLedgerTransactionV2R>,
  ) => Promise<T>): Promise<T>;
  getByGuardIdentity(
    guardIdentitySha256: string,
  ): Promise<Readonly<ProviderNativeProductBudgetCreditRecordV2R> | null>;
}

export type ProviderNativeProductBudgetCreditsOwnerV2R =
  ProviderNativeProductBudgetWalletPortV2R
  & ProviderNativeProductBudgetReservationLocatorV2R
  & ProviderNativeProductTerminalReservationLocatorV2R;

/**
 * Sole product-budget policy coordinator. The injected ledger must execute the
 * wallet movement and record transition in one atomic transaction. This owner
 * performs no project mutation and never calls a provider.
 */
export function createProviderNativeProductBudgetCreditsOwnerV2R(input: Readonly<{
  ledger: Readonly<ProviderNativeProductBudgetCreditLedgerV2R>;
  now?: () => string;
}>): Readonly<ProviderNativeProductBudgetCreditsOwnerV2R> {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    reserve: async ({ authorization: authorizationInput }) => {
      const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
        authorizationInput,
      );
      const reservationId = reservationIdFor(authorization.authorizationSha256);
      const reservedAt = normalizedTimestamp(now(), 'RESERVED_AT');
      return input.ledger.transact(async (transaction) => {
        const existing = await transaction.get(reservationId);
        if (existing) {
          const record = assertProviderNativeProductBudgetCreditRecordV2R(existing);
          if (record.authorization.authorizationSha256 !== authorization.authorizationSha256) {
            fail('CREDIT_RESERVATION_ID_CONFLICT');
          }
          if (record.status !== 'RESERVED') fail('CREDIT_RESERVATION_ALREADY_TERMINAL');
          return record.reservation;
        }
        const snapshot = await transaction.readWallet(authorization.wallet);
        if (!snapshot || !sameWallet(snapshot.wallet, authorization.wallet)) {
          fail('CREDIT_RESERVATION_WALLET_NOT_FOUND');
        }
        const split = reservationSplit(snapshot, authorization);
        const walletReceipt = await transaction.reserveWallet({
          reservationId,
          authorization,
          subscriptionCentiCredits: split.subscriptionCentiCredits,
          topupCentiCredits: split.topupCentiCredits,
          reservedAt,
        });
        const reservation = createProviderNativeProductBudgetReservationV2R({
          authorization,
          reservationId,
          walletReservationTransactionId: walletReceipt.walletReservationTransactionId,
          walletReservationReceiptSha256: walletReceipt.walletReservationReceiptSha256,
          reservedAt,
        });
        const record = createReservedRecord(authorization, reservation, split);
        await transaction.insert(record);
        return reservation;
      });
    },

    settle: async ({ authorization: authorizationInput, reservation: reservationInput, requested }) => {
      const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
        authorizationInput,
      );
      const reservation = assertProviderNativeProductBudgetReservationV2R(
        reservationInput,
        authorization,
      );
      const settledAt = normalizedTimestamp(now(), 'SETTLED_AT');
      return input.ledger.transact(async (transaction) => {
        const stored = await transaction.get(reservation.reservationId);
        if (!stored) fail('CREDIT_RESERVATION_NOT_FOUND');
        const record = assertProviderNativeProductBudgetCreditRecordV2R(stored);
        assertRecordBindings(record, authorization, reservation);
        if (record.settlement) {
          if (!sameSettlementRequest(record.settlement, requested)) {
            fail('CREDIT_RESERVATION_SETTLEMENT_CONFLICT');
          }
          return record.settlement;
        }
        const prevalidated = createProviderNativeProductBudgetSettlementV2R({
          authorization,
          reservation,
          ...requested,
          walletSettlementReceiptSha256: '0'.repeat(64),
          settledAt,
        });
        const release = settlementReleaseSplit(record, prevalidated, settledAt);
        const walletReceipt = await transaction.settleWallet({
          record,
          requested,
          returnSubscriptionCentiCredits: release.subscriptionCentiCredits,
          returnTopupCentiCredits: release.topupCentiCredits,
          settledAt,
        });
        const settlement = createProviderNativeProductBudgetSettlementV2R({
          authorization,
          reservation,
          ...requested,
          walletSettlementReceiptSha256: walletReceipt.walletSettlementReceiptSha256,
          settledAt,
        });
        const settledRecord = createSettledRecord(record, settlement);
        await transaction.replaceSettlement({
          expectedRecordSha256: record.recordSha256,
          record: settledRecord,
        });
        return settlement;
      });
    },

    resolve: async (request) => {
      const stored = await input.ledger.getByGuardIdentity(
        request.expectedGuardIdentitySha256,
      );
      if (!stored) fail('CREDIT_RESERVATION_NOT_FOUND');
      const record = assertProviderNativeProductBudgetCreditRecordV2R(stored);
      if (record.status !== 'RESERVED'
        || record.reservation.guardKind !== request.guardKind
        || record.reservation.guardIdentitySha256 !== request.expectedGuardIdentitySha256
        || !sameScope(record.authorization.scope, request.scope)) {
        fail('CREDIT_RESERVATION_GUARD_MISMATCH');
      }
      return { authorization: record.authorization, reservation: record.reservation };
    },

    resolveTerminal: async (request) => {
      const stored = await input.ledger.getByGuardIdentity(
        request.expectedGuardIdentitySha256,
      );
      if (!stored) fail('CREDIT_RESERVATION_NOT_FOUND');
      const record = assertProviderNativeProductBudgetCreditRecordV2R(stored);
      if (record.reservation.reservationId !== request.reservationId
        || record.reservation.guardIdentitySha256
          !== request.expectedGuardIdentitySha256) {
        fail('CREDIT_TERMINAL_RESERVATION_BINDING_MISMATCH');
      }
      return {
        authorization: record.authorization,
        reservation: record.reservation,
      };
    },
  };
}

export function assertProviderNativeProductBudgetCreditRecordV2R(
  value: unknown,
): Readonly<ProviderNativeProductBudgetCreditRecordV2R> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('CREDIT_RESERVATION_RECORD_INVALID');
  }
  const candidate = value as ProviderNativeProductBudgetCreditRecordV2R;
  const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
    candidate.authorization,
  );
  const reservation = assertProviderNativeProductBudgetReservationV2R(
    candidate.reservation,
    authorization,
  );
  const split = normalizeStoredSplit(candidate.reservedSplit, reservation);
  const rebound = candidate.settlement === null
    ? createReservedRecord(authorization, reservation, split)
    : createSettledRecord(
      createReservedRecord(authorization, reservation, split),
      assertProviderNativeProductBudgetSettlementV2R(
        candidate.settlement,
        authorization,
        reservation,
      ),
    );
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('CREDIT_RESERVATION_RECORD_INVALID');
  }
  return rebound;
}

function reservationSplit(
  snapshot: Readonly<ProviderNativeProductBudgetWalletSnapshotV2R>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
) {
  const subscription = centi(snapshot.subscriptionCentiCredits, 'SUBSCRIPTION_BALANCE');
  const topup = centi(snapshot.topupCentiCredits, 'TOPUP_BALANCE');
  const reserved = authorization.limits.absoluteMaxCustomerChargeCentiCredits;
  if (subscription + topup < reserved) fail('CREDIT_RESERVATION_INSUFFICIENT_BALANCE');
  const fromSubscription = Math.min(subscription, reserved);
  const fromTopup = reserved - fromSubscription;
  const expiry = snapshot.subscriptionExpiresAt === null
    ? null : normalizedTimestamp(snapshot.subscriptionExpiresAt, 'SUBSCRIPTION_EXPIRY');
  if (fromSubscription > 0
    && (!expiry || Date.parse(expiry) < Date.parse(authorization.approval.expiresAt))) {
    fail('CREDIT_RESERVATION_SUBSCRIPTION_EXPIRY_CONFLICT');
  }
  return {
    subscriptionCentiCredits: fromSubscription,
    topupCentiCredits: fromTopup,
    subscriptionExpiresAt: expiry,
  } as const;
}

function settlementReleaseSplit(
  record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>,
  settlement: Readonly<ProviderNativeProductBudgetSettlementV2R>,
  settledAt: string,
) {
  const chargedSubscription = Math.min(
    record.reservedSplit.subscriptionCentiCredits,
    settlement.chargedCentiCredits,
  );
  const chargedTopup = settlement.chargedCentiCredits - chargedSubscription;
  if (chargedTopup > record.reservedSplit.topupCentiCredits) {
    fail('CREDIT_RESERVATION_CHARGE_SPLIT_INVALID');
  }
  const subscriptionCentiCredits =
    record.reservedSplit.subscriptionCentiCredits - chargedSubscription;
  const topupCentiCredits = record.reservedSplit.topupCentiCredits - chargedTopup;
  if (subscriptionCentiCredits + topupCentiCredits !== settlement.releasedCentiCredits) {
    fail('CREDIT_RESERVATION_RELEASE_SPLIT_INVALID');
  }
  if (subscriptionCentiCredits > 0
    && (!record.reservedSplit.subscriptionExpiresAt
      || Date.parse(settledAt) >= Date.parse(record.reservedSplit.subscriptionExpiresAt))) {
    fail('CREDIT_RESERVATION_SUBSCRIPTION_RELEASE_EXPIRED');
  }
  return { subscriptionCentiCredits, topupCentiCredits } as const;
}

function createReservedRecord(
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>,
  split: ProviderNativeProductBudgetCreditRecordV2R['reservedSplit'],
) {
  return freezeRecord({
    version: PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R,
    recordVersion: 1 as const,
    reservationId: reservation.reservationId,
    status: 'RESERVED' as const,
    authorization,
    reservation,
    reservedSplit: split,
    settlement: null,
  });
}

function createSettledRecord(
  record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>,
  settlement: Readonly<ProviderNativeProductBudgetSettlementV2R>,
) {
  return freezeRecord({
    version: PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R,
    recordVersion: 2 as const,
    reservationId: record.reservationId,
    status: settlement.status,
    authorization: record.authorization,
    reservation: record.reservation,
    reservedSplit: record.reservedSplit,
    settlement,
  });
}

function freezeRecord<T extends Omit<ProviderNativeProductBudgetCreditRecordV2R, 'recordSha256'>>(
  material: T,
): Readonly<ProviderNativeProductBudgetCreditRecordV2R> {
  return deepFreezeEditronJsonV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function normalizeStoredSplit(
  split: ProviderNativeProductBudgetCreditRecordV2R['reservedSplit'],
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>,
) {
  const result = {
    subscriptionCentiCredits: centi(split.subscriptionCentiCredits, 'RESERVED_SUBSCRIPTION'),
    topupCentiCredits: centi(split.topupCentiCredits, 'RESERVED_TOPUP'),
    subscriptionExpiresAt: split.subscriptionExpiresAt === null
      ? null : normalizedTimestamp(split.subscriptionExpiresAt, 'SUBSCRIPTION_EXPIRY'),
  };
  if (result.subscriptionCentiCredits + result.topupCentiCredits
    !== reservation.reservedCentiCredits) {
    fail('CREDIT_RESERVATION_STORED_SPLIT_INVALID');
  }
  return result;
}

function assertRecordBindings(
  record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>,
) {
  if (record.authorization.authorizationSha256 !== authorization.authorizationSha256
    || record.reservation.reservationSha256 !== reservation.reservationSha256) {
    fail('CREDIT_RESERVATION_BINDING_MISMATCH');
  }
}

function sameSettlementRequest(
  settlement: Readonly<ProviderNativeProductBudgetSettlementV2R>,
  requested: ProviderNativeProductBudgetSettlementRequestV2R,
) {
  return canonicalizeEditronJsonV1({
    mode: settlement.mode,
    terminalDisposition: settlement.terminalDisposition,
    actualProviderSpendNanoUsd: settlement.actualProviderSpendNanoUsd,
    chargedCentiCredits: settlement.chargedCentiCredits,
    releasedCentiCredits: settlement.releasedCentiCredits,
    providerAttemptReceiptSha256s: settlement.providerAttemptReceiptSha256s,
    executionEvidence: settlement.executionEvidence,
    customerChargeComputationSha256: settlement.customerChargeComputationSha256,
  }) === canonicalizeEditronJsonV1(requested);
}

function reservationIdFor(authorizationSha256: string) {
  return `pnb_${authorizationSha256}`;
}

function centi(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`CREDIT_RESERVATION_${label}_INVALID`);
  return Number(value);
}

function normalizedTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(`CREDIT_RESERVATION_${label}_INVALID`);
  return new Date(milliseconds).toISOString();
}

function sameWallet(left: Readonly<WalletRef>, right: Readonly<WalletRef>) {
  return canonicalizeEditronJsonV1(left) === canonicalizeEditronJsonV1(right);
}

function sameScope(
  left: Readonly<ProviderNativeProductBudgetAuthorizationV2R['scope']>,
  right: Readonly<ProviderNativeProductBudgetAuthorizationV2R['scope']>,
) {
  return left.tenantId === right.tenantId && left.userId === right.userId
    && left.projectId === right.projectId && left.episodeId === right.episodeId;
}

function fail(message: string): never {
  throw new Error(message);
}
