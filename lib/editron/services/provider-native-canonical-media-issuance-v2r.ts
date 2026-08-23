import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { ProviderNativeCanonicalMediaReferenceBindingV2R }
  from './provider-native-canonical-media-reference-v2r';
import {
  assertProviderNativeCanonicalMediaArtifactBindingV2R,
  assertProviderNativeCanonicalMediaBindingRecordV2R,
  assertProviderNativeCanonicalMediaPolicyGrantV2R,
  type ProviderNativeCanonicalMediaArtifactBindingV2R,
  type ProviderNativeCanonicalMediaBindingRecordV2R,
  type ProviderNativeCanonicalMediaPolicyGrantV2R,
} from './provider-native-canonical-media-product-records-v2r';

type Scope = ProviderNativeCanonicalMediaReferenceBindingV2R['scope'];
type MediaOwner = ProviderNativeCanonicalMediaArtifactBindingV2R['mediaOwner'];

export const PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_V2R_1' as const;
export const PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_COLLECTION_V2R =
  'editron_provider_native_media_source_versions_v2r' as const;
export const PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_RECEIPT_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_RECEIPT_V2R_1' as const;

export interface ProviderNativeCanonicalMediaSourceVersionV2R {
  version: typeof PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_V2R;
  mediaOwner: Readonly<MediaOwner>;
  assetId: string;
  mediaKind: 'video' | 'image';
  byteLength: number;
  contentSha256: string;
  referenceEnvelopeSha256: string;
  sourceVersionSha256: string;
}

export interface ProviderNativeCanonicalMediaPolicyDecisionOwnerV2R {
  assertIssuable(input: Readonly<{
    binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>;
    policyGrant: Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R>;
  }>): Promise<void>;
}

export interface ProviderNativeCanonicalMediaIssuanceLedgerV2R {
  /** Must atomically verify media rows and create-or-compare all metadata. */
  issueExact(input: Readonly<{
    sourceVersion: Readonly<ProviderNativeCanonicalMediaSourceVersionV2R>;
    bindingRecord: Readonly<ProviderNativeCanonicalMediaBindingRecordV2R>;
    policyGrant: Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R>;
    artifactBindings: readonly Readonly<ProviderNativeCanonicalMediaArtifactBindingV2R>[];
  }>): Promise<Readonly<{ ledgerReceiptSha256: string }>>;
}

export interface ProviderNativeCanonicalMediaIssuanceReceiptV2R {
  version: typeof PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_RECEIPT_V2R;
  scope: Readonly<Scope>;
  sourceVersionSha256: string;
  bindingRecordSha256: string;
  authorizationSha256: string;
  artifactBindingSha256s: readonly string[];
  ledgerReceiptSha256: string;
  issuanceSha256: string;
}

export function createProviderNativeCanonicalMediaSourceVersionV2R(input: Readonly<{
  mediaOwner: Readonly<MediaOwner>;
  assetId: string;
  mediaKind: 'video' | 'image';
  byteLength: number;
  contentSha256: string;
  referenceEnvelopeSha256: string;
}>): Readonly<ProviderNativeCanonicalMediaSourceVersionV2R> {
  const material = {
    version: PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_V2R,
    mediaOwner: normalizeOwner(input.mediaOwner),
    assetId: identity(input.assetId, 'SOURCE_ASSET_ID'),
    mediaKind: mediaKind(input.mediaKind),
    byteLength: positiveInteger(input.byteLength, 'SOURCE_BYTE_LENGTH'),
    contentSha256: sha256(input.contentSha256, 'SOURCE_CONTENT'),
    referenceEnvelopeSha256: sha256(input.referenceEnvelopeSha256, 'SOURCE_ENVELOPE'),
  };
  return frozen({
    ...material,
    sourceVersionSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProviderNativeCanonicalMediaSourceVersionV2R(
  value: unknown,
): Readonly<ProviderNativeCanonicalMediaSourceVersionV2R> {
  const candidate = record(value, 'SOURCE_VERSION');
  exactKeys(candidate, [
    'version', 'mediaOwner', 'assetId', 'mediaKind', 'byteLength',
    'contentSha256', 'referenceEnvelopeSha256', 'sourceVersionSha256',
  ], 'SOURCE_VERSION');
  if (candidate.version !== PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_V2R) {
    fail('SOURCE_VERSION_IDENTITY_INVALID');
  }
  const rebound = createProviderNativeCanonicalMediaSourceVersionV2R({
    mediaOwner: normalizeOwner(candidate.mediaOwner),
    assetId: identity(candidate.assetId, 'SOURCE_ASSET_ID'),
    mediaKind: mediaKind(candidate.mediaKind),
    byteLength: positiveInteger(candidate.byteLength, 'SOURCE_BYTE_LENGTH'),
    contentSha256: sha256(candidate.contentSha256, 'SOURCE_CONTENT'),
    referenceEnvelopeSha256: sha256(candidate.referenceEnvelopeSha256, 'SOURCE_ENVELOPE'),
  });
  if (rebound.sourceVersionSha256 !== sha256(candidate.sourceVersionSha256, 'SOURCE_VERSION')) {
    fail('SOURCE_VERSION_HASH_MISMATCH');
  }
  return rebound;
}

/**
 * Coordinates issuance without deciding rights or owning persistence. The
 * policy decision and atomic create-or-compare ledger remain separate owners.
 */
export function createProviderNativeCanonicalMediaIssuanceOwnerV2R(input: Readonly<{
  policyDecision: Readonly<ProviderNativeCanonicalMediaPolicyDecisionOwnerV2R>;
  ledger: Readonly<ProviderNativeCanonicalMediaIssuanceLedgerV2R>;
  now?: () => string;
}>) {
  return {
    issue: async (request: Readonly<{
      sourceVersion: Readonly<ProviderNativeCanonicalMediaSourceVersionV2R>;
      bindingRecord: Readonly<ProviderNativeCanonicalMediaBindingRecordV2R>;
      policyGrant: Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R>;
      artifactBindings: readonly Readonly<ProviderNativeCanonicalMediaArtifactBindingV2R>[];
    }>): Promise<Readonly<ProviderNativeCanonicalMediaIssuanceReceiptV2R>> => {
      const sourceVersion = assertProviderNativeCanonicalMediaSourceVersionV2R(
        request.sourceVersion,
      );
      const bindingRecord = assertProviderNativeCanonicalMediaBindingRecordV2R(
        request.bindingRecord,
      );
      const policyGrant = assertProviderNativeCanonicalMediaPolicyGrantV2R(
        request.policyGrant,
      );
      const artifacts = request.artifactBindings.map(
        (artifact) => assertProviderNativeCanonicalMediaArtifactBindingV2R(artifact),
      );
      assertProviderNativeCanonicalMediaIssuanceSetV2R(
        sourceVersion,
        bindingRecord.binding,
        policyGrant,
        artifacts,
      );
      if (policyGrant.disposition !== 'AUTHORIZED') fail('POLICY_NOT_AUTHORIZED');
      const now = timestamp(input.now?.() ?? new Date().toISOString(), 'ISSUANCE_NOW');
      if (Date.parse(now) < Date.parse(policyGrant.issuedAt)) fail('POLICY_NOT_YET_VALID');
      if (Date.parse(now) >= Date.parse(policyGrant.expiresAt)) fail('POLICY_EXPIRED');
      await input.policyDecision.assertIssuable({
        binding: bindingRecord.binding,
        policyGrant,
      });
      const persisted = await input.ledger.issueExact({
        sourceVersion,
        bindingRecord,
        policyGrant,
        artifactBindings: artifacts,
      });
      const material = {
        version: PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_RECEIPT_V2R,
        scope: bindingRecord.binding.scope,
        sourceVersionSha256: sourceVersion.sourceVersionSha256,
        bindingRecordSha256: bindingRecord.recordSha256,
        authorizationSha256: policyGrant.authorizationSha256,
        artifactBindingSha256s: artifacts
          .map(({ bindingSha256 }) => bindingSha256)
          .sort(),
        ledgerReceiptSha256: sha256(persisted.ledgerReceiptSha256, 'LEDGER_RECEIPT'),
      };
      return frozen({ ...material, issuanceSha256: hashEditronCanonicalJsonV1(material) });
    },
  };
}

export class ProviderNativeCanonicalMediaIssuanceErrorV2R extends Error {}

export function assertProviderNativeCanonicalMediaIssuanceSetV2R(
  source: Readonly<ProviderNativeCanonicalMediaSourceVersionV2R>,
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>,
  policy: Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R>,
  artifacts: readonly Readonly<ProviderNativeCanonicalMediaArtifactBindingV2R>[],
): void {
  if (source.assetId !== binding.source.assetId
    || source.sourceVersionSha256 !== binding.source.assetVersionSha256
    || source.contentSha256 !== binding.source.contentSha256
    || source.referenceEnvelopeSha256 !== binding.source.referenceEnvelopeSha256) {
    fail('SOURCE_BINDING_MISMATCH');
  }
  if (!sameScope(binding.scope, policy.scope)
    || policy.routeSha256 !== binding.routeSha256
    || policy.sourceAssetId !== binding.source.assetId
    || policy.sourceContentSha256 !== binding.source.contentSha256
    || hashEditronCanonicalJsonV1(policy.rightsPolicyRef)
      !== hashEditronCanonicalJsonV1(binding.policy.rightsPolicyRef)
    || hashEditronCanonicalJsonV1(policy.privacyEgressPolicyRef)
      !== hashEditronCanonicalJsonV1(binding.policy.privacyEgressPolicyRef)
    || policy.authorizationSha256 !== binding.policy.authorizationSha256) {
    fail('POLICY_BINDING_MISMATCH');
  }
  const expected = new Map(binding.materialization.artifacts.map((artifact) => [
    `${artifact.artifactId}:${artifact.artifactVersionSha256}`,
    artifact,
  ]));
  if (expected.size !== artifacts.length) fail('ARTIFACT_SET_MISMATCH');
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    const artifactKey = `${artifact.artifactId}:${artifact.artifactVersionSha256}`;
    if (seen.has(artifactKey)) fail('ARTIFACT_SET_MISMATCH');
    seen.add(artifactKey);
    const descriptor = expected.get(artifactKey);
    if (!descriptor || !sameScope(binding.scope, artifact.scope)
      || artifact.sourceAssetId !== source.assetId
      || artifact.sourceAssetVersionSha256 !== source.sourceVersionSha256
      || artifact.referenceEnvelopeSha256 !== source.referenceEnvelopeSha256
      || !sameOwner(source.mediaOwner, artifact.mediaOwner)
      || artifact.bytesSha256 !== descriptor.bytesSha256
      || artifact.byteLength !== descriptor.byteLength) {
      fail('ARTIFACT_BINDING_MISMATCH');
    }
  }
  if (seen.size !== expected.size) fail('ARTIFACT_SET_MISMATCH');
}

function sameScope(left: Readonly<Scope>, right: Readonly<Scope>): boolean {
  return left.tenantId === right.tenantId && left.userId === right.userId
    && left.projectId === right.projectId && left.episodeId === right.episodeId;
}

function sameOwner(left: Readonly<MediaOwner>, right: Readonly<MediaOwner>): boolean {
  return left.type === right.type && (left.type === 'USER'
    ? left.userId === (right as Readonly<{ type: 'USER'; userId: string }>).userId
    : left.orgId === (right as Readonly<{ type: 'ORG'; orgId: string }>).orgId);
}

function normalizeOwner(value: unknown): Readonly<MediaOwner> {
  const candidate = record(value, 'MEDIA_OWNER');
  if (candidate.type === 'USER') {
    exactKeys(candidate, ['type', 'userId'], 'MEDIA_OWNER');
    return { type: 'USER', userId: identity(candidate.userId, 'MEDIA_OWNER_USER_ID') };
  }
  if (candidate.type === 'ORG') {
    exactKeys(candidate, ['type', 'orgId'], 'MEDIA_OWNER');
    return { type: 'ORG', orgId: identity(candidate.orgId, 'MEDIA_OWNER_ORG_ID') };
  }
  fail('MEDIA_OWNER_INVALID');
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    fail(`${label}_FIELDS_INVALID`);
  }
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label}_INVALID`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(`${label}_INVALID`);
  return Number(value);
}

function mediaKind(value: unknown): 'video' | 'image' {
  if (value !== 'video' && value !== 'image') fail('SOURCE_MEDIA_KIND_INVALID');
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail(`${label}_INVALID`);
  }
  return new Date(value).toISOString();
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value)) as Readonly<T>;
}

function fail(code: string): never {
  throw new ProviderNativeCanonicalMediaIssuanceErrorV2R(
    `PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_${code}`,
  );
}
