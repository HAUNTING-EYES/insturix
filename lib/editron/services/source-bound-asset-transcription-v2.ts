import {
  assertAssetTranscriptionEvidenceV2,
  createAssetTranscriptionSourceBindingV2,
  type AssetTranscriptionEvidenceV2,
  type AssetTranscriptionPrecisionV2,
  type AssetTranscriptionProcessingEvidenceV2,
  type AssetTranscriptionSourceBindingV2,
  type AssetTranscriptionSourceRoleV2,
  type AssetTranscriptionTimingEvidenceV2,
} from './asset-transcription-source-cache-v2';
import type { MediaAsset } from './asset-resolver';
import type { EditorialPlanArtifactRefV1 } from './editorial-plan-v1';
import type { GeneratedTranscriptionV2 } from './media/transcription-service';
import type { TranscriptionData } from './media/types';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  sameMediaSourceStorageVersionV1,
} from './media-source-storage-version-v1';
import type { ProjectRevisionV1 } from './project-service';
import {
  authorizeCurrentSourceMediaRightsV1,
  type SourceMediaRightsAuthorizationReceiptV1,
} from './source-media-rights-authorization-v1';
import type { SourceMediaRightsLedgerReaderV1 }
  from './source-media-rights-ledger-v1';
import {
  assertSourceTranscriptionProviderApprovedV1,
  authorizeSourceTranscriptionEgressV1,
  createSourceTranscriptionEgressRequestV1,
  type SourceTranscriptionEgressPolicyOwnerV1,
  type SourceTranscriptionProviderIdV1,
} from './source-transcription-egress-authorization-v1';
import type { VerifiedMediaSourceLeasePortV1 }
  from './verified-media-source-local-file-v1';

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type SourceBoundAssetTranscriptionInputV2 = Readonly<{
  mode: 'FULL' | 'CACHE_ONLY';
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectOwnerId: string | null;
  projectRevision: ProjectRevisionV1;
  asset: MediaAsset;
  sourceVersion: MediaSourceVersionV1;
  sourceRole: AssetTranscriptionSourceRoleV2;
  requestedLanguage?: string | null;
  precision: AssetTranscriptionPrecisionV2;
  eligibleProviderIds: readonly SourceTranscriptionProviderIdV1[];
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
}>;

export type SourceBoundAssetTranscriptionSuccessV2 = Readonly<{
  disposition: 'CACHE_HIT' | 'GENERATED';
  projectRevision: ProjectRevisionV1;
  sourceBindingV2: AssetTranscriptionSourceBindingV2;
  sourceRightsAuthorization: SourceMediaRightsAuthorizationReceiptV1;
  evidence: AssetTranscriptionEvidenceV2;
}>;

export type SourceBoundAssetTranscriptionResultV2 = Readonly<
  | SourceBoundAssetTranscriptionSuccessV2
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

export type SourceBoundAssetTranscriptionPortsV2 = Readonly<{
  cache: Readonly<{
    get(binding: AssetTranscriptionSourceBindingV2):
      Promise<AssetTranscriptionEvidenceV2 | null>;
    save(binding: AssetTranscriptionSourceBindingV2, input: Readonly<{
      transcription: TranscriptionData;
      timingEvidence: AssetTranscriptionTimingEvidenceV2;
      processingEvidence: AssetTranscriptionProcessingEvidenceV2;
    }>): Promise<AssetTranscriptionEvidenceV2>;
  }>;
  rightsReader: Readonly<SourceMediaRightsLedgerReaderV1>;
  projectRevisionReader: Readonly<{
    getProjectRevision(userId: string, projectId: string): Promise<ProjectRevisionV1>;
  }>;
  egressPolicyOwner?: Readonly<SourceTranscriptionEgressPolicyOwnerV1>;
  sourceLeasePort?: Readonly<VerifiedMediaSourceLeasePortV1>;
  providerTranscriber?: Readonly<{
    transcribe(input: Readonly<{
      asset: MediaAsset;
      userId: string;
      sourceUrl: string;
      requestedLanguage?: string | null;
      precision: AssetTranscriptionPrecisionV2;
      approvedProviderIds: readonly SourceTranscriptionProviderIdV1[];
    }>): Promise<GeneratedTranscriptionV2>;
  }>;
  now?: () => Date;
}>;

export async function resolveSourceBoundAssetTranscriptionV2(
  input: SourceBoundAssetTranscriptionInputV2,
  ports: SourceBoundAssetTranscriptionPortsV2,
): Promise<SourceBoundAssetTranscriptionResultV2> {
  try {
    const scope = normalizeScope(input, ports);
    const binding = createAssetTranscriptionSourceBindingV2({
      userId: scope.userId,
      assetId: scope.asset.assetId,
      sourceRole: scope.sourceRole,
      sourceVersion: scope.sourceVersion,
      requestedLanguage: scope.requestedLanguage,
      precision: scope.precision,
    });
    const cached = await readCache(binding, ports);
    if (cached.disposition === 'BLOCKED') return cached;
    const firstRights = await authorizeRights(scope, ports);
    if (firstRights.disposition === 'BLOCKED') return firstRights;
    const beforeRevision = await currentRevision(scope, ports);
    if (beforeRevision.disposition === 'BLOCKED') return beforeRevision;
    if (!sameRevision(beforeRevision.revision, scope.projectRevision)) {
      return blocked('ASSET_TRANSCRIPTION_PROJECT_REVISION_STALE');
    }
    if (cached.evidence) {
      return Object.freeze({
        disposition: 'CACHE_HIT' as const,
        projectRevision: beforeRevision.revision,
        sourceBindingV2: binding,
        sourceRightsAuthorization: firstRights.receipt,
        evidence: cached.evidence,
      });
    }
    // CACHE_ONLY is a read contract, not permission to acquire a lease, egress,
    // spend provider resources, or create durable evidence.
    if (scope.mode === 'CACHE_ONLY') {
      return blocked('ASSET_TRANSCRIPTION_CACHE_MISS');
    }

    const owners = requireMissOwners(ports);
    if (owners.disposition === 'BLOCKED') return owners;
    const request = createSourceTranscriptionEgressRequestV1({
      tenantId: scope.tenantId,
      userId: scope.userId,
      orgId: scope.orgId,
      projectId: scope.projectId,
      projectRevision: scope.projectRevision,
      sourceBindingV2: binding,
      eligibleProviderIds: scope.eligibleProviderIds,
      sourceRightsAuthorizationReceiptSha256: firstRights.receipt.receiptSha256,
      privacyEgressPolicyRef: scope.privacyEgressPolicyRef,
    });
    const egress = await authorizeSourceTranscriptionEgressV1(
      request,
      owners.egressPolicyOwner,
      ports.now ?? (() => new Date()),
    );
    if (egress.disposition === 'BLOCKED') return blocked(egress.diagnosticCode);

    let lease;
    try {
      lease = await owners.sourceLeasePort.open(scope.sourceVersion);
    } catch (error) {
      return blocked(diagnostic(error, 'ASSET_TRANSCRIPTION_SOURCE_LEASE_UNAVAILABLE'));
    }
    if (!lease || typeof lease.revalidate !== 'function'
      || !sameMediaSourceStorageVersionV1(
        lease.storageVersion,
        scope.sourceVersion.storageVersion,
      )) {
      return blocked('ASSET_TRANSCRIPTION_SOURCE_LEASE_SCOPE_MISMATCH');
    }

    let generated: GeneratedTranscriptionV2;
    try {
      generated = await owners.providerTranscriber.transcribe({
        asset: scope.asset,
        userId: scope.userId,
        sourceUrl: lease.sourceUrl,
        requestedLanguage: scope.requestedLanguage,
        precision: scope.precision,
        approvedProviderIds: egress.authorization.approvedProviderIds,
      });
      assertSourceTranscriptionProviderApprovedV1(
        egress.authorization,
        request,
        generated.timingEvidence.providerId as SourceTranscriptionProviderIdV1,
      );
    } catch (error) {
      return blocked(diagnostic(error, 'ASSET_TRANSCRIPTION_PROVIDER_UNVERIFIABLE'));
    }
    try {
      if (!await lease.revalidate()) {
        return blocked('ASSET_TRANSCRIPTION_SOURCE_LEASE_STALE');
      }
    } catch {
      return blocked('ASSET_TRANSCRIPTION_SOURCE_LEASE_REVALIDATION_UNAVAILABLE');
    }

    const finalRights = await authorizeRights(scope, ports);
    if (finalRights.disposition === 'BLOCKED') return finalRights;
    const preSaveRevision = await currentRevision(scope, ports);
    if (preSaveRevision.disposition === 'BLOCKED') return preSaveRevision;
    if (!sameRevision(preSaveRevision.revision, scope.projectRevision)) {
      return blocked('ASSET_TRANSCRIPTION_PROJECT_REVISION_STALE');
    }

    let evidence: AssetTranscriptionEvidenceV2;
    try {
      evidence = assertExpectedEvidence(
        await ports.cache.save(binding, {
          transcription: generated.transcription,
          timingEvidence: generated.timingEvidence,
          processingEvidence: {
            mode: 'EXTERNAL_PROVIDER',
            request,
            authorization: egress.authorization,
          },
        }),
        binding,
      );
    } catch (error) {
      return blocked(diagnostic(error, 'ASSET_TRANSCRIPTION_CACHE_WRITE_UNAVAILABLE'));
    }
    const finalRevision = await currentRevision(scope, ports);
    if (finalRevision.disposition === 'BLOCKED') return finalRevision;
    if (!sameRevision(finalRevision.revision, scope.projectRevision)) {
      return blocked('ASSET_TRANSCRIPTION_PROJECT_REVISION_STALE_AFTER_CACHE_WRITE');
    }
    return Object.freeze({
      disposition: 'GENERATED' as const,
      projectRevision: finalRevision.revision,
      sourceBindingV2: binding,
      sourceRightsAuthorization: finalRights.receipt,
      evidence,
    });
  } catch (error) {
    return blocked(diagnostic(error, 'ASSET_TRANSCRIPTION_ORCHESTRATION_UNAVAILABLE'));
  }
}

function normalizeScope(
  input: SourceBoundAssetTranscriptionInputV2,
  ports: SourceBoundAssetTranscriptionPortsV2,
) {
  if (!ports?.cache || typeof ports.cache.get !== 'function'
    || typeof ports.cache.save !== 'function'
    || typeof ports.rightsReader?.read !== 'function'
    || typeof ports.projectRevisionReader?.getProjectRevision !== 'function'
    || (ports.now !== undefined && typeof ports.now !== 'function')) {
    throw new Error('ASSET_TRANSCRIPTION_ORCHESTRATION_PORT_INVALID');
  }
  if (input.mode !== 'FULL' && input.mode !== 'CACHE_ONLY') {
    throw new Error('ASSET_TRANSCRIPTION_MODE_INVALID');
  }
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  if (!input.asset || input.asset.assetId !== sourceVersion.assetId
    || input.asset.type !== sourceVersion.mediaKind) {
    throw new Error('ASSET_TRANSCRIPTION_ASSET_SOURCE_SCOPE_MISMATCH');
  }
  return Object.freeze({
    mode: input.mode,
    tenantId: identity(input.tenantId),
    userId: identity(input.userId),
    orgId: input.orgId === null ? null : identity(input.orgId),
    projectId: identity(input.projectId),
    projectOwnerId: input.projectOwnerId === null
      ? null
      : identity(input.projectOwnerId),
    projectRevision: revision(input.projectRevision),
    asset: input.asset,
    sourceVersion,
    sourceRole: input.sourceRole,
    requestedLanguage: input.requestedLanguage ?? null,
    precision: input.precision,
    eligibleProviderIds: input.eligibleProviderIds,
    privacyEgressPolicyRef: input.privacyEgressPolicyRef,
  });
}

async function readCache(
  binding: AssetTranscriptionSourceBindingV2,
  ports: SourceBoundAssetTranscriptionPortsV2,
): Promise<Readonly<
  | { disposition: 'READ'; evidence: AssetTranscriptionEvidenceV2 | null }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>> {
  try {
    const value = await ports.cache.get(binding);
    return Object.freeze({
      disposition: 'READ' as const,
      evidence: value === null ? null : assertExpectedEvidence(value, binding),
    });
  } catch (error) {
    return blocked(diagnostic(error, 'ASSET_TRANSCRIPTION_CACHE_READ_UNAVAILABLE'));
  }
}

function assertExpectedEvidence(
  value: unknown,
  binding: AssetTranscriptionSourceBindingV2,
): AssetTranscriptionEvidenceV2 {
  const evidence = assertAssetTranscriptionEvidenceV2(value);
  if (evidence.sourceBindingV2.bindingSha256 !== binding.bindingSha256) {
    throw new Error('ASSET_TRANSCRIPTION_CACHE_SOURCE_SCOPE_MISMATCH');
  }
  return evidence;
}

async function authorizeRights(
  scope: ReturnType<typeof normalizeScope>,
  ports: SourceBoundAssetTranscriptionPortsV2,
) {
  return authorizeCurrentSourceMediaRightsV1({
    tenantId: scope.tenantId,
    userId: scope.userId,
    orgId: scope.orgId,
    projectId: scope.projectId,
    projectOwnerId: scope.projectOwnerId,
    sourceVersion: scope.sourceVersion,
  }, {
    rightsReader: ports.rightsReader,
    ...(ports.now ? { now: ports.now } : {}),
  });
}

async function currentRevision(
  scope: ReturnType<typeof normalizeScope>,
  ports: SourceBoundAssetTranscriptionPortsV2,
): Promise<Readonly<
  | { disposition: 'CURRENT'; revision: ProjectRevisionV1 }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>> {
  try {
    return Object.freeze({
      disposition: 'CURRENT' as const,
      revision: revision(await ports.projectRevisionReader.getProjectRevision(
        scope.userId,
        scope.projectId,
      )),
    });
  } catch {
    return blocked('ASSET_TRANSCRIPTION_PROJECT_REVISION_UNAVAILABLE');
  }
}

function requireMissOwners(ports: SourceBoundAssetTranscriptionPortsV2): Readonly<
  | {
      disposition: 'OWNERS';
      egressPolicyOwner: SourceTranscriptionEgressPolicyOwnerV1;
      sourceLeasePort: VerifiedMediaSourceLeasePortV1;
      providerTranscriber: NonNullable<
        SourceBoundAssetTranscriptionPortsV2['providerTranscriber']
      >;
    }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
> {
  if (!ports.egressPolicyOwner
    || typeof ports.egressPolicyOwner.authorize !== 'function'
    || !ports.sourceLeasePort
    || typeof ports.sourceLeasePort.open !== 'function'
    || !ports.providerTranscriber
    || typeof ports.providerTranscriber.transcribe !== 'function') {
    return blocked('ASSET_TRANSCRIPTION_PROVIDER_OWNER_UNAVAILABLE');
  }
  return Object.freeze({
    disposition: 'OWNERS' as const,
    egressPolicyOwner: ports.egressPolicyOwner,
    sourceLeasePort: ports.sourceLeasePort,
    providerTranscriber: ports.providerTranscriber,
  });
}

function revision(value: ProjectRevisionV1): ProjectRevisionV1 {
  const record = value as unknown as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(record).sort().join('|')
      !== 'compatibilityUpdatedAt|schemaVersion|value'
    || record.schemaVersion !== 1
    || !Number.isSafeInteger(record.value)
    || Number(record.value) < 0
    || typeof record.compatibilityUpdatedAt !== 'string') {
    throw new Error('ASSET_TRANSCRIPTION_PROJECT_REVISION_INVALID');
  }
  const parsed = new Date(record.compatibilityUpdatedAt);
  if (Number.isNaN(parsed.getTime())
    || parsed.toISOString() !== record.compatibilityUpdatedAt) {
    throw new Error('ASSET_TRANSCRIPTION_PROJECT_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    value: Number(record.value),
    compatibilityUpdatedAt: record.compatibilityUpdatedAt,
  });
}

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function identity(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) {
    throw new Error('ASSET_TRANSCRIPTION_SCOPE_IDENTITY_INVALID');
  }
  return normalized;
}

function blocked(diagnosticCode: string) {
  return Object.freeze({ disposition: 'BLOCKED' as const, diagnosticCode });
}

function diagnostic(error: unknown, fallback: string): string {
  return error instanceof Error
    && /^(?:ASSET_TRANSCRIPTION|SOURCE_TRANSCRIPTION_EGRESS|SOURCE_MEDIA_RIGHTS)_[A-Z0-9_]{1,180}$/.test(
      error.message,
    )
    ? error.message
    : fallback;
}
