import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertAssetTranscriptionSourceBindingV2,
  type AssetTranscriptionPrecisionV2,
  type AssetTranscriptionSourceBindingV2,
} from './asset-transcription-source-cache-v2';
import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
} from './editorial-plan-v1';
import type { ProjectRevisionV1 } from './project-service';

export const SOURCE_TRANSCRIPTION_EGRESS_REQUEST_KIND_V1 =
  'EDITRON_SOURCE_TRANSCRIPTION_EGRESS_REQUEST_V1' as const;
export const SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_KIND_V1 =
  'EDITRON_SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type SourceTranscriptionProviderIdV1 =
  | 'xai'
  | 'deepgram'
  | 'fal-ai'
  | 'google-gemini';

export type SourceTranscriptionEgressRequestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_TRANSCRIPTION_EGRESS_REQUEST_KIND_V1;
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  sourceBindingV2: AssetTranscriptionSourceBindingV2;
  precision: AssetTranscriptionPrecisionV2;
  eligibleProviderIds: readonly SourceTranscriptionProviderIdV1[];
  sourceRightsAuthorizationReceiptSha256: string;
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  requestSha256: string;
}>;

export type SourceTranscriptionEgressAuthorizationV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_KIND_V1;
  requestSha256: string;
  approvedProviderIds: readonly SourceTranscriptionProviderIdV1[];
  authorizationDecisionRef: Readonly<EditorialPlanArtifactRefV1>;
  issuedAt: string;
  expiresAt: string;
  authorizationSha256: string;
}>;

export interface SourceTranscriptionEgressPolicyOwnerV1 {
  authorize(
    request: SourceTranscriptionEgressRequestV1,
  ): Promise<unknown>;
}

export type SourceTranscriptionEgressAuthorizationResultV1 = Readonly<
  | {
      disposition: 'AUTHORIZED';
      request: SourceTranscriptionEgressRequestV1;
      authorization: SourceTranscriptionEgressAuthorizationV1;
    }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

export function createSourceTranscriptionEgressRequestV1(input: Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  sourceBindingV2: AssetTranscriptionSourceBindingV2;
  eligibleProviderIds: readonly SourceTranscriptionProviderIdV1[];
  sourceRightsAuthorizationReceiptSha256: string;
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
}>): SourceTranscriptionEgressRequestV1 {
  const sourceBindingV2 = assertAssetTranscriptionSourceBindingV2(
    input.sourceBindingV2,
  );
  const userId = identity(input.userId, 'SOURCE_TRANSCRIPTION_EGRESS_USER_INVALID');
  if (sourceBindingV2.userId !== userId) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_SOURCE_USER_MISMATCH');
  }
  const tenantId = identity(
    input.tenantId,
    'SOURCE_TRANSCRIPTION_EGRESS_TENANT_INVALID',
  );
  const orgId = input.orgId === null
    ? null
    : identity(input.orgId, 'SOURCE_TRANSCRIPTION_EGRESS_ORG_INVALID');
  assertSourceTenantScope(sourceBindingV2, tenantId, orgId);
  const material = {
    schemaVersion: 1 as const,
    kind: SOURCE_TRANSCRIPTION_EGRESS_REQUEST_KIND_V1,
    tenantId,
    userId,
    orgId,
    projectId: identity(
      input.projectId,
      'SOURCE_TRANSCRIPTION_EGRESS_PROJECT_INVALID',
    ),
    projectRevision: projectRevision(input.projectRevision),
    sourceBindingV2,
    precision: sourceBindingV2.precision,
    eligibleProviderIds: providerSet(
      input.eligibleProviderIds,
      sourceBindingV2.precision,
      'SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_SET_INVALID',
    ),
    sourceRightsAuthorizationReceiptSha256: sha256(
      input.sourceRightsAuthorizationReceiptSha256,
      'SOURCE_TRANSCRIPTION_EGRESS_RIGHTS_RECEIPT_INVALID',
    ),
    privacyEgressPolicyRef: artifactRef(
      input.privacyEgressPolicyRef,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_REF_INVALID',
    ),
  };
  return deepFreezeEditronJsonV1({
    ...material,
    requestSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertSourceTranscriptionEgressRequestV1(
  value: unknown,
): SourceTranscriptionEgressRequestV1 {
  const record = object(value, 'SOURCE_TRANSCRIPTION_EGRESS_REQUEST_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'tenantId', 'userId', 'orgId', 'projectId',
    'projectRevision', 'sourceBindingV2', 'precision', 'eligibleProviderIds',
    'sourceRightsAuthorizationReceiptSha256', 'privacyEgressPolicyRef',
    'requestSha256',
  ], 'SOURCE_TRANSCRIPTION_EGRESS_REQUEST_FIELDS_INVALID');
  const rebound = createSourceTranscriptionEgressRequestV1({
    tenantId: text(record.tenantId),
    userId: text(record.userId),
    orgId: record.orgId === null ? null : text(record.orgId),
    projectId: text(record.projectId),
    projectRevision: record.projectRevision as unknown as ProjectRevisionV1,
    sourceBindingV2: record.sourceBindingV2 as AssetTranscriptionSourceBindingV2,
    eligibleProviderIds: record.eligibleProviderIds as SourceTranscriptionProviderIdV1[],
    sourceRightsAuthorizationReceiptSha256: text(
      record.sourceRightsAuthorizationReceiptSha256,
    ),
    privacyEgressPolicyRef: record.privacyEgressPolicyRef as EditorialPlanArtifactRefV1,
  });
  if (record.precision !== rebound.precision
    || record.requestSha256 !== rebound.requestSha256
    || canonicalizeEditronJsonV1(record)
      !== canonicalizeEditronJsonV1(rebound)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_REQUEST_INVALID');
  }
  return rebound;
}

export function createSourceTranscriptionEgressAuthorizationV1(input: Readonly<{
  request: SourceTranscriptionEgressRequestV1;
  approvedProviderIds: readonly SourceTranscriptionProviderIdV1[];
  authorizationDecisionRef: Readonly<EditorialPlanArtifactRefV1>;
  issuedAt: string;
  expiresAt: string;
}>): SourceTranscriptionEgressAuthorizationV1 {
  const request = assertSourceTranscriptionEgressRequestV1(input.request);
  const approvedProviderIds = providerSet(
    input.approvedProviderIds,
    request.precision,
    'SOURCE_TRANSCRIPTION_EGRESS_APPROVED_PROVIDER_SET_INVALID',
  );
  if (approvedProviderIds.some(
    (providerId) => !request.eligibleProviderIds.includes(providerId),
  )) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_NOT_REQUESTED');
  }
  const issuedAt = timestamp(
    input.issuedAt,
    'SOURCE_TRANSCRIPTION_EGRESS_ISSUED_AT_INVALID',
  );
  const expiresAt = timestamp(
    input.expiresAt,
    'SOURCE_TRANSCRIPTION_EGRESS_EXPIRES_AT_INVALID',
  );
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_LIFETIME_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_KIND_V1,
    requestSha256: request.requestSha256,
    approvedProviderIds,
    authorizationDecisionRef: artifactRef(
      input.authorizationDecisionRef,
      'SOURCE_TRANSCRIPTION_EGRESS_DECISION_REF_INVALID',
    ),
    issuedAt,
    expiresAt,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    authorizationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertSourceTranscriptionEgressAuthorizationV1(
  value: unknown,
  requestInput: SourceTranscriptionEgressRequestV1,
): SourceTranscriptionEgressAuthorizationV1 {
  const request = assertSourceTranscriptionEgressRequestV1(requestInput);
  const record = object(
    value,
    'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'requestSha256', 'approvedProviderIds',
    'authorizationDecisionRef', 'issuedAt', 'expiresAt',
    'authorizationSha256',
  ], 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_FIELDS_INVALID');
  const rebound = createSourceTranscriptionEgressAuthorizationV1({
    request,
    approvedProviderIds: record.approvedProviderIds as SourceTranscriptionProviderIdV1[],
    authorizationDecisionRef: record.authorizationDecisionRef as EditorialPlanArtifactRefV1,
    issuedAt: text(record.issuedAt),
    expiresAt: text(record.expiresAt),
  });
  if (record.requestSha256 !== request.requestSha256
    || record.authorizationSha256 !== rebound.authorizationSha256
    || canonicalizeEditronJsonV1(record)
      !== canonicalizeEditronJsonV1(rebound)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_INVALID');
  }
  return rebound;
}

export async function authorizeSourceTranscriptionEgressV1(
  requestInput: SourceTranscriptionEgressRequestV1,
  owner: Readonly<SourceTranscriptionEgressPolicyOwnerV1>,
  now: () => Date = () => new Date(),
): Promise<SourceTranscriptionEgressAuthorizationResultV1> {
  try {
    const request = assertSourceTranscriptionEgressRequestV1(requestInput);
    if (!owner || typeof owner.authorize !== 'function') {
      fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_OWNER_INVALID');
    }
    const authorization = assertSourceTranscriptionEgressAuthorizationV1(
      await owner.authorize(request),
      request,
    );
    const evaluatedAt = currentTime(now);
    if (Date.parse(evaluatedAt) < Date.parse(authorization.issuedAt)
      || Date.parse(evaluatedAt) >= Date.parse(authorization.expiresAt)) {
      fail('SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_NOT_CURRENT');
    }
    return deepFreezeEditronJsonV1({
      disposition: 'AUTHORIZED' as const,
      request,
      authorization,
    });
  } catch (error) {
    return Object.freeze({
      disposition: 'BLOCKED' as const,
      diagnosticCode: diagnostic(error),
    });
  }
}

export function assertSourceTranscriptionProviderApprovedV1(
  authorization: SourceTranscriptionEgressAuthorizationV1,
  request: SourceTranscriptionEgressRequestV1,
  providerId: SourceTranscriptionProviderIdV1,
): void {
  const normalized = assertSourceTranscriptionEgressAuthorizationV1(
    authorization,
    request,
  );
  if (!normalized.approvedProviderIds.includes(providerId)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_NOT_APPROVED');
  }
}

function providerSet(
  value: readonly SourceTranscriptionProviderIdV1[],
  precision: AssetTranscriptionPrecisionV2,
  code: string,
): readonly SourceTranscriptionProviderIdV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) fail(code);
  const compatible: readonly SourceTranscriptionProviderIdV1[] =
    precision === 'MEASURED_WORD_REQUIRED'
      ? ['deepgram', 'xai']
      : ['deepgram', 'fal-ai', 'google-gemini'];
  const providers = value.map((provider) => {
    if (!compatible.includes(provider)) fail(code);
    return provider;
  });
  if (new Set(providers).size !== providers.length) fail(code);
  return Object.freeze([...providers].sort());
}

function assertSourceTenantScope(
  binding: AssetTranscriptionSourceBindingV2,
  tenantId: string,
  orgId: string | null,
): void {
  const owner = binding.source.owner;
  if (owner.kind === 'USER') {
    if (tenantId !== owner.userId || orgId !== null) {
      fail('SOURCE_TRANSCRIPTION_EGRESS_SOURCE_TENANT_MISMATCH');
    }
    return;
  }
  if (tenantId !== owner.orgId || orgId !== owner.orgId) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_SOURCE_TENANT_MISMATCH');
  }
}

function projectRevision(value: unknown): ProjectRevisionV1 {
  const record = object(value, 'SOURCE_TRANSCRIPTION_EGRESS_REVISION_INVALID');
  exactKeys(record, ['schemaVersion', 'value', 'compatibilityUpdatedAt'],
    'SOURCE_TRANSCRIPTION_EGRESS_REVISION_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || !Number.isSafeInteger(record.value)
    || Number(record.value) < 0) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_REVISION_INVALID');
  }
  return deepFreezeEditronJsonV1({
    schemaVersion: 1 as const,
    value: Number(record.value),
    compatibilityUpdatedAt: timestamp(
      record.compatibilityUpdatedAt,
      'SOURCE_TRANSCRIPTION_EGRESS_REVISION_TIME_INVALID',
    ),
  });
}

function artifactRef(value: unknown, code: string): Readonly<EditorialPlanArtifactRefV1> {
  const parsed = EditorialPlanArtifactRefSchemaV1.safeParse(value);
  if (!parsed.success) fail(code);
  return deepFreezeEditronJsonV1(parsed.data);
}

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function timestamp(value: unknown, code: string): string {
  if (typeof value !== 'string') fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail(code);
  return value;
}

function currentTime(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_CURRENT_TIME_INVALID');
  }
  return value.toISOString();
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) fail(code);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function diagnostic(error: unknown): string {
  return error instanceof Error
    && /^SOURCE_TRANSCRIPTION_EGRESS_[A-Z0-9_]{1,180}$/.test(error.message)
    ? error.message
    : 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_UNAVAILABLE';
}

function fail(code: string): never {
  throw new Error(code);
}
