import type { Collection, Document, Filter } from 'mongodb';

import {
  assertProviderNativeProductCustomerPricingPolicyV2R,
  type ProviderNativeProductCustomerPricingPolicyLocatorV2R,
} from './provider-native-product-customer-pricing-v2r';

type MongoRecord = Record<string, unknown>;
type PricingPolicyLookupRequestV2R = Parameters<
  ProviderNativeProductCustomerPricingPolicyLocatorV2R['resolve']
>[0];

export const PROVIDER_NATIVE_PRODUCT_CUSTOMER_PRICING_COLLECTION_V2R =
  'editronProviderCustomerPricingPoliciesV2R' as const;

export interface ProviderNativeProductCustomerPricingCollectionV2R {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(filter: Readonly<MongoRecord>): Promise<MongoRecord | null>;
}

export function createProviderNativeProductCustomerPricingMongoLocatorV2R(
  input: Readonly<{
    loadCollection?: () => Promise<
      Readonly<ProviderNativeProductCustomerPricingCollectionV2R>
    >;
  }> = {},
): Readonly<ProviderNativeProductCustomerPricingPolicyLocatorV2R> {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<
    Readonly<ProviderNativeProductCustomerPricingCollectionV2R>
  > | null = null;
  let indexPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndex = async () => {
    indexPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex(
        { ownerId: 1, ownerVersion: 1, pricingSha256: 1 },
        { name: 'uniq_product_customer_pricing_identity_v2r', unique: true },
      );
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };
  return Object.freeze({
    resolve: async (request: PricingPolicyLookupRequestV2R) => {
      const ownerId = identity(request.ownerId, 'CUSTOMER_PRICING_OWNER');
      const ownerVersion = identity(
        request.ownerVersion,
        'CUSTOMER_PRICING_OWNER_VERSION',
      );
      const pricingSha256 = sha256(request.pricingSha256);
      await ensureIndex();
      const stored = await (await collection()).findOne({
        ownerId,
        ownerVersion,
        pricingSha256,
      });
      if (!stored) fail('PRODUCT_CUSTOMER_PRICING_POLICY_NOT_FOUND');
      const policy = assertProviderNativeProductCustomerPricingPolicyV2R(
        withoutMongoId(stored),
      );
      if (policy.ownerId !== ownerId || policy.ownerVersion !== ownerVersion
        || policy.pricingSha256 !== pricingSha256) {
        fail('PRODUCT_CUSTOMER_PRICING_POLICY_LOOKUP_MISMATCH');
      }
      return policy;
    },
  });
}

async function loadDefaultCollection(): Promise<
  Readonly<ProviderNativeProductCustomerPricingCollectionV2R>
> {
  const { getDatabase } = await import('./../db/mongodb');
  const database = await getDatabase();
  return wrapCollection(
    database.collection(PROVIDER_NATIVE_PRODUCT_CUSTOMER_PRICING_COLLECTION_V2R),
  );
}

function wrapCollection(
  collection: Collection<Document>,
): ProviderNativeProductCustomerPricingCollectionV2R {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: async (filter) => {
      const value = await collection.findOne(filter as Filter<Document>);
      return value as MongoRecord | null;
    },
  };
}

function withoutMongoId(value: MongoRecord): MongoRecord {
  const { _id: _discarded, ...record } = value;
  return record;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('PRODUCT_CUSTOMER_PRICING_SHA256_INVALID');
  }
  return value;
}

function fail(code: string): never {
  throw new ProviderNativeProductCustomerPricingMongoErrorV2R(code);
}

export class ProviderNativeProductCustomerPricingMongoErrorV2R extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'ProviderNativeProductCustomerPricingMongoErrorV2R';
  }
}
