import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §11 "use this" — the simulated user selects a candidate: the route must
 * verify the artifact belongs to the project's log AND the candidate is a
 * real variation in the caller's Clickatron session BEFORE persisting the
 * selection to the spine. Throwaway per-file db; only auth is mocked. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_sel";
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));

const SESSION_ID = "507f1f77bcf86cd799439011";
const PROJECT = "proj_sel_sim";
const ART = "art_cv_sim";

const postSelect = (artifactId: string, body: unknown) =>
  new Request(`http://local/api/studio/artifacts/${artifactId}/select`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe.skipIf(!canRun)("simulated user — §11 candidate selection", () => {
  let POST: typeof import("@/app/api/studio/artifacts/[artifactId]/select/route").POST;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/studio/artifacts/[artifactId]/select/route"));
    const { connectSpine, getOrCreateProject, appendTurnEvent } = await import("@/lib/studio/persist/db");
    const { ClickatronTask } = await import("@/schemas/Clickatron");
    const { getClickatronDb } = await import("@/lib/clickatron-mongo");

    const now = new Date().toISOString();
    await connectSpine();
    await getOrCreateProject({ projectId: PROJECT, organizationId: "org_sim_1", brandId: "br_sim", title: "Design sim" });
    await appendTurnEvent(PROJECT, {
      actor: "system",
      kind: "turn.done",
      turnId: "t1",
      payload: {
        type: "turn.done",
        turnId: "t1",
        summary: "canvas live",
        artifactIds: [ART],
        artifactPayload: {
          id: ART,
          kind: "image_canvas",
          status: "running",
          title: "Canvas",
          sourceRef: { engine: "clickatron", externalId: SESSION_ID, manualHref: null },
          revisions: [],
          updatedAt: now,
          createdAt: now,
        },
      },
    });
    await getClickatronDb();
    await ClickatronTask.create({
      _id: new mongoose.Types.ObjectId(SESSION_ID),
      clerkUserId: "user_sim_1",
      title: "sim canvas",
      status: "active",
      details: {
        videoIdea: "launch visual",
        aspectRatio: "16:9",
        canvas: {
          variations: [
            { id: "var_good", status: "completed", imageRef: "https://r2.example/var_good.png", modelId: "fal-ai/flux-2/flash", aspectRatio: "16:9" },
            { id: "var_still_generating", status: "generating", modelId: "fal-ai/flux-2/flash", aspectRatio: "16:9" },
          ],
          chatHistory: [],
        },
      },
    });
  });

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it("persists the selection — and a reload rebuilds it onto the artifact (§3 + §11)", async () => {
    const res = await POST(postSelect(ART, { projectId: PROJECT, candidateId: "var_good" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean; candidateId: string })).toMatchObject({ ok: true, candidateId: "var_good" });

    const { listEvents } = await import("@/lib/studio/persist/db");
    const { artifactsFromEvents } = await import("@/lib/studio/persist/replay");
    const log = await listEvents(PROJECT, 0);
    expect(log.some((e) => e.kind === "artifact.selected")).toBe(true);
    const rebuilt = artifactsFromEvents(log).find((a) => a.id === ART);
    expect(rebuilt?.selectedCandidateId).toBe("var_good");
  });

  it("re-selecting just records the newest choice (idempotent semantics, no job spawned)", async () => {
    const res = await POST(postSelect(ART, { projectId: PROJECT, candidateId: "var_still_generating" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(200);
    const { listEvents, } = await import("@/lib/studio/persist/db");
    const { artifactsFromEvents } = await import("@/lib/studio/persist/replay");
    const rebuilt = artifactsFromEvents(await listEvents(PROJECT, 0)).find((a) => a.id === ART);
    expect(rebuilt?.selectedCandidateId).toBe("var_still_generating");
  });

  it("a candidate the engine never made is refused (404, nothing persisted)", async () => {
    const before = await (await import("@/lib/studio/persist/db")).listEvents(PROJECT, 0);
    const res = await POST(postSelect(ART, { projectId: PROJECT, candidateId: "var_ghost" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("candidate_not_found");
    const after = await (await import("@/lib/studio/persist/db")).listEvents(PROJECT, 0);
    expect(after.length).toBe(before.length);
  });

  it("another organization cannot select on this project (403)", async () => {
    sim.auth = { userId: "user_sim_2", orgId: "org_OTHER", has: async () => false };
    const res = await POST(postSelect(ART, { projectId: PROJECT, candidateId: "var_good" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(403);
    sim.auth = { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false };
  });

  it("an artifact id that is not in the project's log is refused (404)", async () => {
    const res = await POST(postSelect("art_ghost", { projectId: PROJECT, candidateId: "var_good" }), { params: Promise.resolve({ artifactId: "art_ghost" }) });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("artifact_not_in_project");
  });
});
