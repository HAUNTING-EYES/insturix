import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPendingRenderJob,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import { createProjectRenderSnapshotBindingV1 } from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  fenceRenderJobsForProjectArtifactInvalidationV1,
  getCurrentRenderJobV1,
} from "@/lib/editron/services/render-job-service";
import { projectService } from "@/lib/editron/services/project-service";
import {
  createProjectArtifactBindingV1,
  createProjectArtifactInvalidationOutboxV1,
  createProjectArtifactInvalidationReceiptV1,
  applyProjectArtifactInvalidationProgressV1,
  canAuthorizeProjectArtifactInvalidationV1,
  enqueueProjectArtifactInvalidationOutboxV1,
  type ProjectArtifactInvalidationFenceV1,
  type ProjectArtifactInvalidationOutboxV1,
  type ProjectArtifactInvalidationOutboxCollectionV1,
  type ProjectArtifactTargetV1,
} from "@/lib/editron/services/project-artifact-invalidation-v1";
import {
  pipelineVideoDeliveryInvalidationAdmissionHashV1,
  pipelineVideoDeliveryInvalidationAdmissionKeyV1,
  type PipelineVideoDeliveryInvalidationAdmissionV1,
} from "@/lib/editron/services/pipeline-video-project-delivery-v1";

const databaseMocks = vi.hoisted(() => ({
  projectFindOne: vi.fn(),
  outboxFindOne: vi.fn(),
  outboxInsertOne: vi.fn(),
  outboxReplaceOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  connectToDatabase: vi.fn(),
  getDatabase: vi.fn(async () => ({
    collection: vi.fn((name: string) => name === "projects"
      ? { findOne: databaseMocks.projectFindOne }
      : {
          findOne: databaseMocks.outboxFindOne,
          insertOne: databaseMocks.outboxInsertOne,
          replaceOne: databaseMocks.outboxReplaceOne,
        }),
  })),
}));

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

const OWNER_ID = "owner-artifact-test";
const PROJECT_ID = "project-artifact-test";
const BEFORE_REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-08-31T00:00:00.000Z",
};
const AFTER_REVISION = {
  schemaVersion: 1 as const,
  value: 8,
  compatibilityUpdatedAt: "2026-08-31T00:01:00.000Z",
};
const TARGET: ProjectArtifactTargetV1 = {
  overlayId: 12,
  expectedAssetId: "asset-before",
  exactFrameRange: { startFrame: 30, endFrame: 180 },
  targetFingerprint: "a".repeat(64),
};
const ADMITTED_AT = "2026-08-31T00:01:00.000Z";
const EXPIRES_AT = "2026-08-31T00:16:00.000Z";

function makeAdmission(): PipelineVideoDeliveryInvalidationAdmissionV1 {
  const admissionId = `pipeline-video-invalidation_${pipelineVideoDeliveryInvalidationAdmissionKeyV1({
    projectId: PROJECT_ID,
    ownerId: OWNER_ID,
    expectedRevision: BEFORE_REVISION,
    target: TARGET,
  })}`;
  const unsigned = {
    required: true as const,
    status: "ADMITTED_ARTIFACT_CHAIN_PENDING" as const,
    admissionId,
    projectId: PROJECT_ID,
    ownerId: OWNER_ID,
    beforeRevision: BEFORE_REVISION,
    afterRevision: AFTER_REVISION,
    target: TARGET,
    affectedDerivativeClasses: ["RENDERED_PREVIEW", "DELIVERY_PROOF"] as const,
    admittedAt: ADMITTED_AT,
    expiresAt: EXPIRES_AT,
  };
  return {
    ...unsigned,
    admissionHash: pipelineVideoDeliveryInvalidationAdmissionHashV1(unsigned),
  };
}

function makeReceipt() {
  const admission = makeAdmission();
  return createProjectArtifactInvalidationReceiptV1({
    admissionId: admission.admissionId,
    admissionHash: admission.admissionHash,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    beforeRevision: BEFORE_REVISION,
    afterRevision: AFTER_REVISION,
    target: TARGET,
    affectedDerivativeClasses: admission.affectedDerivativeClasses,
  });
}

function makeProject(admission: PipelineVideoDeliveryInvalidationAdmissionV1) {
  return {
    projectId: PROJECT_ID,
    userId: OWNER_ID,
    name: "Artifact invalidation fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 240,
    createdAt: new Date(BEFORE_REVISION.compatibilityUpdatedAt),
    updatedAt: new Date(AFTER_REVISION.compatibilityUpdatedAt),
    projectRevision: AFTER_REVISION.value,
    visibility: "private" as const,
    pipelineVideoDeliveryInvalidationAdmissionsV1: [admission],
  };
}

function makeBinding(
  artifactKind: "RENDERED_PREVIEW" | "DELIVERY_PROOF",
  artifactId: string,
  target: ProjectArtifactTargetV1 = TARGET,
) {
  return createProjectArtifactBindingV1({
    artifactKind,
    artifactId,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: BEFORE_REVISION,
    target,
  });
}

function makeFence(
  binding: ReturnType<typeof makeBinding>,
  nextState: "STALE" | "HISTORY_ONLY" = "STALE",
): ProjectArtifactInvalidationFenceV1 {
  return {
    schemaVersion: 1,
    binding,
    priorState: "ACTIVE",
    nextState,
    cleanup: "PENDING",
    fencedAt: "2026-08-31T00:02:00.000Z",
  };
}

function makeBoundRenderJob(
  artifactKind: "RENDERED_PREVIEW" | "DELIVERY_PROOF",
  artifactId: string,
  status: RenderJob["status"] = "rendering",
): RenderJob {
  const base = createPendingRenderJob(
    artifactId,
    OWNER_ID,
    PROJECT_ID,
    "us-east-1",
    5_000,
    makeBinding(artifactKind, artifactId),
  );
  return RenderJobSchema.parse({
    ...base,
    status,
    ...(status === "done"
      ? {
          outputUrl: "https://media.example.test/done.mp4",
          outputSize: 100,
          completedAt: new Date("2026-08-31T00:03:00.000Z"),
        }
      : {}),
  });
}

function makeSnapshotRenderJob(
  artifactId: string,
  target: ProjectArtifactTargetV1,
): RenderJob {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: BEFORE_REVISION,
    sequenceId: "main",
    compositionId: "MainComposition",
    renderContract: { delivery: "review" },
    durationInFrames: 240,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { overlays: [{ id: target.overlayId }] },
    containedVideoTargets: [target],
  });
  return createPendingRenderJob(
    artifactId,
    OWNER_ID,
    PROJECT_ID,
    "us-east-1",
    8_000,
    undefined,
    binding,
    OWNER_ID,
  );
}

class MemoryOutboxCollection implements ProjectArtifactInvalidationOutboxCollectionV1 {
  readonly documents = new Map<string, ProjectArtifactInvalidationOutboxV1>();

  async findOne(filter: Record<string, unknown>) {
    const id = String(filter._id ?? filter.outboxId ?? "");
    const document = this.documents.get(id);
    if (!document) return null;
    if (filter.outboxHash !== undefined && filter.outboxHash !== document.outboxHash) return null;
    return structuredClone(document);
  }

  async insertOne(document: ProjectArtifactInvalidationOutboxV1) {
    if (this.documents.has(document.outboxId)) {
      const error = Object.assign(new Error("duplicate"), { code: 11000 });
      throw error;
    }
    this.documents.set(document.outboxId, structuredClone(document));
    return { acknowledged: true };
  }

  async replaceOne(filter: Record<string, unknown>, replacement: ProjectArtifactInvalidationOutboxV1) {
    const current = this.documents.get(String(filter._id ?? ""));
    if (!current || current.outboxHash !== filter.outboxHash) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    this.documents.set(replacement.outboxId, structuredClone(replacement));
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (
    current && typeof current === "object"
      ? (current as Record<string, unknown>)[key]
      : undefined
  ), value);
}

function matchesFilter(value: unknown, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$and") return (expected as Record<string, unknown>[]).every((part) => matchesFilter(value, part));
    if (key === "$or") return (expected as Record<string, unknown>[]).some((part) => matchesFilter(value, part));
    const actual = readPath(value, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const operator = expected as Record<string, unknown>;
      if ("$exists" in operator) return (actual !== undefined) === operator.$exists;
      if ("$in" in operator) return (operator.$in as unknown[]).includes(actual);
      return matchesFilter(actual, operator);
    }
    return actual === expected;
  });
}

class MemoryRenderCollection {
  constructor(
    readonly documents: RenderJob[],
    readonly blockedUpdateIds = new Set<string>(),
  ) {}

  find(filter: Record<string, unknown>) {
    return { toArray: async () => this.documents.filter((document) => matchesFilter(document, filter)) };
  }

  async findOne(filter: Record<string, unknown>) {
    return this.documents.find((document) => matchesFilter(document, filter)) ?? null;
  }

  async updateOne(filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) {
    const document = this.documents.find((candidate) => matchesFilter(candidate, filter));
    if (!document || this.blockedUpdateIds.has(document._id)) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    for (const [path, next] of Object.entries(update.$set ?? {})) {
      const parts = path.split(".");
      let cursor = document as unknown as Record<string, unknown>;
      for (const part of parts.slice(0, -1)) {
        cursor[part] = (cursor[part] as Record<string, unknown> | undefined) ?? {};
        cursor = cursor[part] as Record<string, unknown>;
      }
      cursor[parts.at(-1)!] = next;
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

describe("Project artifact invalidation V1", () => {
  beforeEach(() => {
    databaseMocks.projectFindOne.mockReset();
    databaseMocks.outboxFindOne.mockReset();
    databaseMocks.outboxInsertOne.mockReset();
    databaseMocks.outboxReplaceOne.mockReset();
  });

  it("keeps authorization pending until every exact derivative class is fenced", () => {
    const receipt = makeReceipt();
    const initial = createProjectArtifactInvalidationOutboxV1({
      receipt,
      now: new Date("2026-08-31T00:01:30.000Z"),
    });
    expect(canAuthorizeProjectArtifactInvalidationV1(initial)).toBe(false);

    const preview = applyProjectArtifactInvalidationProgressV1({
      outbox: initial,
      fences: [makeFence(makeBinding("RENDERED_PREVIEW", "preview-job-1"))],
      resolvedDerivativeClasses: ["RENDERED_PREVIEW"],
      now: new Date("2026-08-31T00:02:00.000Z"),
    });
    expect(preview.status).toBe("PENDING");
    expect(preview.pendingDerivativeClasses).toEqual(["DELIVERY_PROOF"]);
    expect(preview.cleanup.pendingArtifactIds).toEqual(["preview-job-1"]);
    expect(canAuthorizeProjectArtifactInvalidationV1(preview)).toBe(false);

    const replay = applyProjectArtifactInvalidationProgressV1({
      outbox: preview,
      fences: [makeFence(makeBinding("RENDERED_PREVIEW", "preview-job-1"))],
      resolvedDerivativeClasses: ["RENDERED_PREVIEW"],
      now: new Date("2026-08-31T00:10:00.000Z"),
    });
    expect(replay.outboxHash).toBe(preview.outboxHash);
    expect(replay.attempts).toBe(preview.attempts);

    const materialized = applyProjectArtifactInvalidationProgressV1({
      outbox: preview,
      fences: [makeFence(makeBinding("DELIVERY_PROOF", "delivery-proof-1"), "HISTORY_ONLY")],
      resolvedDerivativeClasses: ["DELIVERY_PROOF"],
      now: new Date("2026-08-31T00:03:00.000Z"),
    });
    expect(materialized.status).toBe("MATERIALIZED");
    expect(materialized.pendingDerivativeClasses).toEqual([]);
    expect(materialized.cleanup.pendingArtifactIds).toEqual([
      "preview-job-1",
      "delivery-proof-1",
    ]);
    expect(canAuthorizeProjectArtifactInvalidationV1(materialized)).toBe(true);
  });

  it("rejects legacy current reads and fences only exact bound jobs while preserving history", async () => {
    const receipt = makeReceipt();
    const legacy = createPendingRenderJob("legacy-job-1", OWNER_ID, PROJECT_ID, "us-east-1", 5_000);
    const preview = makeBoundRenderJob("RENDERED_PREVIEW", "preview-job-2");
    const delivery = makeBoundRenderJob("DELIVERY_PROOF", "delivery-proof-2", "done");
    const collection = new MemoryRenderCollection([legacy, preview, delivery]);

    await expect(getCurrentRenderJobV1({
      binding: makeBinding("RENDERED_PREVIEW", "legacy-job-1"),
      collection: collection as never,
    })).resolves.toBeNull();

    const result = await fenceRenderJobsForProjectArtifactInvalidationV1({
      receipt,
      now: new Date("2026-08-31T00:04:00.000Z"),
      collection: collection as never,
    });
    expect(result.unresolvedArtifactIds).toEqual([]);
    expect(result.resolvedDerivativeClasses).toEqual(["RENDERED_PREVIEW", "DELIVERY_PROOF"]);
    expect(result.fencedArtifactIds).toEqual(["preview-job-2", "delivery-proof-2"]);
    expect(result.fences.map((fence) => fence.nextState)).toEqual(["STALE", "HISTORY_ONLY"]);
    expect(collection.documents[0]?.artifactBinding).toBeUndefined();
    expect(collection.documents[1]?.artifactState).toBe("STALE");
    expect(collection.documents[2]?.artifactState).toBe("HISTORY_ONLY");
    expect(collection.documents[2]?.status).toBe("done");

    await expect(getCurrentRenderJobV1({
      binding: makeBinding("RENDERED_PREVIEW", "preview-job-2"),
      collection: collection as never,
    })).resolves.toBeNull();
  });

  it("resolves classes only after the complete active scan has no unresolved rows", async () => {
    const receipt = makeReceipt();
    const blockedPreview = makeBoundRenderJob("RENDERED_PREVIEW", "blocked-preview");
    const delivery = makeBoundRenderJob("DELIVERY_PROOF", "scanned-delivery");
    const collection = new MemoryRenderCollection(
      [blockedPreview, delivery],
      new Set([blockedPreview._id]),
    );

    const result = await fenceRenderJobsForProjectArtifactInvalidationV1({
      receipt,
      collection: collection as never,
    });

    expect(result.fencedArtifactIds).toEqual(["scanned-delivery"]);
    expect(result.unresolvedArtifactIds).toEqual(["blocked-preview"]);
    expect(result.resolvedDerivativeClasses).toEqual(["DELIVERY_PROOF"]);
  });

  it("fences a whole-project snapshot only when its sealed target index contains the replacement", async () => {
    const receipt = makeReceipt();
    const matching = makeSnapshotRenderJob("snapshot-matching", TARGET);
    const unrelated = makeSnapshotRenderJob("snapshot-unrelated", {
      ...TARGET,
      overlayId: 99,
      expectedAssetId: "asset-unrelated",
      targetFingerprint: "b".repeat(64),
    });
    const collection = new MemoryRenderCollection([matching, unrelated]);

    const result = await fenceRenderJobsForProjectArtifactInvalidationV1({
      receipt,
      collection: collection as never,
    });

    expect(result.fencedArtifactIds).toEqual(["snapshot-matching"]);
    expect(result.unresolvedArtifactIds).toEqual([]);
    expect(result.resolvedDerivativeClasses).toEqual([
      "RENDERED_PREVIEW",
      "DELIVERY_PROOF",
    ]);
    expect(result.fences[0]).toMatchObject({
      binding: {
        artifactId: "snapshot-matching",
        target: TARGET,
      },
    });
    expect(collection.documents[0]).toMatchObject({
      artifactState: "STALE",
      artifactInvalidation: {
        receiptId: receipt.receiptId,
        receiptHash: receipt.receiptHash,
      },
    });
    expect(collection.documents[1]).toMatchObject({ artifactState: "ACTIVE" });
    expect(collection.documents[1]?.artifactInvalidation).toBeUndefined();
  });

  it("fails closed for forged receipts, wrong revisions, and wrong target evidence", () => {
    const receipt = makeReceipt();
    const outbox = createProjectArtifactInvalidationOutboxV1({ receipt });
    const wrongTarget = { ...TARGET, targetFingerprint: "b".repeat(64) };
    const mismatchedFence = makeFence(makeBinding("RENDERED_PREVIEW", "preview-job-3", wrongTarget));
    expect(() => applyProjectArtifactInvalidationProgressV1({
      outbox,
      fences: [mismatchedFence],
    })).toThrow("PROJECT_ARTIFACT_INVALIDATION_FENCE_SCOPE_MISMATCH");

    const wrongRevision = {
      ...makeBinding("RENDERED_PREVIEW", "preview-job-4"),
      projectRevision: AFTER_REVISION,
    };
    expect(() => applyProjectArtifactInvalidationProgressV1({
      outbox,
      fences: [makeFence(wrongRevision as ReturnType<typeof makeBinding>)],
    })).toThrow("PROJECT_ARTIFACT_INVALIDATION_FENCE_SCOPE_MISMATCH");

    const forgedReceipt = { ...receipt, admissionHash: "f".repeat(64) };
    expect(() => createProjectArtifactInvalidationOutboxV1({
      receipt: forgedReceipt,
    })).toThrow("PROJECT_ARTIFACT_INVALIDATION_RECEIPT_HASH_MISMATCH");
  });

  it("uses deterministic outbox identity and refuses forged replay or premature completion", async () => {
    const receipt = makeReceipt();
    const outbox = createProjectArtifactInvalidationOutboxV1({ receipt });
    const collection = new MemoryOutboxCollection();
    const first = await enqueueProjectArtifactInvalidationOutboxV1({ outbox, collection });
    const second = await enqueueProjectArtifactInvalidationOutboxV1({ outbox, collection });
    expect(first.disposition).toBe("ENQUEUED");
    expect(second.disposition).toBe("ALREADY_ENQUEUED");
    expect(second.outbox.outboxHash).toBe(first.outbox.outboxHash);
    expect(canAuthorizeProjectArtifactInvalidationV1(second.outbox)).toBe(false);

    const forged = {
      ...outbox,
      receipt: { ...receipt, projectId: "other-project" },
    } as ProjectArtifactInvalidationOutboxV1;
    await expect(enqueueProjectArtifactInvalidationOutboxV1({
      outbox: forged,
      collection,
    })).rejects.toThrow();
  });

  it("keeps ProjectService authorization pending, then accepts only current-revision owner progress", async () => {
    const admission = makeAdmission();
    const project = makeProject(admission);
    const collection = new MemoryOutboxCollection();
    databaseMocks.projectFindOne.mockResolvedValue(project);
    databaseMocks.outboxFindOne.mockImplementation((filter: Record<string, unknown>) => collection.findOne(filter));
    databaseMocks.outboxInsertOne.mockImplementation((document: ProjectArtifactInvalidationOutboxV1) => (
      collection.insertOne(document)
    ));
    databaseMocks.outboxReplaceOne.mockImplementation((
      filter: Record<string, unknown>,
      document: ProjectArtifactInvalidationOutboxV1,
    ) => collection.replaceOne(filter, document));

    const admitted = await projectService.enqueuePipelineVideoArtifactInvalidationV1(
      OWNER_ID,
      PROJECT_ID,
      admission,
    );
    expect(admitted.disposition).toBe("ENQUEUED");
    expect(canAuthorizeProjectArtifactInvalidationV1(admitted.outbox)).toBe(false);

    const previewProgress = await projectService.advancePipelineVideoArtifactInvalidationV1(
      OWNER_ID,
      PROJECT_ID,
      {
        outboxId: admitted.outbox.outboxId,
        receiptHash: admitted.outbox.receipt.receiptHash,
        fences: [makeFence(makeBinding("RENDERED_PREVIEW", "preview-project-service"))],
        resolvedDerivativeClasses: ["RENDERED_PREVIEW"],
      },
    );
    expect(previewProgress.disposition).toBe("APPLIED");
    expect(previewProgress.outbox.status).toBe("PENDING");
    expect(canAuthorizeProjectArtifactInvalidationV1(previewProgress.outbox)).toBe(false);

    const completed = await projectService.advancePipelineVideoArtifactInvalidationV1(
      OWNER_ID,
      PROJECT_ID,
      {
        outboxId: admitted.outbox.outboxId,
        receiptHash: admitted.outbox.receipt.receiptHash,
        fences: [makeFence(makeBinding("DELIVERY_PROOF", "delivery-project-service"), "HISTORY_ONLY")],
        resolvedDerivativeClasses: ["DELIVERY_PROOF"],
      },
    );
    expect(completed.outbox.status).toBe("MATERIALIZED");
    expect(canAuthorizeProjectArtifactInvalidationV1(completed.outbox)).toBe(true);

    const replay = await projectService.advancePipelineVideoArtifactInvalidationV1(
      OWNER_ID,
      PROJECT_ID,
      {
        outboxId: admitted.outbox.outboxId,
        receiptHash: admitted.outbox.receipt.receiptHash,
        fences: [makeFence(makeBinding("DELIVERY_PROOF", "delivery-project-service"), "HISTORY_ONLY")],
        resolvedDerivativeClasses: ["DELIVERY_PROOF"],
      },
    );
    expect(replay.disposition).toBe("ALREADY_APPLIED");
    expect(replay.outbox.outboxHash).toBe(completed.outbox.outboxHash);

    databaseMocks.projectFindOne.mockResolvedValue({
      ...project,
      projectRevision: AFTER_REVISION.value + 1,
      updatedAt: new Date("2026-08-31T00:02:00.000Z"),
    });
    await expect(projectService.advancePipelineVideoArtifactInvalidationV1(
      OWNER_ID,
      PROJECT_ID,
      {
        outboxId: admitted.outbox.outboxId,
        receiptHash: admitted.outbox.receipt.receiptHash,
        fences: [],
        resolvedDerivativeClasses: [],
      },
    )).rejects.toMatchObject({ reason: "INVALIDATION_UNVERIFIABLE" });
  });
});
