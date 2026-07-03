import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
}));

vi.mock("@/app/api/services/alyzitron/utils/mongodb", () => ({
  getCollections: async () => ({
    analyses: {
      findOne: mocks.findOne,
    },
  }),
}));

import {
  AlyzitronTaskOwnershipError,
  assertAlyzitronChatSessionOwned,
  requireOwnedAlyzitronTask,
} from "@/app/api/services/alyzitron/utils/task-ownership";

describe("Alyzitron task ownership", () => {
  beforeEach(() => {
    mocks.findOne.mockReset();
  });

  it("returns an owned task", async () => {
    mocks.findOne.mockResolvedValueOnce({ taskId: "task_1", clerkUserId: "user_1" });

    await expect(requireOwnedAlyzitronTask("task_1", "user_1")).resolves.toMatchObject({
      taskId: "task_1",
      clerkUserId: "user_1",
    });

    expect(mocks.findOne).toHaveBeenCalledWith(
      { taskId: "task_1", clerkUserId: "user_1" },
    );
  });

  it("throws 400 for malformed task ids", async () => {
    await expect(requireOwnedAlyzitronTask("", "user_1")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 404 when the task is not owned by the user", async () => {
    mocks.findOne.mockResolvedValueOnce(null);

    await expect(requireOwnedAlyzitronTask("task_2", "user_1")).rejects.toBeInstanceOf(AlyzitronTaskOwnershipError);
    await expect(requireOwnedAlyzitronTask("task_2", "user_1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("requires chat sessions to match both task and user", () => {
    expect(() => assertAlyzitronChatSessionOwned({ taskId: "task_1", userId: "user_1" }, "task_1", "user_1")).not.toThrow();
    expect(() => assertAlyzitronChatSessionOwned({ taskId: "task_2", userId: "user_1" }, "task_1", "user_1")).toThrow(
      AlyzitronTaskOwnershipError,
    );
    expect(() => assertAlyzitronChatSessionOwned({ taskId: "task_1", userId: "user_2" }, "task_1", "user_1")).toThrow(
      AlyzitronTaskOwnershipError,
    );
  });
});
