import type { Collection, Document, Filter } from 'mongodb';

import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import type { EditorialPlanArtifactRefV1 } from './editorial-plan-v1';
import {
  assertSourceTranscriptionEgressPolicyGrantV1,
  type SourceTranscriptionEgressPolicyGrantReaderV1,
  type SourceTranscriptionEgressPolicyScopeV1,
} from './source-transcription-egress-policy-v1';

export const SOURCE_TRANSCRIPTION_EGRESS_POLICY_COLLECTION_V1 =
  'editron_source_transcription_egress_policy_grants_v1' as const;

type MongoRecord = Record<string, unknown>;
type PolicyLookupV1 = Parameters<
  SourceTranscriptionEgressPolicyGrantReaderV1['read']
>[0];

export interface SourceTranscriptionEgressPolicyMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(filter: Readonly<MongoRecord>): Promise<MongoRecord | null>;
}

export function createSourceTranscriptionEgressPolicyMongoReaderV1(
  input: Readonly<{
    loadCollection?: () => Promise<Readonly<
      SourceTranscriptionEgressPolicyMongoCollectionV1
    >>;
  }> = {},
): Readonly<SourceTranscriptionEgressPolicyGrantReaderV1> {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<Readonly<
    SourceTranscriptionEgressPolicyMongoCollectionV1
  >> | null = null;
  let indexPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndex = async () => {
    indexPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex({
        'scope.tenantId': 1,
        'scope.userId': 1,
        'scope.orgId': 1,
        'scope.projectId': 1,
        'privacyEgressPolicyRef.ownerId': 1,
        'privacyEgressPolicyRef.artifactId': 1,
        'privacyEgressPolicyRef.artifactVersion': 1,
        'privacyEgressPolicyRef.artifactSha256': 1,
      }, {
        name: 'uniq_source_transcription_egress_policy_scope_v1',
        unique: true,
      });
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  return Object.freeze({
    async read(request: PolicyLookupV1) {
      const filter = lookupFilter(request.scope, request.privacyEgressPolicyRef);
      try {
        await ensureIndex();
        const stored = await (await collection()).findOne(filter);
        if (stored === null) return null;
        const grant = assertSourceTranscriptionEgressPolicyGrantV1(
          withoutMongoId(stored),
        );
        if (canonicalizeEditronJsonV1(grant.scope)
            !== canonicalizeEditronJsonV1(request.scope)
          || canonicalizeEditronJsonV1(grant.privacyEgressPolicyRef)
            !== canonicalizeEditronJsonV1(request.privacyEgressPolicyRef)) {
          fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_MONGO_LOOKUP_MISMATCH');
        }
        return grant;
      } catch (error) {
        if (error instanceof Error
          && /^SOURCE_TRANSCRIPTION_EGRESS_POLICY_[A-Z0-9_]{1,180}$/.test(
            error.message,
          )) throw error;
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_MONGO_UNAVAILABLE');
      }
    },
  });
}

function lookupFilter(
  scope: SourceTranscriptionEgressPolicyScopeV1,
  policy: Readonly<EditorialPlanArtifactRefV1>,
): Readonly<MongoRecord> {
  return {
    'scope.tenantId': scope.tenantId,
    'scope.userId': scope.userId,
    'scope.orgId': scope.orgId,
    'scope.projectId': scope.projectId,
    'privacyEgressPolicyRef.ownerId': policy.ownerId,
    'privacyEgressPolicyRef.artifactId': policy.artifactId,
    'privacyEgressPolicyRef.artifactVersion': policy.artifactVersion,
    'privacyEgressPolicyRef.artifactSha256': policy.artifactSha256,
  };
}

async function loadDefaultCollection(): Promise<Readonly<
  SourceTranscriptionEgressPolicyMongoCollectionV1
>> {
  const { getDatabase } = await import('../db/mongodb');
  const database = await getDatabase();
  return wrapCollection(
    database.collection(SOURCE_TRANSCRIPTION_EGRESS_POLICY_COLLECTION_V1),
  );
}

function wrapCollection(
  collection: Collection<Document>,
): SourceTranscriptionEgressPolicyMongoCollectionV1 {
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

function fail(code: string): never {
  throw new Error(code);
}
