import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

vi.mock("@/lib/editron/services/project-service", () => {
  class ProjectMutationConflictError extends Error {
    readonly code = "PROJECT_REVISION_CONFLICT";
    constructor(readonly currentRevision: unknown) {
      super("The project changed before this write could be committed.");
    }
  }
  class ProjectNotFoundOrForbiddenError extends Error {
    readonly code = "PROJECT_NOT_FOUND_OR_FORBIDDEN";
    constructor() {
      super("Project not found.");
    }
  }
  return {
    ProjectMutationConflictError,
    ProjectNotFoundOrForbiddenError,
    projectService: {
      deleteProject: mocks.deleteProject,
      loadProject: vi.fn(),
    },
  };
});

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  ProjectAssetSourceUnverifiableErrorV1: class extends Error {},
}));

import {
  ProjectMutationConflictError,
} from "@/lib/editron/services/project-service";
import { DELETE } from "@/app/api/services/editron/projects/[projectId]/route";

const PROJECT_ID = "project-route-delete";
const REVISION = {
  schemaVersion: 1 as const,
  value: 4,
  compatibilityUpdatedAt: "2026-09-02T06:30:00.000Z",
};
const context = { params: Promise.resolve({ projectId: PROJECT_ID }) };

function request(body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/services/editron/projects/${PROJECT_ID}`, {
    method: "DELETE",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

describe("project DELETE route V1", () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ userId: "route-user" });
    mocks.deleteProject.mockReset().mockResolvedValue({
      status: "DELETED",
      tombstone: { afterRevision: { ...REVISION, value: 5 } },
    });
  });

  it("rejects deletion without the exact visible project revision", async () => {
    const response = await DELETE(request(), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "PROJECT_DELETE_REVISION_REQUIRED",
    });
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });

  it("forwards a valid exact revision and returns the terminal revision", async () => {
    const response = await DELETE(request({ expectedRevision: REVISION }), context);
    expect(response.status).toBe(200);
    expect(mocks.deleteProject).toHaveBeenCalledWith(
      "route-user",
      PROJECT_ID,
      REVISION,
    );
    expect(await response.json()).toMatchObject({
      success: true,
      deletionStatus: "DELETED",
      terminalRevision: { value: 5 },
    });
  });

  it("surfaces a stale deletion as a conflict instead of retrying", async () => {
    mocks.deleteProject.mockRejectedValueOnce(
      new ProjectMutationConflictError({ ...REVISION, value: 6 }),
    );
    const response = await DELETE(request({ expectedRevision: REVISION }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 6 },
    });
    expect(mocks.deleteProject).toHaveBeenCalledOnce();
  });
});
