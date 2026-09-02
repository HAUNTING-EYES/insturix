import type { ClientSession, Collection } from "mongodb";
import { describe, expect, it } from "vitest";

import {
  createPendingRenderJob,
  createRenderJobChapterOrchestrationV1,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import { createProjectRenderSnapshotBindingV1 } from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  createProjectRenderSnapshotInvalidationReceiptV1,
  projectRenderSnapshotInvalidationLinkV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-v1";
import { materializeProjectRenderSnapshotInvalidationCleanupV1 } from "@/lib/editron/services/project-render-snapshot-invalidation-cleanup-v1";
import type { ProjectRenderSourceCleanupOutboxV1 } from "@/lib/editron/services/project-render-source-cleanup-v1";

const NOW = new Date("2026-09-02T01:00:00.000Z");
const EXPIRES = new Date("2026-09-08T01:00:00.000Z");
const BEFORE = {
  schemaVersion: 1 as const,
  value: 10,
  compatibilityUpdatedAt: "2026-09-02T00:58:00.000Z",
};
const AFTER = {
  schemaVersion: 1 as const,
  value: 11,
  compatibilityUpdatedAt: "2026-09-02T00:59:00.000Z",
};

function receipt() {
  return createProjectRenderSnapshotInvalidationReceiptV1({
    ownerId: "owner-1",
    projectId: "project-1",
    operation: "REPLACE_EDITOR_STATE",
    beforeRevision: BEFORE,
    afterRevision: AFTER,
    issuedAt: new Date(AFTER.compatibilityUpdatedAt),
  });
}

function job(input: {
  state?: "STALE" | "HISTORY_ONLY";
  dispatch?: "NOT_ATTEMPTED" | "UNKNOWN";
  provider?: boolean;
  chapter?: boolean;
} = {}): RenderJob {
  const id = input.chapter ? "chr_abcdefghijkl" : "render-cleanup-1";
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: "DELIVERY_PROOF",
    artifactId: id,
    ownerId: "owner-1",
    projectId: "project-1",
    projectRevision: BEFORE,
    sequenceId: "main",
    compositionId: "Main",
    renderContract: { codec: "h264" },
    durationInFrames: 90,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSourceSnapshotHash: "a".repeat(64),
    containedVideoTargets: [],
  });
  const base = createPendingRenderJob(
    id,
    "owner-1",
    "project-1",
    "us-east-1",
    3_000,
    undefined,
    binding,
    "owner-1",
  );
  const requestedDispatch = input.dispatch ?? (input.chapter ? "NOT_ATTEMPTED" : undefined);
  const dispatch = requestedDispatch
    ? {
        version: 1 as const,
        phase: requestedDispatch,
        billingState: requestedDispatch === "UNKNOWN" ? "RECORDED" as const : "PENDING" as const,
        attemptToken: "attempt-1",
        creditIdempotencyKey: "credit-1",
        billingWallet: { type: "user" as const, clerkUserId: "owner-1" },
        ...(requestedDispatch === "UNKNOWN"
          ? {
              creditTransactionId: "credit-tx-1",
              attemptStartedAt: new Date("2026-09-02T00:57:00.000Z"),
              unknownReason: "provider outcome unknown",
            }
          : {}),
      }
    : undefined;
  const provider = input.provider
    ? {
        providerRenderId: "provider-render-1",
        bucketName: "editron-render-output",
        finalization: {
          version: "editron-render-finalization-v1" as const,
          state: "done" as const,
          sourceOutputUrl: "https://editron-render-output.s3.us-east-1.amazonaws.com/renders/provider-render-1/out.mp4",
          sourceOutputSize: 1_024,
          attempts: 1,
          completedAt: new Date("2026-09-02T00:57:30.000Z"),
        },
      }
    : {};
  return RenderJobSchema.parse({
    ...base,
    ...provider,
    ...(dispatch ? { dispatch } : {}),
    artifactState: input.state ?? "HISTORY_ONLY",
    artifactCleanup: { state: "PENDING", pendingArtifactIds: [id] },
    projectRenderSnapshotInvalidation: projectRenderSnapshotInvalidationLinkV1(receipt()),
    artifactInvalidatedAt: new Date("2026-09-02T00:59:30.000Z"),
    expiresAt: EXPIRES,
    ...(input.provider ? { status: "done", completedAt: new Date("2026-09-02T00:57:30.000Z") } : {}),
    ...(input.chapter
      ? {
          chapterOrchestration: createRenderJobChapterOrchestrationV1({
            aggregateJobId: id,
            bindingHash: binding.bindingHash,
            selectedRegion: "us-east-1",
            reservedAt: new Date("2026-09-02T00:55:00.000Z"),
          }),
        }
      : {}),
  });
}

class MemoryRenderJobs {
  constructor(public current: RenderJob) {}
  async findOne() { return structuredClone(this.current); }
  async updateOne(_filter: unknown, update: { $set?: Record<string, unknown> }) {
    Object.assign(this.current, structuredClone(update.$set ?? {}));
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

class MemoryCleanupOutboxes {
  readonly documents = new Map<string, ProjectRenderSourceCleanupOutboxV1>();
  async findOne(filter: Record<string, unknown>) {
    return structuredClone(this.documents.get(String(filter._id)) ?? null);
  }
  async updateOne(
    filter: Record<string, unknown>,
    update: { $setOnInsert?: ProjectRenderSourceCleanupOutboxV1 },
  ) {
    const id = String(filter._id);
    const existing = this.documents.get(id);
    if (existing) return { matchedCount: 1, upsertedCount: 0 };
    this.documents.set(id, structuredClone(update.$setOnInsert!));
    return { matchedCount: 0, upsertedCount: 1 };
  }
}

const session = { inTransaction: () => true } as unknown as ClientSession;

function input(renderJobs: MemoryRenderJobs, cleanupOutboxes: MemoryCleanupOutboxes) {
  return {
    receipt: receipt(),
    jobId: renderJobs.current._id,
    renderJobs: renderJobs as unknown as Collection<RenderJob>,
    cleanupOutboxes: cleanupOutboxes as unknown as Collection<ProjectRenderSourceCleanupOutboxV1>,
    session,
    now: NOW,
  };
}

describe("project render snapshot invalidation cleanup V1", () => {
  it("retains completed history until expiry before provider deletion", async () => {
    const renderJobs = new MemoryRenderJobs(job({ provider: true }));
    const cleanupOutboxes = new MemoryCleanupOutboxes();
    const result = await materializeProjectRenderSnapshotInvalidationCleanupV1(
      input(renderJobs, cleanupOutboxes),
    );
    expect(result).toMatchObject({
      disposition: "CLEANUP_HANDOFF_CREATED",
      retainedUntil: EXPIRES.toISOString(),
    });
    const outbox = [...cleanupOutboxes.documents.values()][0]!;
    expect(outbox.availableAt).toEqual(EXPIRES);
    expect(renderJobs.current.projectRenderSourceCleanupOutboxId).toBe(outbox._id);
    expect(RenderJobSchema.safeParse(renderJobs.current).success).toBe(true);
  });

  it("closes exact pre-provider stale work without inventing a provider deletion", async () => {
    const renderJobs = new MemoryRenderJobs(job({ state: "STALE", dispatch: "NOT_ATTEMPTED" }));
    const cleanupOutboxes = new MemoryCleanupOutboxes();
    const result = await materializeProjectRenderSnapshotInvalidationCleanupV1(
      input(renderJobs, cleanupOutboxes),
    );
    expect(result.disposition).toBe("CLEANUP_DONE");
    expect(renderJobs.current.artifactCleanup).toEqual({ state: "DONE", pendingArtifactIds: [] });
    expect(cleanupOutboxes.documents.size).toBe(0);
  });

  it("does not guess an unknown provider outcome", async () => {
    const renderJobs = new MemoryRenderJobs(job({ state: "STALE", dispatch: "UNKNOWN" }));
    const result = await materializeProjectRenderSnapshotInvalidationCleanupV1(
      input(renderJobs, new MemoryCleanupOutboxes()),
    );
    expect(result.disposition).toBe("PROVIDER_OUTCOME_UNRESOLVED");
    expect(renderJobs.current.artifactCleanup?.state).toBe("PENDING");
  });

  it("reconciles a completed delete receipt back to the render job", async () => {
    const renderJobs = new MemoryRenderJobs(job({ state: "STALE", provider: true }));
    const cleanupOutboxes = new MemoryCleanupOutboxes();
    const first = await materializeProjectRenderSnapshotInvalidationCleanupV1(
      input(renderJobs, cleanupOutboxes),
    );
    const outbox = cleanupOutboxes.documents.get(first.cleanupOutboxId!)!;
    cleanupOutboxes.documents.set(outbox._id, {
      ...outbox,
      status: "DONE",
      completion: { completedAt: NOW, freedBytes: 1_024 },
      updatedAt: NOW,
    });
    const reconciled = await materializeProjectRenderSnapshotInvalidationCleanupV1(
      input(renderJobs, cleanupOutboxes),
    );
    expect(reconciled.disposition).toBe("CLEANUP_DONE");
    expect(renderJobs.current.artifactCleanup?.state).toBe("DONE");
  });

  it("defers chapter parents and requires a transaction", async () => {
    const renderJobs = new MemoryRenderJobs(job({ chapter: true }));
    const cleanupOutboxes = new MemoryCleanupOutboxes();
    await expect(materializeProjectRenderSnapshotInvalidationCleanupV1(
      input(renderJobs, cleanupOutboxes),
    )).resolves.toMatchObject({ disposition: "CHAPTER_OWNER_REQUIRED" });
    await expect(materializeProjectRenderSnapshotInvalidationCleanupV1({
      ...input(renderJobs, cleanupOutboxes),
      session: { inTransaction: () => false } as unknown as ClientSession,
    })).rejects.toThrow("PROJECT_RENDER_SNAPSHOT_CLEANUP_TRANSACTION_REQUIRED");
  });
});
