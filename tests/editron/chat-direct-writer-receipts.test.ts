import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mongoMocks = vi.hoisted(() => ({
  project: null as Record<string, any> | null,
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "editron_prev.projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: mongoMocks.findOne,
      updateOne: mongoMocks.updateOne,
    })),
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
  mongoMocks.findOne.mockReset().mockImplementation(async (filter: Record<string, unknown>) => {
    const project = mongoMocks.project;
    if (!project || filter.projectId !== PROJECT_ID) return null;
    if ("userId" in filter && filter.userId !== USER_ID) return null;
    return structuredClone(project);
  });
  mongoMocks.updateOne.mockReset().mockImplementation(async (
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
    expect(mongoMocks.updateOne).toHaveBeenCalledTimes(1);
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
    expect(mongoMocks.updateOne).not.toHaveBeenCalled();
  });
});
