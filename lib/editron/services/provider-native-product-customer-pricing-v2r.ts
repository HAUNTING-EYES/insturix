import {
  assertProviderNativeProductBudgetAuthorizationV2R,
  assertProviderNativeProductBudgetReservationV2R,
  type ProviderNativeProductBudgetAuthorizationV2R,
} from './provider-native-product-budget-v2r';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  createProviderNativeProductCustomerChargeReceiptV2R,
  type ProviderNativeProductCustomerChargeOwnerV2R,
} from './provider-native-product-customer-charge-v2r';

export const PROVIDER_NATIVE_PRODUCT_CUSTOMER_PRICING_POLICY_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_CUSTOMER_PRICING_POLICY_V2R_1' as const;

export interface ProviderNativeProductCustomerPricingPolicyV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_CUSTOMER_PRICING_POLICY_VERSION_V2R;
  authority: 'FINANCE_OWNED_PRODUCT_CUSTOMER_PRICING_POLICY';
  ownerId: string;
  ownerVersion: string;
  currency: 'EDITRON_CREDIT';
  billingQuantum: 'CENTICREDIT';
  creditPool: 'main';
  effectiveAt: string;
  expiresAt: string;
  formula: Readonly<{
    kind: 'LINEAR_PROVIDER_SPEND_V1';
    centiCreditsNumerator: number;
    providerSpendNanoUsdDenominator: number;
    rounding: 'CEIL_TOTAL_EPISODE_TO_CENTICREDIT';
  }>;
  pricingSha256: string;
}

export interface ProviderNativeProductCustomerPricingPolicyLocatorV2R {
  resolve(input: Readonly<{
    ownerId: string;
    ownerVersion: string;
    pricingSha256: string;
  }>): Promise<Readonly<ProviderNativeProductCustomerPricingPolicyV2R>>;
}

type ProviderNativeProductCustomerChargeRequestV2R = Parameters<
  ProviderNativeProductCustomerChargeOwnerV2R['compute']
>[0];

export function createProviderNativeProductCustomerPricingPolicyV2R(
  input: Readonly<{
    ownerId: string;
    ownerVersion: string;
    effectiveAt: string;
    expiresAt: string;
    centiCreditsNumerator: number;
    providerSpendNanoUsdDenominator: number;
  }>,
): Readonly<ProviderNativeProductCustomerPricingPolicyV2R> {
  const material = {
    version: PROVIDER_NATIVE_PRODUCT_CUSTOMER_PRICING_POLICY_VERSION_V2R,
    authority: 'FINANCE_OWNED_PRODUCT_CUSTOMER_PRICING_POLICY' as const,
    ownerId: identity(input.ownerId, 'CUSTOMER_PRICING_POLICY_OWNER'),
    ownerVersion: identity(
      input.ownerVersion,
      'CUSTOMER_PRICING_POLICY_OWNER_VERSION',
    ),
    currency: 'EDITRON_CREDIT' as const,
    billingQuantum: 'CENTICREDIT' as const,
    creditPool: 'main' as const,
    effectiveAt: timestamp(input.effectiveAt, 'CUSTOMER_PRICING_EFFECTIVE'),
    expiresAt: timestamp(input.expiresAt, 'CUSTOMER_PRICING_EXPIRY'),
    formula: {
      kind: 'LINEAR_PROVIDER_SPEND_V1' as const,
      centiCreditsNumerator: nonNegativeInteger(
        input.centiCreditsNumerator,
        'CUSTOMER_PRICING_NUMERATOR',
      ),
      providerSpendNanoUsdDenominator: positiveInteger(
        input.providerSpendNanoUsdDenominator,
        'CUSTOMER_PRICING_DENOMINATOR',
      ),
      rounding: 'CEIL_TOTAL_EPISODE_TO_CENTICREDIT' as const,
    },
  };
  if (Date.parse(material.effectiveAt) >= Date.parse(material.expiresAt)) {
    fail('PRODUCT_CUSTOMER_PRICING_TIME_ORDER_INVALID');
  }
  return deepFreezeEditronJsonV1({
    ...material,
    pricingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProviderNativeProductCustomerPricingPolicyV2R(
  value: unknown,
): Readonly<ProviderNativeProductCustomerPricingPolicyV2R> {
  const candidate = record(value, 'CUSTOMER_PRICING_POLICY');
  const formula = record(candidate.formula, 'CUSTOMER_PRICING_FORMULA');
  const rebound = createProviderNativeProductCustomerPricingPolicyV2R({
    ownerId: text(candidate.ownerId, 'CUSTOMER_PRICING_POLICY_OWNER'),
    ownerVersion: text(
      candidate.ownerVersion,
      'CUSTOMER_PRICING_POLICY_OWNER_VERSION',
    ),
    effectiveAt: text(candidate.effectiveAt, 'CUSTOMER_PRICING_EFFECTIVE'),
    expiresAt: text(candidate.expiresAt, 'CUSTOMER_PRICING_EXPIRY'),
    centiCreditsNumerator: formula.centiCreditsNumerator as number,
    providerSpendNanoUsdDenominator:
      formula.providerSpendNanoUsdDenominator as number,
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('PRODUCT_CUSTOMER_PRICING_POLICY_INVALID');
  }
  return rebound;
}

export function createProviderNativeProductCustomerChargeOwnerV2R(
  input: Readonly<{
    policyLocator:
      Readonly<ProviderNativeProductCustomerPricingPolicyLocatorV2R>;
  }>,
): Readonly<ProviderNativeProductCustomerChargeOwnerV2R> {
  return Object.freeze({
    compute: async (request: ProviderNativeProductCustomerChargeRequestV2R) => {
      const authorization =
        assertProviderNativeProductBudgetAuthorizationV2R(
          request.authorization,
        );
      const reservation = assertProviderNativeProductBudgetReservationV2R(
        request.reservation,
        authorization,
      );
      const expected = authorization.customerPricing;
      const policy = assertProviderNativeProductCustomerPricingPolicyV2R(
        await input.policyLocator.resolve({
          ownerId: expected.ownerId,
          ownerVersion: expected.ownerVersion,
          pricingSha256: expected.pricingSha256,
        }),
      );
      assertPolicyBinding(policy, authorization);
      const actualProviderSpendNanoUsd = nonNegativeInteger(
        request.actualProviderSpendNanoUsd,
        'CUSTOMER_CHARGE_PROVIDER_SPEND',
      );
      if (actualProviderSpendNanoUsd
        > reservation.reservedProviderSpendNanoUsd) {
        fail('PRODUCT_CUSTOMER_CHARGE_PROVIDER_SPEND_EXCEEDS_RESERVATION');
      }
      const chargedCentiCredits = ceilRatio(
        actualProviderSpendNanoUsd,
        policy.formula.centiCreditsNumerator,
        policy.formula.providerSpendNanoUsdDenominator,
      );
      if (chargedCentiCredits > reservation.reservedCentiCredits) {
        fail('PRODUCT_CUSTOMER_CHARGE_EXCEEDS_RESERVATION');
      }
      return createProviderNativeProductCustomerChargeReceiptV2R({
        authorization,
        actualProviderSpendNanoUsd,
        providerAttemptReceiptSha256s:
          request.providerAttemptReceiptSha256s,
        chargedCentiCredits,
      });
    },
  });
}

function assertPolicyBinding(
  policy: Readonly<ProviderNativeProductCustomerPricingPolicyV2R>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
): void {
  const expected = authorization.customerPricing;
  if (policy.ownerId !== expected.ownerId
    || policy.ownerVersion !== expected.ownerVersion
    || policy.pricingSha256 !== expected.pricingSha256
    || policy.currency !== expected.currency
    || policy.billingQuantum !== expected.billingQuantum
    || policy.creditPool !== expected.creditPool) {
    fail('PRODUCT_CUSTOMER_PRICING_BINDING_MISMATCH');
  }
  if (Date.parse(policy.effectiveAt)
      > Date.parse(authorization.approval.approvedAt)
    || Date.parse(policy.expiresAt)
      < Date.parse(authorization.approval.expiresAt)) {
    fail('PRODUCT_CUSTOMER_PRICING_AUTHORIZATION_WINDOW_MISMATCH');
  }
}

function ceilRatio(value: number, numerator: number, denominator: number): number {
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const zero = BigInt(0);
  const one = BigInt(1);
  const result = product === zero ? zero : ((product - one) / divisor) + one;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('PRODUCT_CUSTOMER_CHARGE_ARITHMETIC_UNSAFE');
  }
  return Number(result);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${label}_INVALID`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    fail(`${label}_INVALID`);
  }
  return Number(value);
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) fail(`${label}_INVALID`);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  return value;
}

function fail(code: string): never {
  throw new Error(code);
}
