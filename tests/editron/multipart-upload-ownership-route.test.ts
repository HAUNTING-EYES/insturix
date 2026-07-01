import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  generatePartUploadUrl: vi.fn(),
  completeMultipartUpload: vi.fn(),
  abortMultipartUpload: vi.fn(),
  getR2PublicUrl: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: async () => ({
    collection: () => ({
      findOne: mocks.findOne,
      updateOne: mocks.updateOne,
    }),
  }),
}));

vi.mock("@/lib/editron/services/r2-service", () => ({
  generatePartUploadUrl: mocks.generatePartUploadUrl,
  completeMultipartUpload: mocks.completeMultipartUpload,
  abortMultipartUpload: mocks.abortMultipartUpload,
  getR2PublicUrl: mocks.getR2PublicUrl,
}));

import { POST as completeUpload } from "@/app/api/services/editron/media/upload/multipart/complete/route";
import { POST as signPart } from "@/app/api/services/editron/media/upload/multipart/part-url/route";

function request(body: unknown): Request {
  return new Request("https://app.example.com/api/services/editron/media/upload/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Editron multipart upload key ownership", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    mocks.findOne.mockResolvedValue({
      assetId: "asset_1",
      userId: "user_123",
      uploadId: "upload_1",
      r2Key: "tracked_key",
      status: "in-progress",
    });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.generatePartUploadUrl.mockResolvedValue("https://r2.example.com/part-url");
    mocks.completeMultipartUpload.mockResolvedValue("https://cdn.example.com/asset/tracked_key");
    mocks.abortMultipartUpload.mockResolvedValue(undefined);
    mocks.getR2PublicUrl.mockReturnValue("https://cdn.example.com/asset/asset_1");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not sign a part URL when the caller r2Key differs from the tracked upload", async () => {
    const response = await signPart(request({
      assetId: "asset_1",
      uploadId: "upload_1",
      r2Key: "foreign_key",
      partNumber: 1,
    }) as any);

    expect(response.status).toBe(400);
    expect(mocks.generatePartUploadUrl).not.toHaveBeenCalled();
  });

  it("signs part URLs with the tracked r2Key and normalized part number", async () => {
    const response = await signPart(request({
      assetId: "asset_1",
      uploadId: "upload_1",
      r2Key: "tracked_key",
      partNumber: "2",
    }) as any);

    expect(response.status).toBe(200);
    expect(mocks.generatePartUploadUrl).toHaveBeenCalledWith("tracked_key", "upload_1", 2);
    expect(await response.json()).toMatchObject({ partNumber: 2 });
  });

  it("does not abort when the caller r2Key differs from the tracked upload", async () => {
    const response = await completeUpload(request({
      assetId: "asset_1",
      uploadId: "upload_1",
      r2Key: "foreign_key",
      abort: true,
    }) as any);

    expect(response.status).toBe(400);
    expect(mocks.abortMultipartUpload).not.toHaveBeenCalled();
  });

  it("completes multipart uploads with the tracked r2Key", async () => {
    const response = await completeUpload(request({
      assetId: "asset_1",
      uploadId: "upload_1",
      r2Key: "tracked_key",
      parts: [{ ETag: "etag-1", PartNumber: 1 }],
    }) as any);

    expect(response.status).toBe(200);
    expect(mocks.completeMultipartUpload).toHaveBeenCalledWith("tracked_key", "upload_1", [{ ETag: "etag-1", PartNumber: 1 }]);
    expect(await response.json()).toMatchObject({
      assetId: "asset_1",
      publicUrl: "https://cdn.example.com/asset/tracked_key",
      readUrl: "https://cdn.example.com/asset/asset_1",
    });
  });
});
