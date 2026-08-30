import type { Collection, Document, Filter } from 'mongodb';

import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';

type MongoRecord = Record<string, unknown>;
type PolicyLookupV1 = Parameters<
  MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1['resolve']
>[0];

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_POLICY_COLLECTION_V1 =
  'editron_media_proxy_master_transcode_execution_budget_policies_v1' as const;

export interface MediaProxyMasterTranscodeExecutionBudgetPolicyMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(filter: Readonly<MongoRecord>): Promise<MongoRecord | null>;
}

export function createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1(
  input: Readonly<{
    loadCollection?: () => Promise<Readonly<
      MediaProxyMasterTranscodeExecutionBudgetPolicyMongoCollectionV1
    >>;
  }> = {},
): Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1> {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<Readonly<
    MediaProxyMasterTranscodeExecutionBudgetPolicyMongoCollectionV1
  >> | null = null;
  let indexPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndex = async () => {
    indexPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex(
        { ownerId: 1, ownerVersion: 1, policySha256: 1 },
        {
          name: 'uniq_proxy_transcode_execution_budget_policy_v1',
          unique: true,
        },
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
    resolve: async (request: PolicyLookupV1) => {
      if (request.ownerId
        !== MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1) {
        fail('OWNER_ID_INVALID');
      }
      const ownerVersion = identity(request.ownerVersion, 'OWNER_VERSION');
      const policySha256 = sha256(request.policySha256, 'POLICY_SHA256');
      await ensureIndex();
      const stored = await (await collection()).findOne({
        ownerId: request.ownerId,
        ownerVersion,
        policySha256,
      });
      if (!stored) fail('NOT_FOUND');
      const policy =
        assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
          withoutMongoId(stored!),
        );
      if (policy.ownerId !== request.ownerId
        || policy.ownerVersion !== ownerVersion
        || policy.policySha256 !== policySha256) {
        fail('LOOKUP_MISMATCH');
      }
      return policy;
    },
  });
}

async function loadDefaultCollection(): Promise<Readonly<
  MediaProxyMasterTranscodeExecutionBudgetPolicyMongoCollectionV1
>> {
  const { getDatabase } = await import('../db/mongodb');
  const database = await getDatabase();
  return wrapCollection(
    database.collection(
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_POLICY_COLLECTION_V1,
    ),
  );
}

function wrapCollection(
  collection: Collection<Document>,
): MediaProxyMasterTranscodeExecutionBudgetPolicyMongoCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: async (filter) => {
      const value = await collection.findOne(filter as Filter<Document>);
      return value as MongoRecord | null;
    },
  };
}

function withoutMongoId(value: Readonly<MongoRecord>): MongoRecord {
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

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1(code);
}

export class MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1
  extends Error {
  constructor(code: string) {
    super(
      `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_POLICY_MONGO_${code}`,
    );
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1';
  }
}
