import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mongoMocks = vi.hoisted(() => ({
  project: null as Record<string, any> | null,
  prerequisiteRows: new Map<string, Record<string, any>>(),
  invalidationRows: new Map<string, Record<string, any>>(),
  projectFindOne: vi.fn(),
  projectUpdateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: {
    PROJECTS: "editron_prev.projects",
    MEDIA_ASSETS: "editron_prev.mediaAssets",
  },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn((name: string) => {
      if (name === "editron_prev.projects") {
        return {
          findOne: mongoMocks.projectFindOne,
          updateOne: mongoMocks.projectUpdateOne,
        };
      }
      if (name === "editron_prev.mediaAssets") {
        return {
          find: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
        };
      }
      if (name === "editron_project_whole_state_media_prerequisites_v1") {
        return {
          findOne: vi.fn(async (filter: { _id?: string }) => {
            const row = filter._id ? mongoMocks.prerequisiteRows.get(filter._id) : undefined;
            return row ? structuredClone(row) : null;
          }),
          updateOne: vi.fn(async (
            filter: { _id?: string },
            update: Record<string, Record<string, unknown>>,
          ) => {
            if (!filter._id) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
            const current = mongoMocks.prerequisiteRows.get(filter._id);
            if (!current && update.$setOnInsert) {
              mongoMocks.prerequisiteRows.set(filter._id, structuredClone(update.$setOnInsert));
              return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            if (current && update.$set) {
              mongoMocks.prerequisiteRows.set(filter._id, {
                ...current,
                ...structuredClone(update.$set),
              });
              return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
            }
            return { acknowledged: true, matchedCount: current ? 1 : 0, modifiedCount: 0 };
          }),
        };
      }
      if (name === "editron_project_render_snapshot_invalidation_outbox_v1") {
        return {
          findOne: vi.fn(async (filter: { _id?: string }) => {
            const row = filter._id ? mongoMocks.invalidationRows.get(filter._id) : undefined;
            return row ? structuredClone(row) : null;
          }),
          insertOne: vi.fn(async (document: Record<string, any>) => {
            mongoMocks.invalidationRows.set(document._id, structuredClone(document));
            return { acknowledged: true };
          }),
          replaceOne: vi.fn(async (
            filter: { _id?: string; outboxHash?: string },
            replacement: Record<string, any>,
          ) => {
            const current = filter._id ? mongoMocks.invalidationRows.get(filter._id) : undefined;
            if (!current || current.outboxHash !== filter.outboxHash) {
              return { matchedCount: 0, modifiedCount: 0 };
            }
            mongoMocks.invalidationRows.set(filter._id!, structuredClone(replacement));
            return { matchedCount: 1, modifiedCount: 1 };
          }),
        };
      }
      throw new Error(`Unexpected collection in chat writer fixture: ${name}`);
    }),
  })),
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));

import { createTools } from "@/lib/editron/agent/tools";
import { projectService } from "@/lib/editron/services/project-service";

const USER_ID = "user_receipt_tool";
const PROJECT_ID = "proj_receipt_tool";

function toolNamed(name: string) {
  const tool = createTools(USER_ID, PROJECT_ID).find((candidate) => candidate.name === name);
  expect(tool, `${name} should be registered`).toBeDefined();
  return tool as unknown as {
    invoke: (input: Record<string, unknown>) => Promise<string>;
  };
}

function parseToolResult(raw: string) {
  return JSON.parse(raw) as {
    status: "success" | "error" | "no-op";
    message?: string;
  };
}

function projectFixture(overlays: Array<Record<string, unknown>>) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Writer receipt tool fixture",
    overlays,
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 300,
    visibility: "private",
    createdAt: new Date("2026-08-11T06:00:00.000Z"),
    updatedAt: new Date("2026-08-11T06:00:00.000Z"),
    projectRevision: 7,
  };
}

beforeEach(() => {
  mongoMocks.prerequisiteRows.clear();
  mongoMocks.invalidationRows.clear();
  mongoMocks.project = projectFixture([
    {
      id: 1,
      type: "text",
      from: 0,
      row: 0,
      durationInFrames: 90,
      content: "before",
      styles: { color: "#ffffff" },
    },
  ]);
  mongoMocks.projectFindOne.mockReset().mockImplementation(async (filter: Record<string, unknown>) => {
    const project = mongoMocks.project;
    if (!project || filter.projectId !== PROJECT_ID) return null;
    if ("userId" in filter && filter.userId !== USER_ID) return null;
    return structuredClone(project);
  });
  mongoMocks.projectUpdateOne.mockReset().mockImplementation(async (
    filter: Record<string, unknown>,
    update: Record<string, any>,
  ) => {
    const project = mongoMocks.project;
    if (
      !project ||
      filter.projectId !== PROJECT_ID ||
      filter.userId !== USER_ID ||
      filter.projectRevision !== project.projectRevision ||
      !(filter.updatedAt instanceof Date) ||
      filter.updatedAt.getTime() !== project.updatedAt.getTime() ||
      (filter["overlays.id"] !== undefined &&
        !project.overlays.some((overlay: { id: unknown }) => overlay.id === filter["overlays.id"]))
    ) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const replacement = update.$set?.["overlays.$[elem]"];
    if (replacement) {
      const index = project.overlays.findIndex(
        (overlay: { id: unknown }) => overlay.id === filter["overlays.id"],
      );
      project.overlays[index] = structuredClone(replacement);
    }
    project.updatedAt = update.$set.updatedAt;
    project.projectRevision += update.$inc.projectRevision;
    return { matchedCount: 1, modifiedCount: 1 };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat direct writer receipts", () => {
  it("captures the actual ProjectService receipt from createTools update_overlay", async () => {
    const captured = await projectService.captureMutationReceipts(async () => {
      const result = await toolNamed("update_overlay").invoke({
        id: 1,
        text: "after",
      });
      return parseToolResult(result);
    });

    expect(captured.value).toMatchObject({ status: "success" });
    expect(captured.receipts).toMatchObject([
      {
        projectId: PROJECT_ID,
        revision: { value: 8 },
      },
    ]);
    expect(mongoMocks.project?.overlays[0]).toMatchObject({ content: "after" });
    expect(mongoMocks.prerequisiteRows.size).toBe(1);
    expect(mongoMocks.invalidationRows.size).toBe(1);
    expect(mongoMocks.projectUpdateOne).toHaveBeenCalledTimes(1);
  });

  it("fails a missing update_overlay before a writer receipt or database mutation", async () => {
    mongoMocks.project = projectFixture([]);

    const captured = await projectService.captureMutationReceipts(async () => {
      const result = await toolNamed("update_overlay").invoke({
        id: 404,
        text: "missing",
      });
      return parseToolResult(result);
    });

    expect(captured.value).toMatchObject({
      status: "error",
    });
    expect(JSON.stringify(captured.value)).toContain("Overlay not found");
    expect(captured.receipts).toEqual([]);
    expect(mongoMocks.projectUpdateOne).not.toHaveBeenCalled();
  });
});
