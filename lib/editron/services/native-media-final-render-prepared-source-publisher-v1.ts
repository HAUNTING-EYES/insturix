import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  DURABLE_WORKFLOW_JOB_VERSION_V1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from './media-source-audio-artifact-asset-owner-v1';
import {
  nativeMediaFinalRenderAssetTimingStateSha256V1,
  readNativeMediaFinalRenderVideoOverlayV1,
} from './native-media-final-render-admission-v1';
import type { NativeMediaFinalRenderPublisherPortV1 } from './native-media-final-render-materializer-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  buildNativeMediaFinalRenderPreparationJobContractV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_MAX_ATTEMPTS_V1,
  type NativeMediaFinalRenderPreparationJobInputV1,
} from './native-media-final-render-preparation-job-v1';
import {
  assertNativeMediaFinalRenderPreparationResultV1,
  createNativeMediaFinalRenderPreparationTerminalReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1,
  type NativeMediaFinalRenderPreparationResultV1,
} from './native-media-final-render-preparation-result-v1';
import {
  createNativeMediaFinalRenderSourceLeaseV1,
  type NativeMediaFinalRenderArtifactV1,
  type NativeMediaFinalRenderSourceLeaseV1,
} from './native-media-final-render-source-preparation-v1';
import type { Project, ProjectRevisionV1 } from './project-service';
import { resolveVerifiedVideoSourceEpochTimeBindingV3 } from './video-source-time-transform-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLISHER_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLISHER_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLICATION_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLICATION_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_V1' as const;

const OPERATION_OWNER = 'NATIVE_MEDIA_FINAL_RENDER';
const OPERATION_KIND = 'native_media_final_render_prepare_source';
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type NativeMediaFinalRenderPublicationRightsReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_KIND_V1;
  disposition: 'AUTHORIZED';
  ownerId: string;
  ownerVersion: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectOwnerId: string | null;
  sequenceId: string;
  projectRevisionSha256: string;
  overlayId: string;
  assetId: string;
  sourceVersionSha256: string;
  artifactBindingSha256: string;
  currentScopeSha256: string;
  rightsEvidenceSha256: string;
  receiptSha256: string;
}>;

export interface NativeMediaFinalRenderPublicationRightsOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  authorize(input: Readonly<{
    tenantId: string;
    userId: string;
    orgId: string | null;
    projectId: string;
    projectOwnerId: string | null;
    sequenceId: string;
    projectRevision: ProjectRevisionV1;
    currentScopeSha256: string;
    overlay: Overlay;
    asset: MediaSourceAudioArtifactAssetStateInputV1;
    artifact: NativeMediaFinalRenderArtifactV1;
  }>): Promise<Readonly<
    | {
        disposition: 'AUTHORIZED';
        receipt: NativeMediaFinalRenderPublicationRightsReceiptV1;
      }
    | { disposition: 'BLOCKED'; diagnosticCode: string }
  >>;
}

export function createNativeMediaFinalRenderPublicationRightsReceiptV1(input: Readonly<{
  ownerId: string;
  ownerVersion: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  projectOwnerId: string | null;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  overlayId: string;
  assetId: string;
  sourceVersionSha256: string;
  artifactBindingSha256: string;
  currentScopeSha256: string;
  rightsEvidenceSha256: string;
}>): NativeMediaFinalRenderPublicationRightsReceiptV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_KIND_V1,
    disposition: 'AUTHORIZED' as const,
    ownerId: identity(input.ownerId, 'RIGHTS_OWNER_ID'),
    ownerVersion: identity(input.ownerVersion, 'RIGHTS_OWNER_VERSION'),
    tenantId: identity(input.tenantId, 'RIGHTS_TENANT_ID'),
    userId: identity(input.userId, 'RIGHTS_USER_ID'),
    orgId: nullableIdentity(input.orgId, 'RIGHTS_ORG_ID'),
    projectId: identity(input.projectId, 'RIGHTS_PROJECT_ID'),
    projectOwnerId: nullableIdentity(input.projectOwnerId, 'RIGHTS_PROJECT_OWNER_ID'),
    sequenceId: identity(input.sequenceId, 'RIGHTS_SEQUENCE_ID'),
    projectRevisionSha256: hashEditronCanonicalJsonV1(input.projectRevision),
    overlayId: identity(input.overlayId, 'RIGHTS_OVERLAY_ID'),
    assetId: identity(input.assetId, 'RIGHTS_ASSET_ID'),
    sourceVersionSha256: sha256(input.sourceVersionSha256, 'RIGHTS_SOURCE_VERSION'),
    artifactBindingSha256: sha256(
      input.artifactBindingSha256,
      'RIGHTS_ARTIFACT_BINDING',
    ),
    currentScopeSha256: sha256(input.currentScopeSha256, 'RIGHTS_CURRENT_SCOPE'),
    rightsEvidenceSha256: sha256(input.rightsEvidenceSha256, 'RIGHTS_EVIDENCE'),
  };
  return Object.freeze({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export type NativeMediaFinalRenderPreparedSourcePublicationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLICATION_KIND_V1;
  publisherVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLISHER_VERSION_V1;
  jobId: string;
  jobInputBindingSha256: string;
  preparationTerminalReceiptSha256: string;
  resultBindingSha256: string;
  artifactBindingSha256: string;
  currentScopeSha256: string;
  rightsOwnerId: string;
  rightsOwnerVersion: string;
  rightsAuthorizationReceiptSha256: string;
  leaseId: string;
  leaseBindingSha256: string;
  leaseExpiresAtEpochMs: number;
  receiptSha256: string;
}>;

export type NativeMediaFinalRenderPreparedSourcePublicationResultV1 = Readonly<
  | {
      disposition: 'SOURCE_PUBLISHED';
      lease: NativeMediaFinalRenderSourceLeaseV1;
      receipt: NativeMediaFinalRenderPreparedSourcePublicationReceiptV1;
    }
  | { disposition: 'UNVERIFIABLE'; diagnostic: string }
>;

type Ports = Readonly<{
  jobReader: Pick<DurableWorkflowJobStoreV1, 'getAuthorized'>;
  projectSnapshotReader: Readonly<{
    loadProjectForMutation(userId: string, projectId: string): Promise<{
      project: Project;
      revision: ProjectRevisionV1;
    }>;
  }>;
  assetReader: Readonly<{
    load(assetId: string, userId: string): Promise<MediaSourceAudioArtifactAssetStateInputV1 | null>;
  }>;
  rightsOwner: Readonly<NativeMediaFinalRenderPublicationRightsOwnerV1>;
  publisher: NativeMediaFinalRenderPublisherPortV1;
  now?: () => number;
}>;

type CurrentScope = Readonly<{
  projectOwnerId: string | null;
  overlay: Overlay;
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  scopeSha256: string;
}>;

export function createNativeMediaFinalRenderPreparedSourcePublisherV1(ports: Ports) {
  assertPorts(ports);
  const rightsOwnerId = identity(ports.rightsOwner.ownerId, 'RIGHTS_OWNER_ID');
  const rightsOwnerVersion = identity(
    ports.rightsOwner.ownerVersion,
    'RIGHTS_OWNER_VERSION',
  );
  const now = ports.now ?? Date.now;

  return Object.freeze({
    async publishPreparedSource(input: Readonly<{
      jobId: string;
      tenantId: string;
      userId: string;
      projectId: string;
      sequenceId: string;
      minimumExpiresAtEpochMs: number;
    }>): Promise<NativeMediaFinalRenderPreparedSourcePublicationResultV1> {
      try {
        const request = normalizeInput(input, now());
        const job = await readAuthorizedJob(ports, request);
        const completed = resolveCompletedPreparation(job, request);
        const jobExpiry = dateEpoch(job.expiresAt, 'JOB_EXPIRY');
        if (jobExpiry <= request.nowEpochMs
          || request.minimumExpiresAtEpochMs > jobExpiry) {
          fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_EXPIRED');
        }

        const firstScope = await readCurrentScope(ports, completed);
        const firstRights = await authorizeRights(
          ports.rightsOwner,
          completed,
          firstScope,
        );
        const published = await ports.publisher.publish({
          artifact: completed.result.artifact,
          publishHandle: completed.result.publishHandle,
          minimumExpiresAtEpochMs: request.minimumExpiresAtEpochMs,
        });
        if (!published || published.disposition !== 'SOURCE_PUBLISHED') {
          fail(published?.disposition === 'UNVERIFIABLE'
            ? safeDiagnostic(published.diagnostic)
              ?? 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_STORAGE_UNAVAILABLE'
            : 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_STORAGE_UNAVAILABLE');
        }
        const lease = validateLease(
          published.lease,
          completed.result.artifact,
          request.minimumExpiresAtEpochMs,
          jobExpiry,
        );

        const finalScope = await readCurrentScope(ports, completed);
        if (finalScope.scopeSha256 !== firstScope.scopeSha256) {
          fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_SCOPE_CHANGED');
        }
        const finalRights = await authorizeRights(
          ports.rightsOwner,
          completed,
          finalScope,
        );
        if (finalRights !== firstRights) {
          fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_CHANGED');
        }

        const material = {
          schemaVersion: 1 as const,
          kind: NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLICATION_KIND_V1,
          publisherVersion: NATIVE_MEDIA_FINAL_RENDER_PREPARED_SOURCE_PUBLISHER_VERSION_V1,
          jobId: job.jobId,
          jobInputBindingSha256: job.input.bindingSha256,
          preparationTerminalReceiptSha256: job.terminalReceipt!.receiptSha256,
          resultBindingSha256: completed.result.resultBindingSha256,
          artifactBindingSha256: completed.result.artifact.artifactBindingSha256,
          currentScopeSha256: finalScope.scopeSha256,
          rightsOwnerId,
          rightsOwnerVersion,
          rightsAuthorizationReceiptSha256: finalRights,
          leaseId: lease.leaseId,
          leaseBindingSha256: lease.leaseBindingSha256,
          leaseExpiresAtEpochMs: lease.expiresAtEpochMs,
        };
        return Object.freeze({
          disposition: 'SOURCE_PUBLISHED' as const,
          lease,
          receipt: Object.freeze({
            ...material,
            receiptSha256: hashEditronCanonicalJsonV1(material),
          }),
        });
      } catch (error) {
        return blocked(
          diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_FAILED',
        );
      }
    },
  });
}

async function readAuthorizedJob(
  ports: Ports,
  input: ReturnType<typeof normalizeInput>,
): Promise<Readonly<DurableWorkflowJobSnapshotV1>> {
  let job: Readonly<DurableWorkflowJobSnapshotV1> | null;
  try {
    job = await ports.jobReader.getAuthorized({
      jobId: input.jobId,
      tenantId: input.tenantId,
      userId: input.userId,
    });
  } catch {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_UNAVAILABLE');
  }
  if (!job) fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_UNAVAILABLE');
  return job;
}

function resolveCompletedPreparation(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  input: ReturnType<typeof normalizeInput>,
) {
  if (job.version !== DURABLE_WORKFLOW_JOB_VERSION_V1 || job.status !== 'completed'
    || job.operationOwner !== OPERATION_OWNER || job.operationKind !== OPERATION_KIND
    || job.jobId !== input.jobId || job.tenantId !== input.tenantId
    || job.userId !== input.userId || job.projectId !== input.projectId
    || job.leaseOwnerId !== null || job.leaseExpiresAt !== null || job.error !== null
    || job.cancelRequestedAt !== null || !job.resumeState || !job.terminalReceipt
    || job.terminalReceipt.disposition !== 'PASS'
    || job.maxAttempts !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_MAX_ATTEMPTS_V1
    || job.attemptCount < 1 || job.attemptCount > job.maxAttempts
    || job.remainingAttempts !== job.maxAttempts - job.attemptCount) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_NOT_COMPLETED');
  }
  const jobInput = assertNativeMediaFinalRenderPreparationJobInputV1(job.input.payload);
  const contract = buildNativeMediaFinalRenderPreparationJobContractV1({
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    projectId: jobInput.projectId,
    sequenceId: jobInput.sequenceId,
    projectRevision: jobInput.projectRevision,
    admissionReceiptSha256: jobInput.admissionReceiptSha256,
    budgetReservation: jobInput.budgetReservation,
    exactSourceRequest: jobInput.exactSourceRequest,
    policyBindings: jobInput.policyBindings,
    executionProfile: jobInput.executionProfile,
  });
  if (input.sequenceId !== jobInput.sequenceId
    || jobInput.tenantId !== job.tenantId || jobInput.userId !== job.userId
    || jobInput.orgId !== job.orgId || jobInput.projectId !== job.projectId
    || job.input.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1
    || job.input.bindingSha256 !== contract.bindingSha256
    || job.operationId !== contract.operationIdentity
    || job.idempotencyKey !== contract.operationIdentity
    || job.parentCommandId !== null || job.parentReceiptId !== null
    || hashDurableWorkflowJobJsonV1(job.dependencies)
      !== hashDurableWorkflowJobJsonV1(contract.dependencies)
    || hashDurableWorkflowJobJsonV1(job.budgetReservation)
      !== hashDurableWorkflowJobJsonV1(jobInput.budgetReservation)) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_BINDING_INVALID');
  }
  const resume = job.resumeState;
  if (resume.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1
    || !Number.isSafeInteger(resume.sequence) || resume.sequence < 1
    || resume.stateSha256 !== hashDurableWorkflowJobJsonV1(resume.payload)) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RESUME_INVALID');
  }
  const result = assertNativeMediaFinalRenderPreparationResultV1(resume.payload, {
    jobInput,
    jobInputBindingSha256: job.input.bindingSha256,
  });
  validateTerminalReceipt(job, jobInput, result);
  return Object.freeze({ job, jobInput, result });
}

function validateTerminalReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
  result: NativeMediaFinalRenderPreparationResultV1,
): void {
  const terminal = job.terminalReceipt!;
  const budgetProofs = terminal.proofReferences.filter(
    ({ proofId, disposition }) => proofId === 'execution-budget-authorization'
      && disposition === 'PASS',
  );
  if (budgetProofs.length !== 1) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_TERMINAL_RECEIPT_INVALID');
  }
  const recreated = createNativeMediaFinalRenderPreparationTerminalReceiptV1({
    jobId: job.jobId,
    operationId: job.operationId,
    jobInput,
    jobInputBindingSha256: job.input.bindingSha256,
    result,
    executionAuthorizationReceiptSha256: budgetProofs[0]!.proofSha256,
    completedAt: validDate(terminal.completedAt, 'TERMINAL_COMPLETED_AT'),
  });
  if (hashDurableWorkflowJobJsonV1(receiptMaterial(terminal))
    !== hashDurableWorkflowJobJsonV1(receiptMaterial(recreated))) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_TERMINAL_RECEIPT_INVALID');
  }
}

async function readCurrentScope(
  ports: Ports,
  completed: ReturnType<typeof resolveCompletedPreparation>,
): Promise<CurrentScope> {
  const { jobInput, result } = completed;
  let snapshot: Awaited<ReturnType<Ports['projectSnapshotReader']['loadProjectForMutation']>>;
  try {
    snapshot = await ports.projectSnapshotReader.loadProjectForMutation(
      jobInput.userId,
      jobInput.projectId,
    );
  } catch {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_PROJECT_UNAVAILABLE');
  }
  if (snapshot.project.projectId !== jobInput.projectId
    || !sameRevision(snapshot.revision, jobInput.projectRevision)) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_PROJECT_STALE');
  }
  const candidate = snapshot.project.overlays.find(
    (overlay) => String(overlay.id) === jobInput.exactSourceRequest.overlayId,
  );
  if (!candidate) fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_OVERLAY_STALE');
  const overlay = readNativeMediaFinalRenderVideoOverlayV1(candidate);
  const request = jobInput.exactSourceRequest;
  if (overlay.assetId !== request.assetId
    || overlay.overlayTimingSha256 !== request.overlayTimingSha256
    || overlay.renderNativeAudio !== request.renderNativeAudio) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_OVERLAY_STALE');
  }
  let asset: MediaSourceAudioArtifactAssetStateInputV1 | null;
  try {
    asset = await ports.assetReader.load(request.assetId, jobInput.userId);
  } catch {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_ASSET_UNAVAILABLE');
  }
  if (!asset || asset.assetId !== request.assetId || asset.type !== 'video'
    || nativeMediaFinalRenderAssetTimingStateSha256V1(asset)
      !== request.assetTimingStateSha256) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_ASSET_STALE');
  }
  const binding = resolveVerifiedVideoSourceEpochTimeBindingV3(asset);
  if (!binding || binding.assetId !== request.assetId
    || binding.sourceVersionSha256 !== request.sourceVersionSha256
    || binding.storageVersionSha256 !== request.storageVersionSha256
    || binding.sourceBindingSha256 !== request.sourceBindingSha256
    || binding.sourcePtsCadenceMapStateSha256V3
      !== request.sourcePtsCadenceMapStateSha256V3) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_SOURCE_BINDING_STALE');
  }
  const audioStateSha256 = verifyCurrentAudio(asset, result.artifact);
  const scopeSha256 = hashEditronCanonicalJsonV1({
    projectRevision: snapshot.revision,
    overlayTimingSha256: overlay.overlayTimingSha256,
    assetTimingStateSha256: request.assetTimingStateSha256,
    sourceBindingSha256: binding.bindingSha256,
    audioStateSha256,
  });
  return Object.freeze({
    projectOwnerId: typeof snapshot.project.userId === 'string'
      ? snapshot.project.userId
      : null,
    overlay: candidate,
    asset,
    scopeSha256,
  });
}

function verifyCurrentAudio(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
  artifact: NativeMediaFinalRenderArtifactV1,
): string | null {
  if (artifact.audio.disposition === 'NO_AUDIO_MAPPING_REQUESTED') return null;
  const state = readMediaSourceAudioArtifactAssetStateV1(asset);
  const matched = state?.sourceAudioArtifactsV1.records.some((record) => (
    record.source.sourceVersionSha256 === artifact.sourceVersionSha256
    && record.source.storageVersionSha256 === artifact.storageVersionSha256
    && record.source.sourceBindingSha256 === artifact.sourceBindingSha256
    && record.decodedPcmSha256 === artifact.audio.sourceDecodedPcmSha256
    && record.sampleRate === artifact.audio.sampleRate
    && record.channelCount === artifact.audio.channelCount
  ));
  if (!state || !matched) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_AUDIO_STALE');
  }
  return state.sourceAudioArtifactsStateSha256V1;
}

async function authorizeRights(
  owner: Readonly<NativeMediaFinalRenderPublicationRightsOwnerV1>,
  completed: ReturnType<typeof resolveCompletedPreparation>,
  scope: CurrentScope,
): Promise<string> {
  let result: Awaited<ReturnType<typeof owner.authorize>>;
  try {
    result = await owner.authorize({
      tenantId: completed.jobInput.tenantId,
      userId: completed.jobInput.userId,
      orgId: completed.jobInput.orgId,
      projectId: completed.jobInput.projectId,
      projectOwnerId: scope.projectOwnerId,
      sequenceId: completed.jobInput.sequenceId,
      projectRevision: completed.jobInput.projectRevision,
      currentScopeSha256: scope.scopeSha256,
      overlay: scope.overlay,
      asset: scope.asset,
      artifact: completed.result.artifact,
    });
  } catch {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_UNAVAILABLE');
  }
  if (result?.disposition === 'AUTHORIZED') {
    return assertRightsReceipt(result.receipt, owner, completed, scope).receiptSha256;
  }
  if (result?.disposition === 'BLOCKED') {
    fail(identity(result.diagnosticCode, 'RIGHTS_DIAGNOSTIC'));
  }
  fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RESULT_INVALID');
}

function assertRightsReceipt(
  value: unknown,
  owner: Readonly<NativeMediaFinalRenderPublicationRightsOwnerV1>,
  completed: ReturnType<typeof resolveCompletedPreparation>,
  scope: CurrentScope,
): NativeMediaFinalRenderPublicationRightsReceiptV1 {
  const record = asRecord(
    value,
    'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'artifactBindingSha256', 'assetId', 'currentScopeSha256', 'disposition',
    'kind', 'orgId', 'overlayId', 'ownerId', 'ownerVersion', 'projectId',
    'projectOwnerId', 'projectRevisionSha256', 'receiptSha256',
    'rightsEvidenceSha256', 'schemaVersion', 'sequenceId',
    'sourceVersionSha256', 'tenantId', 'userId',
  ], 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_FIELDS_INVALID');
  const jobInput = completed.jobInput;
  const rebuilt = createNativeMediaFinalRenderPublicationRightsReceiptV1({
    ownerId: owner.ownerId,
    ownerVersion: owner.ownerVersion,
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    projectId: jobInput.projectId,
    projectOwnerId: scope.projectOwnerId,
    sequenceId: jobInput.sequenceId,
    projectRevision: jobInput.projectRevision,
    overlayId: jobInput.exactSourceRequest.overlayId,
    assetId: jobInput.exactSourceRequest.assetId,
    sourceVersionSha256: jobInput.exactSourceRequest.sourceVersionSha256,
    artifactBindingSha256: completed.result.artifact.artifactBindingSha256,
    currentScopeSha256: scope.scopeSha256,
    rightsEvidenceSha256: record.rightsEvidenceSha256 as string,
  });
  if (hashEditronCanonicalJsonV1(record) !== hashEditronCanonicalJsonV1(rebuilt)) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_SCOPE_INVALID');
  }
  return rebuilt;
}

function validateLease(
  value: NativeMediaFinalRenderSourceLeaseV1,
  artifact: NativeMediaFinalRenderArtifactV1,
  minimumExpiresAtEpochMs: number,
  maximumExpiresAtEpochMs: number,
): NativeMediaFinalRenderSourceLeaseV1 {
  const lease = createNativeMediaFinalRenderSourceLeaseV1({
    leaseId: value?.leaseId,
    artifact: value?.artifact,
    sourceUrl: value?.sourceUrl,
    issuedAtEpochMs: value?.issuedAtEpochMs,
    expiresAtEpochMs: value?.expiresAtEpochMs,
  });
  if (lease.sourceUrlSha256 !== value.sourceUrlSha256
    || lease.leaseBindingSha256 !== value.leaseBindingSha256
    || lease.artifact.artifactBindingSha256 !== artifact.artifactBindingSha256
    || lease.expiresAtEpochMs < minimumExpiresAtEpochMs
    || lease.expiresAtEpochMs > maximumExpiresAtEpochMs) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_LEASE_INVALID');
  }
  return lease;
}

function normalizeInput(input: Readonly<{
  jobId: string;
  tenantId: string;
  userId: string;
  projectId: string;
  sequenceId: string;
  minimumExpiresAtEpochMs: number;
}>, nowEpochMs: number) {
  const now = epochMs(nowEpochMs, 'NOW');
  const minimum = epochMs(input?.minimumExpiresAtEpochMs, 'MINIMUM_EXPIRY');
  if (minimum <= now) fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_EXPIRY_INVALID');
  return Object.freeze({
    jobId: identity(input?.jobId, 'JOB_ID'),
    tenantId: identity(input?.tenantId, 'TENANT_ID'),
    userId: identity(input?.userId, 'USER_ID'),
    projectId: identity(input?.projectId, 'PROJECT_ID'),
    sequenceId: identity(input?.sequenceId, 'SEQUENCE_ID'),
    minimumExpiresAtEpochMs: minimum,
    nowEpochMs: now,
  });
}

function assertPorts(ports: Ports): void {
  if (!ports || typeof ports.jobReader?.getAuthorized !== 'function'
    || typeof ports.projectSnapshotReader?.loadProjectForMutation !== 'function'
    || typeof ports.assetReader?.load !== 'function'
    || typeof ports.rightsOwner?.authorize !== 'function'
    || typeof ports.publisher?.publish !== 'function'
    || (ports.now !== undefined && typeof ports.now !== 'function')) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_PORTS_INVALID');
  }
}

function receiptMaterial(value: Readonly<{
  disposition: string;
  receiptId: string;
  receiptSha256: string;
  proofReferences: readonly unknown[];
  completedAt: string | Date;
}>) {
  return {
    disposition: value.disposition,
    receiptId: value.receiptId,
    receiptSha256: value.receiptSha256,
    proofReferences: value.proofReferences,
    completedAt: value.completedAt instanceof Date
      ? value.completedAt.toISOString()
      : value.completedAt,
  };
}

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left?.schemaVersion === 1 && right?.schemaVersion === 1
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_${label}_INVALID`);
  }
  return normalized;
}

function nullableIdentity(value: unknown, label: string): string | null {
  return value === null ? null : identity(value, label);
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_${label}_SHA256_INVALID`);
  }
  return value;
}

function epochMs(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_${label}_INVALID`);
  }
  return Number(value);
}

function dateEpoch(value: unknown, label: string): number {
  const date = validDate(value, label);
  return date.getTime();
}

function validDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_${label}_INVALID`);
  }
  return date;
}

function safeDiagnostic(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_]{1,200}$/.test(value)
    ? value
    : null;
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error ? safeDiagnostic(error.message) : null;
}

function blocked(diagnosticCode: string): NativeMediaFinalRenderPreparedSourcePublicationResultV1 {
  return Object.freeze({ disposition: 'UNVERIFIABLE' as const, diagnostic: diagnosticCode });
}

function fail(code: string): never {
  throw new Error(code);
}
