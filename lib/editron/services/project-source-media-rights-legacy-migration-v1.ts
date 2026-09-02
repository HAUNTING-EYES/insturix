import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  readStoredNativeVideoAudioRights,
  SOURCE_MEDIA_RIGHTS_ATTESTATION_TEXT_V1,
} from './native-video-audio-rights';
import { analysisProjectRevision, analysisText }
  from './native-media-timestamp-analysis-validation-v1';
import type { ProjectRevisionV1 } from './project-service';
import {
  authorizeCurrentSourceMediaRightsV1,
  type SourceMediaRightsAuthorizationReceiptV1,
} from './source-media-rights-authorization-v1';
import {
  issueSourceMediaRightsV1,
  type SourceMediaRightsPrincipalAuthorityV1,
} from './source-media-rights-owner-v1';
import {
  persistSourceMediaRightsLedgerTransitionV1,
  type SourceMediaRightsLedgerStorePortsV1,
} from './source-media-rights-ledger-v1';

export const PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_OWNER_ID_V1 =
  'EDITRON_PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_OWNER' as const;
export const PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_VERSION_V1 =
  '1' as const;

export type ProjectSourceMediaRightsLegacyMigrationResultV1 = Readonly<
  | {
      disposition: 'AUTHORIZED';
      authorityDisposition: 'EXISTING' | 'MIGRATED';
      authorization: SourceMediaRightsAuthorizationReceiptV1;
      migrationReceiptSha256: string;
    }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

/**
 * One-way migration for uploads that already carry Editron's canonical,
 * timestamped source-media attestation. It cannot create third-party licence
 * evidence or revive a revoked grant.
 */
export async function ensureProjectSourceMediaRightsFromLegacyAttestationV1(
  input: Readonly<{
    tenantId: string;
    userId: string;
    orgId: string | null;
    projectId: string;
    projectOwnerId: string;
    projectRevision: ProjectRevisionV1;
    sourceVersion: MediaSourceVersionV1;
    asset: unknown;
  }>,
  ports: Readonly<{
    rightsStore: Readonly<SourceMediaRightsLedgerStorePortsV1>;
    now?: () => Date;
  }>,
): Promise<ProjectSourceMediaRightsLegacyMigrationResultV1> {
  let scope: ReturnType<typeof normalizeScope>;
  try {
    scope = normalizeScope(input, ports);
  } catch (error) {
    return blocked(diagnostic(error));
  }
  const now = ports.now ?? (() => new Date());
  const current = await authorizeCurrentSourceMediaRightsV1(
    authorizationInput(scope),
    { rightsReader: ports.rightsStore, now },
  );
  if (current.disposition === 'AUTHORIZED') {
    return authorized('EXISTING', current.receipt, scope);
  }
  if (current.diagnosticCode !== 'SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING') {
    return blocked(current.diagnosticCode);
  }

  let legacy: ReturnType<typeof assertLegacyAttestation>;
  try {
    legacy = assertLegacyAttestation(scope, now);
  } catch (error) {
    return blocked(diagnostic(error));
  }
  const migrationAuthority = principalAuthority(scope, legacy.rightsSha256);
  const issued = await issueSourceMediaRightsV1({
    tenantId: scope.tenantId,
    attestedByUserId: scope.projectOwnerId,
    orgId: scope.orgId,
    projectId: scope.projectId,
    disposition: legacy.disposition,
    sourceVersion: scope.sourceVersion,
    termsVersion: legacy.attestationVersion,
    termsContentSha256: legacy.termsContentSha256,
    license: null,
    attestedAt: new Date(legacy.attestedAt),
    principalAuthority: migrationAuthority,
  });
  if (issued.disposition === 'BLOCKED') {
    return blocked(`PROJECT_SOURCE_RIGHTS_MIGRATION_${issued.diagnosticCode}`);
  }

  let persisted: Awaited<ReturnType<
    typeof persistSourceMediaRightsLedgerTransitionV1
  >>;
  try {
    persisted = await persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: issued.state,
    }, ports.rightsStore);
  } catch {
    return blocked('PROJECT_SOURCE_RIGHTS_MIGRATION_STORE_UNAVAILABLE');
  }
  if (persisted.disposition === 'REJECTED') {
    return blocked(`PROJECT_SOURCE_RIGHTS_MIGRATION_${persisted.reason}`);
  }

  const rebound = await authorizeCurrentSourceMediaRightsV1(
    authorizationInput(scope),
    { rightsReader: ports.rightsStore, now },
  );
  if (rebound.disposition === 'BLOCKED') {
    return blocked(persisted.disposition === 'RACE_LOST'
      ? 'PROJECT_SOURCE_RIGHTS_MIGRATION_RACE_LOST'
      : rebound.diagnosticCode);
  }
  return authorized(
    persisted.disposition === 'RACE_LOST' ? 'EXISTING' : 'MIGRATED',
    rebound.receipt,
    scope,
  );
}

function normalizeScope(
  input: Parameters<
    typeof ensureProjectSourceMediaRightsFromLegacyAttestationV1
  >[0],
  ports: Parameters<
    typeof ensureProjectSourceMediaRightsFromLegacyAttestationV1
  >[1],
) {
  if (typeof ports?.rightsStore?.read !== 'function'
    || typeof ports.rightsStore.commit !== 'function'
    || (ports.now !== undefined && typeof ports.now !== 'function')) {
    fail('PROJECT_SOURCE_RIGHTS_MIGRATION_PORT_INVALID');
  }
  return {
    tenantId: analysisText(
      input.tenantId, 256, 'PROJECT_SOURCE_RIGHTS_MIGRATION_SCOPE_INVALID',
    ),
    userId: analysisText(
      input.userId, 256, 'PROJECT_SOURCE_RIGHTS_MIGRATION_SCOPE_INVALID',
    ),
    orgId: nullableText(input.orgId),
    projectId: analysisText(
      input.projectId, 256, 'PROJECT_SOURCE_RIGHTS_MIGRATION_SCOPE_INVALID',
    ),
    projectOwnerId: analysisText(
      input.projectOwnerId, 256,
      'PROJECT_SOURCE_RIGHTS_MIGRATION_SCOPE_INVALID',
    ),
    projectRevision: analysisProjectRevision(input.projectRevision),
    sourceVersion: assertMediaSourceVersionV1(input.sourceVersion),
    asset: object(input.asset, 'PROJECT_SOURCE_RIGHTS_MIGRATION_ASSET_INVALID'),
  };
}

function assertLegacyAttestation(
  scope: ReturnType<typeof normalizeScope>,
  now: () => Date,
) {
  const source = scope.sourceVersion;
  if (scope.asset.assetId !== source.assetId
    || scope.asset.type !== 'video'
    || scope.asset.source !== 'user-upload'
    || scope.asset.userId !== scope.projectOwnerId
    || !sourcePresentOnAsset(scope.asset, source)) {
    fail('PROJECT_SOURCE_RIGHTS_MIGRATION_SOURCE_SCOPE_MISMATCH');
  }
  const rights = readStoredNativeVideoAudioRights(scope.asset);
  const evidence = object(
    rights?.evidence,
    'PROJECT_SOURCE_RIGHTS_MIGRATION_ATTESTATION_REQUIRED',
  );
  if (evidence.kind !== 'user-attestation'
    || evidence.sourceAssetId !== source.assetId
    || evidence.attestedBy !== scope.projectOwnerId
    || typeof evidence.attestationVersion !== 'string'
    || typeof evidence.attestedAt !== 'string') {
    fail('PROJECT_SOURCE_RIGHTS_MIGRATION_ATTESTATION_INVALID');
  }
  const attestedAt = new Date(evidence.attestedAt);
  let evaluatedAt: Date;
  try {
    evaluatedAt = now();
  } catch {
    fail('SOURCE_MEDIA_RIGHTS_CURRENT_TIME_INVALID');
  }
  if (Number.isNaN(attestedAt.getTime())
    || !(evaluatedAt instanceof Date)
    || Number.isNaN(evaluatedAt.getTime())
    || attestedAt.getTime() > evaluatedAt.getTime()) {
    fail('PROJECT_SOURCE_RIGHTS_MIGRATION_ATTESTATION_TIME_INVALID');
  }

  let disposition: 'OWNED_BY_USER' | 'OWNED_BY_ORG';
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== scope.projectOwnerId
      || scope.orgId !== null
      || scope.tenantId !== scope.projectOwnerId) {
      fail('PROJECT_SOURCE_RIGHTS_MIGRATION_PRINCIPAL_SCOPE_MISMATCH');
    }
    disposition = 'OWNED_BY_USER';
  } else {
    if (scope.orgId !== source.owner.orgId
      || scope.tenantId !== source.owner.orgId
      || scope.asset.orgId !== source.owner.orgId) {
      fail('PROJECT_SOURCE_RIGHTS_MIGRATION_PRINCIPAL_SCOPE_MISMATCH');
    }
    disposition = 'OWNED_BY_ORG';
  }
  return {
    disposition,
    attestationVersion: evidence.attestationVersion,
    attestedAt: attestedAt.toISOString(),
    termsContentSha256: hashEditronCanonicalJsonV1({
      attestationVersion: evidence.attestationVersion,
      text: SOURCE_MEDIA_RIGHTS_ATTESTATION_TEXT_V1,
    }),
    rightsSha256: hashEditronCanonicalJsonV1(rights),
  };
}

function principalAuthority(
  scope: ReturnType<typeof normalizeScope>,
  legacyRightsSha256: string,
): SourceMediaRightsPrincipalAuthorityV1 {
  return Object.freeze({
    ownerId: PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_OWNER_ID_V1,
    ownerVersion: PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_VERSION_V1,
    async authorize(
      request: Parameters<SourceMediaRightsPrincipalAuthorityV1['authorize']>[0],
    ) {
      if (request.action !== 'ISSUE'
        || request.actorUserId !== scope.projectOwnerId
        || request.tenantId !== scope.tenantId
        || request.orgId !== scope.orgId
        || request.projectId !== scope.projectId
        || request.source.sourceVersionSha256
          !== scope.sourceVersion.sourceVersionSha256
        || request.currentRecordSha256 !== null) {
        return {
          disposition: 'BLOCKED' as const,
          diagnosticCode:
            'PROJECT_SOURCE_RIGHTS_MIGRATION_PRINCIPAL_SCOPE_MISMATCH',
        };
      }
      return {
        disposition: 'AUTHORIZED' as const,
        receiptSha256: hashEditronCanonicalJsonV1({
          ownerId: PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_OWNER_ID_V1,
          ownerVersion:
            PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_VERSION_V1,
          projectId: scope.projectId,
          projectRevision: scope.projectRevision,
          sourceVersionSha256: scope.sourceVersion.sourceVersionSha256,
          legacyRightsSha256,
        }),
      };
    },
  });
}

function authorizationInput(scope: ReturnType<typeof normalizeScope>) {
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    orgId: scope.orgId,
    projectId: scope.projectId,
    projectOwnerId: scope.projectOwnerId,
    sourceVersion: scope.sourceVersion,
  };
}

function sourcePresentOnAsset(
  asset: Record<string, unknown>,
  source: Readonly<MediaSourceVersionV1>,
): boolean {
  return [asset.sourceVersionV1, asset.proxySourceVersionV1].some((candidate) => {
    try {
      return canonicalizeEditronJsonV1(assertMediaSourceVersionV1(candidate))
        === canonicalizeEditronJsonV1(source);
    } catch {
      return false;
    }
  });
}

function authorized(
  authorityDisposition: 'EXISTING' | 'MIGRATED',
  authorization: SourceMediaRightsAuthorizationReceiptV1,
  scope: ReturnType<typeof normalizeScope>,
): ProjectSourceMediaRightsLegacyMigrationResultV1 {
  return deepFreezeEditronJsonV1({
    disposition: 'AUTHORIZED' as const,
    authorityDisposition,
    authorization,
    migrationReceiptSha256: hashEditronCanonicalJsonV1({
      ownerId: PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_OWNER_ID_V1,
      ownerVersion: PROJECT_SOURCE_MEDIA_RIGHTS_LEGACY_MIGRATION_VERSION_V1,
      authorityDisposition,
      projectId: scope.projectId,
      projectRevision: scope.projectRevision,
      authorizationReceiptSha256: authorization.receiptSha256,
    }),
  });
}

function nullableText(value: unknown): string | null {
  return value === null
    ? null
    : analysisText(
        value, 256, 'PROJECT_SOURCE_RIGHTS_MIGRATION_SCOPE_INVALID',
      );
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function diagnostic(error: unknown): string {
  return error instanceof Error && /^[A-Z0-9_]{1,240}$/.test(error.message)
    ? error.message
    : 'PROJECT_SOURCE_RIGHTS_MIGRATION_UNAVAILABLE';
}

function blocked(
  diagnosticCode: string,
): ProjectSourceMediaRightsLegacyMigrationResultV1 {
  return Object.freeze({ disposition: 'BLOCKED' as const, diagnosticCode });
}

function fail(code: string): never {
  throw new Error(code);
}
