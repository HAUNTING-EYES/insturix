import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* outbox integration tests — same throwaway-db pattern as spine-db tests */
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_outbox"; // per-file throwaway db

const canRun = Boolean(process.env.MONGODB_URI);

const purge = async () => {
  for (const name of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
  }
};

describe.skipIf(!canRun)("durable outbox — parked events land in order, exactly once", () => {
  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      await purge();
      await mongoose.disconnect();
    }
  });

  it("enqueued events drain into the log oldest-first and don't duplicate on re-drain", { timeout: 30000 }, async () => {
    const { connectSpine, enqueueOutbox, drainOutbox, listEvents } = await import("@/lib/studio/persist/db");
    await connectSpine();
    const projectId = `proj_obx_${crypto.randomUUID().slice(0, 8)}`;

    const ok = await enqueueOutbox(projectId, { turnId: "t1", actor: "system", kind: "turn.plan", payload: { type: "turn.plan", turnId: "t1" } });
    await enqueueOutbox(projectId, { turnId: "t1", actor: "system", kind: "step.start", payload: { type: "step.start", turnId: "t1" } });
    await enqueueOutbox(projectId, { turnId: "t1", actor: "system", kind: "turn.done", payload: { type: "turn.done", turnId: "t1", summary: "done" } });
    expect(ok).toBe(true);

    const drained = await drainOutbox(projectId);
    expect(drained).toBe(3);
    const after = await listEvents(projectId, 0);
    expect(after.map((e) => e.kind)).toEqual(["turn.plan", "step.start", "turn.done"]);
    expect(after.map((e) => e.seq)).toEqual([1, 2, 3]); // true order, no gaps

    const redrain = await drainOutbox(projectId);
    expect(redrain).toBe(0); // exactly-once: drained entries are deleted
    const after2 = await listEvents(projectId, 0);
    expect(after2.length).toBe(3);
  });

  it("drained events keep true order AFTER events already in the log", { timeout: 30000 }, async () => {
    const { connectSpine, appendTurnEvent, enqueueOutbox, drainOutbox, listEvents } = await import("@/lib/studio/persist/db");
    await connectSpine();
    const projectId = `proj_obx_${crypto.randomUUID().slice(0, 8)}`;

    await appendTurnEvent(projectId, { turnId: null, actor: "user", kind: "user", payload: { kind: "user", text: "cut this" } });
    await enqueueOutbox(projectId, { turnId: "t1", actor: "system", kind: "turn.capability_gap", payload: { type: "turn.capability_gap", turnId: "t1", reason: "soon" } });
    await drainOutbox(projectId);
    const after = await listEvents(projectId, 0);
    expect(after.map((e) => e.kind)).toEqual(["user", "turn.capability_gap"]);
    expect(after.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("drain on an empty outbox is a no-op", { timeout: 30000 }, async () => {
    const { connectSpine, drainOutbox } = await import("@/lib/studio/persist/db");
    await connectSpine();
    expect(await drainOutbox(`proj_obx_empty_${crypto.randomUUID().slice(0, 8)}`)).toBe(0);
  });
});
