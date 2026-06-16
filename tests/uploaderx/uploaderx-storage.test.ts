import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";

const mocks = vi.hoisted(() => {
  const connectToDatabase = vi.fn();
  const findOne = vi.fn();
  return {
    connectToDatabase,
    findOne,
  };
});

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/uploaderx-video", () => ({
  default: {
    findOne: mocks.findOne,
  },
}));

function mockVideo(record: unknown): void {
  mocks.findOne.mockReturnValue({
    lean: vi.fn(async () => record),
  });
}

describe("resolveUploaderXVideo", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockReset();
    mocks.findOne.mockReset();
  });

  it("scopes videoUuid lookup to the owning user when userId is provided", async () => {
    mockVideo({
      videoUuid: "video_1",
      gcsPath: "uploads/user_1/video.mp4",
      publicUrl: "https://cdn.example/video.mp4",
      filename: "video.mp4",
      contentType: "video/mp4",
      size: 123,
    });

    const result = await resolveUploaderXVideo({
      userId: "user_1",
      videoUuid: "video_1",
      gcsPath: "ignored_when_uuid_exists",
    });

    expect(mocks.findOne).toHaveBeenCalledWith({
      userId: "user_1",
      videoUuid: "video_1",
    });
    expect(result).toEqual({
      videoUuid: "video_1",
      gcsPath: "uploads/user_1/video.mp4",
      publicUrl: "https://cdn.example/video.mp4",
      filename: "video.mp4",
      contentType: "video/mp4",
      size: 123,
    });
  });

  it("scopes gcsPath fallback lookup to the owning user", async () => {
    mockVideo({
      videoUuid: "video_2",
      gcsPath: "uploads/user_1/video-2.mp4",
      publicUrl: "https://cdn.example/video-2.mp4",
      filename: "video-2.mp4",
      contentType: "video/mp4",
    });

    await resolveUploaderXVideo({
      userId: "user_1",
      gcsPath: "uploads/user_1/video-2.mp4",
    });

    expect(mocks.findOne).toHaveBeenCalledWith({
      userId: "user_1",
      gcsPath: "uploads/user_1/video-2.mp4",
    });
  });

  it("rejects missing media records before external publish callers stream content", async () => {
    mockVideo(null);

    await expect(
      resolveUploaderXVideo({
        userId: "user_1",
        videoUuid: "other_users_video",
      }),
    ).rejects.toThrow("UploaderX video record not found");
  });
});
