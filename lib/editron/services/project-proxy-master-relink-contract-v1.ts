import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterActiveMappingV1,
  type MediaProxyMasterActiveMappingAssetStateV1,
} from './media-proxy-master-active-mapping-asset-owner-v1';
import {
  assertMediaProxyMasterExactBoundaryResolutionReceiptV1,
  type MediaProxyMasterExactBoundaryResolutionReceiptV1,
} from './media-proxy-master-exact-boundary-resolver-v1';

export const PROJECT_PROXY_MASTER_RELINK_STATE_KIND_V1 =
  'EDITRON_PROJECT_PROXY_MASTER_RELINK_STATE_V1' as const;
export const PROJECT_PROXY_MASTER_RELINK_COMMIT_KIND_V1 =
  'EDITRON_PROJECT_PROXY_MASTER_RELINK_COMMIT_V1' as const;
export const PROJECT_PROXY_SOURCE_BINDING_KIND_V1 =
  'EDITRON_PROJECT_PROXY_SOURCE_BINDING_V1' as const;
export const PROJECT_PROXY_SOURCE_BINDING_COMMIT_KIND_V1 =
  'EDITRON_PROJECT_PROXY_SOURCE_BINDING_COMMIT_V1' as const;
export const PROJECT_PROXY_SOURCE_BINDING_ADMISSION_KIND_V1 =
  'EDITRON_PROJECT_PROXY_SOURCE_BINDING_ADMISSION_V1' as const;
export const PROJECT_PROXY_SOURCE_BINDING_OWNER_V1 =
  'EDITRON_PROJECT_SERVICE_VERIFIED_V3_PROXY_BINDING_OWNER_V1' as const;
export const PROJECT_PROXY_MASTER_RELINK_POLICY_VERSION_V1 =
  'EDITRON_PROJECT_PROXY_MASTER_RELINK_POLICY_V1' as const;

const MAX_TARGET_OVERLAYS = 100_000;
const MAX_RELINK_STATE_BYTES = 8 * 1024 * 1024;
const MAX_PROJECT_RELINK_STATES = 256;

export const PROJECT_PROXY_MASTER_PENDING_INVALIDATION_TARGETS_V1 = [
  'TECHNICAL_OBSERVATION',
  'TRANSCRIPTION',
  'AUDIO_ANALYSIS',
  'VISUAL_ANALYSIS',
  'SEMANTIC_ANALYSIS',
  'PROXY_TIME_MAPPING',
  'RENDERED_PREVIEW',
  'DELIVERY_PROOF',
] as const;

export type ProjectProxyMasterRelinkActorKindV1 =
  | 'USER'
  | 'AGENT'
  | 'SYSTEM';

export type ProjectProxyMasterRelinkRevisionV1 = Readonly<{
  schemaVersion: 1;
  value: number;
  compatibilityUpdatedAt: string;
}>;

export type ProjectProxyMasterRelinkPolicyV1 = Readonly<{
  policyVersion: string;
  maxTargetOverlays: number;
  maxRelinkStateBytes: number;
  maxProjectRelinkStates: number;
}>;

export const PROJECT_PROXY_MASTER_RELINK_POLICY_V1 = {
  policyVersion: PROJECT_PROXY_MASTER_RELINK_POLICY_VERSION_V1,
  maxTargetOverlays: MAX_TARGET_OVERLAYS,
  maxRelinkStateBytes: MAX_RELINK_STATE_BYTES,
  maxProjectRelinkStates: MAX_PROJECT_RELINK_STATES,
} as const satisfies ProjectProxyMasterRelinkPolicyV1;

export type ProjectProxyMasterRelinkOverlayChangeV1 = Readonly<{
  overlayId: number;
  timelineStartFrame: number;
  timelineEndFrameExclusive: number;
  proxySourceStartFrame: number;
  proxySourceEndFrameExclusive: number;
  masterSourceStartFrame: number;
  masterSourceEndFrameExclusive: number;
  sourceStartFrameWasExplicit: boolean;
  sourceEndFrameWasExplicit: true;
  videoStartTimeWasExplicit: boolean;
}>;

export type ProjectProxySourceBindingOverlayV1 = Readonly<{
  overlayId: number;
  timelineStartFrame: number;
  timelineEndFrameExclusive: number;
  proxySourceStartFrame: number;
  proxySourceEndFrameExclusive: number;
  sourceStartFrameWasExplicit: boolean;
  sourceEndFrameWasExplicit: true;
  videoStartTimeWasExplicit: boolean;
}>;

export type ProjectProxySourceBindingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_PROXY_SOURCE_BINDING_KIND_V1;
  writerAuthority: typeof PROJECT_PROXY_SOURCE_BINDING_OWNER_V1;
  disposition: 'PROJECT_OVERLAYS_BOUND_TO_PROXY_SOURCE';
  projectId: string;
  assetId: string;
  actorKind: ProjectProxyMasterRelinkActorKindV1;
  proxySourceVersionSha256: string;
  verifiedSourceBindingSha256: string;
  proxyTimeMapReferenceSha256: string;
  projectRevision: ProjectProxyMasterRelinkRevisionV1;
  overlays: readonly ProjectProxySourceBindingOverlayV1[];
  boundAt: string;
  bindingSha256: string;
}>;

export type ProjectProxySourceBindingMutationReceiptV1 = Readonly<{
  schemaVersion: 1;
  projectId: string;
  revision: ProjectProxyMasterRelinkRevisionV1;
  committedAt: string;
}>;

export type ProjectProxySourceBindingCommitReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_PROXY_SOURCE_BINDING_COMMIT_KIND_V1;
  disposition: 'PROJECT_PROXY_SOURCE_BINDING_COMMITTED';
  binding: ProjectProxySourceBindingV1;
  mutationReceipt: ProjectProxySourceBindingMutationReceiptV1;
  commitSha256: string;
}>;

export type ProjectProxySourceBindingAdmissionReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_PROXY_SOURCE_BINDING_ADMISSION_KIND_V1;
  writerAuthority: typeof PROJECT_PROXY_SOURCE_BINDING_OWNER_V1;
  disposition: 'PROJECT_PROXY_SOURCE_BINDING_ADMITTED_AFTER_ASSET_REVALIDATION';
  projectId: string;
  assetId: string;
  projectRevision: ProjectProxyMasterRelinkRevisionV1;
  bindingSha256: string;
  commitSha256: string;
  verifiedSourceBindingSha256: string;
  proxyTimeMapReferenceSha256: string;
  admittedAt: string;
  admissionSha256: string;
}>;

export type ProjectProxyMasterRelinkStateV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_PROXY_MASTER_RELINK_STATE_KIND_V1;
  disposition: 'PROJECT_SOURCE_RELINKED_TO_QUALIFIED_MASTER';
  projectId: string;
  assetId: string;
  actorKind: ProjectProxyMasterRelinkActorKindV1;
  relationSha256: string;
  activeMappingStateSha256: string;
  qualificationSha256: string;
  mappingSha256: string;
  proxySourceVersionSha256: string;
  masterSourceVersionSha256: string;
  sourceInvalidationPlanSha256: string;
  beforeSourceBinding: ProjectProxySourceBindingV1;
  boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1;
  audioRightsEvidenceSha256: string | null;
  beforeProjectRevision: ProjectProxyMasterRelinkRevisionV1;
  expectedAfterProjectRevisionValue: number;
  overlayChanges: readonly ProjectProxyMasterRelinkOverlayChangeV1[];
  projectBindingRevalidation:
    'SATISFIED_BY_PROJECT_DOCUMENT_CAS';
  downstreamInvalidation: Readonly<{
    status: 'PENDING_OWNER_EXECUTION';
    targets: typeof PROJECT_PROXY_MASTER_PENDING_INVALIDATION_TARGETS_V1;
  }>;
  rollback: Readonly<{
    status: 'AVAILABLE_FROM_RELINK_STATE';
    restoresProxyCoordinates: true;
  }>;
  policy: ProjectProxyMasterRelinkPolicyV1;
  relinkedAt: string;
  stateSha256: string;
}>;

export type ProjectProxyMasterRelinkMutationReceiptV1 = Readonly<{
  schemaVersion: 1;
  projectId: string;
  revision: ProjectProxyMasterRelinkRevisionV1;
  committedAt: string;
}>;

export type ProjectProxyMasterRelinkCommitReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_PROXY_MASTER_RELINK_COMMIT_KIND_V1;
  disposition: 'PROJECT_PROXY_MASTER_RELINK_COMMITTED';
  state: ProjectProxyMasterRelinkStateV1;
  mutationReceipt: ProjectProxyMasterRelinkMutationReceiptV1;
  commitSha256: string;
}>;

export function createProjectProxySourceBindingV1(input: Readonly<{
  projectId: string;
  assetId: string;
  actorKind: ProjectProxyMasterRelinkActorKindV1;
  proxySourceVersionSha256: string;
  verifiedSourceBindingSha256: string;
  proxyTimeMapReferenceSha256: string;
  projectRevision: ProjectProxyMasterRelinkRevisionV1;
  overlays: readonly ProjectProxySourceBindingOverlayV1[];
  boundAt: Date;
}>): ProjectProxySourceBindingV1 {
  const projectRevision = revision(
    input.projectRevision,
    'PROJECT_PROXY_SOURCE_BINDING_REVISION_INVALID',
  );
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_SOURCE_BINDING_KIND_V1,
    writerAuthority: PROJECT_PROXY_SOURCE_BINDING_OWNER_V1,
    disposition: 'PROJECT_OVERLAYS_BOUND_TO_PROXY_SOURCE' as const,
    projectId: identifier(
      input.projectId,
      'PROJECT_PROXY_SOURCE_BINDING_PROJECT_ID_INVALID',
    ),
    assetId: identifier(
      input.assetId,
      'PROJECT_PROXY_SOURCE_BINDING_ASSET_ID_INVALID',
    ),
    actorKind: assertActorKind(input.actorKind),
    proxySourceVersionSha256: sha256(
      input.proxySourceVersionSha256,
      'PROJECT_PROXY_SOURCE_BINDING_SOURCE_INVALID',
    ),
    verifiedSourceBindingSha256: sha256(
      input.verifiedSourceBindingSha256,
      'PROJECT_PROXY_SOURCE_BINDING_VERIFIED_SOURCE_INVALID',
    ),
    proxyTimeMapReferenceSha256: sha256(
      input.proxyTimeMapReferenceSha256,
      'PROJECT_PROXY_SOURCE_BINDING_TIME_MAP_INVALID',
    ),
    projectRevision,
    overlays: normalizeProxySourceBindingOverlays(
      input.overlays,
      MAX_TARGET_OVERLAYS,
    ),
    boundAt: isoDate(
      input.boundAt,
      'PROJECT_PROXY_SOURCE_BINDING_TIME_INVALID',
    ),
  };
  return assertProjectProxySourceBindingV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProjectProxySourceBindingV1(
  value: unknown,
): ProjectProxySourceBindingV1 {
  const record = object(value, 'PROJECT_PROXY_SOURCE_BINDING_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'writerAuthority', 'disposition', 'projectId',
    'assetId', 'actorKind', 'proxySourceVersionSha256',
    'verifiedSourceBindingSha256', 'proxyTimeMapReferenceSha256',
    'projectRevision', 'overlays', 'boundAt', 'bindingSha256',
  ], 'PROJECT_PROXY_SOURCE_BINDING_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== PROJECT_PROXY_SOURCE_BINDING_KIND_V1
    || record.writerAuthority !== PROJECT_PROXY_SOURCE_BINDING_OWNER_V1
    || record.disposition !== 'PROJECT_OVERLAYS_BOUND_TO_PROXY_SOURCE') {
    fail('PROJECT_PROXY_SOURCE_BINDING_IDENTITY_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_SOURCE_BINDING_KIND_V1,
    writerAuthority: PROJECT_PROXY_SOURCE_BINDING_OWNER_V1,
    disposition: 'PROJECT_OVERLAYS_BOUND_TO_PROXY_SOURCE' as const,
    projectId: identifier(
      record.projectId,
      'PROJECT_PROXY_SOURCE_BINDING_PROJECT_ID_INVALID',
    ),
    assetId: identifier(
      record.assetId,
      'PROJECT_PROXY_SOURCE_BINDING_ASSET_ID_INVALID',
    ),
    actorKind: assertActorKind(record.actorKind),
    proxySourceVersionSha256: sha256(
      record.proxySourceVersionSha256,
      'PROJECT_PROXY_SOURCE_BINDING_SOURCE_INVALID',
    ),
    verifiedSourceBindingSha256: sha256(
      record.verifiedSourceBindingSha256,
      'PROJECT_PROXY_SOURCE_BINDING_VERIFIED_SOURCE_INVALID',
    ),
    proxyTimeMapReferenceSha256: sha256(
      record.proxyTimeMapReferenceSha256,
      'PROJECT_PROXY_SOURCE_BINDING_TIME_MAP_INVALID',
    ),
    projectRevision: revision(
      record.projectRevision,
      'PROJECT_PROXY_SOURCE_BINDING_REVISION_INVALID',
    ),
    overlays: normalizeProxySourceBindingOverlays(
      record.overlays,
      MAX_TARGET_OVERLAYS,
    ),
    boundAt: isoInstant(
      record.boundAt,
      'PROJECT_PROXY_SOURCE_BINDING_TIME_INVALID',
    ),
  };
  if (material.boundAt
    !== material.projectRevision.compatibilityUpdatedAt) {
    fail('PROJECT_PROXY_SOURCE_BINDING_REVISION_TIME_MISMATCH');
  }
  const bindingSha256 = sha256(
    record.bindingSha256,
    'PROJECT_PROXY_SOURCE_BINDING_HASH_INVALID',
  );
  if (bindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_PROXY_SOURCE_BINDING_HASH_MISMATCH');
  }
  const binding = frozen({ ...material, bindingSha256 });
  if (Buffer.byteLength(canonicalizeEditronJsonV1(binding), 'utf8')
    > MAX_RELINK_STATE_BYTES) {
    fail('PROJECT_PROXY_SOURCE_BINDING_BYTE_LIMIT_EXCEEDED');
  }
  return binding;
}

export function assertProjectProxySourceBindingHistoryV1(
  value: unknown,
  projectId: string,
  maxBindings: number,
): readonly ProjectProxySourceBindingV1[] {
  const expectedProjectId = identifier(
    projectId,
    'PROJECT_PROXY_SOURCE_BINDING_HISTORY_PROJECT_ID_INVALID',
  );
  const limit = positiveSafeInteger(
    maxBindings,
    MAX_PROJECT_RELINK_STATES,
    'PROJECT_PROXY_SOURCE_BINDING_HISTORY_LIMIT_INVALID',
  );
  if (value === undefined) return frozen([]);
  if (!Array.isArray(value) || value.length > limit) {
    fail('PROJECT_PROXY_SOURCE_BINDING_HISTORY_INVALID');
  }
  let previousAssetId: string | null = null;
  return frozen(value.map((entry) => {
    const binding = assertProjectProxySourceBindingV1(entry);
    if (binding.projectId !== expectedProjectId
      || (previousAssetId !== null && binding.assetId <= previousAssetId)) {
      fail('PROJECT_PROXY_SOURCE_BINDING_HISTORY_SCOPE_OR_ORDER_INVALID');
    }
    previousAssetId = binding.assetId;
    return binding;
  }));
}

export function createProjectProxySourceBindingCommitReceiptV1(
  input: Readonly<{
    binding: ProjectProxySourceBindingV1;
    mutationReceipt: ProjectProxySourceBindingMutationReceiptV1;
  }>,
): ProjectProxySourceBindingCommitReceiptV1 {
  const binding = assertProjectProxySourceBindingV1(input.binding);
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_SOURCE_BINDING_COMMIT_KIND_V1,
    disposition: 'PROJECT_PROXY_SOURCE_BINDING_COMMITTED' as const,
    binding,
    mutationReceipt: input.mutationReceipt,
  };
  return assertProjectProxySourceBindingCommitReceiptV1({
    ...material,
    commitSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProjectProxySourceBindingCommitReceiptV1(
  value: unknown,
): ProjectProxySourceBindingCommitReceiptV1 {
  const record = object(value, 'PROJECT_PROXY_SOURCE_BINDING_COMMIT_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'binding', 'mutationReceipt',
    'commitSha256',
  ], 'PROJECT_PROXY_SOURCE_BINDING_COMMIT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== PROJECT_PROXY_SOURCE_BINDING_COMMIT_KIND_V1
    || record.disposition !== 'PROJECT_PROXY_SOURCE_BINDING_COMMITTED') {
    fail('PROJECT_PROXY_SOURCE_BINDING_COMMIT_IDENTITY_INVALID');
  }
  const binding = assertProjectProxySourceBindingV1(record.binding);
  const mutationReceipt = normalizeSourceBindingMutationReceipt(
    record.mutationReceipt,
  );
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_SOURCE_BINDING_COMMIT_KIND_V1,
    disposition: 'PROJECT_PROXY_SOURCE_BINDING_COMMITTED' as const,
    binding,
    mutationReceipt,
  };
  if (mutationReceipt.projectId !== binding.projectId
    || canonicalizeEditronJsonV1(mutationReceipt.revision)
      !== canonicalizeEditronJsonV1(binding.projectRevision)
    || mutationReceipt.committedAt !== binding.boundAt) {
    fail('PROJECT_PROXY_SOURCE_BINDING_COMMIT_SCOPE_MISMATCH');
  }
  const commitSha256 = sha256(
    record.commitSha256,
    'PROJECT_PROXY_SOURCE_BINDING_COMMIT_HASH_INVALID',
  );
  if (commitSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_PROXY_SOURCE_BINDING_COMMIT_HASH_MISMATCH');
  }
  return frozen({ ...material, commitSha256 });
}

export function createProjectProxySourceBindingAdmissionReceiptV1(
  input: Readonly<{
    commitReceipt: ProjectProxySourceBindingCommitReceiptV1;
    currentVerifiedSourceBindingSha256: string;
    admittedAt: Date;
  }>,
): ProjectProxySourceBindingAdmissionReceiptV1 {
  const commitReceipt = assertProjectProxySourceBindingCommitReceiptV1(
    input.commitReceipt,
  );
  const currentVerifiedSourceBindingSha256 = sha256(
    input.currentVerifiedSourceBindingSha256,
    'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_CURRENT_SOURCE_INVALID',
  );
  if (currentVerifiedSourceBindingSha256
    !== commitReceipt.binding.verifiedSourceBindingSha256) {
    fail('PROJECT_PROXY_SOURCE_BINDING_ADMISSION_CURRENT_SOURCE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_SOURCE_BINDING_ADMISSION_KIND_V1,
    writerAuthority: PROJECT_PROXY_SOURCE_BINDING_OWNER_V1,
    disposition:
      'PROJECT_PROXY_SOURCE_BINDING_ADMITTED_AFTER_ASSET_REVALIDATION' as const,
    projectId: commitReceipt.binding.projectId,
    assetId: commitReceipt.binding.assetId,
    projectRevision: commitReceipt.binding.projectRevision,
    bindingSha256: commitReceipt.binding.bindingSha256,
    commitSha256: commitReceipt.commitSha256,
    verifiedSourceBindingSha256: currentVerifiedSourceBindingSha256,
    proxyTimeMapReferenceSha256:
      commitReceipt.binding.proxyTimeMapReferenceSha256,
    admittedAt: isoDate(
      input.admittedAt,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_TIME_INVALID',
    ),
  };
  return assertProjectProxySourceBindingAdmissionReceiptV1({
    ...material,
    admissionSha256: hashEditronCanonicalJsonV1(material),
  }, commitReceipt);
}

export function assertProjectProxySourceBindingAdmissionReceiptV1(
  value: unknown,
  expectedCommitReceipt: ProjectProxySourceBindingCommitReceiptV1,
): ProjectProxySourceBindingAdmissionReceiptV1 {
  const commitReceipt = assertProjectProxySourceBindingCommitReceiptV1(
    expectedCommitReceipt,
  );
  const record = object(
    value,
    'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'writerAuthority', 'disposition', 'projectId',
    'assetId', 'projectRevision', 'bindingSha256', 'commitSha256',
    'verifiedSourceBindingSha256', 'proxyTimeMapReferenceSha256',
    'admittedAt', 'admissionSha256',
  ], 'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== PROJECT_PROXY_SOURCE_BINDING_ADMISSION_KIND_V1
    || record.writerAuthority !== PROJECT_PROXY_SOURCE_BINDING_OWNER_V1
    || record.disposition
      !== 'PROJECT_PROXY_SOURCE_BINDING_ADMITTED_AFTER_ASSET_REVALIDATION') {
    fail('PROJECT_PROXY_SOURCE_BINDING_ADMISSION_IDENTITY_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_SOURCE_BINDING_ADMISSION_KIND_V1,
    writerAuthority: PROJECT_PROXY_SOURCE_BINDING_OWNER_V1,
    disposition:
      'PROJECT_PROXY_SOURCE_BINDING_ADMITTED_AFTER_ASSET_REVALIDATION' as const,
    projectId: identifier(
      record.projectId,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_PROJECT_ID_INVALID',
    ),
    assetId: identifier(
      record.assetId,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_ASSET_ID_INVALID',
    ),
    projectRevision: revision(
      record.projectRevision,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_REVISION_INVALID',
    ),
    bindingSha256: sha256(
      record.bindingSha256,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_BINDING_INVALID',
    ),
    commitSha256: sha256(
      record.commitSha256,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_COMMIT_INVALID',
    ),
    verifiedSourceBindingSha256: sha256(
      record.verifiedSourceBindingSha256,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_SOURCE_INVALID',
    ),
    proxyTimeMapReferenceSha256: sha256(
      record.proxyTimeMapReferenceSha256,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_TIME_MAP_INVALID',
    ),
    admittedAt: isoInstant(
      record.admittedAt,
      'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_TIME_INVALID',
    ),
  };
  const expected = commitReceipt.binding;
  if (material.projectId !== expected.projectId
    || material.assetId !== expected.assetId
    || canonicalizeEditronJsonV1(material.projectRevision)
      !== canonicalizeEditronJsonV1(expected.projectRevision)
    || material.bindingSha256 !== expected.bindingSha256
    || material.commitSha256 !== commitReceipt.commitSha256
    || material.verifiedSourceBindingSha256
      !== expected.verifiedSourceBindingSha256
    || material.proxyTimeMapReferenceSha256
      !== expected.proxyTimeMapReferenceSha256
    || Date.parse(material.admittedAt)
      < Date.parse(commitReceipt.mutationReceipt.committedAt)) {
    fail('PROJECT_PROXY_SOURCE_BINDING_ADMISSION_SCOPE_MISMATCH');
  }
  const admissionSha256 = sha256(
    record.admissionSha256,
    'PROJECT_PROXY_SOURCE_BINDING_ADMISSION_HASH_INVALID',
  );
  if (admissionSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_PROXY_SOURCE_BINDING_ADMISSION_HASH_MISMATCH');
  }
  return frozen({ ...material, admissionSha256 });
}

export function createProjectProxyMasterRelinkStateV1(input: Readonly<{
  projectId: string;
  assetId: string;
  actorKind: ProjectProxyMasterRelinkActorKindV1;
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1;
  beforeSourceBinding: ProjectProxySourceBindingV1;
  boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1;
  sourceInvalidationPlanSha256: string;
  audioRightsEvidenceSha256: string | null;
  beforeProjectRevision: ProjectProxyMasterRelinkRevisionV1;
  overlayChanges: readonly ProjectProxyMasterRelinkOverlayChangeV1[];
  policy: ProjectProxyMasterRelinkPolicyV1;
  relinkedAt: Date;
}>): ProjectProxyMasterRelinkStateV1 {
  const activeState = assertActiveMappingState(input.activeMappingState);
  const active = activeState.proxyMasterActiveMappingV1;
  const relation = active.qualification.relation;
  const beforeSourceBinding = assertProjectProxySourceBindingV1(
    input.beforeSourceBinding,
  );
  const beforeProjectRevision = revision(
    input.beforeProjectRevision,
    'PROJECT_PROXY_MASTER_RELINK_BEFORE_REVISION_INVALID',
  );
  const policy = assertProjectProxyMasterRelinkPolicyV1(input.policy);
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_MASTER_RELINK_STATE_KIND_V1,
    disposition: 'PROJECT_SOURCE_RELINKED_TO_QUALIFIED_MASTER' as const,
    projectId: identifier(
      input.projectId,
      'PROJECT_PROXY_MASTER_RELINK_PROJECT_ID_INVALID',
    ),
    assetId: identifier(
      input.assetId,
      'PROJECT_PROXY_MASTER_RELINK_ASSET_ID_INVALID',
    ),
    actorKind: assertActorKind(input.actorKind),
    relationSha256: active.relationSha256,
    activeMappingStateSha256:
      activeState.proxyMasterActiveMappingStateSha256V1,
    qualificationSha256: active.qualification.qualificationSha256,
    mappingSha256: active.qualification.mapping.mappingSha256,
    proxySourceVersionSha256: relation.proxy.sourceVersionSha256,
    masterSourceVersionSha256: relation.master.sourceVersionSha256,
    sourceInvalidationPlanSha256: sha256(
      input.sourceInvalidationPlanSha256,
      'PROJECT_PROXY_MASTER_RELINK_INVALIDATION_PLAN_INVALID',
    ),
    beforeSourceBinding,
    boundaryResolution: input.boundaryResolution,
    audioRightsEvidenceSha256: nullableSha256(
      input.audioRightsEvidenceSha256,
      'PROJECT_PROXY_MASTER_RELINK_AUDIO_RIGHTS_INVALID',
    ),
    beforeProjectRevision,
    expectedAfterProjectRevisionValue:
      beforeProjectRevision.value + 1,
    overlayChanges: input.overlayChanges,
    projectBindingRevalidation:
      'SATISFIED_BY_PROJECT_DOCUMENT_CAS' as const,
    downstreamInvalidation: {
      status: 'PENDING_OWNER_EXECUTION' as const,
      targets: PROJECT_PROXY_MASTER_PENDING_INVALIDATION_TARGETS_V1,
    },
    rollback: {
      status: 'AVAILABLE_FROM_RELINK_STATE' as const,
      restoresProxyCoordinates: true as const,
    },
    policy,
    relinkedAt: isoDate(
      input.relinkedAt,
      'PROJECT_PROXY_MASTER_RELINK_TIME_INVALID',
    ),
  };
  return assertProjectProxyMasterRelinkStateV1({
    ...material,
    stateSha256: hashEditronCanonicalJsonV1(material),
  }, activeState);
}

export function assertProjectProxyMasterRelinkStateV1(
  value: unknown,
  expectedActiveMappingState: MediaProxyMasterActiveMappingAssetStateV1,
): ProjectProxyMasterRelinkStateV1 {
  const activeState = assertActiveMappingState(expectedActiveMappingState);
  const active = activeState.proxyMasterActiveMappingV1;
  const relation = active.qualification.relation;
  const mapping = active.qualification.mapping;
  const record = object(value, 'PROJECT_PROXY_MASTER_RELINK_STATE_INVALID');
  exactKeys(record, stateKeys(), 'PROJECT_PROXY_MASTER_RELINK_STATE_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== PROJECT_PROXY_MASTER_RELINK_STATE_KIND_V1
    || record.disposition
      !== 'PROJECT_SOURCE_RELINKED_TO_QUALIFIED_MASTER') {
    fail('PROJECT_PROXY_MASTER_RELINK_STATE_IDENTITY_INVALID');
  }
  const policy = assertProjectProxyMasterRelinkPolicyV1(record.policy);
  const boundaryResolution =
    assertMediaProxyMasterExactBoundaryResolutionReceiptV1(
      record.boundaryResolution,
      activeState,
    );
  const beforeProjectRevision = revision(
    record.beforeProjectRevision,
    'PROJECT_PROXY_MASTER_RELINK_BEFORE_REVISION_INVALID',
  );
  const beforeSourceBinding = assertProjectProxySourceBindingV1(
    record.beforeSourceBinding,
  );
  const expectedAfterProjectRevisionValue = positiveSafeInteger(
    record.expectedAfterProjectRevisionValue,
    Number.MAX_SAFE_INTEGER,
    'PROJECT_PROXY_MASTER_RELINK_AFTER_REVISION_INVALID',
  );
  const overlayChanges = normalizeOverlayChanges(
    record.overlayChanges,
    policy.maxTargetOverlays,
    mapping.proxyTimeMap.totalFrameCount,
    mapping.masterTimeMap.totalFrameCount,
    boundaryResolution,
  );
  const audioRightsEvidenceSha256 = nullableSha256(
    record.audioRightsEvidenceSha256,
    'PROJECT_PROXY_MASTER_RELINK_AUDIO_RIGHTS_INVALID',
  );
  const relinkedAt = isoInstant(
    record.relinkedAt,
    'PROJECT_PROXY_MASTER_RELINK_TIME_INVALID',
  );
  const downstreamInvalidation = normalizeDownstreamInvalidation(
    record.downstreamInvalidation,
  );
  const rollback = normalizeRollback(record.rollback);
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_MASTER_RELINK_STATE_KIND_V1,
    disposition: 'PROJECT_SOURCE_RELINKED_TO_QUALIFIED_MASTER' as const,
    projectId: identifier(
      record.projectId,
      'PROJECT_PROXY_MASTER_RELINK_PROJECT_ID_INVALID',
    ),
    assetId: identifier(
      record.assetId,
      'PROJECT_PROXY_MASTER_RELINK_ASSET_ID_INVALID',
    ),
    actorKind: assertActorKind(record.actorKind),
    relationSha256: sha256(
      record.relationSha256,
      'PROJECT_PROXY_MASTER_RELINK_RELATION_INVALID',
    ),
    activeMappingStateSha256: sha256(
      record.activeMappingStateSha256,
      'PROJECT_PROXY_MASTER_RELINK_ACTIVE_STATE_INVALID',
    ),
    qualificationSha256: sha256(
      record.qualificationSha256,
      'PROJECT_PROXY_MASTER_RELINK_QUALIFICATION_INVALID',
    ),
    mappingSha256: sha256(
      record.mappingSha256,
      'PROJECT_PROXY_MASTER_RELINK_MAPPING_INVALID',
    ),
    proxySourceVersionSha256: sha256(
      record.proxySourceVersionSha256,
      'PROJECT_PROXY_MASTER_RELINK_PROXY_SOURCE_INVALID',
    ),
    masterSourceVersionSha256: sha256(
      record.masterSourceVersionSha256,
      'PROJECT_PROXY_MASTER_RELINK_MASTER_SOURCE_INVALID',
    ),
    sourceInvalidationPlanSha256: sha256(
      record.sourceInvalidationPlanSha256,
      'PROJECT_PROXY_MASTER_RELINK_INVALIDATION_PLAN_INVALID',
    ),
    beforeSourceBinding,
    boundaryResolution,
    audioRightsEvidenceSha256,
    beforeProjectRevision,
    expectedAfterProjectRevisionValue,
    overlayChanges,
    projectBindingRevalidation:
      record.projectBindingRevalidation as
        ProjectProxyMasterRelinkStateV1['projectBindingRevalidation'],
    downstreamInvalidation,
    rollback,
    policy,
    relinkedAt,
  };
  if (material.projectBindingRevalidation
      !== 'SATISFIED_BY_PROJECT_DOCUMENT_CAS'
    || material.assetId !== relation.assetId
    || material.relationSha256 !== active.relationSha256
    || material.activeMappingStateSha256
      !== activeState.proxyMasterActiveMappingStateSha256V1
    || material.qualificationSha256
      !== active.qualification.qualificationSha256
    || material.mappingSha256 !== mapping.mappingSha256
    || material.proxySourceVersionSha256
      !== relation.proxy.sourceVersionSha256
    || material.masterSourceVersionSha256
      !== relation.master.sourceVersionSha256
    || material.sourceInvalidationPlanSha256
      !== active.sourceInvalidationPlanSha256
    || !sourceBindingMatchesRelink(
      beforeSourceBinding,
      material,
      mapping.proxyTimeMap,
    )
    || Date.parse(beforeSourceBinding.boundAt)
      >= Date.parse(active.activatedAt)
    || expectedAfterProjectRevisionValue !== beforeProjectRevision.value + 1
    || Date.parse(relinkedAt) < Date.parse(boundaryResolution.resolvedAt)
    || Date.parse(relinkedAt) < Date.parse(active.activatedAt)
    || (mapping.audio.disposition === 'NO_AUDIO_IN_EITHER_SOURCE'
      ? audioRightsEvidenceSha256 !== null
      : audioRightsEvidenceSha256 === null)) {
    fail('PROJECT_PROXY_MASTER_RELINK_STATE_SCOPE_MISMATCH');
  }
  const stateSha256 = sha256(
    record.stateSha256,
    'PROJECT_PROXY_MASTER_RELINK_STATE_HASH_INVALID',
  );
  if (stateSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_PROXY_MASTER_RELINK_STATE_HASH_MISMATCH');
  }
  const state = frozen({ ...material, stateSha256 });
  if (Buffer.byteLength(canonicalizeEditronJsonV1(state), 'utf8')
    > policy.maxRelinkStateBytes) {
    fail('PROJECT_PROXY_MASTER_RELINK_STATE_BYTE_LIMIT_EXCEEDED');
  }
  return state;
}

export function createProjectProxyMasterRelinkCommitReceiptV1(input: Readonly<{
  state: ProjectProxyMasterRelinkStateV1;
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1;
  mutationReceipt: ProjectProxyMasterRelinkMutationReceiptV1;
}>): ProjectProxyMasterRelinkCommitReceiptV1 {
  const state = assertProjectProxyMasterRelinkStateV1(
    input.state,
    input.activeMappingState,
  );
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_MASTER_RELINK_COMMIT_KIND_V1,
    disposition: 'PROJECT_PROXY_MASTER_RELINK_COMMITTED' as const,
    state,
    mutationReceipt: input.mutationReceipt,
  };
  return assertProjectProxyMasterRelinkCommitReceiptV1({
    ...material,
    commitSha256: hashEditronCanonicalJsonV1(material),
  }, input.activeMappingState);
}

export function assertProjectProxyMasterRelinkCommitReceiptV1(
  value: unknown,
  expectedActiveMappingState: MediaProxyMasterActiveMappingAssetStateV1,
): ProjectProxyMasterRelinkCommitReceiptV1 {
  const record = object(value, 'PROJECT_PROXY_MASTER_RELINK_COMMIT_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'state', 'mutationReceipt',
    'commitSha256',
  ], 'PROJECT_PROXY_MASTER_RELINK_COMMIT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== PROJECT_PROXY_MASTER_RELINK_COMMIT_KIND_V1
    || record.disposition !== 'PROJECT_PROXY_MASTER_RELINK_COMMITTED') {
    fail('PROJECT_PROXY_MASTER_RELINK_COMMIT_IDENTITY_INVALID');
  }
  const state = assertProjectProxyMasterRelinkStateV1(
    record.state,
    expectedActiveMappingState,
  );
  const mutationReceipt = normalizeMutationReceipt(record.mutationReceipt);
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_PROXY_MASTER_RELINK_COMMIT_KIND_V1,
    disposition: 'PROJECT_PROXY_MASTER_RELINK_COMMITTED' as const,
    state,
    mutationReceipt,
  };
  if (mutationReceipt.projectId !== state.projectId
    || mutationReceipt.revision.value
      !== state.expectedAfterProjectRevisionValue
    || mutationReceipt.revision.compatibilityUpdatedAt
      !== mutationReceipt.committedAt
    || Date.parse(mutationReceipt.committedAt) < Date.parse(state.relinkedAt)) {
    fail('PROJECT_PROXY_MASTER_RELINK_COMMIT_SCOPE_MISMATCH');
  }
  const commitSha256 = sha256(
    record.commitSha256,
    'PROJECT_PROXY_MASTER_RELINK_COMMIT_HASH_INVALID',
  );
  if (commitSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_PROXY_MASTER_RELINK_COMMIT_HASH_MISMATCH');
  }
  return frozen({ ...material, commitSha256 });
}

export function assertProjectProxyMasterRelinkPolicyV1(
  value: unknown,
): ProjectProxyMasterRelinkPolicyV1 {
  const record = object(value, 'PROJECT_PROXY_MASTER_RELINK_POLICY_INVALID');
  exactKeys(record, [
    'policyVersion', 'maxTargetOverlays', 'maxRelinkStateBytes',
    'maxProjectRelinkStates',
  ], 'PROJECT_PROXY_MASTER_RELINK_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: text(
      record.policyVersion,
      'PROJECT_PROXY_MASTER_RELINK_POLICY_VERSION_INVALID',
    ),
    maxTargetOverlays: positiveSafeInteger(
      record.maxTargetOverlays,
      MAX_TARGET_OVERLAYS,
      'PROJECT_PROXY_MASTER_RELINK_POLICY_OVERLAYS_INVALID',
    ),
    maxRelinkStateBytes: positiveSafeInteger(
      record.maxRelinkStateBytes,
      MAX_RELINK_STATE_BYTES,
      'PROJECT_PROXY_MASTER_RELINK_POLICY_BYTES_INVALID',
    ),
    maxProjectRelinkStates: positiveSafeInteger(
      record.maxProjectRelinkStates,
      MAX_PROJECT_RELINK_STATES,
      'PROJECT_PROXY_MASTER_RELINK_POLICY_STATES_INVALID',
    ),
  });
}

/**
 * Validates server-owned history envelopes without requiring every historical
 * asset's current active mapping. The target state must still pass the full
 * active-mapping validator before it is replaced or consumed.
 */
export function assertProjectProxyMasterRelinkStateHistoryV1(
  value: unknown,
  projectId: string,
  maxStates: number,
): readonly ProjectProxyMasterRelinkStateV1[] {
  const expectedProjectId = identifier(
    projectId,
    'PROJECT_PROXY_MASTER_RELINK_HISTORY_PROJECT_ID_INVALID',
  );
  const limit = positiveSafeInteger(
    maxStates,
    MAX_PROJECT_RELINK_STATES,
    'PROJECT_PROXY_MASTER_RELINK_HISTORY_LIMIT_INVALID',
  );
  if (value === undefined) return frozen([]);
  if (!Array.isArray(value) || value.length > limit) {
    fail('PROJECT_PROXY_MASTER_RELINK_HISTORY_INVALID');
  }
  let previousAssetId: string | null = null;
  return frozen(value.map((entry) => {
    const state = assertStateEnvelope(entry);
    if (state.projectId !== expectedProjectId
      || (previousAssetId !== null && state.assetId <= previousAssetId)) {
      fail('PROJECT_PROXY_MASTER_RELINK_HISTORY_SCOPE_OR_ORDER_INVALID');
    }
    previousAssetId = state.assetId;
    return state;
  }));
}

function normalizeOverlayChanges(
  value: unknown,
  maxTargetOverlays: number,
  proxyFrameCountText: string,
  masterFrameCountText: string,
  boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1,
): readonly ProjectProxyMasterRelinkOverlayChangeV1[] {
  if (!Array.isArray(value) || value.length === 0
    || value.length > maxTargetOverlays) {
    fail('PROJECT_PROXY_MASTER_RELINK_OVERLAY_CHANGES_INVALID');
  }
  const proxyFrameCount = BigInt(proxyFrameCountText);
  const masterFrameCount = BigInt(masterFrameCountText);
  const resolutions = new Map(boundaryResolution.resolvedBoundaries.map(
    (entry) => [entry.proxyBoundaryOrdinal, entry.masterBoundaryOrdinal],
  ));
  let previousOverlayId = -1;
  const requiredProxyBoundaries = new Set<string>();
  const changes = value.map((entry) => {
    const record = object(
      entry,
      'PROJECT_PROXY_MASTER_RELINK_OVERLAY_CHANGE_INVALID',
    );
    exactKeys(record, [
      'overlayId', 'timelineStartFrame', 'timelineEndFrameExclusive',
      'proxySourceStartFrame', 'proxySourceEndFrameExclusive',
      'masterSourceStartFrame', 'masterSourceEndFrameExclusive',
      'sourceStartFrameWasExplicit', 'sourceEndFrameWasExplicit',
      'videoStartTimeWasExplicit',
    ], 'PROJECT_PROXY_MASTER_RELINK_OVERLAY_CHANGE_FIELDS_INVALID');
    const overlayId = nonNegativeSafeInteger(
      record.overlayId,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_OVERLAY_ID_INVALID',
    );
    const timelineStartFrame = nonNegativeSafeInteger(
      record.timelineStartFrame,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_TIMELINE_START_INVALID',
    );
    const timelineEndFrameExclusive = positiveSafeInteger(
      record.timelineEndFrameExclusive,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_TIMELINE_END_INVALID',
    );
    const proxySourceStartFrame = nonNegativeSafeInteger(
      record.proxySourceStartFrame,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_PROXY_START_INVALID',
    );
    const proxySourceEndFrameExclusive = positiveSafeInteger(
      record.proxySourceEndFrameExclusive,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_PROXY_END_INVALID',
    );
    const masterSourceStartFrame = nonNegativeSafeInteger(
      record.masterSourceStartFrame,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_MASTER_START_INVALID',
    );
    const masterSourceEndFrameExclusive = positiveSafeInteger(
      record.masterSourceEndFrameExclusive,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_MASTER_RELINK_MASTER_END_INVALID',
    );
    const sourceStartFrameWasExplicit = bool(
      record.sourceStartFrameWasExplicit,
      'PROJECT_PROXY_MASTER_RELINK_SOURCE_START_PRESENCE_INVALID',
    );
    const sourceEndFrameWasExplicit = bool(
      record.sourceEndFrameWasExplicit,
      'PROJECT_PROXY_MASTER_RELINK_SOURCE_END_PRESENCE_INVALID',
    );
    const videoStartTimeWasExplicit = bool(
      record.videoStartTimeWasExplicit,
      'PROJECT_PROXY_MASTER_RELINK_VIDEO_START_PRESENCE_INVALID',
    );
    if (overlayId <= previousOverlayId
      || timelineEndFrameExclusive <= timelineStartFrame
      || proxySourceEndFrameExclusive <= proxySourceStartFrame
      || masterSourceEndFrameExclusive <= masterSourceStartFrame
      || BigInt(proxySourceEndFrameExclusive) > proxyFrameCount
      || BigInt(masterSourceEndFrameExclusive) > masterFrameCount
      || resolutions.get(String(proxySourceStartFrame))
        !== String(masterSourceStartFrame)
      || resolutions.get(String(proxySourceEndFrameExclusive))
        !== String(masterSourceEndFrameExclusive)
      || (!sourceStartFrameWasExplicit && !videoStartTimeWasExplicit)
      || sourceEndFrameWasExplicit !== true) {
      fail('PROJECT_PROXY_MASTER_RELINK_OVERLAY_CHANGE_SCOPE_MISMATCH');
    }
    previousOverlayId = overlayId;
    requiredProxyBoundaries.add(String(proxySourceStartFrame));
    requiredProxyBoundaries.add(String(proxySourceEndFrameExclusive));
    return {
      overlayId,
      timelineStartFrame,
      timelineEndFrameExclusive,
      proxySourceStartFrame,
      proxySourceEndFrameExclusive,
      masterSourceStartFrame,
      masterSourceEndFrameExclusive,
      sourceStartFrameWasExplicit,
      sourceEndFrameWasExplicit: true as const,
      videoStartTimeWasExplicit,
    };
  });
  const expectedBoundaries = [...requiredProxyBoundaries]
    .sort((left, right) => compareIntegerText(left, right));
  if (canonicalizeEditronJsonV1(expectedBoundaries)
    !== canonicalizeEditronJsonV1(
      boundaryResolution.requestedProxyBoundaryOrdinals,
    )) {
    fail('PROJECT_PROXY_MASTER_RELINK_BOUNDARY_SET_MISMATCH');
  }
  return frozen(changes);
}

function normalizeProxySourceBindingOverlays(
  value: unknown,
  maxTargetOverlays: number,
): readonly ProjectProxySourceBindingOverlayV1[] {
  if (!Array.isArray(value) || value.length === 0
    || value.length > maxTargetOverlays) {
    fail('PROJECT_PROXY_SOURCE_BINDING_OVERLAYS_INVALID');
  }
  let previousOverlayId = -1;
  return frozen(value.map((entry) => {
    const record = object(entry, 'PROJECT_PROXY_SOURCE_BINDING_OVERLAY_INVALID');
    exactKeys(record, [
      'overlayId', 'timelineStartFrame', 'timelineEndFrameExclusive',
      'proxySourceStartFrame', 'proxySourceEndFrameExclusive',
      'sourceStartFrameWasExplicit', 'sourceEndFrameWasExplicit',
      'videoStartTimeWasExplicit',
    ], 'PROJECT_PROXY_SOURCE_BINDING_OVERLAY_FIELDS_INVALID');
    const overlayId = nonNegativeSafeInteger(
      record.overlayId,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_SOURCE_BINDING_OVERLAY_ID_INVALID',
    );
    const timelineStartFrame = nonNegativeSafeInteger(
      record.timelineStartFrame,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_SOURCE_BINDING_TIMELINE_START_INVALID',
    );
    const timelineEndFrameExclusive = positiveSafeInteger(
      record.timelineEndFrameExclusive,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_SOURCE_BINDING_TIMELINE_END_INVALID',
    );
    const proxySourceStartFrame = nonNegativeSafeInteger(
      record.proxySourceStartFrame,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_SOURCE_BINDING_SOURCE_START_INVALID',
    );
    const proxySourceEndFrameExclusive = positiveSafeInteger(
      record.proxySourceEndFrameExclusive,
      Number.MAX_SAFE_INTEGER,
      'PROJECT_PROXY_SOURCE_BINDING_SOURCE_END_INVALID',
    );
    const sourceStartFrameWasExplicit = bool(
      record.sourceStartFrameWasExplicit,
      'PROJECT_PROXY_SOURCE_BINDING_SOURCE_START_PRESENCE_INVALID',
    );
    const sourceEndFrameWasExplicit = bool(
      record.sourceEndFrameWasExplicit,
      'PROJECT_PROXY_SOURCE_BINDING_SOURCE_END_PRESENCE_INVALID',
    );
    const videoStartTimeWasExplicit = bool(
      record.videoStartTimeWasExplicit,
      'PROJECT_PROXY_SOURCE_BINDING_VIDEO_START_PRESENCE_INVALID',
    );
    if (overlayId <= previousOverlayId
      || timelineEndFrameExclusive <= timelineStartFrame
      || proxySourceEndFrameExclusive <= proxySourceStartFrame
      || (!sourceStartFrameWasExplicit && !videoStartTimeWasExplicit)
      || sourceEndFrameWasExplicit !== true) {
      fail('PROJECT_PROXY_SOURCE_BINDING_OVERLAY_SCOPE_MISMATCH');
    }
    previousOverlayId = overlayId;
    return {
      overlayId,
      timelineStartFrame,
      timelineEndFrameExclusive,
      proxySourceStartFrame,
      proxySourceEndFrameExclusive,
      sourceStartFrameWasExplicit,
      sourceEndFrameWasExplicit: true as const,
      videoStartTimeWasExplicit,
    };
  }));
}

function sourceBindingMatchesRelink(
  binding: ProjectProxySourceBindingV1,
  state: Pick<
  ProjectProxyMasterRelinkStateV1,
  | 'projectId'
  | 'assetId'
  | 'proxySourceVersionSha256'
  | 'beforeProjectRevision'
  | 'overlayChanges'
  | 'relinkedAt'
  >,
  proxyTimeMap: unknown,
): boolean {
  const expectedOverlays = binding.overlays.map((overlay) => ({
    overlayId: overlay.overlayId,
    timelineStartFrame: overlay.timelineStartFrame,
    timelineEndFrameExclusive: overlay.timelineEndFrameExclusive,
    proxySourceStartFrame: overlay.proxySourceStartFrame,
    proxySourceEndFrameExclusive: overlay.proxySourceEndFrameExclusive,
    sourceStartFrameWasExplicit: overlay.sourceStartFrameWasExplicit,
    sourceEndFrameWasExplicit: overlay.sourceEndFrameWasExplicit,
    videoStartTimeWasExplicit: overlay.videoStartTimeWasExplicit,
  }));
  const actualOverlays = state.overlayChanges.map((overlay) => ({
    overlayId: overlay.overlayId,
    timelineStartFrame: overlay.timelineStartFrame,
    timelineEndFrameExclusive: overlay.timelineEndFrameExclusive,
    proxySourceStartFrame: overlay.proxySourceStartFrame,
    proxySourceEndFrameExclusive: overlay.proxySourceEndFrameExclusive,
    sourceStartFrameWasExplicit: overlay.sourceStartFrameWasExplicit,
    sourceEndFrameWasExplicit: overlay.sourceEndFrameWasExplicit,
    videoStartTimeWasExplicit: overlay.videoStartTimeWasExplicit,
  }));
  return binding.projectId === state.projectId
    && binding.assetId === state.assetId
    && binding.proxySourceVersionSha256
      === state.proxySourceVersionSha256
    && binding.proxyTimeMapReferenceSha256
      === hashEditronCanonicalJsonV1(proxyTimeMap)
    && canonicalizeEditronJsonV1(binding.projectRevision)
      === canonicalizeEditronJsonV1(state.beforeProjectRevision)
    && Date.parse(state.relinkedAt) >= Date.parse(binding.boundAt)
    && canonicalizeEditronJsonV1(expectedOverlays)
      === canonicalizeEditronJsonV1(actualOverlays);
}

function normalizeMutationReceipt(
  value: unknown,
): ProjectProxyMasterRelinkMutationReceiptV1 {
  const record = object(
    value,
    'PROJECT_PROXY_MASTER_RELINK_MUTATION_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'projectId', 'revision', 'committedAt',
  ], 'PROJECT_PROXY_MASTER_RELINK_MUTATION_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1) {
    fail('PROJECT_PROXY_MASTER_RELINK_MUTATION_RECEIPT_IDENTITY_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    projectId: identifier(
      record.projectId,
      'PROJECT_PROXY_MASTER_RELINK_MUTATION_PROJECT_ID_INVALID',
    ),
    revision: revision(
      record.revision,
      'PROJECT_PROXY_MASTER_RELINK_MUTATION_REVISION_INVALID',
    ),
    committedAt: isoInstant(
      record.committedAt,
      'PROJECT_PROXY_MASTER_RELINK_MUTATION_TIME_INVALID',
    ),
  });
}

function normalizeSourceBindingMutationReceipt(
  value: unknown,
): ProjectProxySourceBindingMutationReceiptV1 {
  const record = object(
    value,
    'PROJECT_PROXY_SOURCE_BINDING_MUTATION_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'projectId', 'revision', 'committedAt',
  ], 'PROJECT_PROXY_SOURCE_BINDING_MUTATION_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1) {
    fail('PROJECT_PROXY_SOURCE_BINDING_MUTATION_RECEIPT_IDENTITY_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    projectId: identifier(
      record.projectId,
      'PROJECT_PROXY_SOURCE_BINDING_MUTATION_PROJECT_ID_INVALID',
    ),
    revision: revision(
      record.revision,
      'PROJECT_PROXY_SOURCE_BINDING_MUTATION_REVISION_INVALID',
    ),
    committedAt: isoInstant(
      record.committedAt,
      'PROJECT_PROXY_SOURCE_BINDING_MUTATION_TIME_INVALID',
    ),
  });
}

function normalizeDownstreamInvalidation(
  value: unknown,
): ProjectProxyMasterRelinkStateV1['downstreamInvalidation'] {
  const record = object(
    value,
    'PROJECT_PROXY_MASTER_RELINK_DOWNSTREAM_INVALIDATION_INVALID',
  );
  exactKeys(record, ['status', 'targets'], 'PROJECT_PROXY_MASTER_RELINK_DOWNSTREAM_INVALIDATION_FIELDS_INVALID');
  if (record.status !== 'PENDING_OWNER_EXECUTION'
    || canonicalizeEditronJsonV1(record.targets)
      !== canonicalizeEditronJsonV1(
        PROJECT_PROXY_MASTER_PENDING_INVALIDATION_TARGETS_V1,
      )) {
    fail('PROJECT_PROXY_MASTER_RELINK_DOWNSTREAM_INVALIDATION_SCOPE_INVALID');
  }
  return frozen({
    status: 'PENDING_OWNER_EXECUTION' as const,
    targets: PROJECT_PROXY_MASTER_PENDING_INVALIDATION_TARGETS_V1,
  });
}

function normalizeRollback(
  value: unknown,
): ProjectProxyMasterRelinkStateV1['rollback'] {
  const record = object(value, 'PROJECT_PROXY_MASTER_RELINK_ROLLBACK_INVALID');
  exactKeys(record, [
    'status', 'restoresProxyCoordinates',
  ], 'PROJECT_PROXY_MASTER_RELINK_ROLLBACK_FIELDS_INVALID');
  if (record.status !== 'AVAILABLE_FROM_RELINK_STATE'
    || record.restoresProxyCoordinates !== true) {
    fail('PROJECT_PROXY_MASTER_RELINK_ROLLBACK_SCOPE_INVALID');
  }
  return frozen({
    status: 'AVAILABLE_FROM_RELINK_STATE' as const,
    restoresProxyCoordinates: true as const,
  });
}

function assertStateEnvelope(value: unknown): ProjectProxyMasterRelinkStateV1 {
  const record = object(
    value,
    'PROJECT_PROXY_MASTER_RELINK_HISTORY_STATE_INVALID',
  );
  exactKeys(record, stateKeys(), 'PROJECT_PROXY_MASTER_RELINK_HISTORY_STATE_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== PROJECT_PROXY_MASTER_RELINK_STATE_KIND_V1
    || record.disposition
      !== 'PROJECT_SOURCE_RELINKED_TO_QUALIFIED_MASTER') {
    fail('PROJECT_PROXY_MASTER_RELINK_HISTORY_STATE_IDENTITY_INVALID');
  }
  const stateSha256 = sha256(
    record.stateSha256,
    'PROJECT_PROXY_MASTER_RELINK_HISTORY_STATE_HASH_INVALID',
  );
  const { stateSha256: _ignored, ...material } = record;
  if (stateSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_PROXY_MASTER_RELINK_HISTORY_STATE_HASH_MISMATCH');
  }
  identifier(
    record.projectId,
    'PROJECT_PROXY_MASTER_RELINK_HISTORY_PROJECT_ID_INVALID',
  );
  identifier(
    record.assetId,
    'PROJECT_PROXY_MASTER_RELINK_HISTORY_ASSET_ID_INVALID',
  );
  return frozen(record as unknown as ProjectProxyMasterRelinkStateV1);
}

function stateKeys(): readonly string[] {
  return [
    'schemaVersion', 'kind', 'disposition', 'projectId', 'assetId',
    'actorKind', 'relationSha256', 'activeMappingStateSha256',
    'qualificationSha256', 'mappingSha256', 'proxySourceVersionSha256',
    'masterSourceVersionSha256', 'sourceInvalidationPlanSha256',
    'beforeSourceBinding',
    'boundaryResolution', 'audioRightsEvidenceSha256',
    'beforeProjectRevision', 'expectedAfterProjectRevisionValue',
    'overlayChanges', 'projectBindingRevalidation',
    'downstreamInvalidation', 'rollback', 'policy', 'relinkedAt',
    'stateSha256',
  ];
}

function assertActiveMappingState(
  value: unknown,
): MediaProxyMasterActiveMappingAssetStateV1 {
  const record = object(value, 'PROJECT_PROXY_MASTER_RELINK_ACTIVE_STATE_INVALID');
  exactKeys(record, [
    'proxyMasterActiveMappingV1',
    'proxyMasterActiveMappingStateSha256V1',
  ], 'PROJECT_PROXY_MASTER_RELINK_ACTIVE_STATE_FIELDS_INVALID');
  const active = assertMediaProxyMasterActiveMappingV1(
    record.proxyMasterActiveMappingV1,
  );
  const stateSha256 = sha256(
    record.proxyMasterActiveMappingStateSha256V1,
    'PROJECT_PROXY_MASTER_RELINK_ACTIVE_STATE_HASH_INVALID',
  );
  if (stateSha256 !== active.activationSha256) {
    fail('PROJECT_PROXY_MASTER_RELINK_ACTIVE_STATE_HASH_MISMATCH');
  }
  return frozen({
    proxyMasterActiveMappingV1: active,
    proxyMasterActiveMappingStateSha256V1: stateSha256,
  });
}

function revision(value: unknown, error: string): ProjectProxyMasterRelinkRevisionV1 {
  const record = object(value, error);
  exactKeys(record, [
    'schemaVersion', 'value', 'compatibilityUpdatedAt',
  ], error);
  if (record.schemaVersion !== 1) fail(error);
  return frozen({
    schemaVersion: 1 as const,
    value: nonNegativeSafeInteger(record.value, Number.MAX_SAFE_INTEGER, error),
    compatibilityUpdatedAt: isoInstant(record.compatibilityUpdatedAt, error),
  });
}

function assertActorKind(value: unknown): ProjectProxyMasterRelinkActorKindV1 {
  if (value !== 'USER' && value !== 'AGENT' && value !== 'SYSTEM') {
    fail('PROJECT_PROXY_MASTER_RELINK_ACTOR_INVALID');
  }
  return value;
}

function compareIntegerText(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function text(value: unknown, error: string, max = 256): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > max) fail(error);
  return value;
}

function identifier(value: unknown, error: string): string {
  const parsed = text(value, error, 512);
  if (/[^\x21-\x7E]/.test(parsed)) fail(error);
  return parsed;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function nullableSha256(value: unknown, error: string): string | null {
  return value === null ? null : sha256(value, error);
}

function bool(value: unknown, error: string): boolean {
  if (typeof value !== 'boolean') fail(error);
  return value;
}

function nonNegativeSafeInteger(
  value: unknown,
  max: number,
  error: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0
    || (value as number) > max) fail(error);
  return value as number;
}

function positiveSafeInteger(
  value: unknown,
  max: number,
  error: string,
): number {
  const parsed = nonNegativeSafeInteger(value, max, error);
  if (parsed === 0) fail(error);
  return parsed;
}

function isoDate(value: unknown, error: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(error);
  return value.toISOString();
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(error);
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
