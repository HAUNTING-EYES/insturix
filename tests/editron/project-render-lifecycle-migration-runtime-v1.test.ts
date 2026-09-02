import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({ getDatabase: vi.fn() }));

import { handleProjectRenderLifecycleMigrationCronV1 } from "@/app/api/cron/migrate-editron-project-renders/route";
import {
  runProjectRenderLifecycleMigrationBatchV1,
  type ProjectRenderLifecycleMigrationBatchResultV1,
  type ProjectRenderLifecycleMigrationBatchStoreV1,
} from "@/lib/editron/services/project-render-lifecycle-migration-runtime-v1";

const NOW = new Date("2026-09-02T04:00:00.000Z");
const REPO_ROOT = resolve(__dirname, "../..");

function request(secret?: string): Request {
  return new Request("https://example.test/api/cron/migrate-editron-project-renders", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("project render lifecycle migration runtime V1", () => {
  it("processes candidates serially and separates blocked rows from failures", async () => {
    const order: string[] = [];
    const migrate = vi.fn(async (jobId: string) => {
      order.push(jobId);
      if (jobId === "render-a") {
        return { ok: true as const, status: "MIGRATED" as const, disposition: "MIGRATED_ACTIVE" as const };
      }
      if (jobId === "render-b") {
        return { ok: true as const, status: "BLOCKED" as const, disposition: "BLOCKED_UNBOUND_LEGACY" as const };
      }
      throw new Error("private database detail");
    });
    const store: ProjectRenderLifecycleMigrationBatchStoreV1 = {
      listCandidateIds: vi.fn(async () => ["render-a", "render-b", "render-c"]),
      migrate,
    };
    await expect(runProjectRenderLifecycleMigrationBatchV1({
      store,
      limit: 3,
      now: NOW,
    })).resolves.toEqual({
      candidates: 3,
      migrated: 1,
      blocked: 1,
      alreadyAssessed: 0,
      missing: 0,
      failed: 1,
      results: [
        { jobId: "render-a", state: "MIGRATED" },
        { jobId: "render-b", state: "BLOCKED" },
        { jobId: "render-c", state: "FAILED" },
      ],
    });
    expect(order).toEqual(["render-a", "render-b", "render-c"]);
  });

  it("protects the cron and retries only infrastructure failures", async () => {
    const result: ProjectRenderLifecycleMigrationBatchResultV1 = {
      candidates: 1,
      migrated: 0,
      blocked: 1,
      alreadyAssessed: 0,
      missing: 0,
      failed: 0,
      results: [{ jobId: "render-a", state: "BLOCKED" }],
    };
    const runner = vi.fn(async () => result);
    vi.stubEnv("CRON_SECRET", "migration-secret");
    expect((await handleProjectRenderLifecycleMigrationCronV1(request(), runner)).status).toBe(401);
    const success = await handleProjectRenderLifecycleMigrationCronV1(
      request("migration-secret"),
      runner,
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({ success: true, migration: result });
    runner.mockResolvedValueOnce({ ...result, blocked: 0, failed: 1 });
    const retry = await handleProjectRenderLifecycleMigrationCronV1(
      request("migration-secret"),
      runner,
    );
    expect(retry.status).toBe(503);
    expect(retry.headers.get("retry-after")).toBe("300");
  });

  it("fails closed on missing configuration/outage and registers production wiring", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const runner = vi.fn();
    expect((await handleProjectRenderLifecycleMigrationCronV1(request(), runner)).status).toBe(503);
    expect(runner).not.toHaveBeenCalled();

    vi.stubEnv("CRON_SECRET", "migration-secret");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runner.mockRejectedValueOnce(new Error("private database detail"));
    const outage = await handleProjectRenderLifecycleMigrationCronV1(
      request("migration-secret"),
      runner,
    );
    expect(outage.status).toBe(503);
    await expect(outage.json()).resolves.toEqual({
      success: false,
      error: { code: "PROJECT_RENDER_LIFECYCLE_MIGRATION_UNAVAILABLE" },
    });
    errorLog.mockRestore();

    const configuration = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: "/api/cron/migrate-editron-project-renders",
      schedule: "29 * * * *",
    });
    const mongo = readFileSync(resolve(REPO_ROOT, "lib/editron/db/mongodb.ts"), "utf8");
    expect(mongo).toContain("project_render_lifecycle_migration_candidates_v1");
  });
});
