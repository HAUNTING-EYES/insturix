import type { Collection } from "mongodb";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({ getDatabase: vi.fn() }));

import { createPendingRenderJob, RenderJobSchema } from "@/lib/editron/schemas/render-job";
import type { ProjectArtifactProjectRevisionV1 } from "@/lib/editron/services/project-artifact-invalidation-v1";
import {
  migrateProjectRenderLifecycleV1,
  type ProjectRenderLifecycleMigrationDocumentV1,
} from "@/lib/editron/services/project-render-lifecycle-migration-v1";
import { createProjectRenderSnapshotBindingV1 } from "@/lib/editron/services/project-render-snapshot-binding-v1";

const NOW = new Date("2026-09-02T03:00:00.000Z");
const REVISION: ProjectArtifactProjectRevisionV1 = {
  schemaVersion: 1,
  value: 8,
  compatibilityUpdatedAt: "2026-09-02T02:59:00.000Z",
};
const JOB_ID = "legacy-project-render-1";
const OWNER_ID = "owner-1";
const REQUESTER_ID = "requester-1";
const PROJECT_ID = "project-1";

function binding() {
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: JOB_ID,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
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
}

function boundLegacy(): ProjectRenderLifecycleMigrationDocumentV1 {
  const job = createPendingRenderJob(
    JOB_ID,
    OWNER_ID,
    PROJECT_ID,
    "us-east-1",
    3_000,
    undefined,
    binding(),
    REQUESTER_ID,
  );
  const row = {
    ...job,
    deliveryManifest: {
      version: "editron-render-delivery-manifest-v1",
      mode: "embedded",
      createdAt: "2026-09-02T02:58:00.000Z",
      completedAt: null,
      primaryArtifact: {
        kind: "mixed-master",
        renderId: JOB_ID,
        status: "rendering",
        url: null,
      },
      music: { embedded: true, removedOverlayIds: [], handoff: null },
    },
  } as ProjectRenderLifecycleMigrationDocumentV1;
  delete row.artifactState;
  return row;
}

function unboundLegacy(): ProjectRenderLifecycleMigrationDocumentV1 {
  return createPendingRenderJob(
    "legacy-unbound-1",
    OWNER_ID,
    PROJECT_ID,
    "us-east-1",
    3_000,
  ) as ProjectRenderLifecycleMigrationDocumentV1;
}

class MemoryRows {
  writes = 0;

  constructor(public current: ProjectRenderLifecycleMigrationDocumentV1 | null) {}

  async findOne() {
    return this.current ? structuredClone(this.current) : null;
  }

  async updateOne(_filter: unknown, update: { $set: Record<string, unknown> }) {
    if (!this.current) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(this.current, structuredClone(update.$set));
    this.writes += 1;
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

function input(rows: MemoryRows, revision: unknown = REVISION) {
  return {
    jobId: rows.current!._id,
    collection: rows as unknown as Pick<
      Collection<ProjectRenderLifecycleMigrationDocumentV1>,
      "findOne" | "updateOne"
    >,
    projectRevisionReader: vi.fn(async () => revision),
    now: NOW,
  };
}

describe("project render lifecycle migration V1", () => {
  it("promotes only an exact bound row at the live project revision", async () => {
    const rows = new MemoryRows(boundLegacy());
    const result = await migrateProjectRenderLifecycleV1(input(rows));
    expect(result).toEqual({
      ok: true,
      status: "MIGRATED",
      disposition: "MIGRATED_ACTIVE",
    });
    expect(rows.current?.artifactState).toBe("ACTIVE");
    expect(RenderJobSchema.safeParse(rows.current).success).toBe(true);
    await expect(migrateProjectRenderLifecycleV1(input(rows))).resolves.toMatchObject({
      status: "ALREADY_MIGRATED",
    });
  });

  it("records unbound legacy rows without inventing a project snapshot", async () => {
    const rows = new MemoryRows(unboundLegacy());
    const first = await migrateProjectRenderLifecycleV1(input(rows));
    expect(first).toMatchObject({
      status: "BLOCKED",
      disposition: "BLOCKED_UNBOUND_LEGACY",
    });
    expect(rows.current?.artifactState).toBeUndefined();
    expect(rows.current?.projectRenderLifecycleMigration).toMatchObject({
      disposition: "BLOCKED_UNBOUND_LEGACY",
    });
    await expect(migrateProjectRenderLifecycleV1(input(rows))).resolves.toMatchObject({
      status: "ALREADY_ASSESSED",
    });
  });

  it("blocks a valid stored binding whose project revision is no longer current", async () => {
    const rows = new MemoryRows(boundLegacy());
    const result = await migrateProjectRenderLifecycleV1(input(rows, {
      ...REVISION,
      value: REVISION.value + 1,
    }));
    expect(result).toMatchObject({
      status: "BLOCKED",
      disposition: "BLOCKED_PROJECT_REVISION_STALE",
    });
    expect(rows.current?.artifactState).toBeUndefined();
  });

  it("blocks forged contracts and fails loud on partial lifecycle or lost CAS", async () => {
    const forged = boundLegacy();
    forged.projectRenderSnapshotBinding = {
      ...(forged.projectRenderSnapshotBinding as Record<string, unknown>),
      bindingHash: "f".repeat(64),
    };
    const forgedRows = new MemoryRows(forged);
    await expect(migrateProjectRenderLifecycleV1(input(forgedRows))).resolves.toMatchObject({
      disposition: "BLOCKED_CONTRACT_INVALID",
    });

    const missingRequester = boundLegacy();
    delete missingRequester.requestedByUserId;
    await expect(migrateProjectRenderLifecycleV1(input(new MemoryRows(missingRequester))))
      .resolves.toMatchObject({ disposition: "BLOCKED_CONTRACT_INVALID" });

    const partial = boundLegacy();
    partial.artifactCleanup = { state: "PENDING", pendingArtifactIds: [JOB_ID] };
    await expect(migrateProjectRenderLifecycleV1(input(new MemoryRows(partial))))
      .rejects.toThrow("PROJECT_RENDER_LIFECYCLE_MIGRATION_LIFECYCLE_CONFLICT");

    const lost = new MemoryRows(unboundLegacy());
    lost.updateOne = vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 }));
    await expect(migrateProjectRenderLifecycleV1(input(lost)))
      .rejects.toThrow("PROJECT_RENDER_LIFECYCLE_MIGRATION_WRITE_UNPROVED");
  });
});
