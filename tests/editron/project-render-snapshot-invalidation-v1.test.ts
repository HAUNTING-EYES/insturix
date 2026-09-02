import { describe, expect, it } from "vitest";

import {
  activateProjectRenderSnapshotInvalidationOutboxV1,
  applyProjectRenderSnapshotInvalidationProgressV1,
  assertProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationReceiptV1,
  enqueueProjectRenderSnapshotInvalidationOutboxV1,
  projectRenderSnapshotInvalidationLinkV1,
  replaceProjectRenderSnapshotInvalidationOutboxV1,
  type ProjectRenderSnapshotInvalidationOutboxCollectionV1,
  type ProjectRenderSnapshotInvalidationOutboxV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-v1";

const ISSUED_AT = new Date("2026-09-02T00:00:00.000Z");

function revision(value: number, timestamp: string) {
  return {
    schemaVersion: 1 as const,
    value,
    compatibilityUpdatedAt: timestamp,
  };
}

function receipt() {
  return createProjectRenderSnapshotInvalidationReceiptV1({
    ownerId: "user-1",
    projectId: "project-1",
    operation: "REPLACE_EDITOR_STATE",
    beforeRevision: revision(7, "2026-09-01T23:59:59.000Z"),
    afterRevision: revision(8, ISSUED_AT.toISOString()),
    issuedAt: ISSUED_AT,
  });
}

class MemoryOutboxCollection implements ProjectRenderSnapshotInvalidationOutboxCollectionV1 {
  readonly documents = new Map<string, ProjectRenderSnapshotInvalidationOutboxV1>();
  insertRace = false;

  async findOne(filter: Record<string, unknown>) {
    const document = this.documents.get(String(filter._id));
    return document ? structuredClone(document) : null;
  }

  async insertOne(document: ProjectRenderSnapshotInvalidationOutboxV1) {
    this.documents.set(document.outboxId, structuredClone(document));
    if (this.insertRace) throw new Error("duplicate key");
    return { acknowledged: true };
  }

  async replaceOne(
    filter: Record<string, unknown>,
    replacement: ProjectRenderSnapshotInvalidationOutboxV1,
  ) {
    const current = this.documents.get(String(filter._id));
    if (!current || current.outboxHash !== filter.outboxHash) return { matchedCount: 0 };
    this.documents.set(replacement.outboxId, structuredClone(replacement));
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

describe("project render snapshot invalidation V1", () => {
  it("issues a deterministic project-wide receipt and inert durable outbox", () => {
    const first = receipt();
    const second = receipt();
    expect(first).toEqual(second);
    expect(first.receiptId).toBe(`project-snapshot-invalidation_${first.receiptHash}`);
    expect(first.affectedDerivativeClasses).toEqual([
      "RENDERED_PREVIEW",
      "DELIVERY_PROOF",
    ]);

    const outbox = createProjectRenderSnapshotInvalidationOutboxV1(first);
    expect(outbox).toMatchObject({
      _id: first.receiptId,
      outboxId: first.receiptId,
      status: "AWAITING_PROJECT_COMMIT",
      resolvedDerivativeClasses: [],
      pendingDerivativeClasses: ["RENDERED_PREVIEW", "DELIVERY_PROOF"],
      attempts: 0,
    });
    expect(() => assertProjectRenderSnapshotInvalidationOutboxV1(outbox)).not.toThrow();
  });

  it("activates only from the exact committed timeline link", () => {
    const issued = receipt();
    const awaiting = createProjectRenderSnapshotInvalidationOutboxV1(issued);
    const beforeExpiry = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: awaiting,
      now: new Date("2026-09-02T00:04:59.000Z"),
    });
    expect(beforeExpiry).toEqual(awaiting);

    const wrongLink = {
      ...projectRenderSnapshotInvalidationLinkV1(issued),
      afterRevision: revision(9, ISSUED_AT.toISOString()),
    };
    expect(() => activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: awaiting,
      committedLink: wrongLink,
      now: new Date("2026-09-02T00:00:01.000Z"),
    })).toThrow("PROJECT_SNAPSHOT_INVALIDATION_COMMIT_LINK_MISMATCH");

    const active = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: awaiting,
      committedLink: projectRenderSnapshotInvalidationLinkV1(issued),
      now: new Date("2026-09-02T00:00:01.000Z"),
    });
    expect(active).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: active,
      committedLink: projectRenderSnapshotInvalidationLinkV1(issued),
    })).toEqual(active);
  });

  it("abandons an uncommitted record after the bounded activation window", () => {
    const abandoned = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: createProjectRenderSnapshotInvalidationOutboxV1(receipt()),
      now: new Date("2026-09-02T00:05:00.001Z"),
    });
    expect(abandoned).toMatchObject({
      status: "ABANDONED",
      resolvedDerivativeClasses: [],
      pendingDerivativeClasses: [],
      attempts: 1,
    });
    expect(() => applyProjectRenderSnapshotInvalidationProgressV1({
      outbox: abandoned,
      resolvedDerivativeClasses: ["RENDERED_PREVIEW"],
    })).toThrow("PROJECT_SNAPSHOT_INVALIDATION_NOT_ACTIVE");
  });

  it("tracks partial and complete materialization with idempotent terminal replay", () => {
    const issued = receipt();
    const active = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: createProjectRenderSnapshotInvalidationOutboxV1(issued),
      committedLink: projectRenderSnapshotInvalidationLinkV1(issued),
      now: new Date("2026-09-02T00:00:01.000Z"),
    });
    const partial = applyProjectRenderSnapshotInvalidationProgressV1({
      outbox: active,
      resolvedDerivativeClasses: ["RENDERED_PREVIEW"],
      now: new Date("2026-09-02T00:00:02.000Z"),
    });
    expect(partial).toMatchObject({
      status: "PENDING",
      resolvedDerivativeClasses: ["RENDERED_PREVIEW"],
      pendingDerivativeClasses: ["DELIVERY_PROOF"],
    });
    const complete = applyProjectRenderSnapshotInvalidationProgressV1({
      outbox: partial,
      resolvedDerivativeClasses: ["DELIVERY_PROOF"],
      now: new Date("2026-09-02T00:00:03.000Z"),
    });
    expect(complete).toMatchObject({
      status: "MATERIALIZED",
      resolvedDerivativeClasses: ["RENDERED_PREVIEW", "DELIVERY_PROOF"],
      pendingDerivativeClasses: [],
    });
    expect(applyProjectRenderSnapshotInvalidationProgressV1({
      outbox: complete,
      resolvedDerivativeClasses: ["DELIVERY_PROOF"],
    })).toEqual(complete);
  });

  it("recovers duplicate insertion and persists state changes with compare-and-set", async () => {
    const collection = new MemoryOutboxCollection();
    collection.insertRace = true;
    const awaiting = createProjectRenderSnapshotInvalidationOutboxV1(receipt());
    const enqueued = await enqueueProjectRenderSnapshotInvalidationOutboxV1({
      outbox: awaiting,
      collection,
    });
    expect(enqueued).toEqual(awaiting);

    const active = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: awaiting,
      committedLink: projectRenderSnapshotInvalidationLinkV1(awaiting.receipt),
      now: new Date("2026-09-02T00:00:01.000Z"),
    });
    const replaced = await replaceProjectRenderSnapshotInvalidationOutboxV1({
      expected: awaiting,
      next: active,
      collection,
    });
    expect(replaced.status).toBe("PENDING");
    expect((await collection.findOne({ _id: awaiting.outboxId }))?.outboxHash)
      .toBe(active.outboxHash);

    const stale = { ...active, attempts: active.attempts + 1 };
    expect(() => assertProjectRenderSnapshotInvalidationOutboxV1(stale)).toThrow(
      "PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_HASH_MISMATCH",
    );
  });
});
