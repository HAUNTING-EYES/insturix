import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  connectToDatabase: vi.fn(),
  createVideo: vi.fn(),
  buildUploaderXPublicUrl: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/uploaderx-video", () => ({
  default: {
    create: mocks.createVideo,
  },
}));

vi.mock("@/lib/uploaderx-storage", () => ({
  buildUploaderXPublicUrl: mocks.buildUploaderXPublicUrl,
}));

import { POST } from "@/app/api/services/uploaderx/gcs/track-upload/route";

function request(body: unknown): Request {
  return new Request("https://app.example.com/api/services/uploaderx/gcs/track-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("UploaderX upload tracking ownership", () => {
  beforeEach(() => {
    vi.stubEnv("GCS_BUCKET_NAME", "uploaderx-test-bucket");
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "owner@example.com" }],
    });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.createVideo.mockImplementation(async (doc) => ({ _id: "video_doc", ...doc }));
    mocks.buildUploaderXPublicUrl.mockImplementation((key: string) => `https://r2.example.com/${key}`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects a foreign upload key before creating a video record", async () => {
    const response = await POST(request({
      filename: "clip.mp4",
      gcsPath: "uploads/user_other/upload-1.mp4",
      fileSize: 1024,
      contentType: "video/mp4",
      videoUuid: "vid_1",
      publicUrl: "https://storage.googleapis.com/uploaderx-test-bucket/uploads/user_other/upload-1.mp4",
    }));

    expect(response.status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.createVideo).not.toHaveBeenCalled();
  });

  it("stores the authenticated user's owned key and derives the public URL server-side", async () => {
    const response = await POST(request({
      filename: "clip.mp4",
      gcsPath: "uploads/user_123/upload-1.mp4",
      fileSize: 2048,
      contentType: "video/mp4",
      videoUuid: "vid_1",
      publicUrl: "https://evil.example.com/foreign.mp4",
      metadata: { title: "Launch" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.createVideo).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_123",
      email: "owner@example.com",
      videoUuid: "vid_1",
      gcsPath: "uploads/user_123/upload-1.mp4",
      publicUrl: "https://r2.example.com/uploads/user_123/upload-1.mp4",
    }));
  });

  it("rejects malformed caller public URLs instead of persisting them", async () => {
    const response = await POST(request({
      filename: "clip.mp4",
      gcsPath: "uploads/user_123/upload-1.mp4",
      fileSize: 2048,
      contentType: "video/mp4",
      videoUuid: "vid_1",
      publicUrl: "http://storage.googleapis.com/uploaderx-test-bucket/uploads/user_123/upload-1.mp4",
    }));

    expect(response.status).toBe(400);
    expect(mocks.createVideo).not.toHaveBeenCalled();
  });
});
