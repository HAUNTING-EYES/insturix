import type {
  ProviderNativeProductBudgetAuthorizationV2R,
  ProviderNativeProductBudgetReservationV2R,
} from './provider-native-product-budget-v2r';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const PROVIDER_NATIVE_PRODUCT_CUSTOMER_CHARGE_RECEIPT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_CUSTOMER_CHARGE_RECEIPT_V2R_1' as const;

export interface ProviderNativeProductCustomerChargeReceiptV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_CUSTOMER_CHARGE_RECEIPT_VERSION_V2R;
  authority: 'PRODUCT_CUSTOMER_PRICING_NO_WALLET_OR_PROJECT_MUTATION';
  ownerId: string;
  ownerVersion: string;
  authorizationSha256: string;
  pricingSha256: string;
  actualProviderSpendNanoUsd: number;
  providerAttemptReceiptSha256s: readonly string[];
  chargedCentiCredits: number;
  receiptSha256: string;
}

export interface ProviderNativeProductCustomerChargeOwnerV2R {
  compute(input: Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
    actualProviderSpendNanoUsd: number;
    providerAttemptReceiptSha256s: readonly string[];
  }>): Promise<Readonly<ProviderNativeProductCustomerChargeReceiptV2R>>;
}

export function createProviderNativeProductCustomerChargeReceiptV2R(
  input: Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    actualProviderSpendNanoUsd: number;
    providerAttemptReceiptSha256s: readonly string[];
    chargedCentiCredits: number;
  }>,
): Readonly<ProviderNativeProductCustomerChargeReceiptV2R> {
  const authorization = input.authorization;
  const attempts = uniqueHashes(input.providerAttemptReceiptSha256s);
  const material = {
    version: PROVIDER_NATIVE_PRODUCT_CUSTOMER_CHARGE_RECEIPT_VERSION_V2R,
    authority: 'PRODUCT_CUSTOMER_PRICING_NO_WALLET_OR_PROJECT_MUTATION' as const,
    ownerId: authorization.customerPricing.ownerId,
    ownerVersion: authorization.customerPricing.ownerVersion,
    authorizationSha256: authorization.authorizationSha256,
    pricingSha256: authorization.customerPricing.pricingSha256,
    actualProviderSpendNanoUsd: nonNegativeInteger(
      input.actualProviderSpendNanoUsd,
      'CUSTOMER_CHARGE_PROVIDER_SPEND',
    ),
    providerAttemptReceiptSha256s: attempts,
    chargedCentiCredits: nonNegativeInteger(
      input.chargedCentiCredits,
      'CUSTOMER_CHARGE_CENTICREDITS',
    ),
  };
  if (material.chargedCentiCredits
    > authorization.limits.absoluteMaxCustomerChargeCentiCredits) {
    fail('PRODUCT_CUSTOMER_CHARGE_EXCEEDS_AUTHORIZATION');
  }
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

function uniqueHashes(values: readonly string[]): readonly string[] {
  const result = values.map((value) => sha256(value));
  if (new Set(result).size !== result.length) {
    fail('PRODUCT_ATTEMPT_HASH_DUPLICATE');
  }
  return result;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('PRODUCT_SHA256_INVALID');
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${label}_INVALID`);
  }
  return Number(value);
}

function fail(code: string): never {
  throw new Error(code);
}
