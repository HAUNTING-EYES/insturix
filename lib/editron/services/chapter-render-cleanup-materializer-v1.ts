import type { ClientSession, Collection, Document } from "mongodb";

import {
  assertProjectChapterConcatTargetV1,
  projectChapterConcatOutputUrlV1,
  type ProjectChapterConcatTargetV1,
} from "./chapter-concat-contract-v1";
import {
  createProjectChapterConcatCleanupOutboxFromTargetV1,
  enqueueProjectChapterConcatCleanupOutboxV1,
  type ProjectChapterConcatCleanupOutboxV1,
} from "./chapter-concat-cleanup-v1";
import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";
import {
  createProjectRenderChapterChildSourceCleanupOutboxV1,
  enqueueProjectRenderSourceCleanupOutboxV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from "./project-render-source-cleanup-v1";
import {
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "./project-render-snapshot-binding-v1";
import {
  RenderJobChapterOrchestrationSchema,
  RenderJobSchema,
} from "../schemas/render-job";
import {
  ProjectRenderJobAuthorizationSchema,
  type ProjectRenderJobAuthorizationV1,
} from "./render-job-service";
import {
  assertChapterChildDispatchV1,
  type ChapterChildDispatchV1,
} from "./chapter-render-dispatch-v1";

export const CHAPTER_RENDER_CLEANUP_CHAPTERS_COLLECTION_V1 =
  "editron_render_chapters" as const;

export type ChapterRenderCleanupBoundaryV1 =
  | "CURRENT_SUCCESS"
  | "STALE_FINALIZATION"
  | "STALE_PROVIDER_OUTPUT"
  | "TERMINAL_FINALIZATION_FAILURE";

type ChapterRenderCleanupChildDocumentV1 = {
  index: unknown;
  status: unknown;
  renderId?: unknown;
  bucketName?: unknown;
  region?: unknown;
  parentAdmissionId?: unknown;
  outputUrl?: unknown;
  outputSize?: unknown;
  dispatch?: unknown;
};

type ChapterRenderCleanupMaterializationRecordV1 = {
  schemaVersion: 1;
  boundary: ChapterRenderCleanupBoundaryV1;
  childOutboxIds: string[];
  concatOutboxId?: string;
  materializedAt: Date;
};

export type ChapterRenderCleanupChapterDocumentV1 = {
  _id: string;
  projectId: string;
  userId: string;
  ownerId?: string;
  status?: unknown;
  concatStatus?: unknown;
  chapters: unknown;
  projectRenderSnapshotBinding?: unknown;
  concatTarget?: unknown;
  concatResult?: unknown;
  cleanupMaterialization?: ChapterRenderCleanupMaterializationRecordV1;
  outputUrl?: unknown;
};

export type ChapterRenderCleanupParentDocumentV1 = {
  _id: string;
  userId?: unknown;
  requestedByUserId?: unknown;
  projectId?: unknown;
  providerRenderId?: unknown;
  bucketName?: unknown;
  region?: unknown;
  status?: unknown;
  artifactState?: unknown;
  artifactCleanup?: unknown;
  artifactInvalidatedAt?: unknown;
  projectRenderSnapshotBinding?: unknown;
  finalization?: unknown;
  artifactBinding?: unknown;
  artifactInvalidation?: unknown;
  deliveryManifest?: unknown;
  dispatch?: unknown;
  chapterOrchestration?: unknown;
};

export type ChapterRenderCleanupProviderOutputV1 = {
  providerRenderId: string;
  bucketName: string;
  region: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
};

export type ChapterRenderCleanupMaterializerInputV1 = {
  authorization: unknown;
  chapterCollection?: Collection<ChapterRenderCleanupChapterDocumentV1>;
  /** Alias retained for callers that name this collection after the job. */
  chapterRenderJobs?: Collection<ChapterRenderCleanupChapterDocumentV1>;
  childCleanupCollection?: Collection<ProjectRenderSourceCleanupOutboxV1>;
  /** Alias retained for callers that name this collection after the outbox. */
  renderSourceCleanupOutbox?: Collection<ProjectRenderSourceCleanupOutboxV1>;
  concatCleanupCollection?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  /** Alias retained for callers that name this collection after the outbox. */
  chapterConcatCleanupOutbox?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  /** The strict render-job parent is used to prove the terminal boundary. */
  parentRenderJobs?: Collection<ChapterRenderCleanupParentDocumentV1>;
  session: ClientSession;
  boundary: ChapterRenderCleanupBoundaryV1;
  expectedProviderOutput?: ChapterRenderCleanupProviderOutputV1;
  now?: Date;
};

export type ChapterRenderCleanupMaterializerResultV1 = {
  ok: true;
  status: "MATERIALIZED" | "ALREADY_MATERIALIZED";
  boundary: ChapterRenderCleanupBoundaryV1;
  parentAdmissionId: string;
  childOutboxIds: string[];
  concatOutboxId?: string;
  childOutboxes: ProjectRenderSourceCleanupOutboxV1[];
  concatOutbox?: ProjectChapterConcatCleanupOutboxV1;
};

const CHAPTER_ADMISSION_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const PROVIDER_RENDER_ID = /^[A-Za-z0-9_-]{1,200}$/;
const AWS_BUCKET = /^(?!.*\.\.)(?!\d{1,3}(?:\.\d{1,3}){3}$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
const MAX_CHILDREN = 64;

function fail(code: string): never {
  throw new Error(`CHAPTER_RENDER_CLEANUP_${code}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown, code: string, max = 500): string {
  if (typeof value !== "string") fail(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) {
    fail(code);
  }
  return normalized;
}

function positiveSize(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(code);
  return value as number;
}

function httpsUrl(value: unknown, code: string): string {
  const normalized = nonEmptyString(value, code, 4_096);
  try {
    if (new URL(normalized).protocol !== "https:") fail(code);
  } catch {
    fail(code);
  }
  return normalized;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isChapterRenderCleanupBoundaryV1(
  value: unknown,
): value is ChapterRenderCleanupBoundaryV1 {
  return value === "CURRENT_SUCCESS"
    || value === "STALE_FINALIZATION"
    || value === "STALE_PROVIDER_OUTPUT"
    || value === "TERMINAL_FINALIZATION_FAILURE";
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  try {
    return hashEditronCanonicalJsonV1(left) === hashEditronCanonicalJsonV1(right);
  } catch {
    return false;
  }
}

function sameBinding(
  left: ProjectRenderSnapshotBindingV1,
  right: ProjectRenderSnapshotBindingV1,
): boolean {
  return left.scope === "PROJECT_SNAPSHOT"
    && right.scope === "PROJECT_SNAPSHOT"
    && left.artifactId === right.artifactId
    && left.ownerId === right.ownerId
    && left.projectId === right.projectId
    && left.bindingHash === right.bindingHash
    && sameCanonicalValue(left, right);
}

function parseAuthorization(input: unknown): ProjectRenderJobAuthorizationV1 {
  const parsed = ProjectRenderJobAuthorizationSchema.safeParse(input);
  if (!parsed.success || !CHAPTER_ADMISSION_ID.test(parsed.data.jobId)) {
    fail("AUTHORIZATION_INVALID");
  }
  return parsed.data;
}

function parseBinding(
  value: unknown,
  authorization: ProjectRenderJobAuthorizationV1,
): ProjectRenderSnapshotBindingV1 {
  try {
    assertProjectRenderSnapshotBindingV1(value);
  } catch {
    fail("PARENT_BINDING_INVALID");
  }
  const binding = value as ProjectRenderSnapshotBindingV1;
  if (
    binding.scope !== "PROJECT_SNAPSHOT"
    || binding.artifactId !== authorization.jobId
    || binding.ownerId !== authorization.ownerId
    || binding.projectId !== authorization.projectId
    || binding.bindingHash !== authorization.bindingHash
    || !sameCanonicalValue(binding.projectRevision, authorization.projectRevision)
  ) {
    fail("PARENT_BINDING_MISMATCH");
  }
  return binding;
}

function parseChildren(
  value: unknown,
  parentAdmissionId: string,
): Array<{
  index: number;
  providerRenderId: string;
  bucketName: string;
  region: string;
  outputUrl: string;
  outputSize: number;
  dispatch?: unknown;
}> {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CHILDREN) {
    fail("CHILDREN_INVALID");
  }
  return value.map((raw, expectedIndex) => {
    if (!isRecord(raw)) fail("CHILD_INVALID");
    const child = raw as ChapterRenderCleanupChildDocumentV1;
    if (child.index !== expectedIndex || child.status !== "completed") {
      fail("CHILD_NOT_COMPLETED");
    }
    if (child.parentAdmissionId !== parentAdmissionId) {
      fail("CHILD_PARENT_ADMISSION_MISMATCH");
    }
    const providerRenderId = nonEmptyString(child.renderId, "CHILD_PROVIDER_RENDER_ID_MISSING", 200);
    if (!PROVIDER_RENDER_ID.test(providerRenderId)) fail("CHILD_PROVIDER_RENDER_ID_INVALID");
    const bucketName = nonEmptyString(child.bucketName, "CHILD_BUCKET_MISSING", 100);
    if (!AWS_BUCKET.test(bucketName) || bucketName === "chapter-render") {
      fail("CHILD_BUCKET_INVALID");
    }
    const region = nonEmptyString(child.region, "CHILD_REGION_MISSING", 100);
    if (!AWS_REGION.test(region)) fail("CHILD_REGION_INVALID");
    const outputUrl = httpsUrl(child.outputUrl, "CHILD_OUTPUT_URL_MISSING");
    const outputSize = positiveSize(child.outputSize, "CHILD_OUTPUT_SIZE_INVALID");
    return {
      index: expectedIndex,
      providerRenderId,
      bucketName,
      region,
      outputUrl,
      outputSize,
      dispatch: child.dispatch,
    };
  });
}

function assertProviderFreeChapterChildren(
  children: readonly {
    index: number;
    providerRenderId: string;
    bucketName: string;
    region: string;
    outputUrl: string;
    outputSize: number;
    dispatch?: unknown;
  }[],
  authorization: ProjectRenderJobAuthorizationV1,
  binding: ProjectRenderSnapshotBindingV1,
): void {
  for (const child of children) {
    try {
      assertChapterChildDispatchV1(child.dispatch);
    } catch {
      fail("CHILD_DISPATCH_INVALID");
    }
    const dispatch = child.dispatch as ChapterChildDispatchV1;
    if (
      dispatch.phase !== "BOUND"
      || dispatch.parentAdmissionId !== authorization.jobId
      || dispatch.childIndex !== child.index
      || dispatch.bindingHash !== binding.bindingHash
      || dispatch.providerRenderId !== child.providerRenderId
      || dispatch.providerBucketName !== child.bucketName
      || dispatch.providerRegion !== child.region
      || !dispatch.attemptStartedAt
      || !dispatch.providerAcceptedAt
      || !dispatch.providerBoundAt
      || !validDate(dispatch.attemptStartedAt)
      || !validDate(dispatch.providerAcceptedAt)
      || !validDate(dispatch.providerBoundAt)
    ) {
      fail("CHILD_DISPATCH_MISMATCH");
    }
  }
}

function parseConcatResult(
  value: unknown,
  target: ProjectChapterConcatTargetV1,
  childCount: number,
): {
  generation: string;
  sourceManifestHash: string;
  outputBucket: string;
  outputRegion: string;
  outputKey: string;
  url: string;
  sizeBytes: number;
  completedAt: Date;
} {
  if (!isRecord(value)) fail("CONCAT_RESULT_MISSING");
  if (value.chapters !== childCount || !validDate(value.completedAt)) {
    fail("CONCAT_RESULT_TERMINAL_EVIDENCE_INVALID");
  }
  const result = {
    generation: nonEmptyString(value.generation, "CONCAT_RESULT_GENERATION_INVALID", 64),
    sourceManifestHash: nonEmptyString(
      value.sourceManifestHash,
      "CONCAT_RESULT_SOURCE_MANIFEST_INVALID",
      64,
    ),
    outputBucket: nonEmptyString(value.outputBucket, "CONCAT_RESULT_BUCKET_INVALID", 100),
    outputRegion: nonEmptyString(value.outputRegion, "CONCAT_RESULT_REGION_INVALID", 100),
    outputKey: nonEmptyString(value.outputKey, "CONCAT_RESULT_KEY_INVALID", 500),
    url: httpsUrl(value.url, "CONCAT_RESULT_URL_INVALID"),
    sizeBytes: positiveSize(value.sizeBytes, "CONCAT_RESULT_SIZE_INVALID"),
    completedAt: value.completedAt as Date,
  };
  if (
    result.generation !== target.generation
    || result.sourceManifestHash !== target.sourceManifestHash
    || result.outputBucket !== target.outputBucket
    || result.outputRegion !== target.outputRegion
    || result.outputKey !== target.outputKey
    || result.url !== projectChapterConcatOutputUrlV1(target)
  ) {
    fail("CONCAT_RESULT_IDENTITY_MISMATCH");
  }
  return result;
}

function assertTargetMatchesChildren(
  targetValue: unknown,
  binding: ProjectRenderSnapshotBindingV1,
  parentAdmissionId: string,
  children: readonly {
    index: number;
    providerRenderId: string;
    bucketName: string;
    region: string;
    outputUrl: string;
    outputSize: number;
  }[],
): ProjectChapterConcatTargetV1 {
  try {
    assertProjectChapterConcatTargetV1(targetValue);
  } catch {
    fail("CONCAT_TARGET_INVALID");
  }
  const target = targetValue as ProjectChapterConcatTargetV1;
  if (
    target.parentAdmissionId !== parentAdmissionId
    || !sameBinding(target.projectRenderSnapshotBinding, binding)
    || target.sources.length !== children.length
  ) {
    fail("CONCAT_TARGET_PARENT_MISMATCH");
  }
  for (const [index, source] of target.sources.entries()) {
    const child = children[index]!;
    if (
      source.index !== child.index
      || source.providerRenderId !== child.providerRenderId
      || source.bucketName !== child.bucketName
      || source.region !== child.region
      || source.sourceUrl !== child.outputUrl
      || source.sourceSizeBytes !== child.outputSize
    ) {
      fail("CONCAT_TARGET_CHILD_MISMATCH");
    }
  }
  return target;
}

function assertExpectedProviderOutput(
  expected: ChapterRenderCleanupProviderOutputV1 | undefined,
  authorization: ProjectRenderJobAuthorizationV1,
  children: readonly {
    providerRenderId: string;
    bucketName: string;
    region: string;
    outputUrl: string;
    outputSize: number;
  }[],
  concatResult: {
    url: string;
    sizeBytes: number;
  } | undefined,
): void {
  if (!expected) return;
  const expectedProviderRenderId = authorization.jobId;
  // The aggregate parent is intentionally tracked with the synthetic
  // chapter-render bucket. Only child outboxes may carry real Remotion
  // buckets; this tuple is never handed to the generic cleanup consumer.
  const expectedBucketName = "chapter-render";
  const expectedRegion = children[0]?.region;
  const expectedOutputUrl = children.length === 1
    ? children[0]!.outputUrl
    : concatResult?.url;
  const expectedOutputSize = children.length === 1
    ? children[0]!.outputSize
    : concatResult?.sizeBytes;
  if (
    expected.providerRenderId.trim() !== expectedProviderRenderId
    || expected.bucketName.trim() !== expectedBucketName
    || (expectedRegion !== undefined && expected.region.trim() !== expectedRegion)
    || expectedOutputUrl === undefined
    || expected.sourceOutputUrl !== expectedOutputUrl
    || expected.sourceOutputSize !== expectedOutputSize
  ) {
    fail("PROVIDER_OUTPUT_MISMATCH");
  }
}

function assertParentScope(
  parent: ChapterRenderCleanupParentDocumentV1,
  authorization: ProjectRenderJobAuthorizationV1,
  binding: ProjectRenderSnapshotBindingV1,
): void {
  if (
    parent._id !== authorization.jobId
    || parent.userId !== authorization.ownerId
    || parent.requestedByUserId !== authorization.requestedByUserId
    || parent.projectId !== authorization.projectId
  ) {
    fail("PARENT_ADMISSION_MISMATCH");
  }
  parseBinding(parent.projectRenderSnapshotBinding, authorization);
  if (!sameBinding(parent.projectRenderSnapshotBinding as ProjectRenderSnapshotBindingV1, binding)) {
    fail("PARENT_BINDING_MISMATCH");
  }
}

/**
 * Chapter aggregate parents deliberately have no provider tuple. Re-parse the
 * strict render row here so cleanup can never turn a malformed or mixed row
 * into a provider-shaped descriptor. Child provider tuples remain sourced
 * only from the completed chapter ledger below.
 */
function assertProviderFreeChapterParent(
  parent: ChapterRenderCleanupParentDocumentV1,
  authorization: ProjectRenderJobAuthorizationV1,
  binding: ProjectRenderSnapshotBindingV1,
): void {
  const parsed = RenderJobSchema.safeParse(parent);
  if (!parsed.success) fail("PARENT_ORCHESTRATION_INVALID");
  const job = parsed.data;
  const orchestration = RenderJobChapterOrchestrationSchema.safeParse(
    job.chapterOrchestration,
  );
  if (!orchestration.success) fail("PARENT_ORCHESTRATION_INVALID");
  if (
    job.providerRenderId !== undefined
    || job.bucketName !== undefined
    || job.artifactBinding !== undefined
    || job.artifactInvalidation !== undefined
    || job.region !== orchestration.data.selectedRegion
    || job.deliveryManifest?.primaryArtifact.renderId !== authorization.jobId
  ) {
    fail("PARENT_PROVIDER_IDENTITY_MISMATCH");
  }
  const dispatch = job.dispatch;
  if (
    !dispatch
    || dispatch.version !== 1
    || dispatch.phase !== "NOT_ATTEMPTED"
    || dispatch.providerRenderId !== undefined
    || dispatch.providerBucketName !== undefined
    || dispatch.providerRegion !== undefined
    || dispatch.providerBoundAt !== undefined
  ) {
    fail("PARENT_PROVIDER_IDENTITY_MISMATCH");
  }
  if (
    orchestration.data.scope !== "CHAPTER_ORCHESTRATION"
    || orchestration.data.aggregateJobId !== authorization.jobId
    || orchestration.data.bindingHash !== authorization.bindingHash
  ) {
    fail("PARENT_ORCHESTRATION_INVALID");
  }
  const aggregateOutput = orchestration.data.aggregateOutput;
  const finalization = job.finalization;
  if (
    !aggregateOutput
    || !finalization
    || finalization.sourceOutputUrl !== aggregateOutput.url
    || finalization.sourceOutputSize !== aggregateOutput.sizeBytes
  ) {
    fail("PARENT_PROVIDER_OUTPUT_MISMATCH");
  }
  if (
    !job.projectRenderSnapshotBinding
    || !sameBinding(job.projectRenderSnapshotBinding, binding)
  ) {
    fail("PARENT_BINDING_MISMATCH");
  }
}

function assertParentBoundary(
  parent: ChapterRenderCleanupParentDocumentV1,
  boundary: ChapterRenderCleanupBoundaryV1,
): void {
  const finalization = isRecord(parent.finalization) ? parent.finalization : undefined;
  if (boundary === "CURRENT_SUCCESS") {
    if (parent.status !== "done" || finalization?.state !== "done") {
      fail("CURRENT_SUCCESS_NOT_VERIFIED");
    }
    return;
  }
  if (parent.status !== "error" || finalization?.state !== "failed") {
    fail("STALE_BOUNDARY_NOT_TERMINAL");
  }
  if (boundary === "TERMINAL_FINALIZATION_FAILURE") {
    if (!Number.isInteger(finalization?.attempts) || (finalization?.attempts as number) < 3) {
      fail("FINALIZATION_RETRYABLE");
    }
    return;
  }
  if (
    parent.artifactState !== "STALE"
    || !isRecord(parent.artifactCleanup)
    || parent.artifactCleanup.state !== "PENDING"
  ) {
    fail("STALE_CLEANUP_NOT_PENDING");
  }
}

async function markTerminalFailureStaleV1(
  parentRenderJobs: Collection<ChapterRenderCleanupParentDocumentV1>,
  authorization: ProjectRenderJobAuthorizationV1,
  now: Date,
  session: ClientSession,
): Promise<void> {
  const marked = await parentRenderJobs.updateOne(
    {
      _id: authorization.jobId,
      userId: authorization.ownerId,
      requestedByUserId: authorization.requestedByUserId,
      projectId: authorization.projectId,
      "projectRenderSnapshotBinding.scope": "PROJECT_SNAPSHOT",
      "projectRenderSnapshotBinding.artifactId": authorization.jobId,
      "projectRenderSnapshotBinding.ownerId": authorization.ownerId,
      "projectRenderSnapshotBinding.projectId": authorization.projectId,
      "projectRenderSnapshotBinding.bindingHash": authorization.bindingHash,
      status: "error",
      "finalization.state": "failed",
      "finalization.attempts": { $gte: 3 },
      $or: [
        { artifactState: "ACTIVE", artifactCleanup: { $exists: false } },
        {
          artifactState: "STALE",
          "artifactCleanup.state": "PENDING",
          "artifactCleanup.pendingArtifactIds": { $in: [authorization.jobId] },
        },
      ],
    } as never,
    {
      $set: {
        artifactState: "STALE",
        artifactCleanup: {
          state: "PENDING",
          pendingArtifactIds: [authorization.jobId],
        },
        artifactInvalidatedAt: now,
      },
    },
    { session },
  );
  if (marked.matchedCount === 1) return;
  const latest = await parentRenderJobs.findOne(
    { _id: authorization.jobId },
    { session },
  );
  if (!latest) fail("PARENT_ADMISSION_NOT_FOUND");
  assertParentScope(latest, authorization, latest.projectRenderSnapshotBinding as ProjectRenderSnapshotBindingV1);
  const finalization = isRecord(latest.finalization) ? latest.finalization : undefined;
  if (
    latest.status !== "error"
    || latest.artifactState !== "STALE"
    || !isRecord(latest.artifactCleanup)
    || latest.artifactCleanup.state !== "PENDING"
    || !Number.isInteger(finalization?.attempts)
    || (finalization?.attempts as number) < 3
  ) {
    fail("TERMINAL_FAILURE_STALE_WRITE_UNPROVED");
  }
}

function resolveCollection<T extends Document>(
  first: Collection<T> | undefined,
  second: Collection<T> | undefined,
  code: string,
): Collection<T> {
  const resolved = first ?? second;
  if (!resolved) fail(code);
  return resolved;
}

/**
 * Materialize every temporary artifact owned by one strict chapter admission.
 * The chapter row, parent render row and both outboxes are read/written under
 * the caller's ClientSession. Hash-derived IDs make retries safe; no provider
 * deletion is attempted here.
 */
export async function materializeChapterRenderCleanupV1(
  input: ChapterRenderCleanupMaterializerInputV1,
): Promise<ChapterRenderCleanupMaterializerResultV1> {
  const authorization = parseAuthorization(input.authorization);
  const now = input.now ?? new Date();
  if (!validDate(now)) fail("TIME_INVALID");
  if (
    input.boundary !== "CURRENT_SUCCESS"
    && input.boundary !== "STALE_FINALIZATION"
    && input.boundary !== "STALE_PROVIDER_OUTPUT"
    && input.boundary !== "TERMINAL_FINALIZATION_FAILURE"
  ) {
    fail("BOUNDARY_INVALID");
  }
  const chapterCollection = resolveCollection(
    input.chapterCollection,
    input.chapterRenderJobs,
    "CHAPTER_COLLECTION_MISSING",
  );
  const childCleanupCollection = resolveCollection(
    input.childCleanupCollection,
    input.renderSourceCleanupOutbox,
    "CHILD_CLEANUP_COLLECTION_MISSING",
  );
  const concatCleanupCollection = resolveCollection(
    input.concatCleanupCollection,
    input.chapterConcatCleanupOutbox,
    "CONCAT_CLEANUP_COLLECTION_MISSING",
  );
  const chapterJob = await chapterCollection.findOne(
    { _id: authorization.jobId },
    { session: input.session },
  );
  if (!chapterJob) fail("CHAPTER_PARENT_NOT_FOUND");
  if (
    chapterJob.projectId !== authorization.projectId
    || chapterJob.userId !== authorization.requestedByUserId
    || (chapterJob.ownerId !== undefined && chapterJob.ownerId !== authorization.ownerId)
  ) {
    fail("CHAPTER_PARENT_SCOPE_MISMATCH");
  }
  const binding = parseBinding(chapterJob.projectRenderSnapshotBinding, authorization);
  if (chapterJob._id !== binding.artifactId) fail("PARENT_ADMISSION_MISMATCH");
  const children = parseChildren(chapterJob.chapters, authorization.jobId);
  const existing = chapterJob.cleanupMaterialization;
  let materializationAt = now;
  if (existing) {
    if (
      existing.schemaVersion !== 1
      || !isChapterRenderCleanupBoundaryV1(existing.boundary)
      || existing.boundary !== input.boundary
      || !validDate(existing.materializedAt)
      || !Array.isArray(existing.childOutboxIds)
    ) {
      fail("MATERIALIZATION_RECORD_INVALID");
    }
    materializationAt = existing.materializedAt;
  }

  let concatTarget: ProjectChapterConcatTargetV1 | undefined;
  let concatResult: {
    generation: string;
    sourceManifestHash: string;
    outputBucket: string;
    outputRegion: string;
    outputKey: string;
    url: string;
    sizeBytes: number;
  } | undefined;
  if (children.length === 1) {
    if (chapterJob.status !== "completed") fail("CHAPTER_NOT_TERMINAL");
    if (chapterJob.concatTarget !== undefined || chapterJob.concatResult !== undefined) {
      fail("SINGLE_CHILD_CONCAT_AMBIGUOUS");
    }
  } else {
    if (chapterJob.status !== "completed" || chapterJob.concatStatus !== "done") {
      fail("CONCAT_NOT_TERMINAL");
    }
    if (chapterJob.concatTarget === undefined) fail("CONCAT_TARGET_MISSING");
    concatTarget = assertTargetMatchesChildren(
      chapterJob.concatTarget,
      binding,
      authorization.jobId,
      children,
    );
    concatResult = parseConcatResult(chapterJob.concatResult, concatTarget, children.length);
  }

  if (input.parentRenderJobs) {
    const parent = await input.parentRenderJobs.findOne(
      { _id: authorization.jobId },
      { session: input.session },
    );
    if (!parent) fail("PARENT_ADMISSION_NOT_FOUND");
    assertParentScope(parent, authorization, binding);
    assertParentBoundary(parent, input.boundary);
    const isProviderFreeChapter = parent.chapterOrchestration !== undefined;
    if (isProviderFreeChapter) {
      if (input.expectedProviderOutput !== undefined) {
        fail("PROVIDER_OUTPUT_MISMATCH");
      }
      assertProviderFreeChapterParent(parent, authorization, binding);
      assertProviderFreeChapterChildren(children, authorization, binding);
    } else if (
      parent.providerRenderId !== undefined
      && parent.providerRenderId !== authorization.jobId
    ) {
      fail("PARENT_PROVIDER_RENDER_ID_MISMATCH");
    }
    if (input.boundary === "TERMINAL_FINALIZATION_FAILURE") {
      await markTerminalFailureStaleV1(
        input.parentRenderJobs,
        authorization,
        now,
        input.session,
      );
    }
    if (!isProviderFreeChapter) {
      const finalization = isRecord(parent.finalization) ? parent.finalization : undefined;
      if (!finalization) fail("PARENT_PROVIDER_OUTPUT_MISSING");
      const sourceOutputUrl = finalization.sourceOutputUrl;
      const sourceOutputSize = finalization.sourceOutputSize;
      if (
        typeof parent.providerRenderId !== "string"
        || typeof parent.bucketName !== "string"
        || typeof parent.region !== "string"
        || typeof sourceOutputUrl !== "string"
        || typeof sourceOutputSize !== "number"
      ) {
        fail("PARENT_PROVIDER_OUTPUT_MISSING");
      }
      assertExpectedProviderOutput({
        providerRenderId: parent.providerRenderId,
        bucketName: parent.bucketName,
        region: parent.region,
        sourceOutputUrl,
        sourceOutputSize,
      }, authorization, children, concatResult);
    }
  }
  assertExpectedProviderOutput(
    input.expectedProviderOutput,
    authorization,
    children,
    concatResult,
  );

  const childOutboxes = children.map((child) => createProjectRenderChapterChildSourceCleanupOutboxV1({
    binding,
    parentAdmissionId: authorization.jobId,
    chapterIndex: child.index,
    providerRenderId: child.providerRenderId,
    bucketName: child.bucketName,
    region: child.region,
    sourceOutputUrl: child.outputUrl,
    sourceOutputSize: child.outputSize,
    now: materializationAt,
  }));
  for (const outbox of childOutboxes) {
    await enqueueProjectRenderSourceCleanupOutboxV1({
      outbox,
      collection: childCleanupCollection,
      session: input.session,
    });
  }
  const concatOutbox = concatTarget && concatResult
    ? createProjectChapterConcatCleanupOutboxFromTargetV1({
        target: concatTarget,
        result: {
          generation: concatResult.generation,
          sourceManifestHash: concatResult.sourceManifestHash,
          outputBucket: concatResult.outputBucket,
          outputRegion: concatResult.outputRegion,
          outputKey: concatResult.outputKey,
          url: concatResult.url,
          sizeBytes: concatResult.sizeBytes,
        },
        now: materializationAt,
      })
    : undefined;
  if (concatOutbox) {
    await enqueueProjectChapterConcatCleanupOutboxV1({
      outbox: concatOutbox,
      collection: concatCleanupCollection,
      session: input.session,
    });
  }

  const childOutboxIds = childOutboxes.map((outbox) => outbox._id);
  const concatOutboxId = concatOutbox?._id;
  if (existing) {
    if (
      existing.childOutboxIds.length !== childOutboxIds.length
      || existing.childOutboxIds.some((id, index) => id !== childOutboxIds[index])
      || existing.concatOutboxId !== concatOutboxId
    ) {
      fail("MATERIALIZATION_CONFLICT");
    }
  } else {
    const linked = await chapterCollection.updateOne(
      {
        _id: authorization.jobId,
        "projectRenderSnapshotBinding.bindingHash": authorization.bindingHash,
        cleanupMaterialization: { $exists: false },
      },
      {
        $set: {
          cleanupMaterialization: {
            schemaVersion: 1,
            boundary: input.boundary,
            childOutboxIds,
            ...(concatOutboxId ? { concatOutboxId } : {}),
            materializedAt: materializationAt,
          },
        },
      },
      { session: input.session },
    );
    if (linked.matchedCount !== 1) {
      const latest = await chapterCollection.findOne(
        { _id: authorization.jobId },
        { session: input.session },
      );
      if (
        !latest?.cleanupMaterialization
        || !Array.isArray(latest.cleanupMaterialization.childOutboxIds)
      ) fail("MATERIALIZATION_LINK_UNPROVED");
      if (
        latest.cleanupMaterialization.childOutboxIds.length !== childOutboxIds.length
        || latest.cleanupMaterialization.childOutboxIds.some(
          (id, index) => id !== childOutboxIds[index],
        )
        || latest.cleanupMaterialization.concatOutboxId !== concatOutboxId
      ) {
        fail("MATERIALIZATION_CONFLICT");
      }
    }
  }

  return {
    ok: true,
    status: existing ? "ALREADY_MATERIALIZED" : "MATERIALIZED",
    boundary: input.boundary,
    parentAdmissionId: authorization.jobId,
    childOutboxIds,
    ...(concatOutboxId ? { concatOutboxId } : {}),
    childOutboxes,
    ...(concatOutbox ? { concatOutbox } : {}),
  };
}

export const materializeChapterRenderCleanupOutboxesV1 =
  materializeChapterRenderCleanupV1;
