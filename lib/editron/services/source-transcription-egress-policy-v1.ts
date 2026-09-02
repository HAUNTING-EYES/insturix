import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
} from './editorial-plan-v1';
import type {
  AssetTranscriptionPrecisionV2,
  AssetTranscriptionSourceRoleV2,
} from './asset-transcription-source-binding-v2';
import {
  assertSourceTranscriptionEgressRequestV1,
  createSourceTranscriptionEgressAuthorizationV1,
  type SourceTranscriptionEgressPolicyOwnerV1,
  type SourceTranscriptionEgressRequestV1,
  type SourceTranscriptionProviderIdV1,
} from './source-transcription-egress-authorization-v1';

export const SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_KIND_V1 =
  'EDITRON_SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_V1' as const;

type MediaKindV1 = 'video' | 'audio';

export type SourceTranscriptionEgressPolicyScopeV1 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
}>;

export type SourceTranscriptionEgressPolicyGrantV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_KIND_V1;
  scope: SourceTranscriptionEgressPolicyScopeV1;
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  allowedProviderIds: readonly SourceTranscriptionProviderIdV1[];
  allowedMediaKinds: readonly MediaKindV1[];
  allowedSourceRoles: readonly AssetTranscriptionSourceRoleV2[];
  allowedPrecisions: readonly AssetTranscriptionPrecisionV2[];
  authorizationTtlSeconds: number;
  authorizationDecisionRef: Readonly<EditorialPlanArtifactRefV1>;
  issuedAt: string;
  expiresAt: string;
  disposition: 'AUTHORIZED' | 'REVOKED';
  grantSha256: string;
}>;

export interface SourceTranscriptionEgressPolicyGrantReaderV1 {
  read(input: Readonly<{
    scope: SourceTranscriptionEgressPolicyScopeV1;
    privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  }>): Promise<unknown | null>;
}

export function createSourceTranscriptionEgressPolicyGrantV1(input: Readonly<{
  scope: SourceTranscriptionEgressPolicyScopeV1;
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  allowedProviderIds: readonly SourceTranscriptionProviderIdV1[];
  allowedMediaKinds: readonly MediaKindV1[];
  allowedSourceRoles: readonly AssetTranscriptionSourceRoleV2[];
  allowedPrecisions: readonly AssetTranscriptionPrecisionV2[];
  authorizationTtlSeconds: number;
  authorizationDecisionRef: Readonly<EditorialPlanArtifactRefV1>;
  issuedAt: string;
  expiresAt: string;
  disposition?: 'AUTHORIZED' | 'REVOKED';
}>): SourceTranscriptionEgressPolicyGrantV1 {
  const issuedAt = timestamp(
    input.issuedAt,
    'SOURCE_TRANSCRIPTION_EGRESS_POLICY_ISSUED_AT_INVALID',
  );
  const expiresAt = timestamp(
    input.expiresAt,
    'SOURCE_TRANSCRIPTION_EGRESS_POLICY_EXPIRES_AT_INVALID',
  );
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_LIFETIME_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_KIND_V1,
    scope: scope(input.scope),
    privacyEgressPolicyRef: artifactRef(
      input.privacyEgressPolicyRef,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_REF_INVALID',
    ),
    allowedProviderIds: providerSet(input.allowedProviderIds),
    allowedMediaKinds: enumSet(
      input.allowedMediaKinds,
      ['audio', 'video'] as const,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_MEDIA_KINDS_INVALID',
    ),
    allowedSourceRoles: enumSet(
      input.allowedSourceRoles,
      ['DIRECT', 'MASTER', 'PROXY'] as const,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_SOURCE_ROLES_INVALID',
    ),
    allowedPrecisions: enumSet(
      input.allowedPrecisions,
      ['MEASURED_WORD_REQUIRED', 'TEXT_ALLOWED'] as const,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_PRECISIONS_INVALID',
    ),
    authorizationTtlSeconds: ttl(input.authorizationTtlSeconds),
    authorizationDecisionRef: artifactRef(
      input.authorizationDecisionRef,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_DECISION_REF_INVALID',
    ),
    issuedAt,
    expiresAt,
    disposition: disposition(input.disposition ?? 'AUTHORIZED'),
  };
  return deepFreezeEditronJsonV1({
    ...material,
    grantSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertSourceTranscriptionEgressPolicyGrantV1(
  value: unknown,
): SourceTranscriptionEgressPolicyGrantV1 {
  const record = object(
    value,
    'SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'scope', 'privacyEgressPolicyRef',
    'allowedProviderIds', 'allowedMediaKinds', 'allowedSourceRoles',
    'allowedPrecisions', 'authorizationTtlSeconds',
    'authorizationDecisionRef', 'issuedAt', 'expiresAt', 'disposition',
    'grantSha256',
  ], 'SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_KIND_V1) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_VERSION_INVALID');
  }
  const rebound = createSourceTranscriptionEgressPolicyGrantV1({
    scope: record.scope as SourceTranscriptionEgressPolicyScopeV1,
    privacyEgressPolicyRef:
      record.privacyEgressPolicyRef as EditorialPlanArtifactRefV1,
    allowedProviderIds:
      record.allowedProviderIds as SourceTranscriptionProviderIdV1[],
    allowedMediaKinds: record.allowedMediaKinds as MediaKindV1[],
    allowedSourceRoles:
      record.allowedSourceRoles as AssetTranscriptionSourceRoleV2[],
    allowedPrecisions:
      record.allowedPrecisions as AssetTranscriptionPrecisionV2[],
    authorizationTtlSeconds: Number(record.authorizationTtlSeconds),
    authorizationDecisionRef:
      record.authorizationDecisionRef as EditorialPlanArtifactRefV1,
    issuedAt: text(record.issuedAt),
    expiresAt: text(record.expiresAt),
    disposition: record.disposition as 'AUTHORIZED' | 'REVOKED',
  });
  if (record.grantSha256 !== rebound.grantSha256
    || canonicalizeEditronJsonV1(record)
      !== canonicalizeEditronJsonV1(rebound)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_HASH_MISMATCH');
  }
  return rebound;
}

export function createSourceTranscriptionEgressPolicyOwnerV1(input: Readonly<{
  reader: Readonly<SourceTranscriptionEgressPolicyGrantReaderV1>;
  now?: () => Date;
}>): Readonly<SourceTranscriptionEgressPolicyOwnerV1> {
  if (!input.reader || typeof input.reader.read !== 'function') {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_READER_INVALID');
  }
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async authorize(rawRequest: SourceTranscriptionEgressRequestV1) {
      const request = assertSourceTranscriptionEgressRequestV1(rawRequest);
      const requestedScope = requestScope(request);
      let stored: unknown | null;
      try {
        stored = await input.reader.read({
          scope: requestedScope,
          privacyEgressPolicyRef: request.privacyEgressPolicyRef,
        });
      } catch (error) {
        if (isPolicyDiagnostic(error)) throw error;
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_STORE_UNAVAILABLE');
      }
      if (stored === null) {
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_NOT_FOUND');
      }
      const grant = assertSourceTranscriptionEgressPolicyGrantV1(stored);
      assertGrantMatchesRequest(grant, request, requestedScope);
      const issuedAt = currentTime(now);
      if (Date.parse(issuedAt) < Date.parse(grant.issuedAt)) {
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_NOT_YET_CURRENT');
      }
      if (Date.parse(issuedAt) >= Date.parse(grant.expiresAt)) {
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_EXPIRED');
      }
      if (grant.disposition !== 'AUTHORIZED') {
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_REVOKED');
      }
      const approvedProviderIds = request.eligibleProviderIds.filter(
        (providerId) => grant.allowedProviderIds.includes(providerId),
      );
      if (approvedProviderIds.length === 0) {
        fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_PROVIDER_DENIED');
      }
      const requestedExpiry = Date.parse(issuedAt)
        + grant.authorizationTtlSeconds * 1_000;
      const expiresAt = new Date(Math.min(
        requestedExpiry,
        Date.parse(grant.expiresAt),
      )).toISOString();
      return createSourceTranscriptionEgressAuthorizationV1({
        request,
        approvedProviderIds,
        authorizationDecisionRef: grant.authorizationDecisionRef,
        issuedAt,
        expiresAt,
      });
    },
  });
}

function assertGrantMatchesRequest(
  grant: SourceTranscriptionEgressPolicyGrantV1,
  request: SourceTranscriptionEgressRequestV1,
  requestedScope: SourceTranscriptionEgressPolicyScopeV1,
): void {
  if (canonicalizeEditronJsonV1(grant.scope)
      !== canonicalizeEditronJsonV1(requestedScope)
    || canonicalizeEditronJsonV1(grant.privacyEgressPolicyRef)
      !== canonicalizeEditronJsonV1(request.privacyEgressPolicyRef)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_SCOPE_MISMATCH');
  }
  if (!grant.allowedMediaKinds.includes(request.sourceBindingV2.source.mediaKind)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_MEDIA_KIND_DENIED');
  }
  if (!grant.allowedSourceRoles.includes(request.sourceBindingV2.sourceRole)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_SOURCE_ROLE_DENIED');
  }
  if (!grant.allowedPrecisions.includes(request.precision)) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_PRECISION_DENIED');
  }
}

function requestScope(
  request: SourceTranscriptionEgressRequestV1,
): SourceTranscriptionEgressPolicyScopeV1 {
  return deepFreezeEditronJsonV1({
    tenantId: request.tenantId,
    userId: request.userId,
    orgId: request.orgId,
    projectId: request.projectId,
  });
}

function scope(value: unknown): SourceTranscriptionEgressPolicyScopeV1 {
  const record = object(value, 'SOURCE_TRANSCRIPTION_EGRESS_POLICY_SCOPE_INVALID');
  exactKeys(record, ['tenantId', 'userId', 'orgId', 'projectId'],
    'SOURCE_TRANSCRIPTION_EGRESS_POLICY_SCOPE_FIELDS_INVALID');
  return deepFreezeEditronJsonV1({
    tenantId: identity(record.tenantId,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_TENANT_INVALID'),
    userId: identity(record.userId,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_USER_INVALID'),
    orgId: record.orgId === null ? null : identity(
      record.orgId,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_ORG_INVALID',
    ),
    projectId: identity(record.projectId,
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_PROJECT_INVALID'),
  });
}

function providerSet(value: readonly SourceTranscriptionProviderIdV1[]) {
  return enumSet(value, [
    'deepgram', 'fal-ai', 'google-gemini', 'xai',
  ] as const, 'SOURCE_TRANSCRIPTION_EGRESS_POLICY_PROVIDERS_INVALID');
}

function enumSet<T extends string>(
  value: readonly T[],
  allowed: readonly T[],
  code: string,
): readonly T[] {
  if (!Array.isArray(value) || value.length < 1
    || value.length > allowed.length) fail(code);
  const normalized = value.map((entry) => {
    if (!allowed.includes(entry)) fail(code);
    return entry;
  });
  if (new Set(normalized).size !== normalized.length) fail(code);
  return Object.freeze([...normalized].sort());
}

function ttl(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1
    || Number(value) > 3_600) {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_TTL_INVALID');
  }
  return Number(value);
}

function disposition(value: unknown): 'AUTHORIZED' | 'REVOKED' {
  if (value !== 'AUTHORIZED' && value !== 'REVOKED') {
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_DISPOSITION_INVALID');
  }
  return value;
}

function artifactRef(value: unknown, code: string) {
  const parsed = EditorialPlanArtifactRefSchemaV1.safeParse(value);
  if (!parsed.success) fail(code);
  return deepFreezeEditronJsonV1(parsed.data);
}

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(normalized)) fail(code);
  return normalized;
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
    fail('SOURCE_TRANSCRIPTION_EGRESS_POLICY_CURRENT_TIME_INVALID');
  }
  return value.toISOString();
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) fail(code);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isPolicyDiagnostic(error: unknown): boolean {
  return error instanceof Error
    && /^SOURCE_TRANSCRIPTION_EGRESS_POLICY_[A-Z0-9_]{1,180}$/.test(
      error.message,
    );
}

function fail(code: string): never {
  throw new Error(code);
}
