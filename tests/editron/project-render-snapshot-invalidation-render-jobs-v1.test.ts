import type { Collection } from "mongodb";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: vi.fn(),
}));

import {
  createPendingRenderJob,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import {
  fenceRenderJobsForProjectSnapshotInvalidationV1,
} from "@/lib/editron/services/render-job-service";
import {
  createProjectArtifactBindingV1,
  type ProjectArtifactProjectRevisionV1,
} from "@/lib/editron/services/project-artifact-invalidation-v1";
import {
  createProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  createProjectRenderSnapshotInvalidationReceiptV1,
  projectRenderSnapshotInvalidationLinkV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-v1";

const OWNER_ID = "snapshot-invalidation-owner";
const PROJECT_ID = "snapshot-invalidation-project";
const BEFORE_REVISION: ProjectArtifactProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: "2026-09-02T00:00:00.000Z",
};
const AFTER_REVISION: ProjectArtifactProjectRevisionV1 = {
  schemaVersion: 1,
  value: 8,
  compatibilityUpdatedAt: "2026-09-02T00:01:00.000Z",
};

function receipt() {
  return createProjectRenderSnapshotInvalidationReceiptV1({
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    operation: "REPLACE_EDITOR_STATE",
    beforeRevision: BEFORE_REVISION,
    afterRevision: AFTER_REVISION,
    issuedAt: new Date(AFTER_REVISION.compatibilityUpdatedAt),
  });
}

function snapshotBinding(
  artifactKind: "RENDERED_PREVIEW" | "DELIVERY_PROOF",
  artifactId: string,
  projectRevision: ProjectArtifactProjectRevisionV1 = BEFORE_REVISION,
) {
  return createProjectRenderSnapshotBindingV1({
    artifactKind,
    artifactId,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision,
    sequenceId: "sequence-1",
    compositionId: "composition-1",
    renderContract: { renderer: "remotion", codec: "h264" },
    durationInFrames: 180,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSourceSnapshotHash: "a".repeat(64),
    containedVideoTargets: [],
  });
}

function snapshotJob(
  artifactKind: "RENDERED_PREVIEW" | "DELIVERY_PROOF",
  artifactId: string,
  status: RenderJob["status"] = "rendering",
  projectRevision: ProjectArtifactProjectRevisionV1 = BEFORE_REVISION,
): RenderJob {
  const binding = snapshotBinding(artifactKind, artifactId, projectRevision);
  return RenderJobSchema.parse({
    ...createPendingRenderJob(
      artifactId,
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      6_000,
      undefined,
      binding,
      OWNER_ID,
    ),
    status,
    ...(status === "done"
      ? {
          outputUrl: `https://media.example.test/${artifactId}.mp4`,
          outputSize: 100,
          completedAt: new Date("2026-09-02T00:00:30.000Z"),
        }
      : {}),
  });
}

function overlayJob(artifactId: string): RenderJob {
  const binding = createProjectArtifactBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: BEFORE_REVISION,
    target: {
      overlayId: 1,
      expectedAssetId: "asset-1",
      exactFrameRange: { startFrame: 0, endFrame: 30 },
      targetFingerprint: "b".repeat(64),
    },
  });
  return createPendingRenderJob(
    artifactId,
    OWNER_ID,
    PROJECT_ID,
    "us-east-1",
    1_000,
    binding,
  );
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
    if (key === "$or") {
      return (expected as Record<string, unknown>[])
        .some((part) => matchesFilter(value, part));
    }
    const actual = readPath(value, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const operator = expected as Record<string, unknown>;
      if ("$exists" in operator) return (actual !== undefined) === operator.$exists;
      if ("$in" in operator) return (operator.$in as unknown[]).includes(actual);
    }
    return actual === expected;
  });
}

class MemoryRenderCollection {
  constructor(
    readonly documents: RenderJob[],
    readonly blockAfterWriteIds = new Set<string>(),
    readonly blockBeforeWriteIds = new Set<string>(),
  ) {}

  find(filter: Record<string, unknown>) {
    return {
      toArray: async () => this.documents.filter((document) => matchesFilter(document, filter)),
    };
  }

  async findOne(filter: Record<string, unknown>) {
    return this.documents.find((document) => matchesFilter(document, filter)) ?? null;
  }

  async updateOne(filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) {
    const document = this.documents.find((candidate) => matchesFilter(candidate, filter));
    if (!document || this.blockBeforeWriteIds.has(document._id)) {
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
    return this.blockAfterWriteIds.has(document._id)
      ? { matchedCount: 0, modifiedCount: 0 }
      : { matchedCount: 1, modifiedCount: 1 };
  }
}

describe("project render snapshot invalidation render-job materializer V1", () => {
  it("fences exact pre-change snapshot renders and preserves terminal history", async () => {
    const preview = snapshotJob("RENDERED_PREVIEW", "preview-before");
    const delivery = snapshotJob("DELIVERY_PROOF", "delivery-before", "done");
    const collection = new MemoryRenderCollection([preview, delivery]);

    const result = await fenceRenderJobsForProjectSnapshotInvalidationV1({
      receipt: receipt(),
      now: new Date("2026-09-02T00:02:00.000Z"),
      collection: collection as unknown as Collection<RenderJob>,
    });

    expect(result.fencedArtifactIds).toEqual(["preview-before", "delivery-before"]);
    expect(result.unresolvedArtifactIds).toEqual([]);
    expect(result.resolvedDerivativeClasses).toEqual(["RENDERED_PREVIEW", "DELIVERY_PROOF"]);
    expect(collection.documents.map((job) => job.artifactState)).toEqual(["STALE", "HISTORY_ONLY"]);
    expect(collection.documents[0]?.projectRenderSnapshotInvalidation)
      .toEqual(projectRenderSnapshotInvalidationLinkV1(receipt()));
  });

  it("leaves another project revision untouched", async () => {
    const laterRevision = { ...AFTER_REVISION, value: 9 };
    const later = snapshotJob("RENDERED_PREVIEW", "preview-later", "rendering", laterRevision);
    const collection = new MemoryRenderCollection([later]);

    const result = await fenceRenderJobsForProjectSnapshotInvalidationV1({
      receipt: receipt(),
      collection: collection as unknown as Collection<RenderJob>,
    });

    expect(result.fencedArtifactIds).toEqual([]);
    expect(result.resolvedDerivativeClasses).toEqual(["RENDERED_PREVIEW", "DELIVERY_PROOF"]);
    expect(later.artifactState).toBe("ACTIVE");
  });

  it("does not claim resolution for legacy, single-overlay, or lost-CAS rows", async () => {
    const legacy = createPendingRenderJob(
      "legacy-unbound",
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      1_000,
    );
    const overlay = overlayJob("overlay-preview");
    const blocked = snapshotJob("DELIVERY_PROOF", "blocked-delivery");
    const collection = new MemoryRenderCollection(
      [legacy, overlay, blocked],
      undefined,
      new Set([blocked._id]),
    );

    const result = await fenceRenderJobsForProjectSnapshotInvalidationV1({
      receipt: receipt(),
      collection: collection as unknown as Collection<RenderJob>,
    });

    expect(result.fencedArtifactIds).toEqual([]);
    expect(result.unresolvedArtifactIds).toEqual([
      "legacy-unbound",
      "overlay-preview",
      "blocked-delivery",
    ]);
    expect(result.resolvedDerivativeClasses).toEqual([]);
  });

  it("accepts an exact write that won the race before matchedCount was observed", async () => {
    const job = snapshotJob("RENDERED_PREVIEW", "raced-preview");
    const collection = new MemoryRenderCollection([job], new Set([job._id]));
    const result = await fenceRenderJobsForProjectSnapshotInvalidationV1({
      receipt: receipt(),
      collection: collection as unknown as Collection<RenderJob>,
    });

    expect(result.fencedArtifactIds).toEqual(["raced-preview"]);
    expect(result.unresolvedArtifactIds).toEqual([]);
    expect(job.artifactState).toBe("STALE");
  });

  it("rejects invalid project-snapshot invalidation persistence combinations", () => {
    const job = snapshotJob("RENDERED_PREVIEW", "schema-preview");
    const link = projectRenderSnapshotInvalidationLinkV1(receipt());
    const fenced = {
      ...job,
      artifactState: "STALE" as const,
      artifactCleanup: { state: "PENDING" as const, pendingArtifactIds: [job._id] },
      projectRenderSnapshotInvalidation: link,
      artifactInvalidatedAt: new Date("2026-09-02T00:02:00.000Z"),
    };
    expect(RenderJobSchema.safeParse(fenced).success).toBe(true);
    expect(RenderJobSchema.safeParse({ ...fenced, artifactState: "ACTIVE" }).success).toBe(false);
    expect(RenderJobSchema.safeParse({
      ...fenced,
      projectRenderSnapshotBinding: undefined,
    }).success).toBe(false);
    expect(RenderJobSchema.safeParse({
      ...fenced,
      projectRenderSnapshotBinding: snapshotBinding(
        "RENDERED_PREVIEW",
        job._id,
        AFTER_REVISION,
      ),
    }).success).toBe(false);
  });
});
