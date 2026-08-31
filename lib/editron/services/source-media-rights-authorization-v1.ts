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
  assertSourceMediaRightsGrantStateV1,
  SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
  SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
  type SourceMediaRightsRecordV1,
} from './source-media-rights-owner-v1';
import {
  createSourceMediaRightsLedgerScopeV1,
  type SourceMediaRightsLedgerReaderV1,
} from './source-media-rights-ledger-v1';

export const SOURCE_MEDIA_RIGHTS_AUTHORIZATION_RECEIPT_KIND_V1 =
  'EDITRON_SOURCE_MEDIA_RIGHTS_AUTHORIZATION_RECEIPT_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type SourceMediaRightsAuthorizationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_MEDIA_RIGHTS_AUTHORIZATION_RECEIPT_KIND_V1;
  authority: Readonly<{
    ownerId: typeof SOURCE_MEDIA_RIGHTS_OWNER_ID_V1;
    ownerVersion: typeof SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1;
  }>;
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectOwnerId: string | null;
  permittedUse: 'EDIT_AND_RENDER_PROJECT';
  source: SourceMediaRightsRecordV1['source'];
  sourceMediaRightsStateSha256V1: string;
  sourceMediaRightsRecordSha256: string;
  evaluatedAt: string;
  receiptSha256: string;
}>;

export type SourceMediaRightsAuthorizationResultV1 = Readonly<
  | {
      disposition: 'AUTHORIZED';
      receipt: SourceMediaRightsAuthorizationReceiptV1;
    }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

/**
 * Authorizes one current immutable source version for one project use. The
 * rights ledger remains the only grant/revocation owner; callers cannot supply
 * a grant directly or substitute legacy asset/overlay consent.
 */
export async function authorizeCurrentSourceMediaRightsV1(input: Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectOwnerId: string | null;
  sourceVersion: MediaSourceVersionV1;
}>, ports: Readonly<{
  rightsReader: Readonly<SourceMediaRightsLedgerReaderV1>;
  now?: () => Date;
}>): Promise<SourceMediaRightsAuthorizationResultV1> {
  try {
    const scope = normalizeScope(input, ports);
    let state;
    try {
      const stored = await ports.rightsReader.read(
        createSourceMediaRightsLedgerScopeV1({
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          projectId: scope.projectId,
          assetId: scope.sourceVersion.assetId,
          sourceVersionSha256: scope.sourceVersion.sourceVersionSha256,
        }),
      );
      state = stored === null
        ? null
        : assertSourceMediaRightsGrantStateV1(stored);
    } catch {
      fail('SOURCE_MEDIA_RIGHTS_EVIDENCE_INVALID');
    }
    if (!state) fail('SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING');
    if (state.sourceMediaRightsRevocationV1) {
      fail('SOURCE_MEDIA_RIGHTS_REVOKED');
    }

    const record = state.sourceMediaRightsV1;
    assertRecordScope(record, scope);
    const evaluatedAt = currentTime(ports.now ?? (() => new Date()));
    assertLicenseActive(record, evaluatedAt);
    const material = {
      schemaVersion: 1 as const,
      kind: SOURCE_MEDIA_RIGHTS_AUTHORIZATION_RECEIPT_KIND_V1,
      authority: {
        ownerId: SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
        ownerVersion: SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
      },
      tenantId: scope.tenantId,
      userId: scope.userId,
      orgId: scope.orgId,
      projectId: scope.projectId,
      projectOwnerId: scope.projectOwnerId,
      permittedUse: 'EDIT_AND_RENDER_PROJECT' as const,
      source: record.source,
      sourceMediaRightsStateSha256V1:
        state.sourceMediaRightsStateSha256V1,
      sourceMediaRightsRecordSha256: record.recordSha256,
      evaluatedAt,
    };
    return deepFreezeEditronJsonV1({
      disposition: 'AUTHORIZED' as const,
      receipt: {
        ...material,
        receiptSha256: hashEditronCanonicalJsonV1(material),
      },
    });
  } catch (error) {
    return Object.freeze({
      disposition: 'BLOCKED' as const,
      diagnosticCode: diagnostic(error),
    });
  }
}

function normalizeScope(
  input: Parameters<typeof authorizeCurrentSourceMediaRightsV1>[0],
  ports: Parameters<typeof authorizeCurrentSourceMediaRightsV1>[1],
) {
  if (typeof ports?.rightsReader?.read !== 'function') {
    fail('SOURCE_MEDIA_RIGHTS_READER_PORT_INVALID');
  }
  if (ports.now !== undefined && typeof ports.now !== 'function') {
    fail('SOURCE_MEDIA_RIGHTS_NOW_PORT_INVALID');
  }
  return {
    tenantId: identity(input.tenantId, 'SOURCE_MEDIA_RIGHTS_TENANT_INVALID'),
    userId: identity(input.userId, 'SOURCE_MEDIA_RIGHTS_USER_INVALID'),
    orgId: nullableIdentity(input.orgId, 'SOURCE_MEDIA_RIGHTS_ORG_INVALID'),
    projectId: identity(input.projectId, 'SOURCE_MEDIA_RIGHTS_PROJECT_INVALID'),
    projectOwnerId: nullableIdentity(
      input.projectOwnerId,
      'SOURCE_MEDIA_RIGHTS_PROJECT_OWNER_INVALID',
    ),
    sourceVersion: assertMediaSourceVersionV1(input.sourceVersion),
  };
}

function assertRecordScope(
  record: SourceMediaRightsRecordV1,
  scope: ReturnType<typeof normalizeScope>,
): void {
  if (record.tenantId !== scope.tenantId
    || record.orgId !== scope.orgId
    || record.projectId !== scope.projectId) {
    fail('SOURCE_MEDIA_RIGHTS_PROJECT_SCOPE_MISMATCH');
  }
  const source = scope.sourceVersion;
  const expectedSource = {
    owner: source.owner,
    assetId: source.assetId,
    mediaKind: source.mediaKind,
    contentSha256: source.contentSha256,
    storageVersionSha256: source.storageVersion.storageVersionSha256,
    sourceVersionSha256: source.sourceVersionSha256,
  };
  if (canonicalizeEditronJsonV1(record.source)
      !== canonicalizeEditronJsonV1(expectedSource)) {
    fail('SOURCE_MEDIA_RIGHTS_SOURCE_SCOPE_MISMATCH');
  }
  if (record.disposition === 'OWNED_BY_USER') {
    if (source.owner.kind !== 'USER'
      || record.attestedByUserId !== source.owner.userId
      || (scope.userId !== source.owner.userId
        && scope.projectOwnerId !== source.owner.userId)) {
      fail('SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH');
    }
    return;
  }
  if (record.disposition === 'OWNED_BY_ORG') {
    if (source.owner.kind !== 'ORG'
      || scope.orgId !== source.owner.orgId) {
      fail('SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH');
    }
    return;
  }
  if (record.orgId === null
    && scope.userId !== record.attestedByUserId
    && scope.projectOwnerId !== record.attestedByUserId) {
    fail('SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH');
  }
}

function assertLicenseActive(
  record: SourceMediaRightsRecordV1,
  evaluatedAt: string,
): void {
  if (record.disposition !== 'LICENSED_FOR_PROJECT') return;
  const now = Date.parse(evaluatedAt);
  const license = record.license;
  if (!license || now < Date.parse(license.validFrom)
    || (license.expiresAt !== null && now >= Date.parse(license.expiresAt))) {
    fail('SOURCE_MEDIA_RIGHTS_LICENSE_NOT_ACTIVE');
  }
}

function currentTime(now: () => Date): string {
  let value: Date;
  try {
    value = now();
  } catch {
    fail('SOURCE_MEDIA_RIGHTS_CURRENT_TIME_INVALID');
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('SOURCE_MEDIA_RIGHTS_CURRENT_TIME_INVALID');
  }
  return value.toISOString();
}

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(code);
  return normalized;
}

function nullableIdentity(value: unknown, code: string): string | null {
  return value === null ? null : identity(value, code);
}

function diagnostic(error: unknown): string {
  if (error instanceof Error
    && /^SOURCE_MEDIA_RIGHTS_[A-Z0-9_]{1,180}$/.test(error.message)) {
    return error.message;
  }
  return 'SOURCE_MEDIA_RIGHTS_AUTHORIZATION_UNAVAILABLE';
}

function fail(code: string): never {
  throw new Error(code);
}
