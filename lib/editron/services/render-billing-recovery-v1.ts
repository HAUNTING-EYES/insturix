import type { Collection, Filter } from 'mongodb';

import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  RenderJobSchema,
  type RenderJob,
  type RenderJobBillingWalletV1,
} from '@/lib/editron/schemas/render-job';
import {
  CreditsService,
  type EditronRenderUsageLookupResultV1,
} from '@/lib/services/creditsService';
import {
  createProjectRenderJobAuthorizationV1,
  PROJECT_RENDER_JOBS_COLLECTION_V1,
  reconcileProjectRenderJobBillingV1,
  type ProjectRenderBillingReconciliationResultV1,
} from '@/lib/editron/services/render-job-service';
import { projectService } from '@/lib/editron/services/project-service';
import {
  sameProjectArtifactRevisionV1,
  type ProjectArtifactProjectRevisionV1,
} from '@/lib/editron/services/project-artifact-invalidation-v1';

export const MAX_PROJECT_RENDER_BILLING_RECOVERY_BATCH_SIZE_V1 = 10;
export const DEFAULT_PROJECT_RENDER_BILLING_RECOVERY_BATCH_SIZE_V1 = 5;
export const PROJECT_RENDER_BILLING_RECOVERY_COLLECTION_V1 =
  PROJECT_RENDER_JOBS_COLLECTION_V1;

type CurrentProjectRevisionReaderV1 = (job: RenderJob) => Promise<unknown>;
type UsageLookupV1 = (
  input: Parameters<typeof CreditsService.findUsageTransactionForWallet>[0],
) => Promise<EditronRenderUsageLookupResultV1>;
type BillingReconcilerV1 = (
  input: Parameters<typeof reconcileProjectRenderJobBillingV1>[0],
) => Promise<ProjectRenderBillingReconciliationResultV1>;

export type ProjectRenderBillingRecoveryDispositionV1 =
  | 'RECORDED'
  | 'ALREADY_RECORDED'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'INVALID_LOOKUP'
  | 'STALE_PROJECT_REVISION'
  | 'JOB_NOT_CURRENT'
  | 'BILLING_IDENTITY_MISMATCH'
  | 'PROVIDER_IDENTITY_PRESENT'
  | 'BILLING_STATE_NOT_UNKNOWN'
  | 'CAS_CONFLICT'
  | 'INVALID_STRICT_ROW'
  | 'NOT_ELIGIBLE'
  | 'RECOVERY_ERROR';

export type ProjectRenderBillingRecoveryClassificationV1 = {
  jobId: string | null;
  disposition: ProjectRenderBillingRecoveryDispositionV1;
  reason?: string;
};

export type ProjectRenderBillingRecoveryResultV1 = {
  scanned: number;
  reconciled: number;
  alreadyRecorded: number;
  notFound: number;
  ambiguous: number;
  invalid: number;
  stale: number;
  conflicts: number;
  skipped: number;
  errors: number;
  results: ProjectRenderBillingRecoveryClassificationV1[];
};

function boundedRecoveryLimitV1(value: number | undefined): number {
  const limit = value ?? DEFAULT_PROJECT_RENDER_BILLING_RECOVERY_BATCH_SIZE_V1;
  if (
    !Number.isSafeInteger(limit)
    || limit <= 0
    || limit > MAX_PROJECT_RENDER_BILLING_RECOVERY_BATCH_SIZE_V1
  ) {
    throw new Error('PROJECT_RENDER_BILLING_RECOVERY_LIMIT_INVALID');
  }
  return limit;
}

function recoveryFilterV1(): Filter<RenderJob> {
  return {
    artifactState: 'ACTIVE',
    artifactBinding: { $exists: false },
    artifactInvalidation: { $exists: false },
    'projectRenderSnapshotBinding.scope': 'PROJECT_SNAPSHOT',
    'projectRenderSnapshotBinding.artifactId': { $exists: true },
    'dispatch.version': 1,
    'dispatch.phase': 'NOT_ATTEMPTED',
    'dispatch.billingState': 'UNKNOWN',
    'dispatch.billingUnknownAt': { $exists: true },
    'dispatch.unknownReason': { $exists: true },
    'dispatch.attemptStartedAt': { $exists: false },
    'dispatch.providerRenderId': { $exists: false },
    'dispatch.providerBucketName': { $exists: false },
    'dispatch.providerRegion': { $exists: false },
    'dispatch.providerBoundAt': { $exists: false },
    providerRenderId: { $exists: false },
    bucketName: { $exists: false },
    status: { $in: ['pending', 'queued', 'error'] },
  };
}

function validProjectRevisionV1(value: unknown): value is ProjectArtifactProjectRevisionV1 {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { schemaVersion?: unknown }).schemaVersion === 1
    && Number.isSafeInteger((value as { value?: unknown }).value)
    && ((value as { value: number }).value) >= 0
    && typeof (value as { compatibilityUpdatedAt?: unknown }).compatibilityUpdatedAt === 'string';
}

function jobAuthorizationV1(job: RenderJob) {
  const binding = job.projectRenderSnapshotBinding;
  if (!binding || !job.requestedByUserId) return null;
  try {
    return createProjectRenderJobAuthorizationV1({
      jobId: job._id,
      ownerId: job.userId,
      requestedByUserId: job.requestedByUserId,
      projectId: job.projectId,
      projectRevision: binding.projectRevision,
      binding,
    });
  } catch {
    return null;
  }
}

function hasProviderIdentityV1(job: RenderJob): boolean {
  const dispatch = job.dispatch;
  return job.providerRenderId !== undefined
    || job.bucketName !== undefined
    || dispatch?.providerRenderId !== undefined
    || dispatch?.providerBucketName !== undefined
    || dispatch?.providerRegion !== undefined
    || dispatch?.providerBoundAt !== undefined;
}

function classifyReconciliationV1(
  jobId: string,
  result: ProjectRenderBillingReconciliationResultV1,
): ProjectRenderBillingRecoveryClassificationV1 {
  if (result.ok) return { jobId, disposition: result.status };
  const disposition: ProjectRenderBillingRecoveryDispositionV1 =
    result.reason === 'PROJECT_REVISION_STALE'
      ? 'STALE_PROJECT_REVISION'
      : result.reason === 'JOB_NOT_CURRENT'
        ? 'JOB_NOT_CURRENT'
        : result.reason === 'CAS_CONFLICT'
          ? 'CAS_CONFLICT'
          : result.reason === 'PROVIDER_IDENTITY_PRESENT'
            ? 'PROVIDER_IDENTITY_PRESENT'
            : result.reason === 'BILLING_IDENTITY_MISMATCH'
              ? 'BILLING_IDENTITY_MISMATCH'
              : result.reason === 'BILLING_STATE_NOT_UNKNOWN'
                ? 'BILLING_STATE_NOT_UNKNOWN'
                : 'INVALID_LOOKUP';
  return { jobId, disposition, reason: result.reason };
}

function classifyLookupV1(
  jobId: string,
  result: EditronRenderUsageLookupResultV1,
): ProjectRenderBillingRecoveryClassificationV1 {
  switch (result.status) {
    case 'FOUND':
      return { jobId, disposition: 'RECORDED' };
    case 'NOT_FOUND':
      return { jobId, disposition: 'NOT_FOUND' };
    case 'AMBIGUOUS':
      return {
        jobId,
        disposition: 'AMBIGUOUS',
        reason: `MATCH_COUNT_${result.matchCount}`,
      };
    case 'INVALID':
      return { jobId, disposition: 'INVALID_LOOKUP', reason: result.reason };
  }
}

function incrementRecoveryCountV1(
  result: ProjectRenderBillingRecoveryResultV1,
  classification: ProjectRenderBillingRecoveryClassificationV1,
): void {
  switch (classification.disposition) {
    case 'RECORDED':
      result.reconciled += 1;
      return;
    case 'ALREADY_RECORDED':
      result.alreadyRecorded += 1;
      return;
    case 'NOT_FOUND':
      result.notFound += 1;
      return;
    case 'AMBIGUOUS':
      result.ambiguous += 1;
      return;
    case 'INVALID_LOOKUP':
    case 'INVALID_STRICT_ROW':
    case 'BILLING_IDENTITY_MISMATCH':
    case 'PROVIDER_IDENTITY_PRESENT':
    case 'BILLING_STATE_NOT_UNKNOWN':
      result.invalid += 1;
      return;
    case 'STALE_PROJECT_REVISION':
      result.stale += 1;
      return;
    case 'CAS_CONFLICT':
      result.conflicts += 1;
      return;
    case 'JOB_NOT_CURRENT':
    case 'NOT_ELIGIBLE':
      result.skipped += 1;
      return;
    case 'RECOVERY_ERROR':
      result.errors += 1;
      return;
  }
}

function emptyRecoveryResultV1(): ProjectRenderBillingRecoveryResultV1 {
  return {
    scanned: 0,
    reconciled: 0,
    alreadyRecorded: 0,
    notFound: 0,
    ambiguous: 0,
    invalid: 0,
    stale: 0,
    conflicts: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };
}

function renderBillingWalletV1(job: RenderJob): RenderJobBillingWalletV1 | null {
  const wallet = job.dispatch?.billingWallet;
  return wallet ?? null;
}

/**
 * Reconcile bounded pre-dispatch billing uncertainty only when the live
 * ProjectService revision and exact wallet transaction agree with the strict
 * admission. No provider, wallet mutation, rerender or project mutation is
 * reachable from this owner.
 */
export async function sweepProjectRenderBillingRecoveryV1(input: {
  limit?: number;
  collection?: Collection<RenderJob>;
  lookupUsageTransaction?: UsageLookupV1;
  reconcileBilling?: BillingReconcilerV1;
  getCurrentProjectRevision?: CurrentProjectRevisionReaderV1;
} = {}): Promise<ProjectRenderBillingRecoveryResultV1> {
  const limit = boundedRecoveryLimitV1(input.limit);
  const collection = input.collection ?? (await getDatabase()).collection<RenderJob>(
    PROJECT_RENDER_BILLING_RECOVERY_COLLECTION_V1,
  );
  const lookupUsageTransaction = input.lookupUsageTransaction
    ?? ((lookupInput) => CreditsService.findUsageTransactionForWallet(lookupInput));
  const reconcileBilling = input.reconcileBilling ?? reconcileProjectRenderJobBillingV1;
  const getCurrentProjectRevision = input.getCurrentProjectRevision
    ?? ((job: RenderJob) => projectService.getProjectRevision(job.userId, job.projectId));
  const rows = await collection
    .find(recoveryFilterV1())
    .sort({ 'dispatch.billingUnknownAt': 1, _id: 1 })
    .limit(limit)
    .toArray();
  const result = emptyRecoveryResultV1();
  result.scanned = rows.length;

  for (const row of rows) {
    const parsed = RenderJobSchema.safeParse(row);
    const rawJobId = row && typeof row === 'object' && '_id' in row
      && typeof row._id === 'string'
      ? row._id
      : null;
    if (!parsed.success) {
      const classification: ProjectRenderBillingRecoveryClassificationV1 = {
        jobId: rawJobId,
        disposition: 'INVALID_STRICT_ROW',
        reason: 'RENDER_JOB_SCHEMA_INVALID',
      };
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }
    const job = parsed.data;
    const jobId = job._id;
    const authorization = jobAuthorizationV1(job);
    const wallet = renderBillingWalletV1(job);
    if (
      !authorization
      || !wallet
      || !job.dispatch
      || job.dispatch.phase !== 'NOT_ATTEMPTED'
      || job.dispatch.billingState !== 'UNKNOWN'
      || hasProviderIdentityV1(job)
    ) {
      const classification: ProjectRenderBillingRecoveryClassificationV1 = {
        jobId,
        disposition: hasProviderIdentityV1(job) ? 'PROVIDER_IDENTITY_PRESENT' : 'NOT_ELIGIBLE',
        reason: hasProviderIdentityV1(job)
          ? 'PROVIDER_IDENTITY_MUST_BE_RECONCILED_SEPARATELY'
          : 'STRICT_PRE_DISPATCH_BILLING_ROW_REQUIRED',
      };
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }

    let currentProjectRevision: unknown;
    try {
      currentProjectRevision = await getCurrentProjectRevision(job);
    } catch {
      const classification: ProjectRenderBillingRecoveryClassificationV1 = {
        jobId,
        disposition: 'STALE_PROJECT_REVISION',
        reason: 'PROJECT_REVISION_UNAVAILABLE',
      };
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }
    if (
      !validProjectRevisionV1(currentProjectRevision)
      || !sameProjectArtifactRevisionV1(
        authorization.projectRevision,
        currentProjectRevision,
      )
    ) {
      const classification: ProjectRenderBillingRecoveryClassificationV1 = {
        jobId,
        disposition: 'STALE_PROJECT_REVISION',
        reason: 'PROJECT_REVISION_MISMATCH',
      };
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }

    let lookup: EditronRenderUsageLookupResultV1;
    try {
      lookup = await lookupUsageTransaction({
        wallet,
        creditIdempotencyKey: job.dispatch.creditIdempotencyKey,
        expectedTaskId: jobId,
        ...(wallet.type === 'org' ? { expectedActorUserId: wallet.actorUserId } : {}),
      });
    } catch {
      const classification: ProjectRenderBillingRecoveryClassificationV1 = {
        jobId,
        disposition: 'RECOVERY_ERROR',
        reason: 'CREDIT_LOOKUP_UNAVAILABLE',
      };
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }
    if (lookup.status !== 'FOUND') {
      const classification = classifyLookupV1(jobId, lookup);
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }

    let reconciliation: ProjectRenderBillingReconciliationResultV1;
    try {
      reconciliation = await reconcileBilling({
        authorization,
        currentProjectRevision,
        billingWallet: wallet,
        creditTransactionId: lookup.transaction.id,
        collection,
      });
    } catch {
      const classification: ProjectRenderBillingRecoveryClassificationV1 = {
        jobId,
        disposition: 'RECOVERY_ERROR',
        reason: 'BILLING_RECONCILIATION_UNAVAILABLE',
      };
      result.results.push(classification);
      incrementRecoveryCountV1(result, classification);
      continue;
    }
    const classification = classifyReconciliationV1(jobId, reconciliation);
    result.results.push(classification);
    incrementRecoveryCountV1(result, classification);
  }

  return result;
}
