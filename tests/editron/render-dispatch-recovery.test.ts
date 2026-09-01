import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "mongodb";

import {
  createPendingRenderJob,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  createProjectRenderDispatchIdentityV1,
  createProjectRenderJobAuthorizationV1,
} from "@/lib/editron/services/render-job-service";

const recoveryMocks = vi.hoisted(() => ({
  bindProjectRenderDispatchRecoveryTransactionV1: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/services/project-service", () => ({
  projectService: recoveryMocks,
}));

import {
  bindProjectRenderDispatchFromSignedProofV1,
  classifyProjectRenderDispatchRecoveryV1,
  getProjectRenderDispatchAdmissionProofV1,
  sweepProjectRenderDispatchRecoveryV1,
  validateSignedProjectRenderDispatchProofV1,
} from "@/lib/editron/services/render-dispatch-recovery-v1";
import { handleProjectRenderDispatchRecoveryCronV1 } from "@/app/api/cron/recover-editron-render-dispatch/route";

const OWNER_ID = "recovery-owner";
const REQUESTER_ID = "recovery-requester";
const PROJECT_ID = "recovery-project";
const JOB_ID = "rnd_recovery_1";
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-08-31T00:00:00.000Z",
};
const PROVIDER_TUPLE = {
  providerRenderId: "provider-recovery-1",
  bucketName: "editron-recovery-output",
  region: "us-east-1",
};
const REPO_ROOT = resolve(__dirname, "../..");

function makeBinding(): ProjectRenderSnapshotBindingV1 {
  const project = {
    overlays: [],
    durationInFrames: 90,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: "preview" },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: JOB_ID,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
    sequenceId: "main",
    compositionId: "TestComponent",
    renderContract: {
      renderer: "remotion-lambda",
      codec: "h264",
      audioCodec: "aac",
      framesPerLambda: 20,
    },
    durationInFrames: 90,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
}

function makeJob(
  phase: "ATTEMPTING" | "UNKNOWN" | "BOUND",
  providerTuple?: typeof PROVIDER_TUPLE,
): RenderJob {
  const binding = makeBinding();
  const identity = createProjectRenderDispatchIdentityV1({
    jobId: JOB_ID,
    bindingHash: binding.bindingHash,
  });
  const attemptStartedAt = new Date("2026-08-31T00:01:00.000Z");
  const dispatch = {
    version: 1 as const,
    phase,
    billingState: "RECORDED" as const,
    attemptToken: identity.attemptToken,
    creditIdempotencyKey: identity.creditIdempotencyKey,
    billingWallet: { type: "user" as const, clerkUserId: OWNER_ID },
    creditTransactionId: "txn-recovery-1",
    attemptStartedAt,
    ...(phase === "UNKNOWN" ? { unknownReason: "provider response was ambiguous" } : {}),
    ...(phase === "BOUND" ? { providerBoundAt: new Date("2026-08-31T00:02:00.000Z") } : {}),
    ...(providerTuple
      ? {
          providerRenderId: providerTuple.providerRenderId,
          providerBucketName: providerTuple.bucketName,
          providerRegion: providerTuple.region,
        }
      : {}),
  };
  return RenderJobSchema.parse({
    ...createPendingRenderJob(
      JOB_ID,
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      3_000,
      undefined,
      binding,
      REQUESTER_ID,
      dispatch,
    ),
    status: "rendering",
    providerRenderId: providerTuple?.providerRenderId,
    bucketName: providerTuple?.bucketName,
    deliveryManifest: {
      version: "editron-render-delivery-manifest-v1",
      mode: "embedded",
      createdAt: "2026-08-31T00:00:00.000Z",
      completedAt: null,
      primaryArtifact: {
        kind: "mixed-master",
        renderId: JOB_ID,
        status: "rendering",
        url: null,
      },
      music: {
        embedded: true,
        removedOverlayIds: [],
        handoff: null,
      },
    },
  });
}

function authorizationFor(job: RenderJob) {
  return createProjectRenderJobAuthorizationV1({
    jobId: job._id,
    ownerId: job.userId,
    requestedByUserId: job.requestedByUserId!,
    projectId: job.projectId,
    projectRevision: job.projectRenderSnapshotBinding!.projectRevision,
    binding: job.projectRenderSnapshotBinding!,
  });
}

function makeCollection(
  rows: RenderJob[],
  captureFilter?: (filter: unknown) => void,
): Collection<RenderJob> {
  const toArray = vi.fn(async () => rows);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  const find = vi.fn((filter: unknown) => {
    captureFilter?.(filter);
    return { sort };
  });
  return {
    find,
  } as unknown as Collection<RenderJob>;
}

describe("Editron render dispatch recovery V1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("quarantines an UNKNOWN row without a tuple and never binds it", async () => {
    const job = makeJob("UNKNOWN");
    const classification = classifyProjectRenderDispatchRecoveryV1(job);
    expect(classification).toMatchObject({
      jobId: JOB_ID,
      phase: "UNKNOWN",
      disposition: "UNKNOWN_QUARANTINED",
    });

    const bind = vi.fn();
    const sweep = await sweepProjectRenderDispatchRecoveryV1({
      collection: makeCollection([job]),
      limit: 1,
      bindProviderTuple: bind,
    });
    expect(sweep).toMatchObject({
      scanned: 1,
      provable: 0,
      bound: 0,
      quarantined: 1,
      errors: 0,
    });
    expect(bind).not.toHaveBeenCalled();
  });

  it("binds only an exact persisted provider tuple", async () => {
    const job = makeJob("UNKNOWN", PROVIDER_TUPLE);
    const bind = vi.fn(async (input: unknown) => {
      expect(input).toMatchObject({
        authorization: expect.objectContaining({
          jobId: JOB_ID,
          bindingHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        providerTuple: PROVIDER_TUPLE,
      });
      return { ok: true as const, status: "BOUND" as const };
    });

    expect(classifyProjectRenderDispatchRecoveryV1(job)).toMatchObject({
      disposition: "PROVABLE_PROVIDER_TUPLE",
      providerTuple: PROVIDER_TUPLE,
    });
    const sweep = await sweepProjectRenderDispatchRecoveryV1({
      collection: makeCollection([job]),
      limit: 1,
      bindProviderTuple: bind,
    });
    expect(sweep).toMatchObject({
      scanned: 1,
      provable: 1,
      bound: 1,
      quarantined: 0,
      errors: 0,
    });
    expect(bind).toHaveBeenCalledOnce();
  });

  it("excludes chapter parents and chr_ compatibility admissions before recovery binding", async () => {
    const standardJob = makeJob("UNKNOWN", PROVIDER_TUPLE);
    const futureChapterParent = {
      ...makeJob("UNKNOWN", PROVIDER_TUPLE),
      chapterOrchestration: { scope: "CHAPTER_ORCHESTRATION" },
    } as unknown as RenderJob;
    const compatibilityChapterAdmission = {
      ...makeJob("UNKNOWN", PROVIDER_TUPLE),
      _id: "chr_123456789012",
    };
    let recoveryFilter: unknown;
    const bind = vi.fn(async () => ({ ok: true as const, status: "BOUND" as const }));

    expect(classifyProjectRenderDispatchRecoveryV1(futureChapterParent)).toMatchObject({
      disposition: "NOT_ELIGIBLE",
      reason: "CHAPTER_ORCHESTRATION_PARENT_EXCLUDED_FROM_STANDARD_RECOVERY",
    });
    expect(classifyProjectRenderDispatchRecoveryV1(compatibilityChapterAdmission)).toMatchObject({
      jobId: "chr_123456789012",
      disposition: "NOT_ELIGIBLE",
      reason: "CHAPTER_ADMISSION_ID_EXCLUDED_FROM_STANDARD_RECOVERY",
    });
    await expect(bindProjectRenderDispatchFromSignedProofV1({
      authorization: {},
      job: futureChapterParent,
      ...PROVIDER_TUPLE,
    })).resolves.toEqual({
      ok: false,
      reason: "CHAPTER_ORCHESTRATION_PARENT_EXCLUDED_FROM_STANDARD_RECOVERY",
    });
    await expect(bindProjectRenderDispatchFromSignedProofV1({
      authorization: {},
      job: compatibilityChapterAdmission,
      ...PROVIDER_TUPLE,
    })).resolves.toEqual({
      ok: false,
      reason: "CHAPTER_ADMISSION_ID_EXCLUDED_FROM_STANDARD_RECOVERY",
    });
    expect(recoveryMocks.bindProjectRenderDispatchRecoveryTransactionV1).not.toHaveBeenCalled();

    const sweep = await sweepProjectRenderDispatchRecoveryV1({
      // Return adversarial chapter rows even though Mongo must exclude them;
      // the classifier guard proves they cannot reach the binder if a stale
      // query or test double violates the filter contract.
      collection: makeCollection(
        [futureChapterParent, compatibilityChapterAdmission, standardJob],
        (filter) => { recoveryFilter = filter; },
      ),
      limit: 3,
      bindProviderTuple: bind,
    });

    expect(recoveryFilter).toMatchObject({
      _id: { $not: /^chr_/ },
      "chapterOrchestration.scope": { $ne: "CHAPTER_ORCHESTRATION" },
    });
    expect(sweep).toMatchObject({
      scanned: 3,
      provable: 1,
      bound: 1,
      quarantined: 0,
      skipped: 2,
      errors: 0,
    });
    expect(sweep.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        disposition: "NOT_ELIGIBLE",
        reason: "CHAPTER_ORCHESTRATION_PARENT_EXCLUDED_FROM_STANDARD_RECOVERY",
      }),
      expect.objectContaining({
        jobId: "chr_123456789012",
        disposition: "NOT_ELIGIBLE",
        reason: "CHAPTER_ADMISSION_ID_EXCLUDED_FROM_STANDARD_RECOVERY",
      }),
      expect.objectContaining({
        jobId: JOB_ID,
        disposition: "BOUND_FROM_PROVIDER_TUPLE",
      }),
    ]));
    expect(bind).toHaveBeenCalledOnce();
    expect(bind).toHaveBeenCalledWith(expect.objectContaining({
      authorization: expect.objectContaining({ jobId: JOB_ID }),
      providerTuple: PROVIDER_TUPLE,
    }));

    const admissionFindOne = vi.fn(async () => null);
    const admissionCollection = {
      findOne: admissionFindOne,
    } as unknown as Collection<RenderJob>;
    await expect(getProjectRenderDispatchAdmissionProofV1({
      jobId: "chr_123456789012",
      expectedBindingHash: "0".repeat(64),
      collection: admissionCollection,
    })).resolves.toBeNull();
    expect(admissionFindOne).not.toHaveBeenCalled();
    await expect(getProjectRenderDispatchAdmissionProofV1({
      jobId: JOB_ID,
      expectedBindingHash: "0".repeat(64),
      collection: admissionCollection,
    })).resolves.toBeNull();
    expect(admissionFindOne).toHaveBeenCalledWith({
      _id: JOB_ID,
      "chapterOrchestration.scope": { $ne: "CHAPTER_ORCHESTRATION" },
    });
  });

  it("rejects token and split provider tuple evidence", () => {
    const tokenMismatch = makeJob("UNKNOWN");
    tokenMismatch.dispatch!.attemptToken = "wrong-attempt-token";
    expect(classifyProjectRenderDispatchRecoveryV1(tokenMismatch)).toMatchObject({
      disposition: "INVALID_STRICT_ROW",
      reason: "RENDER_DISPATCH_ATTEMPT_TOKEN_MISMATCH",
    });

    const tupleMismatch = makeJob("UNKNOWN", PROVIDER_TUPLE);
    tupleMismatch.providerRenderId = "different-provider";
    expect(classifyProjectRenderDispatchRecoveryV1(tupleMismatch)).toMatchObject({
      disposition: "INVALID_STRICT_ROW",
      reason: "RENDER_DISPATCH_PROVIDER_TUPLE_MISMATCH",
    });
  });

  it("requires exact signed callback proof before binding", async () => {
    const job = makeJob("UNKNOWN");
    const authorization = authorizationFor(job);
    const valid = validateSignedProjectRenderDispatchProofV1({
      authorization,
      job,
      providerRenderId: PROVIDER_TUPLE.providerRenderId,
      bucketName: PROVIDER_TUPLE.bucketName,
      region: PROVIDER_TUPLE.region,
    });
    expect(valid).toMatchObject({ ok: true, providerTuple: PROVIDER_TUPLE });

    expect(validateSignedProjectRenderDispatchProofV1({
      authorization,
      job,
      attemptToken: "wrong-attempt-token",
      ...PROVIDER_TUPLE,
    })).toEqual({ ok: false, reason: "ATTEMPT_TOKEN_MISMATCH" });
    expect(validateSignedProjectRenderDispatchProofV1({
      authorization,
      job,
      ...PROVIDER_TUPLE,
      region: "eu-west-1",
    })).toEqual({ ok: false, reason: "PROVIDER_REGION_MISMATCH" });

    recoveryMocks.bindProjectRenderDispatchRecoveryTransactionV1.mockResolvedValueOnce({
      ok: true,
      status: "BOUND",
    });
    await expect(bindProjectRenderDispatchFromSignedProofV1({
      authorization,
      job,
      ...PROVIDER_TUPLE,
    })).resolves.toEqual({ ok: true, state: "BOUND" });
    expect(recoveryMocks.bindProjectRenderDispatchRecoveryTransactionV1).toHaveBeenCalledWith({
      authorization,
      attemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
      ...PROVIDER_TUPLE,
      proofSource: "SIGNED_CALLBACK",
    });
  });

  it("protects and bounds the recovery cron", async () => {
    vi.stubEnv("CRON_SECRET", "recovery-cron-secret");
    const runner = vi.fn(async (input: { limit: number }) => {
      expect(input).toEqual({ limit: 5 });
      return {
        scanned: 1,
        provable: 0,
        bound: 0,
        quarantined: 1,
        skipped: 0,
        errors: 0,
        results: [],
      };
    });
    const request = (authorization?: string) => new Request("https://app.example.test/api/cron/recover", {
      headers: authorization ? { authorization } : undefined,
    });

    await expect(handleProjectRenderDispatchRecoveryCronV1(
      request("Bearer recovery-cron-secret"),
      runner,
    )).resolves.toMatchObject({ status: 200 });
    expect(runner).toHaveBeenCalledWith({ limit: 5 });

    await expect(handleProjectRenderDispatchRecoveryCronV1(
      request("Bearer wrong"),
      runner,
    )).resolves.toMatchObject({ status: 401 });

    vi.stubEnv("CRON_SECRET", "");
    await expect(handleProjectRenderDispatchRecoveryCronV1(
      request("Bearer recovery-cron-secret"),
      runner,
    )).resolves.toMatchObject({ status: 503 });

    const configuration = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: "/api/cron/recover-editron-render-dispatch",
      schedule: "*/5 * * * *",
    });
    const mongoSource = readFileSync(
      resolve(REPO_ROOT, "lib/editron/db/mongodb.ts"),
      "utf8",
    );
    expect(mongoSource).toContain("dispatch_recovery_attempt_job");
  });
});
