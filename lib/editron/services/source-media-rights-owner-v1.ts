import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const SOURCE_MEDIA_RIGHTS_OWNER_ID_V1 =
  'EDITRON_SOURCE_MEDIA_RIGHTS_OWNER' as const;
export const SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1 = '1' as const;
export const SOURCE_MEDIA_RIGHTS_RECORD_KIND_V1 =
  'EDITRON_SOURCE_MEDIA_RIGHTS_RECORD_V1' as const;
export const SOURCE_MEDIA_RIGHTS_REVOCATION_KIND_V1 =
  'EDITRON_SOURCE_MEDIA_RIGHTS_REVOCATION_V1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type SourceMediaRightsDispositionV1 =
  | 'OWNED_BY_USER'
  | 'OWNED_BY_ORG'
  | 'LICENSED_FOR_PROJECT';

export type SourceMediaRightsSourceReferenceV1 = Readonly<{
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: MediaSourceVersionV1['mediaKind'];
  contentSha256: string;
  storageVersionSha256: string;
  sourceVersionSha256: string;
}>;

export type SourceMediaRightsLicenseEvidenceV1 = Readonly<{
  licenseId: string;
  issuerId: string;
  validFrom: string;
  expiresAt: string | null;
  evidenceSha256: string;
}>;

export type SourceMediaRightsRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_MEDIA_RIGHTS_RECORD_KIND_V1;
  authority: Readonly<{
    ownerId: typeof SOURCE_MEDIA_RIGHTS_OWNER_ID_V1;
    ownerVersion: typeof SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1;
  }>;
  tenantId: string;
  attestedByUserId: string;
  orgId: string | null;
  projectId: string;
  disposition: SourceMediaRightsDispositionV1;
  permittedUse: 'EDIT_AND_RENDER_PROJECT';
  source: SourceMediaRightsSourceReferenceV1;
  terms: Readonly<{
    version: string;
    contentSha256: string;
  }>;
  license: SourceMediaRightsLicenseEvidenceV1 | null;
  issuedAt: string;
  principalAuthorization: Readonly<{
    ownerId: string;
    ownerVersion: string;
    receiptSha256: string;
  }>;
  recordSha256: string;
}>;

export type SourceMediaRightsRevocationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_MEDIA_RIGHTS_REVOCATION_KIND_V1;
  authority: Readonly<{
    ownerId: typeof SOURCE_MEDIA_RIGHTS_OWNER_ID_V1;
    ownerVersion: typeof SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1;
  }>;
  recordSha256: string;
  sourceVersionSha256: string;
  revokedByUserId: string;
  reason: 'RIGHTS_WITHDRAWN' | 'LICENSE_REVOKED' | 'ADMIN_REVOKED';
  revokedAt: string;
  principalAuthorization: Readonly<{
    ownerId: string;
    ownerVersion: string;
    receiptSha256: string;
  }>;
  revocationSha256: string;
}>;

export type SourceMediaRightsAssetStateV1 = Readonly<{
  sourceMediaRightsV1: SourceMediaRightsRecordV1;
  sourceMediaRightsRevocationV1: SourceMediaRightsRevocationReceiptV1 | null;
  sourceMediaRightsStateSha256V1: string;
}>;

export type SourceMediaRightsAssetStateInputV1 = Readonly<{
  assetId?: unknown;
  type?: unknown;
  userId?: unknown;
  orgId?: unknown;
  sourceVersionV1?: unknown;
  sourceMediaRightsV1?: unknown;
  sourceMediaRightsRevocationV1?: unknown;
  sourceMediaRightsStateSha256V1?: unknown;
}>;

export type SourceMediaRightsPrincipalAuthorizationRequestV1 = Readonly<{
  action: 'ISSUE' | 'REVOKE';
  actorUserId: string;
  tenantId: string;
  orgId: string | null;
  projectId: string;
  disposition: SourceMediaRightsDispositionV1;
  source: SourceMediaRightsSourceReferenceV1;
  currentRecordSha256: string | null;
}>;

export interface SourceMediaRightsPrincipalAuthorityV1 {
  ownerId: string;
  ownerVersion: string;
  authorize(input: SourceMediaRightsPrincipalAuthorizationRequestV1): Promise<Readonly<
    | { disposition: 'AUTHORIZED'; receiptSha256: string }
    | { disposition: 'BLOCKED'; diagnosticCode: string }
  >>;
}

export type SourceMediaRightsIssueResultV1 = Readonly<
  | { disposition: 'ISSUED'; state: SourceMediaRightsAssetStateV1 }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

export type SourceMediaRightsRevocationResultV1 = Readonly<
  | { disposition: 'REVOKED'; state: SourceMediaRightsAssetStateV1 }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

export async function issueSourceMediaRightsV1(input: Readonly<{
  tenantId: string;
  attestedByUserId: string;
  orgId: string | null;
  projectId: string;
  disposition: SourceMediaRightsDispositionV1;
  sourceVersion: MediaSourceVersionV1;
  termsVersion: string;
  termsContentSha256: string;
  license: SourceMediaRightsLicenseEvidenceV1 | null;
  attestedAt: Date;
  principalAuthority: Readonly<SourceMediaRightsPrincipalAuthorityV1>;
}>): Promise<SourceMediaRightsIssueResultV1> {
  let normalized: ReturnType<typeof normalizeIssueInput>;
  try {
    normalized = normalizeIssueInput(input);
  } catch {
    return blocked('SOURCE_MEDIA_RIGHTS_ISSUE_INPUT_INVALID');
  }

  const authorization = await authorizePrincipal(input.principalAuthority, {
    action: 'ISSUE',
    actorUserId: normalized.attestedByUserId,
    tenantId: normalized.tenantId,
    orgId: normalized.orgId,
    projectId: normalized.projectId,
    disposition: normalized.disposition,
    source: normalized.source,
    currentRecordSha256: null,
  });
  if (authorization.disposition === 'BLOCKED') return authorization;

  const record = createRecord({
    ...normalized,
    principalAuthorization: authorization.principalAuthorization,
  });
  return deepFreezeEditronJsonV1({
    disposition: 'ISSUED' as const,
    state: createSourceMediaRightsAssetStateV1({ record, revocation: null }),
  });
}

export async function revokeSourceMediaRightsV1(input: Readonly<{
  state: SourceMediaRightsAssetStateV1;
  revokedByUserId: string;
  reason: SourceMediaRightsRevocationReceiptV1['reason'];
  revokedAt: Date;
  principalAuthority: Readonly<SourceMediaRightsPrincipalAuthorityV1>;
}>): Promise<SourceMediaRightsRevocationResultV1> {
  let state: SourceMediaRightsAssetStateV1;
  let revokedByUserId: string;
  let reason: SourceMediaRightsRevocationReceiptV1['reason'];
  let revokedAt: string;
  try {
    state = assertSourceMediaRightsAssetStateV1(input.state);
    if (state.sourceMediaRightsRevocationV1) {
      return blocked('SOURCE_MEDIA_RIGHTS_ALREADY_REVOKED');
    }
    revokedByUserId = identity(
      input.revokedByUserId,
      'SOURCE_MEDIA_RIGHTS_REVOKED_BY_INVALID',
    );
    reason = revocationReason(input.reason);
    revokedAt = isoDate(input.revokedAt, 'SOURCE_MEDIA_RIGHTS_REVOKED_AT_INVALID');
    if (Date.parse(revokedAt) < Date.parse(state.sourceMediaRightsV1.issuedAt)) {
      return blocked('SOURCE_MEDIA_RIGHTS_REVOCATION_PRECEDES_ISSUE');
    }
  } catch {
    return blocked('SOURCE_MEDIA_RIGHTS_REVOCATION_INPUT_INVALID');
  }

  const record = state.sourceMediaRightsV1;
  const authorization = await authorizePrincipal(input.principalAuthority, {
    action: 'REVOKE',
    actorUserId: revokedByUserId,
    tenantId: record.tenantId,
    orgId: record.orgId,
    projectId: record.projectId,
    disposition: record.disposition,
    source: record.source,
    currentRecordSha256: record.recordSha256,
  });
  if (authorization.disposition === 'BLOCKED') return authorization;

  const revocation = createRevocation({
    record,
    revokedByUserId,
    reason,
    revokedAt,
    principalAuthorization: authorization.principalAuthorization,
  });
  return deepFreezeEditronJsonV1({
    disposition: 'REVOKED' as const,
    state: createSourceMediaRightsAssetStateV1({ record, revocation }),
  });
}

export function createSourceMediaRightsAssetStateV1(input: Readonly<{
  record: SourceMediaRightsRecordV1;
  revocation: SourceMediaRightsRevocationReceiptV1 | null;
}>): SourceMediaRightsAssetStateV1 {
  const record = assertSourceMediaRightsRecordV1(input.record);
  const revocation = input.revocation === null
    ? null
    : assertSourceMediaRightsRevocationReceiptV1(input.revocation, record);
  const material = {
    sourceMediaRightsV1: record,
    sourceMediaRightsRevocationV1: revocation,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    sourceMediaRightsStateSha256V1: hashEditronCanonicalJsonV1(material),
  });
}

/**
 * Reads the sole rights state stored on the existing MediaAsset. Legacy
 * audioRights are intentionally not promoted into visual/source clearance.
 */
export function readSourceMediaRightsAssetStateV1(
  asset: SourceMediaRightsAssetStateInputV1,
): SourceMediaRightsAssetStateV1 | null {
  const hasRecord = asset.sourceMediaRightsV1 !== undefined
    && asset.sourceMediaRightsV1 !== null;
  const hasRevocationField = Object.prototype.hasOwnProperty.call(
    asset,
    'sourceMediaRightsRevocationV1',
  );
  const hasStateHash = asset.sourceMediaRightsStateSha256V1 !== undefined
    && asset.sourceMediaRightsStateSha256V1 !== null;
  if (!hasRecord && !hasRevocationField && !hasStateHash) return null;
  if (!hasRecord || !hasRevocationField || !hasStateHash) {
    throw new Error('SOURCE_MEDIA_RIGHTS_ASSET_STATE_INCOMPLETE');
  }

  const state = createSourceMediaRightsAssetStateV1({
    record: asset.sourceMediaRightsV1 as SourceMediaRightsRecordV1,
    revocation: asset.sourceMediaRightsRevocationV1 as
      SourceMediaRightsRevocationReceiptV1 | null,
  });
  if (asset.sourceMediaRightsStateSha256V1
    !== state.sourceMediaRightsStateSha256V1) {
    throw new Error('SOURCE_MEDIA_RIGHTS_ASSET_STATE_HASH_MISMATCH');
  }

  const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  const record = state.sourceMediaRightsV1;
  if (asset.assetId !== sourceVersion.assetId
    || asset.type !== sourceVersion.mediaKind
    || !sameSource(record.source, sourceReference(sourceVersion))) {
    throw new Error('SOURCE_MEDIA_RIGHTS_ASSET_SOURCE_MISMATCH');
  }
  if (sourceVersion.owner.kind === 'USER') {
    if (asset.userId !== sourceVersion.owner.userId) {
      throw new Error('SOURCE_MEDIA_RIGHTS_ASSET_OWNER_MISMATCH');
    }
  } else if (asset.orgId !== sourceVersion.owner.orgId) {
    throw new Error('SOURCE_MEDIA_RIGHTS_ASSET_OWNER_MISMATCH');
  }
  return state;
}

export function assertSourceMediaRightsRecordV1(
  value: unknown,
): SourceMediaRightsRecordV1 {
  const record = object(value, 'SOURCE_MEDIA_RIGHTS_RECORD_INVALID');
  exactKeys(record, [
    'attestedByUserId', 'authority', 'disposition', 'issuedAt', 'kind',
    'license', 'orgId', 'permittedUse', 'principalAuthorization', 'projectId',
    'recordSha256', 'schemaVersion', 'source', 'tenantId', 'terms',
  ], 'SOURCE_MEDIA_RIGHTS_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 1 || record.kind !== SOURCE_MEDIA_RIGHTS_RECORD_KIND_V1) {
    throw new Error('SOURCE_MEDIA_RIGHTS_RECORD_KIND_INVALID');
  }
  const authority = object(record.authority, 'SOURCE_MEDIA_RIGHTS_AUTHORITY_INVALID');
  exactKeys(authority, ['ownerId', 'ownerVersion'], 'SOURCE_MEDIA_RIGHTS_AUTHORITY_FIELDS_INVALID');
  if (authority.ownerId !== SOURCE_MEDIA_RIGHTS_OWNER_ID_V1
    || authority.ownerVersion !== SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1) {
    throw new Error('SOURCE_MEDIA_RIGHTS_AUTHORITY_INVALID');
  }
  if (record.permittedUse !== 'EDIT_AND_RENDER_PROJECT') {
    throw new Error('SOURCE_MEDIA_RIGHTS_PERMITTED_USE_INVALID');
  }
  const terms = object(record.terms, 'SOURCE_MEDIA_RIGHTS_TERMS_INVALID');
  exactKeys(terms, ['contentSha256', 'version'], 'SOURCE_MEDIA_RIGHTS_TERMS_FIELDS_INVALID');
  const principal = normalizePrincipalAuthorization(record.principalAuthorization);
  const rebuilt = createRecord({
    tenantId: identity(record.tenantId, 'SOURCE_MEDIA_RIGHTS_TENANT_INVALID'),
    attestedByUserId: identity(
      record.attestedByUserId,
      'SOURCE_MEDIA_RIGHTS_ATTESTER_INVALID',
    ),
    orgId: nullableIdentity(record.orgId, 'SOURCE_MEDIA_RIGHTS_ORG_INVALID'),
    projectId: identity(record.projectId, 'SOURCE_MEDIA_RIGHTS_PROJECT_INVALID'),
    disposition: disposition(record.disposition),
    source: normalizeSourceReference(record.source),
    termsVersion: identity(terms.version, 'SOURCE_MEDIA_RIGHTS_TERMS_VERSION_INVALID'),
    termsContentSha256: sha256(
      terms.contentSha256,
      'SOURCE_MEDIA_RIGHTS_TERMS_SHA256_INVALID',
    ),
    license: normalizeLicense(record.license),
    issuedAt: isoDate(record.issuedAt, 'SOURCE_MEDIA_RIGHTS_ISSUED_AT_INVALID'),
    principalAuthorization: principal,
  });
  if (rebuilt.recordSha256 !== sha256(
    record.recordSha256,
    'SOURCE_MEDIA_RIGHTS_RECORD_SHA256_INVALID',
  )) {
    throw new Error('SOURCE_MEDIA_RIGHTS_RECORD_HASH_MISMATCH');
  }
  return rebuilt;
}

export function assertSourceMediaRightsRevocationReceiptV1(
  value: unknown,
  record: SourceMediaRightsRecordV1,
): SourceMediaRightsRevocationReceiptV1 {
  const candidate = object(value, 'SOURCE_MEDIA_RIGHTS_REVOCATION_INVALID');
  exactKeys(candidate, [
    'authority', 'kind', 'principalAuthorization', 'reason', 'recordSha256',
    'revocationSha256', 'revokedAt', 'revokedByUserId', 'schemaVersion',
    'sourceVersionSha256',
  ], 'SOURCE_MEDIA_RIGHTS_REVOCATION_FIELDS_INVALID');
  if (candidate.schemaVersion !== 1
    || candidate.kind !== SOURCE_MEDIA_RIGHTS_REVOCATION_KIND_V1) {
    throw new Error('SOURCE_MEDIA_RIGHTS_REVOCATION_KIND_INVALID');
  }
  const authority = object(candidate.authority, 'SOURCE_MEDIA_RIGHTS_AUTHORITY_INVALID');
  exactKeys(authority, ['ownerId', 'ownerVersion'], 'SOURCE_MEDIA_RIGHTS_AUTHORITY_FIELDS_INVALID');
  if (authority.ownerId !== SOURCE_MEDIA_RIGHTS_OWNER_ID_V1
    || authority.ownerVersion !== SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1) {
    throw new Error('SOURCE_MEDIA_RIGHTS_AUTHORITY_INVALID');
  }
  const rebuilt = createRevocation({
    record: assertSourceMediaRightsRecordV1(record),
    revokedByUserId: identity(
      candidate.revokedByUserId,
      'SOURCE_MEDIA_RIGHTS_REVOKED_BY_INVALID',
    ),
    reason: revocationReason(candidate.reason),
    revokedAt: isoDate(candidate.revokedAt, 'SOURCE_MEDIA_RIGHTS_REVOKED_AT_INVALID'),
    principalAuthorization: normalizePrincipalAuthorization(
      candidate.principalAuthorization,
    ),
  });
  if (rebuilt.recordSha256 !== candidate.recordSha256
    || rebuilt.sourceVersionSha256 !== candidate.sourceVersionSha256
    || rebuilt.revocationSha256 !== sha256(
      candidate.revocationSha256,
      'SOURCE_MEDIA_RIGHTS_REVOCATION_SHA256_INVALID',
    )) {
    throw new Error('SOURCE_MEDIA_RIGHTS_REVOCATION_SCOPE_INVALID');
  }
  return rebuilt;
}

function assertSourceMediaRightsAssetStateV1(
  state: SourceMediaRightsAssetStateV1,
): SourceMediaRightsAssetStateV1 {
  const rebuilt = createSourceMediaRightsAssetStateV1({
    record: state.sourceMediaRightsV1,
    revocation: state.sourceMediaRightsRevocationV1,
  });
  if (state.sourceMediaRightsStateSha256V1
    !== rebuilt.sourceMediaRightsStateSha256V1) {
    throw new Error('SOURCE_MEDIA_RIGHTS_ASSET_STATE_HASH_MISMATCH');
  }
  return rebuilt;
}

function normalizeIssueInput(input: Parameters<typeof issueSourceMediaRightsV1>[0]) {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  const normalized = {
    tenantId: identity(input.tenantId, 'SOURCE_MEDIA_RIGHTS_TENANT_INVALID'),
    attestedByUserId: identity(
      input.attestedByUserId,
      'SOURCE_MEDIA_RIGHTS_ATTESTER_INVALID',
    ),
    orgId: nullableIdentity(input.orgId, 'SOURCE_MEDIA_RIGHTS_ORG_INVALID'),
    projectId: identity(input.projectId, 'SOURCE_MEDIA_RIGHTS_PROJECT_INVALID'),
    disposition: disposition(input.disposition),
    source: sourceReference(sourceVersion),
    termsVersion: identity(
      input.termsVersion,
      'SOURCE_MEDIA_RIGHTS_TERMS_VERSION_INVALID',
    ),
    termsContentSha256: sha256(
      input.termsContentSha256,
      'SOURCE_MEDIA_RIGHTS_TERMS_SHA256_INVALID',
    ),
    license: normalizeLicense(input.license),
    issuedAt: isoDate(input.attestedAt, 'SOURCE_MEDIA_RIGHTS_ISSUED_AT_INVALID'),
  };
  assertDispositionScope(normalized);
  return normalized;
}

function createRecord(input: Readonly<{
  tenantId: string;
  attestedByUserId: string;
  orgId: string | null;
  projectId: string;
  disposition: SourceMediaRightsDispositionV1;
  source: SourceMediaRightsSourceReferenceV1;
  termsVersion: string;
  termsContentSha256: string;
  license: SourceMediaRightsLicenseEvidenceV1 | null;
  issuedAt: string;
  principalAuthorization: SourceMediaRightsRecordV1['principalAuthorization'];
}>): SourceMediaRightsRecordV1 {
  assertDispositionScope(input);
  const material = {
    schemaVersion: 1 as const,
    kind: SOURCE_MEDIA_RIGHTS_RECORD_KIND_V1,
    authority: {
      ownerId: SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
      ownerVersion: SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
    },
    tenantId: input.tenantId,
    attestedByUserId: input.attestedByUserId,
    orgId: input.orgId,
    projectId: input.projectId,
    disposition: input.disposition,
    permittedUse: 'EDIT_AND_RENDER_PROJECT' as const,
    source: input.source,
    terms: {
      version: input.termsVersion,
      contentSha256: input.termsContentSha256,
    },
    license: input.license,
    issuedAt: input.issuedAt,
    principalAuthorization: input.principalAuthorization,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function createRevocation(input: Readonly<{
  record: SourceMediaRightsRecordV1;
  revokedByUserId: string;
  reason: SourceMediaRightsRevocationReceiptV1['reason'];
  revokedAt: string;
  principalAuthorization: SourceMediaRightsRevocationReceiptV1['principalAuthorization'];
}>): SourceMediaRightsRevocationReceiptV1 {
  if (Date.parse(input.revokedAt) < Date.parse(input.record.issuedAt)) {
    throw new Error('SOURCE_MEDIA_RIGHTS_REVOCATION_PRECEDES_ISSUE');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: SOURCE_MEDIA_RIGHTS_REVOCATION_KIND_V1,
    authority: {
      ownerId: SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
      ownerVersion: SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
    },
    recordSha256: input.record.recordSha256,
    sourceVersionSha256: input.record.source.sourceVersionSha256,
    revokedByUserId: input.revokedByUserId,
    reason: input.reason,
    revokedAt: input.revokedAt,
    principalAuthorization: input.principalAuthorization,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    revocationSha256: hashEditronCanonicalJsonV1(material),
  });
}

async function authorizePrincipal(
  authority: Readonly<SourceMediaRightsPrincipalAuthorityV1>,
  request: SourceMediaRightsPrincipalAuthorizationRequestV1,
): Promise<Readonly<
  | {
      disposition: 'AUTHORIZED';
      principalAuthorization: SourceMediaRightsRecordV1['principalAuthorization'];
    }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>> {
  let ownerId: string;
  let ownerVersion: string;
  try {
    ownerId = identity(authority?.ownerId, 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_OWNER_INVALID');
    ownerVersion = identity(
      authority?.ownerVersion,
      'SOURCE_MEDIA_RIGHTS_PRINCIPAL_VERSION_INVALID',
    );
    if (typeof authority.authorize !== 'function') throw new Error('INVALID');
  } catch {
    return blocked('SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORITY_INVALID');
  }

  let result: Awaited<ReturnType<SourceMediaRightsPrincipalAuthorityV1['authorize']>>;
  try {
    result = await authority.authorize(deepFreezeEditronJsonV1(request));
  } catch {
    return blocked('SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORITY_UNAVAILABLE');
  }
  if (result?.disposition === 'BLOCKED') {
    return blocked(safeDiagnostic(result.diagnosticCode)
      ?? 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORIZATION_BLOCKED');
  }
  if (result?.disposition !== 'AUTHORIZED') {
    return blocked('SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORIZATION_RESULT_INVALID');
  }
  let receiptSha256: string;
  try {
    receiptSha256 = sha256(
      result.receiptSha256,
      'SOURCE_MEDIA_RIGHTS_PRINCIPAL_RECEIPT_SHA256_INVALID',
    );
  } catch {
    return blocked('SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORIZATION_RESULT_INVALID');
  }
  return deepFreezeEditronJsonV1({
    disposition: 'AUTHORIZED' as const,
    principalAuthorization: { ownerId, ownerVersion, receiptSha256 },
  });
}

function sourceReference(
  source: Readonly<MediaSourceVersionV1>,
): SourceMediaRightsSourceReferenceV1 {
  return deepFreezeEditronJsonV1({
    owner: source.owner,
    assetId: source.assetId,
    mediaKind: source.mediaKind,
    contentSha256: source.contentSha256,
    storageVersionSha256: source.storageVersion.storageVersionSha256,
    sourceVersionSha256: source.sourceVersionSha256,
  });
}

function normalizeSourceReference(value: unknown): SourceMediaRightsSourceReferenceV1 {
  const source = object(value, 'SOURCE_MEDIA_RIGHTS_SOURCE_INVALID');
  exactKeys(source, [
    'assetId', 'contentSha256', 'mediaKind', 'owner', 'sourceVersionSha256',
    'storageVersionSha256',
  ], 'SOURCE_MEDIA_RIGHTS_SOURCE_FIELDS_INVALID');
  const owner = normalizeOwner(source.owner);
  const mediaKind = source.mediaKind;
  if (mediaKind !== 'video' && mediaKind !== 'audio' && mediaKind !== 'image') {
    throw new Error('SOURCE_MEDIA_RIGHTS_MEDIA_KIND_INVALID');
  }
  return deepFreezeEditronJsonV1({
    owner,
    assetId: identity(source.assetId, 'SOURCE_MEDIA_RIGHTS_ASSET_INVALID'),
    mediaKind,
    contentSha256: sha256(
      source.contentSha256,
      'SOURCE_MEDIA_RIGHTS_CONTENT_SHA256_INVALID',
    ),
    storageVersionSha256: sha256(
      source.storageVersionSha256,
      'SOURCE_MEDIA_RIGHTS_STORAGE_VERSION_SHA256_INVALID',
    ),
    sourceVersionSha256: sha256(
      source.sourceVersionSha256,
      'SOURCE_MEDIA_RIGHTS_SOURCE_VERSION_SHA256_INVALID',
    ),
  });
}

function normalizeLicense(value: unknown): SourceMediaRightsLicenseEvidenceV1 | null {
  if (value === null) return null;
  const license = object(value, 'SOURCE_MEDIA_RIGHTS_LICENSE_INVALID');
  exactKeys(license, [
    'evidenceSha256', 'expiresAt', 'issuerId', 'licenseId', 'validFrom',
  ], 'SOURCE_MEDIA_RIGHTS_LICENSE_FIELDS_INVALID');
  const validFrom = isoDate(
    license.validFrom,
    'SOURCE_MEDIA_RIGHTS_LICENSE_VALID_FROM_INVALID',
  );
  const expiresAt = license.expiresAt === null
    ? null
    : isoDate(license.expiresAt, 'SOURCE_MEDIA_RIGHTS_LICENSE_EXPIRES_AT_INVALID');
  if (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(validFrom)) {
    throw new Error('SOURCE_MEDIA_RIGHTS_LICENSE_RANGE_INVALID');
  }
  return deepFreezeEditronJsonV1({
    licenseId: identity(license.licenseId, 'SOURCE_MEDIA_RIGHTS_LICENSE_ID_INVALID'),
    issuerId: identity(license.issuerId, 'SOURCE_MEDIA_RIGHTS_LICENSE_ISSUER_INVALID'),
    validFrom,
    expiresAt,
    evidenceSha256: sha256(
      license.evidenceSha256,
      'SOURCE_MEDIA_RIGHTS_LICENSE_EVIDENCE_SHA256_INVALID',
    ),
  });
}

function normalizePrincipalAuthorization(
  value: unknown,
): SourceMediaRightsRecordV1['principalAuthorization'] {
  const principal = object(value, 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORIZATION_INVALID');
  exactKeys(principal, [
    'ownerId', 'ownerVersion', 'receiptSha256',
  ], 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORIZATION_FIELDS_INVALID');
  return deepFreezeEditronJsonV1({
    ownerId: identity(principal.ownerId, 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_OWNER_INVALID'),
    ownerVersion: identity(
      principal.ownerVersion,
      'SOURCE_MEDIA_RIGHTS_PRINCIPAL_VERSION_INVALID',
    ),
    receiptSha256: sha256(
      principal.receiptSha256,
      'SOURCE_MEDIA_RIGHTS_PRINCIPAL_RECEIPT_SHA256_INVALID',
    ),
  });
}

function assertDispositionScope(input: Readonly<{
  disposition: SourceMediaRightsDispositionV1;
  source: SourceMediaRightsSourceReferenceV1;
  attestedByUserId: string;
  orgId: string | null;
  license: SourceMediaRightsLicenseEvidenceV1 | null;
}>): void {
  if (input.disposition === 'OWNED_BY_USER') {
    if (input.source.owner.kind !== 'USER'
      || input.source.owner.userId !== input.attestedByUserId
      || input.license !== null) {
      throw new Error('SOURCE_MEDIA_RIGHTS_USER_OWNERSHIP_SCOPE_INVALID');
    }
    return;
  }
  if (input.disposition === 'OWNED_BY_ORG') {
    if (input.source.owner.kind !== 'ORG'
      || input.source.owner.orgId !== input.orgId
      || input.license !== null) {
      throw new Error('SOURCE_MEDIA_RIGHTS_ORG_OWNERSHIP_SCOPE_INVALID');
    }
    return;
  }
  if (input.license === null) {
    throw new Error('SOURCE_MEDIA_RIGHTS_LICENSE_REQUIRED');
  }
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const owner = object(value, 'SOURCE_MEDIA_RIGHTS_SOURCE_OWNER_INVALID');
  if (owner.kind === 'USER') {
    exactKeys(owner, ['kind', 'userId'], 'SOURCE_MEDIA_RIGHTS_SOURCE_OWNER_FIELDS_INVALID');
    return {
      kind: 'USER',
      userId: identity(owner.userId, 'SOURCE_MEDIA_RIGHTS_SOURCE_OWNER_INVALID'),
    };
  }
  if (owner.kind === 'ORG') {
    exactKeys(owner, ['kind', 'orgId'], 'SOURCE_MEDIA_RIGHTS_SOURCE_OWNER_FIELDS_INVALID');
    return {
      kind: 'ORG',
      orgId: identity(owner.orgId, 'SOURCE_MEDIA_RIGHTS_SOURCE_OWNER_INVALID'),
    };
  }
  throw new Error('SOURCE_MEDIA_RIGHTS_SOURCE_OWNER_INVALID');
}

function sameSource(
  left: SourceMediaRightsSourceReferenceV1,
  right: SourceMediaRightsSourceReferenceV1,
): boolean {
  return hashEditronCanonicalJsonV1(left) === hashEditronCanonicalJsonV1(right);
}

function disposition(value: unknown): SourceMediaRightsDispositionV1 {
  if (value !== 'OWNED_BY_USER'
    && value !== 'OWNED_BY_ORG'
    && value !== 'LICENSED_FOR_PROJECT') {
    throw new Error('SOURCE_MEDIA_RIGHTS_DISPOSITION_INVALID');
  }
  return value;
}

function revocationReason(value: unknown): SourceMediaRightsRevocationReceiptV1['reason'] {
  if (value !== 'RIGHTS_WITHDRAWN'
    && value !== 'LICENSE_REVOKED'
    && value !== 'ADMIN_REVOKED') {
    throw new Error('SOURCE_MEDIA_RIGHTS_REVOCATION_REASON_INVALID');
  }
  return value;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) throw new Error(code);
}

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) throw new Error(code);
  return normalized;
}

function nullableIdentity(value: unknown, code: string): string | null {
  return value === null ? null : identity(value, code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code);
  return value;
}

function isoDate(value: unknown, code: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(code);
  return date.toISOString();
}

function safeDiagnostic(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_]{1,200}$/.test(value)
    ? value
    : null;
}

function blocked(diagnosticCode: string): Readonly<{
  disposition: 'BLOCKED';
  diagnosticCode: string;
}> {
  return Object.freeze({ disposition: 'BLOCKED' as const, diagnosticCode });
}
