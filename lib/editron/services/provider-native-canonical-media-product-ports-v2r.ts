import type { Collection, Document, Filter } from 'mongodb';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type {
  ProviderNativeCanonicalMediaBytesOwnerV2R,
  ProviderNativeCanonicalMediaPolicyOwnerV2R,
  ProviderNativeCanonicalMediaReferenceLocatorV2R,
} from './provider-native-canonical-media-reference-owner-v2r';
import type { ProviderNativeCanonicalMediaReferenceBindingV2R }
  from './provider-native-canonical-media-reference-v2r';
import {
  assertProviderNativeCanonicalMediaArtifactBindingV2R,
  assertProviderNativeCanonicalMediaBindingRecordV2R,
  assertProviderNativeCanonicalMediaPolicyGrantV2R,
  PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_COLLECTION_V2R,
  PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_COLLECTION_V2R,
} from './provider-native-canonical-media-product-records-v2r';

type MongoRecord = Record<string, unknown>;
type Scope = ProviderNativeCanonicalMediaReferenceBindingV2R['scope'];

export interface ProviderNativeCanonicalMediaProductCollectionV2R {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(filter: Readonly<MongoRecord>): Promise<MongoRecord | null>;
}

export interface ProviderNativeCanonicalMediaProductRuntimeV2R {
  bindings: ProviderNativeCanonicalMediaProductCollectionV2R;
  policyGrants: ProviderNativeCanonicalMediaProductCollectionV2R;
  mediaAssets: ProviderNativeCanonicalMediaProductCollectionV2R;
  readStorage(input: Readonly<{
    backend: 'R2' | 'GCS';
    key: string;
    expectedByteLength: number;
    timeoutMs: number;
  }>): Promise<Uint8Array>;
}

export interface ProviderNativeCanonicalMediaProductPortsV2R {
  locator: Readonly<ProviderNativeCanonicalMediaReferenceLocatorV2R>;
  bytes: Readonly<ProviderNativeCanonicalMediaBytesOwnerV2R>;
  policy: Readonly<ProviderNativeCanonicalMediaPolicyOwnerV2R>;
}

/**
 * Product storage adapter for the existing canonical-reference boundary.
 * Binding and policy collections hold identity only; bytes remain exclusively
 * in the existing mediaAssets-selected R2/GCS object.
 */
export function createProviderNativeCanonicalMediaProductPortsV2R(input: Readonly<{
  storageReadTimeoutMs: number;
  now?: () => string;
  loadRuntime?: () => Promise<Readonly<ProviderNativeCanonicalMediaProductRuntimeV2R>>;
}>): Readonly<ProviderNativeCanonicalMediaProductPortsV2R> {
  const timeoutMs = boundedTimeout(input.storageReadTimeoutMs);
  const now = input.now ?? (() => new Date().toISOString());
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<ProviderNativeCanonicalMediaProductRuntimeV2R>> | null = null;
  let indexPromise: Promise<void> | null = null;
  const runtime = () => {
    runtimePromise ??= loadRuntime();
    return runtimePromise;
  };
  const ensureIndexes = async () => {
    indexPromise ??= runtime().then(async ({ bindings, policyGrants }) => {
      await bindings.createIndex({
        'binding.scope.tenantId': 1,
        'binding.scope.userId': 1,
        'binding.scope.projectId': 1,
        'binding.scope.episodeId': 1,
        'binding.materialization.manifestSha256': 1,
        'binding.routeSha256': 1,
      }, { name: 'uniq_provider_media_binding_scope_v2r', unique: true });
      await policyGrants.createIndex(
        { authorizationSha256: 1 },
        { name: 'uniq_provider_media_policy_authorization_v2r', unique: true },
      );
      await policyGrants.createIndex({
        'scope.tenantId': 1,
        'scope.userId': 1,
        'scope.projectId': 1,
        'scope.episodeId': 1,
        routeSha256: 1,
        sourceAssetId: 1,
      }, { name: 'provider_media_policy_scope_route_v2r' });
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  return {
    locator: {
      resolve: async (request) => {
        await ensureIndexes();
        const stored = await (await runtime()).bindings.findOne({
          'binding.scope.tenantId': request.scope.tenantId,
          'binding.scope.userId': request.scope.userId,
          'binding.scope.projectId': request.scope.projectId,
          'binding.scope.episodeId': request.scope.episodeId,
          'binding.materialization.manifestSha256': request.expectedManifestSha256,
          'binding.routeSha256': request.expectedRouteSha256,
        });
        if (!stored) fail('BINDING_NOT_FOUND');
        return assertProviderNativeCanonicalMediaBindingRecordV2R(stored).binding;
      },
    },
    bytes: {
      read: async (request) => {
        await ensureIndexes();
        const stored = await (await runtime()).mediaAssets.findOne({
          assetId: request.artifactId,
          userId: request.scope.userId,
          projectId: request.scope.projectId,
          'providerNativeCanonicalMediaArtifactV2R.scope.tenantId': request.scope.tenantId,
          'providerNativeCanonicalMediaArtifactV2R.scope.episodeId': request.scope.episodeId,
        });
        if (!stored) fail('ARTIFACT_NOT_FOUND');
        const binding = assertProviderNativeCanonicalMediaArtifactBindingV2R(
          stored.providerNativeCanonicalMediaArtifactV2R,
        );
        assertArtifactRequest(binding, request);
        assertStorageRow(stored, binding.storage);
        const resolved = await runtime();
        return resolved.readStorage({
          ...binding.storage,
          expectedByteLength: binding.byteLength,
          timeoutMs,
        });
      },
    },
    policy: {
      assertAuthorized: async (request) => {
        await ensureIndexes();
        const routeSha256 = hashEditronCanonicalJsonV1(request.route);
        const stored = await (await runtime()).policyGrants.findOne({
          'scope.tenantId': request.scope.tenantId,
          'scope.userId': request.scope.userId,
          'scope.projectId': request.scope.projectId,
          'scope.episodeId': request.scope.episodeId,
          routeSha256,
          sourceAssetId: request.sourceAssetId,
          sourceContentSha256: request.sourceContentSha256,
          'rightsPolicyRef.artifactSha256': request.rightsPolicyRef.artifactSha256,
          'privacyEgressPolicyRef.artifactSha256': request.privacyEgressPolicyRef.artifactSha256,
        });
        if (!stored) fail('POLICY_GRANT_NOT_FOUND');
        const grant = assertProviderNativeCanonicalMediaPolicyGrantV2R(stored);
        assertPolicyRequest(grant, request.scope, routeSha256, request);
        if (grant.disposition !== 'AUTHORIZED') fail('POLICY_GRANT_REVOKED');
        const resolvedNow = Date.parse(now());
        if (!Number.isFinite(resolvedNow) || resolvedNow >= Date.parse(grant.expiresAt)) {
          fail('POLICY_GRANT_EXPIRED');
        }
        return { authorizationSha256: grant.authorizationSha256 };
      },
    },
  };
}

export class ProviderNativeCanonicalMediaProductPortErrorV2R extends Error {}

async function loadDefaultRuntime(): Promise<Readonly<ProviderNativeCanonicalMediaProductRuntimeV2R>> {
  const [{ getDatabase, COLLECTIONS }] = await Promise.all([
    import('./../db/mongodb'),
  ]);
  const db = await getDatabase();
  return {
    bindings: wrapCollection(db.collection(PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_COLLECTION_V2R)),
    policyGrants: wrapCollection(db.collection(PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_COLLECTION_V2R)),
    mediaAssets: wrapCollection(db.collection(COLLECTIONS.MEDIA_ASSETS)),
    readStorage: readDefaultStorage,
  };
}

async function readDefaultStorage(input: Readonly<{
  backend: 'R2' | 'GCS';
  key: string;
  expectedByteLength: number;
  timeoutMs: number;
}>): Promise<Uint8Array> {
  const url = input.backend === 'R2'
    ? await (await import('./r2-service')).getR2PresignedReadUrl(input.key)
    : (await (await import('./gcs-service')).refreshSignedUrl(input.key)).url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) fail(`STORAGE_READ_HTTP_${response.status}`);
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > input.expectedByteLength) {
      fail('STORAGE_READ_LENGTH_OVERFLOW');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== input.expectedByteLength) fail('STORAGE_READ_LENGTH_MISMATCH');
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

function wrapCollection(collection: Collection<Document>): ProviderNativeCanonicalMediaProductCollectionV2R {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter) => collection.findOne(filter as Filter<Document>) as Promise<MongoRecord | null>,
  };
}

function assertArtifactRequest(
  binding: ReturnType<typeof assertProviderNativeCanonicalMediaArtifactBindingV2R>,
  request: Parameters<ProviderNativeCanonicalMediaBytesOwnerV2R['read']>[0],
): void {
  if (!sameScope(binding.scope, request.scope)
    || binding.sourceAssetId !== request.sourceAssetId
    || binding.sourceAssetVersionSha256 !== request.sourceAssetVersionSha256
    || binding.referenceEnvelopeSha256 !== request.referenceEnvelopeSha256
    || binding.artifactId !== request.artifactId
    || binding.artifactVersionSha256 !== request.artifactVersionSha256
    || binding.bytesSha256 !== request.expectedBytesSha256
    || binding.byteLength !== request.expectedByteLength) {
    fail('ARTIFACT_REQUEST_MISMATCH');
  }
}

function assertStorageRow(
  stored: MongoRecord,
  storage: Readonly<{ backend: 'R2' | 'GCS'; key: string }>,
): void {
  const rowKey = storage.backend === 'R2' ? stored.r2Key : stored.gcsPath;
  if (rowKey !== storage.key) fail('ARTIFACT_STORAGE_ROW_MISMATCH');
}

function assertPolicyRequest(
  grant: ReturnType<typeof assertProviderNativeCanonicalMediaPolicyGrantV2R>,
  scope: Readonly<Scope>,
  routeSha256: string,
  request: Parameters<ProviderNativeCanonicalMediaPolicyOwnerV2R['assertAuthorized']>[0],
): void {
  if (!sameScope(grant.scope, scope)
    || grant.routeSha256 !== routeSha256
    || grant.sourceAssetId !== request.sourceAssetId
    || grant.sourceContentSha256 !== request.sourceContentSha256
    || !sameRef(grant.rightsPolicyRef, request.rightsPolicyRef)
    || !sameRef(grant.privacyEgressPolicyRef, request.privacyEgressPolicyRef)) {
    fail('POLICY_GRANT_REQUEST_MISMATCH');
  }
}

function sameScope(left: Readonly<Scope>, right: Readonly<Scope>): boolean {
  return left.tenantId === right.tenantId
    && left.userId === right.userId
    && left.projectId === right.projectId
    && left.episodeId === right.episodeId;
}

function sameRef(left: unknown, right: unknown): boolean {
  return hashEditronCanonicalJsonV1(left) === hashEditronCanonicalJsonV1(right);
}

function boundedTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 300_000) {
    fail('STORAGE_READ_TIMEOUT_INVALID');
  }
  return value;
}

function fail(code: string): never {
  throw new ProviderNativeCanonicalMediaProductPortErrorV2R(
    `PROVIDER_NATIVE_CANONICAL_MEDIA_PRODUCT_${code}`,
  );
}
