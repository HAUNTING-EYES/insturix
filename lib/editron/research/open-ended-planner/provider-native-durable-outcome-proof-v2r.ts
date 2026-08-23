import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
} from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_V2R_1' as const;

export const PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_V2R_2' as const;

export type ProviderNativeExecutionTraceKindV2R =
  | 'FRESH_EPISODE_RECEIPT'
  | 'RESUMED_EPISODE_RECEIPT';

export type ProviderNativeOutcomeProofDispositionV2R =
  'PASS' | 'FAIL' | 'UNVERIFIABLE';

export type ProviderNativeOutcomeProofKindV2R =
  | 'state' | 'reload' | 'render' | 'visual' | 'audio' | 'semantic'
  | 'undo' | 'replay' | 'delivery';

export interface ProviderNativeDurableOutcomeProofReceiptV2R {
  version: typeof PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_VERSION_V2R;
  authority: 'RESEARCH_ISOLATED_OUTCOME_PROOF_NO_PROJECT_MUTATION';
  scope: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
  }>;
  subject: Readonly<{
    episodeReceiptSha256: string;
    resumedReceiptSha256: string;
    proposalReceiptSha256: string;
    finalStateSha256: string;
  }>;
  proofPolicy: Readonly<{
    policyId: string;
    policyVersion: string;
    policySha256: string;
  }>;
  obligations: readonly Readonly<{
    obligationId: string;
    kind: ProviderNativeOutcomeProofKindV2R;
    disposition: ProviderNativeOutcomeProofDispositionV2R;
    proofReferenceIds: readonly string[];
  }>[];
  proofReferences: readonly Readonly<{
    proofId: string;
    proofSha256: string;
    disposition: ProviderNativeOutcomeProofDispositionV2R;
  }>[];
  disposition: ProviderNativeOutcomeProofDispositionV2R;
  observedAt: string;
  summary: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface ProviderNativeExecutionBoundOutcomeProofReceiptV2R {
  version: typeof PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R;
  authority: 'RESEARCH_ISOLATED_OUTCOME_PROOF_NO_PROJECT_MUTATION';
  scope: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
  }>;
  subject: Readonly<{
    episodeReceiptSha256: string;
    executionTrace: Readonly<{
      kind: ProviderNativeExecutionTraceKindV2R;
      receiptSha256: string;
    }>;
    proposalReceiptSha256: string;
    finalStateSha256: string;
  }>;
  proofPolicy: ProviderNativeDurableOutcomeProofReceiptV2R['proofPolicy'];
  obligations: ProviderNativeDurableOutcomeProofReceiptV2R['obligations'];
  proofReferences: ProviderNativeDurableOutcomeProofReceiptV2R['proofReferences'];
  disposition: ProviderNativeOutcomeProofDispositionV2R;
  observedAt: string;
  summary: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

export function bindProviderNativeDurableOutcomeProofReceiptV2R(
  input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    subject: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R['subject']>;
    proofPolicy: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R['proofPolicy']>;
    obligations: ProviderNativeDurableOutcomeProofReceiptV2R['obligations'];
    proofReferences: ProviderNativeDurableOutcomeProofReceiptV2R['proofReferences'];
    observedAt: string;
    summary: string;
  }>,
): Readonly<ProviderNativeDurableOutcomeProofReceiptV2R> {
  const normalized = normalizeProofEvidence(input);
  const subject = {
    episodeReceiptSha256: sha256(input.subject.episodeReceiptSha256, 'EPISODE_RECEIPT'),
    resumedReceiptSha256: sha256(input.subject.resumedReceiptSha256, 'RESUMED_RECEIPT'),
    proposalReceiptSha256: sha256(input.subject.proposalReceiptSha256, 'PROPOSAL_RECEIPT'),
    finalStateSha256: sha256(input.subject.finalStateSha256, 'FINAL_STATE'),
  };
  const material = {
    version: PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_VERSION_V2R,
    authority: 'RESEARCH_ISOLATED_OUTCOME_PROOF_NO_PROJECT_MUTATION' as const,
    scope: normalized.scope,
    subject,
    proofPolicy: normalized.proofPolicy,
    obligations: normalized.obligations,
    proofReferences: normalized.proofReferences,
    disposition: normalized.disposition,
    observedAt: normalized.observedAt,
    summary: normalized.summary,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeDurableOutcomeProofReceiptV2R(
  value: unknown,
): Readonly<ProviderNativeDurableOutcomeProofReceiptV2R> {
  const candidate = record(value, 'RECEIPT');
  const scope = record(candidate.scope, 'SCOPE');
  const subject = record(candidate.subject, 'SUBJECT');
  const proofPolicy = record(candidate.proofPolicy, 'PROOF_POLICY');
  const obligations = records(candidate.obligations, 'OBLIGATIONS') as unknown as
    ProviderNativeDurableOutcomeProofReceiptV2R['obligations'];
  const proofReferences = records(candidate.proofReferences, 'PROOF_REFERENCES') as unknown as
    ProviderNativeDurableOutcomeProofReceiptV2R['proofReferences'];
  const rebound = bindProviderNativeDurableOutcomeProofReceiptV2R({
    tenantId: text(scope.tenantId, 'TENANT_ID'),
    userId: text(scope.userId, 'USER_ID'),
    projectId: text(scope.projectId, 'PROJECT_ID'),
    episodeId: text(scope.episodeId, 'EPISODE_ID'),
    subject: subject as unknown as ProviderNativeDurableOutcomeProofReceiptV2R['subject'],
    proofPolicy: proofPolicy as unknown as ProviderNativeDurableOutcomeProofReceiptV2R['proofPolicy'],
    obligations,
    proofReferences,
    observedAt: text(candidate.observedAt, 'OBSERVED_AT'),
    summary: text(candidate.summary, 'SUMMARY'),
  });
  if (candidate.version !== PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_VERSION_V2R
    || candidate.authority !== 'RESEARCH_ISOLATED_OUTCOME_PROOF_NO_PROJECT_MUTATION'
    || canonicalizeJsonV1(candidate) !== canonicalizeJsonV1(rebound)) {
    fail('RECEIPT_INVALID');
  }
  return rebound;
}

export function bindProviderNativeExecutionBoundOutcomeProofReceiptV2R(
  input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    subject: Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R['subject']>;
    proofPolicy: Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R['proofPolicy']>;
    obligations: ProviderNativeExecutionBoundOutcomeProofReceiptV2R['obligations'];
    proofReferences: ProviderNativeExecutionBoundOutcomeProofReceiptV2R['proofReferences'];
    observedAt: string;
    summary: string;
  }>,
): Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R> {
  const normalized = normalizeProofEvidence(input);
  const episodeReceiptSha256 = sha256(
    input.subject.episodeReceiptSha256,
    'EPISODE_RECEIPT',
  );
  const executionTrace = {
    kind: executionTraceKind(input.subject.executionTrace?.kind),
    receiptSha256: sha256(
      input.subject.executionTrace?.receiptSha256,
      'EXECUTION_TRACE_RECEIPT',
    ),
  };
  assertExecutionTraceRelationship(episodeReceiptSha256, executionTrace);
  const subject = {
    episodeReceiptSha256,
    executionTrace,
    proposalReceiptSha256: sha256(input.subject.proposalReceiptSha256, 'PROPOSAL_RECEIPT'),
    finalStateSha256: sha256(input.subject.finalStateSha256, 'FINAL_STATE'),
  };
  const material = {
    version: PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R,
    authority: 'RESEARCH_ISOLATED_OUTCOME_PROOF_NO_PROJECT_MUTATION' as const,
    scope: normalized.scope,
    subject,
    proofPolicy: normalized.proofPolicy,
    obligations: normalized.obligations,
    proofReferences: normalized.proofReferences,
    disposition: normalized.disposition,
    observedAt: normalized.observedAt,
    summary: normalized.summary,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeExecutionBoundOutcomeProofReceiptV2R(
  value: unknown,
): Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R> {
  const candidate = record(value, 'RECEIPT');
  const scope = record(candidate.scope, 'SCOPE');
  const subject = record(candidate.subject, 'SUBJECT');
  const proofPolicy = record(candidate.proofPolicy, 'PROOF_POLICY');
  const obligations = records(candidate.obligations, 'OBLIGATIONS') as unknown as
    ProviderNativeExecutionBoundOutcomeProofReceiptV2R['obligations'];
  const proofReferences = records(candidate.proofReferences, 'PROOF_REFERENCES') as unknown as
    ProviderNativeExecutionBoundOutcomeProofReceiptV2R['proofReferences'];
  const rebound = bindProviderNativeExecutionBoundOutcomeProofReceiptV2R({
    tenantId: text(scope.tenantId, 'TENANT_ID'),
    userId: text(scope.userId, 'USER_ID'),
    projectId: text(scope.projectId, 'PROJECT_ID'),
    episodeId: text(scope.episodeId, 'EPISODE_ID'),
    subject: subject as unknown as ProviderNativeExecutionBoundOutcomeProofReceiptV2R['subject'],
    proofPolicy: proofPolicy as unknown as
      ProviderNativeExecutionBoundOutcomeProofReceiptV2R['proofPolicy'],
    obligations,
    proofReferences,
    observedAt: text(candidate.observedAt, 'OBSERVED_AT'),
    summary: text(candidate.summary, 'SUMMARY'),
  });
  if (candidate.version !== PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R
    || candidate.authority !== 'RESEARCH_ISOLATED_OUTCOME_PROOF_NO_PROJECT_MUTATION'
    || canonicalizeJsonV1(candidate) !== canonicalizeJsonV1(rebound)) {
    fail('RECEIPT_INVALID');
  }
  return rebound;
}

function normalizeProofEvidence(input: Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
  proofPolicy: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R['proofPolicy']>;
  obligations: ProviderNativeDurableOutcomeProofReceiptV2R['obligations'];
  proofReferences: ProviderNativeDurableOutcomeProofReceiptV2R['proofReferences'];
  observedAt: string;
  summary: string;
}>): Readonly<{
  scope: ProviderNativeDurableOutcomeProofReceiptV2R['scope'];
  proofPolicy: ProviderNativeDurableOutcomeProofReceiptV2R['proofPolicy'];
  obligations: ProviderNativeDurableOutcomeProofReceiptV2R['obligations'];
  proofReferences: ProviderNativeDurableOutcomeProofReceiptV2R['proofReferences'];
  disposition: ProviderNativeOutcomeProofDispositionV2R;
  observedAt: string;
  summary: string;
}> {
  const scope = {
    tenantId: identity(input.tenantId, 'TENANT_ID'),
    userId: identity(input.userId, 'USER_ID'),
    projectId: identity(input.projectId, 'PROJECT_ID'),
    episodeId: identity(input.episodeId, 'EPISODE_ID'),
  };
  const proofPolicy = {
    policyId: identity(input.proofPolicy.policyId, 'POLICY_ID'),
    policyVersion: identity(input.proofPolicy.policyVersion, 'POLICY_VERSION'),
    policySha256: sha256(input.proofPolicy.policySha256, 'POLICY'),
  };
  const proofReferences = input.proofReferences.map((reference) => ({
    proofId: identity(reference.proofId, 'PROOF_ID'),
    proofSha256: sha256(reference.proofSha256, 'PROOF'),
    disposition: disposition(reference.disposition),
  }));
  unique(proofReferences.map(({ proofId }) => proofId), 'PROOF_REFERENCE');
  if (!proofReferences.length) fail('PROOF_REFERENCES_EMPTY');
  const referencesById = new Map(proofReferences.map((entry) => [entry.proofId, entry]));
  const obligations = input.obligations.map((obligation) => {
    const proofReferenceIds = obligation.proofReferenceIds.map((value) =>
      identity(value, 'OBLIGATION_PROOF_REFERENCE_ID'));
    unique(proofReferenceIds, 'OBLIGATION_PROOF_REFERENCE');
    if (!proofReferenceIds.length) fail('OBLIGATION_PROOF_REFERENCES_EMPTY');
    const references = proofReferenceIds.map((proofId) => {
      const reference = referencesById.get(proofId);
      if (!reference) fail('OBLIGATION_PROOF_REFERENCE_MISSING');
      return reference;
    });
    const derivedDisposition = aggregate(references.map(({ disposition: value }) => value));
    if (derivedDisposition !== disposition(obligation.disposition)) {
      fail('OBLIGATION_DISPOSITION_MISMATCH');
    }
    return {
      obligationId: identity(obligation.obligationId, 'OBLIGATION_ID'),
      kind: proofKind(obligation.kind),
      disposition: derivedDisposition,
      proofReferenceIds,
    };
  });
  unique(obligations.map(({ obligationId }) => obligationId), 'OBLIGATION');
  if (!obligations.length) fail('OBLIGATIONS_EMPTY');
  const usedProofIds = new Set(obligations.flatMap(({ proofReferenceIds }) => proofReferenceIds));
  if (proofReferences.some(({ proofId }) => !usedProofIds.has(proofId))) {
    fail('ORPHAN_PROOF_REFERENCE');
  }
  return {
    scope,
    proofPolicy,
    obligations,
    proofReferences,
    disposition: aggregate(obligations.map(({ disposition: value }) => value)),
    observedAt: isoDate(input.observedAt),
    summary: text(input.summary, 'SUMMARY'),
  };
}

function executionTraceKind(value: unknown): ProviderNativeExecutionTraceKindV2R {
  if (value !== 'FRESH_EPISODE_RECEIPT' && value !== 'RESUMED_EPISODE_RECEIPT') {
    fail('EXECUTION_TRACE_KIND_INVALID');
  }
  return value;
}

function assertExecutionTraceRelationship(
  episodeReceiptSha256: string,
  trace: Readonly<{
    kind: ProviderNativeExecutionTraceKindV2R;
    receiptSha256: string;
  }>,
): void {
  if (trace.kind === 'FRESH_EPISODE_RECEIPT'
    && trace.receiptSha256 !== episodeReceiptSha256) {
    fail('FRESH_EXECUTION_TRACE_MISMATCH');
  }
  if (trace.kind === 'RESUMED_EPISODE_RECEIPT'
    && trace.receiptSha256 === episodeReceiptSha256) {
    fail('RESUMED_EXECUTION_TRACE_REUSES_EPISODE_RECEIPT');
  }
}

function aggregate(
  dispositions: readonly ProviderNativeOutcomeProofDispositionV2R[],
): ProviderNativeOutcomeProofDispositionV2R {
  return dispositions.includes('FAIL') ? 'FAIL'
    : dispositions.includes('UNVERIFIABLE') ? 'UNVERIFIABLE' : 'PASS';
}

function disposition(value: unknown): ProviderNativeOutcomeProofDispositionV2R {
  if (value !== 'PASS' && value !== 'FAIL' && value !== 'UNVERIFIABLE') {
    fail('DISPOSITION_INVALID');
  }
  return value;
}

function proofKind(value: unknown): ProviderNativeOutcomeProofKindV2R {
  const values: readonly ProviderNativeOutcomeProofKindV2R[] = [
    'state', 'reload', 'render', 'visual', 'audio', 'semantic',
    'undo', 'replay', 'delivery',
  ];
  if (!values.includes(value as ProviderNativeOutcomeProofKindV2R)) fail('KIND_INVALID');
  return value as ProviderNativeOutcomeProofKindV2R;
}

function records(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value) || value.some((entry) => !entry
    || typeof entry !== 'object' || Array.isArray(entry))) fail(`${label}_INVALID`);
  return value as JsonRecord[];
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}_INVALID`);
  return value;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(result)) fail(`${label}_INVALID`);
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`${label}_HASH_INVALID`);
  return result;
}

function isoDate(value: unknown): string {
  const result = text(value, 'OBSERVED_AT');
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
    fail('OBSERVED_AT_INVALID');
  }
  return result;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label}_DUPLICATE`);
}

function fail(code: string): never {
  throw new Error(`PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_${code}`);
}
