import type { Collection, Filter } from "mongodb";

import { getDatabase } from "@/lib/editron/db/mongodb";
import {
  RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import {
  createProjectRenderDispatchIdentityV1,
  createProjectRenderJobAuthorizationV1,
  PROJECT_RENDER_JOBS_COLLECTION_V1,
  ProjectRenderJobAuthorizationSchema,
  type ProjectRenderJobAuthorizationV1,
} from "@/lib/editron/services/render-job-service";
import {
  ProjectRenderSourceCleanupAwsRegionSchemaV1,
} from "@/lib/editron/services/project-render-source-cleanup-v1";
import {
  projectService,
  type ProjectRenderDispatchBindingRecoveryResultV1,
} from "@/lib/editron/services/project-service";

export const MAX_PROJECT_RENDER_DISPATCH_RECOVERY_BATCH_SIZE_V1 = 10;
export const DEFAULT_PROJECT_RENDER_DISPATCH_RECOVERY_BATCH_SIZE_V1 = 5;
export const PROJECT_RENDER_DISPATCH_RECOVERY_COLLECTION_V1 =
  PROJECT_RENDER_JOBS_COLLECTION_V1;

const CHAPTER_ADMISSION_ID_PREFIX_V1 = /^chr_/;

type ChapterParentRecoveryExclusionReasonV1 =
  | "CHAPTER_ORCHESTRATION_PARENT_EXCLUDED_FROM_STANDARD_RECOVERY"
  | "CHAPTER_ADMISSION_ID_EXCLUDED_FROM_STANDARD_RECOVERY";

type ProviderTupleV1 = {
  providerRenderId: string;
  bucketName: string;
  region: string;
};

export type ProjectRenderDispatchRecoveryDispositionV1 =
  | "PROVABLE_PROVIDER_TUPLE"
  | "BOUND_FROM_PROVIDER_TUPLE"
  | "ALREADY_BOUND"
  | "UNKNOWN_QUARANTINED"
  | "ATTEMPTING_QUARANTINED"
  | "INVALID_STRICT_ROW"
  | "STALE_PROJECT_REVISION"
  | "BIND_REJECTED"
  | "RECOVERY_ERROR"
  | "NOT_ELIGIBLE";

export type ProjectRenderDispatchRecoveryClassificationV1 = {
  jobId: string | null;
  phase: string | null;
  disposition: ProjectRenderDispatchRecoveryDispositionV1;
  reason?: string;
  authorization?: ProjectRenderJobAuthorizationV1;
  providerTuple?: ProviderTupleV1;
  job?: RenderJob;
};

export type ProjectRenderDispatchRecoveryResultV1 = {
  scanned: number;
  provable: number;
  bound: number;
  quarantined: number;
  skipped: number;
  errors: number;
  results: ProjectRenderDispatchRecoveryClassificationV1[];
};

export type ProjectRenderDispatchRecoveryProofValidationV1 =
  | {
      ok: true;
      authorization: ProjectRenderJobAuthorizationV1;
      attemptToken: string;
      providerTuple: ProviderTupleV1;
    }
  | {
      ok: false;
      reason:
        | "AUTHORIZATION_INVALID"
        | "ATTEMPT_TOKEN_MISMATCH"
        | "DISPATCH_LEDGER_INVALID"
        | "PROVIDER_TUPLE_MISMATCH"
        | "PROVIDER_REGION_MISMATCH"
        | "PROJECT_RENDER_BINDING_INVALID"
        | ChapterParentRecoveryExclusionReasonV1;
    };

export type ProjectRenderDispatchAdmissionProofV1 = {
  authorization: ProjectRenderJobAuthorizationV1;
  job: RenderJob;
};

export type BindProjectRenderDispatchFromSignedProofInputV1 = {
  authorization: unknown;
  job: unknown;
  attemptToken?: unknown;
  providerRenderId: unknown;
  bucketName: unknown;
  region: unknown;
};

export type BindProjectRenderDispatchFromSignedProofResultV1 =
  | ProjectRenderDispatchRecoveryProofValidationV1
  | {
      ok: true;
      state: "PRE_LEDGER" | "BOUND" | "ALREADY_BOUND";
    }
  | ProjectRenderDispatchBindingRecoveryResultV1;

function boundedInputString(value: unknown, maximum = 500): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(value);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function readProviderTuple(value: unknown): ProviderTupleV1 | null {
  const parsed = record(value);
  if (!parsed) return null;
  const providerRenderId = parsed.providerRenderId;
  const bucketName = parsed.bucketName;
  const region = parsed.region;
  if (
    !boundedInputString(providerRenderId)
    || !boundedInputString(bucketName)
    || !boundedInputString(region, 100)
    || !ProjectRenderSourceCleanupAwsRegionSchemaV1.safeParse(region.trim()).success
  ) {
    return null;
  }
  return {
    providerRenderId: providerRenderId.trim(),
    bucketName: bucketName.trim(),
    region: region.trim(),
  };
}

function sameProviderTupleV1(left: ProviderTupleV1, right: ProviderTupleV1): boolean {
  return left.providerRenderId === right.providerRenderId
    && left.bucketName === right.bucketName
    && left.region === right.region;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Standard dispatch recovery has no authority over chapter aggregates. Keep
 * this guard before strict parsing so compatibility or malformed rows cannot
 * reach provider-tuple binding merely because a test double or stale query
 * returns a chapter admission.
 */
function chapterParentRecoveryExclusionReasonV1(
  value: unknown,
): ChapterParentRecoveryExclusionReasonV1 | null {
  const raw = record(value);
  const orchestration = record(raw?.chapterOrchestration);
  if (orchestration?.scope === RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1) {
    return "CHAPTER_ORCHESTRATION_PARENT_EXCLUDED_FROM_STANDARD_RECOVERY";
  }
  if (typeof raw?._id === "string" && CHAPTER_ADMISSION_ID_PREFIX_V1.test(raw._id)) {
    return "CHAPTER_ADMISSION_ID_EXCLUDED_FROM_STANDARD_RECOVERY";
  }
  return null;
}

function expectedAttemptTokenV1(
  authorization: ProjectRenderJobAuthorizationV1,
): string {
  return createProjectRenderDispatchIdentityV1({
    jobId: authorization.jobId,
    bindingHash: authorization.bindingHash,
  }).attemptToken;
}

function authorizationFromStrictJobV1(
  job: RenderJob,
): ProjectRenderJobAuthorizationV1 | null {
  if (
    job.artifactBinding !== undefined
    || !job.projectRenderSnapshotBinding
    || job.projectRenderSnapshotBinding.scope !== "PROJECT_SNAPSHOT"
    || !job.requestedByUserId
  ) {
    return null;
  }
  try {
    return createProjectRenderJobAuthorizationV1({
      jobId: job._id,
      ownerId: job.userId,
      requestedByUserId: job.requestedByUserId,
      projectId: job.projectId,
      projectRevision: job.projectRenderSnapshotBinding.projectRevision,
      binding: job.projectRenderSnapshotBinding,
    });
  } catch {
    return null;
  }
}

function persistedProviderTupleV1(value: unknown): {
  tuple: ProviderTupleV1 | null;
  invalid: boolean;
} {
  const job = record(value);
  if (!job) return { tuple: null, invalid: true };
  const topLevelHasProvider = job.providerRenderId !== undefined
    || job.bucketName !== undefined;
  const topLevelTuple = topLevelHasProvider
    ? readProviderTuple({
        providerRenderId: job.providerRenderId,
        bucketName: job.bucketName,
        region: job.region,
      })
    : null;
  if (topLevelHasProvider && !topLevelTuple) return { tuple: null, invalid: true };

  const dispatchValue = job.dispatch;
  if (dispatchValue === undefined) return { tuple: topLevelTuple, invalid: false };
  const dispatch = record(dispatchValue);
  if (!dispatch) return { tuple: null, invalid: true };
  const dispatchHasProvider = dispatch.providerRenderId !== undefined
    || dispatch.providerBucketName !== undefined
    || dispatch.providerRegion !== undefined;
  const dispatchTuple = dispatchHasProvider
    ? readProviderTuple({
        providerRenderId: dispatch.providerRenderId,
        bucketName: dispatch.providerBucketName,
        region: dispatch.providerRegion,
      })
    : null;
  if (dispatchHasProvider && !dispatchTuple) return { tuple: null, invalid: true };
  if (Boolean(topLevelTuple) !== Boolean(dispatchTuple)) {
    return { tuple: null, invalid: true };
  }
  if (topLevelTuple && dispatchTuple && !sameProviderTupleV1(topLevelTuple, dispatchTuple)) {
    return { tuple: null, invalid: true };
  }
  return { tuple: topLevelTuple ?? dispatchTuple, invalid: false };
}

/**
 * Classify a strict row without changing it. A provider tuple is evidence that
 * the provider accepted an attempt, but it is never evidence of a successful
 * render. Rows without that exact tuple remain quarantined for a signed
 * callback or an operator decision; this function never rerenders or refunds.
 */
export function classifyProjectRenderDispatchRecoveryV1(
  value: unknown,
): ProjectRenderDispatchRecoveryClassificationV1 {
  const raw = record(value);
  const rawDispatch = record(raw?.dispatch);
  const chapterExclusionReason = chapterParentRecoveryExclusionReasonV1(value);
  if (chapterExclusionReason) {
    return {
      jobId: typeof raw?._id === "string" ? raw._id : null,
      phase: typeof rawDispatch?.phase === "string" ? rawDispatch.phase : null,
      disposition: "NOT_ELIGIBLE",
      reason: chapterExclusionReason,
    };
  }
  const parsed = RenderJobSchema.safeParse(value);
  if (!parsed.success) {
    return {
      jobId: typeof raw?._id === "string" ? raw._id : null,
      phase: typeof rawDispatch?.phase === "string" ? rawDispatch.phase : null,
      disposition: "INVALID_STRICT_ROW",
      reason: "RENDER_JOB_SCHEMA_INVALID",
    };
  }
  const job = parsed.data;
  const dispatch = job.dispatch;
  const authorization = authorizationFromStrictJobV1(job);
  if (!dispatch || !authorization) {
    return {
      jobId: job._id,
      phase: dispatch?.phase ?? null,
      disposition: "INVALID_STRICT_ROW",
      reason: "PROJECT_SNAPSHOT_DISPATCH_BINDING_REQUIRED",
      job,
    };
  }
  const expectedAttemptToken = expectedAttemptTokenV1(authorization);
  if (dispatch.attemptToken !== expectedAttemptToken) {
    return {
      jobId: job._id,
      phase: dispatch.phase,
      disposition: "INVALID_STRICT_ROW",
      reason: "RENDER_DISPATCH_ATTEMPT_TOKEN_MISMATCH",
      authorization,
      job,
    };
  }
  if (
    dispatch.billingState !== "RECORDED"
    || !dispatch.creditTransactionId
    || !validDate(dispatch.attemptStartedAt)
  ) {
    return {
      jobId: job._id,
      phase: dispatch.phase,
      disposition: "INVALID_STRICT_ROW",
      reason: "RENDER_DISPATCH_BILLING_OR_ATTEMPT_PROOF_MISSING",
      authorization,
      job,
    };
  }
  const persisted = persistedProviderTupleV1(job);
  if (persisted.invalid) {
    return {
      jobId: job._id,
      phase: dispatch.phase,
      disposition: "INVALID_STRICT_ROW",
      reason: "RENDER_DISPATCH_PROVIDER_TUPLE_MISMATCH",
      authorization,
      job,
    };
  }
  if (dispatch.phase === "BOUND") {
    return {
      jobId: job._id,
      phase: dispatch.phase,
      disposition: "NOT_ELIGIBLE",
      reason: "RENDER_DISPATCH_ALREADY_BOUND",
      authorization,
      providerTuple: persisted.tuple ?? undefined,
      job,
    };
  }
  if (dispatch.phase !== "UNKNOWN" && dispatch.phase !== "ATTEMPTING") {
    return {
      jobId: job._id,
      phase: dispatch.phase,
      disposition: "NOT_ELIGIBLE",
      reason: "RENDER_DISPATCH_PHASE_NOT_RECOVERABLE",
      authorization,
      providerTuple: persisted.tuple ?? undefined,
      job,
    };
  }
  return {
    jobId: job._id,
    phase: dispatch.phase,
    disposition: persisted.tuple ? "PROVABLE_PROVIDER_TUPLE" : dispatch.phase === "UNKNOWN"
      ? "UNKNOWN_QUARANTINED"
      : "ATTEMPTING_QUARANTINED",
    reason: persisted.tuple
      ? "EXACT_PERSISTED_PROVIDER_TUPLE"
      : "SIGNED_PROVIDER_CALLBACK_REQUIRED",
    authorization,
    providerTuple: persisted.tuple ?? undefined,
    job,
  };
}

/**
 * Validate a provider callback against the signed admission and all durable
 * dispatch identity fields. The callback signature is checked by the route;
 * this helper checks the signed payload's binding and provider proof.
 */
export function validateSignedProjectRenderDispatchProofV1(input: {
  authorization: unknown;
  job: unknown;
  attemptToken?: unknown;
  providerRenderId: unknown;
  bucketName: unknown;
  region: unknown;
}): ProjectRenderDispatchRecoveryProofValidationV1 {
  const chapterExclusionReason = chapterParentRecoveryExclusionReasonV1(input.job);
  if (chapterExclusionReason) {
    return { ok: false, reason: chapterExclusionReason };
  }
  const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!parsedAuthorization.success) return { ok: false, reason: "AUTHORIZATION_INVALID" };
  const authorization = parsedAuthorization.data;
  const job = record(input.job);
  const binding = record(job?.projectRenderSnapshotBinding);
  const bindingRevision = record(binding?.projectRevision);
  if (
    !job
    || job.artifactBinding !== undefined
    || job._id !== authorization.jobId
    || job.userId !== authorization.ownerId
    || job.requestedByUserId !== authorization.requestedByUserId
    || job.projectId !== authorization.projectId
    || !binding
    || binding.scope !== "PROJECT_SNAPSHOT"
    || binding.artifactId !== authorization.jobId
    || binding.ownerId !== authorization.ownerId
    || binding.projectId !== authorization.projectId
    || binding.bindingHash !== authorization.bindingHash
    || bindingRevision?.schemaVersion !== authorization.projectRevision.schemaVersion
    || bindingRevision.value !== authorization.projectRevision.value
    || bindingRevision.compatibilityUpdatedAt
      !== authorization.projectRevision.compatibilityUpdatedAt
  ) {
    return { ok: false, reason: "PROJECT_RENDER_BINDING_INVALID" };
  }
  const expectedIdentity = createProjectRenderDispatchIdentityV1({
    jobId: authorization.jobId,
    bindingHash: authorization.bindingHash,
  });
  const expectedAttemptToken = expectedIdentity.attemptToken;
  if (
    input.attemptToken !== undefined
    && (!boundedInputString(input.attemptToken, 200)
      || input.attemptToken.trim() !== expectedAttemptToken)
  ) {
    return { ok: false, reason: "ATTEMPT_TOKEN_MISMATCH" };
  }
  const dispatchValue = job?.dispatch;
  if (dispatchValue !== undefined) {
    const dispatch = record(dispatchValue);
    if (
      !dispatch
      || dispatch.version !== 1
      || dispatch.attemptToken !== expectedAttemptToken
      || dispatch.creditIdempotencyKey !== expectedIdentity.creditIdempotencyKey
      || dispatch.billingState !== "RECORDED"
      || !boundedInputString(dispatch.creditTransactionId, 200)
      || !validDate(dispatch.attemptStartedAt)
      || (dispatch.phase !== "ATTEMPTING"
        && dispatch.phase !== "UNKNOWN"
        && dispatch.phase !== "BOUND")
      || dispatch.phase === "UNKNOWN"
        && !boundedInputString(dispatch.unknownReason, 1_000)
      || dispatch.phase === "BOUND"
        && !validDate(dispatch.providerBoundAt)
    ) {
      return { ok: false, reason: "DISPATCH_LEDGER_INVALID" };
    }
  }

  const callbackTuple = readProviderTuple({
    providerRenderId: input.providerRenderId,
    bucketName: input.bucketName,
    region: input.region,
  });
  if (!callbackTuple) return { ok: false, reason: "PROVIDER_TUPLE_MISMATCH" };
  const reservedRegion = job?.region;
  if (
    !boundedInputString(reservedRegion, 100)
    || !ProjectRenderSourceCleanupAwsRegionSchemaV1.safeParse(reservedRegion.trim()).success
    || reservedRegion.trim() !== callbackTuple.region
  ) {
    return { ok: false, reason: "PROVIDER_REGION_MISMATCH" };
  }

  const persisted = persistedProviderTupleV1(job);
  const dispatch = record(dispatchValue);
  if (
    persisted.invalid
    || dispatch?.phase === "BOUND" && !persisted.tuple
    || (persisted.tuple && !sameProviderTupleV1(persisted.tuple, callbackTuple))
  ) {
    return { ok: false, reason: "PROVIDER_TUPLE_MISMATCH" };
  }
  return {
    ok: true,
    authorization,
    attemptToken: expectedAttemptToken,
    providerTuple: callbackTuple,
  };
}

/** Read a strict admission even after it has become stale, for cleanup only. */
export async function getProjectRenderDispatchAdmissionProofV1(input: {
  jobId: string;
  expectedBindingHash: string;
  collection?: Collection<RenderJob>;
}): Promise<ProjectRenderDispatchAdmissionProofV1 | null> {
  if (
    !boundedInputString(input.jobId, 500)
    || !/^[a-f0-9]{64}$/.test(input.expectedBindingHash)
    || CHAPTER_ADMISSION_ID_PREFIX_V1.test(input.jobId)
  ) {
    return null;
  }
  const collection = input.collection ?? (await getDatabase()).collection<RenderJob>(
    PROJECT_RENDER_DISPATCH_RECOVERY_COLLECTION_V1,
  );
  const stored = await collection.findOne({
    _id: input.jobId,
    "chapterOrchestration.scope": { $ne: RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1 },
  });
  const parsed = RenderJobSchema.safeParse(stored);
  if (!parsed.success) return null;
  const job = parsed.data;
  const authorization = authorizationFromStrictJobV1(job);
  if (!authorization || authorization.bindingHash !== input.expectedBindingHash) return null;
  return { authorization, job };
}

export async function bindProjectRenderDispatchFromSignedProofV1(
  input: BindProjectRenderDispatchFromSignedProofInputV1,
): Promise<BindProjectRenderDispatchFromSignedProofResultV1> {
  const proof = validateSignedProjectRenderDispatchProofV1(input);
  if (!proof.ok) return proof;
  const job = record(input.job);
  if (job?.dispatch === undefined) {
    return { ok: true, state: "PRE_LEDGER" };
  }
  const result = await projectService.bindProjectRenderDispatchRecoveryTransactionV1({
    authorization: proof.authorization,
    attemptToken: proof.attemptToken,
    providerRenderId: proof.providerTuple.providerRenderId,
    bucketName: proof.providerTuple.bucketName,
    region: proof.providerTuple.region,
    proofSource: "SIGNED_CALLBACK",
  });
  if (!result.ok) return result;
  return { ok: true, state: result.status };
}

function boundedRecoveryLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_PROJECT_RENDER_DISPATCH_RECOVERY_BATCH_SIZE_V1;
  if (
    !Number.isSafeInteger(limit)
    || limit <= 0
    || limit > MAX_PROJECT_RENDER_DISPATCH_RECOVERY_BATCH_SIZE_V1
  ) {
    throw new Error("PROJECT_RENDER_DISPATCH_RECOVERY_LIMIT_INVALID");
  }
  return limit;
}

function recoveryFilterV1(): Filter<RenderJob> {
  return {
    artifactState: "ACTIVE",
    artifactBinding: { $exists: false },
    _id: { $not: CHAPTER_ADMISSION_ID_PREFIX_V1 },
    [`chapterOrchestration.scope`]: { $ne: RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1 },
    "projectRenderSnapshotBinding.scope": "PROJECT_SNAPSHOT",
    "dispatch.version": 1,
    "dispatch.phase": { $in: ["ATTEMPTING", "UNKNOWN"] },
    status: { $in: ["pending", "queued", "rendering", "finalizing", "error"] },
  } satisfies Filter<RenderJob>;
}

export async function sweepProjectRenderDispatchRecoveryV1(input: {
  collection?: Collection<RenderJob>;
  limit?: number;
  bindProviderTuple?: (input: {
    authorization: ProjectRenderJobAuthorizationV1;
    attemptToken: string;
    providerTuple: ProviderTupleV1;
  }) => Promise<ProjectRenderDispatchBindingRecoveryResultV1>;
} = {}): Promise<ProjectRenderDispatchRecoveryResultV1> {
  const limit = boundedRecoveryLimit(input.limit);
  const collection = input.collection ?? (await getDatabase()).collection<RenderJob>(
    PROJECT_RENDER_DISPATCH_RECOVERY_COLLECTION_V1,
  );
  const candidates = await collection.find(recoveryFilterV1())
    .sort({ "dispatch.attemptStartedAt": 1, _id: 1 })
    .limit(limit)
    .toArray();
  const result: ProjectRenderDispatchRecoveryResultV1 = {
    scanned: candidates.length,
    provable: 0,
    bound: 0,
    quarantined: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };
  const bindProviderTuple = input.bindProviderTuple ?? (
    (bindingInput) => projectService.bindProjectRenderDispatchRecoveryTransactionV1({
      authorization: bindingInput.authorization,
      attemptToken: bindingInput.attemptToken,
      providerRenderId: bindingInput.providerTuple.providerRenderId,
      bucketName: bindingInput.providerTuple.bucketName,
      region: bindingInput.providerTuple.region,
      proofSource: "PERSISTED_PROVIDER_TUPLE",
    })
  );

  for (const candidate of candidates) {
    const classification = classifyProjectRenderDispatchRecoveryV1(candidate);
    if (classification.disposition === "UNKNOWN_QUARANTINED"
      || classification.disposition === "ATTEMPTING_QUARANTINED") {
      result.quarantined += 1;
      result.results.push(classification);
      continue;
    }
    if (classification.disposition !== "PROVABLE_PROVIDER_TUPLE"
      || !classification.authorization
      || !classification.providerTuple) {
      result.skipped += 1;
      result.results.push(classification);
      continue;
    }
    result.provable += 1;
    try {
      const bound = await bindProviderTuple({
        authorization: classification.authorization,
        attemptToken: expectedAttemptTokenV1(classification.authorization),
        providerTuple: classification.providerTuple,
      });
      if (!bound.ok) {
        const disposition = bound.reason === "PROJECT_REVISION_STALE"
          ? "STALE_PROJECT_REVISION"
          : "BIND_REJECTED";
        result.skipped += 1;
        result.results.push({ ...classification, disposition, reason: bound.reason });
        continue;
      }
      const disposition = bound.status === "ALREADY_BOUND"
        ? "ALREADY_BOUND"
        : "BOUND_FROM_PROVIDER_TUPLE";
      result.bound += 1;
      result.results.push({ ...classification, disposition, reason: bound.status });
    } catch {
      result.errors += 1;
      result.results.push({
        ...classification,
        disposition: "RECOVERY_ERROR",
        reason: "PROJECT_RENDER_DISPATCH_BIND_FAILED",
      });
    }
  }
  return result;
}
