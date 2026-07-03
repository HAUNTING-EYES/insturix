import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Editron storage quota wiring", () => {
  it("checks storage quota before multipart upload allocation", () => {
    const source = readSource("app/api/services/editron/media/upload/multipart/init/route.ts");

    expect(source).toContain("reserveStorageForUpload(userId, orgId, numericTotalSize)");
    expect(source).toContain("code: 'storage_quota_exceeded'");
    expect(source.indexOf("reserveStorageForUpload(userId, orgId, numericTotalSize)")).toBeLessThan(
      source.indexOf("initiateMultipartUpload(userId, filename, contentType)"),
    );
    expect(source).toContain("orgId: orgId || null");
    expect(source).toContain("totalSize: numericTotalSize");
  });

  it("records multipart storage bytes only after successful completion", () => {
    const source = readSource("app/api/services/editron/media/upload/multipart/complete/route.ts");

    expect(source).toContain("const publicUrl = await completeMultipartUpload(upload.r2Key, uploadId, parts)");
    expect(source.indexOf("completeMultipartUpload(upload.r2Key, uploadId, parts)")).toBeLessThan(
      source.indexOf("recordStorageUsage(resolveStorageOwner(userId, upload.orgId ?? orgId), storedBytes)"),
    );
    expect(source).toContain("storageUsageRecordedAt");
    expect(source).toContain("storageUsageBytes: storedBytes");
  });

  it("checks presigned registration quota against stored object bytes and avoids multipart double-counts", () => {
    const source = readSource("app/api/services/editron/media/upload/route.ts");

    expect(source).toContain("const storageAlreadyRecorded = Boolean(completedMultipartUpload)");
    expect(source).toContain("const storedSizeBytes = actualSize ?? (typeof size === 'number' ? size : Number(size) || 0)");
    expect(source).toContain("reserveStorageForUpload(userId, orgId, storedSizeBytes)");
    expect(source).toContain("await deleteUploadedObject(gcsPath, assetId)");
    expect(source).toContain("recordStorageUsage(resolveStorageOwner(userId, orgId), storedSizeBytes)");
    expect(source).toContain("...(!gcsPath && { r2Key: assetId })");
  });

  it("decrements storage usage and deletes R2 originals on media delete", () => {
    const source = readSource("app/api/services/editron/media/delete/route.ts");

    expect(source).toContain("completedMultipartUpload");
    expect(source).toContain("deleteFromR2(r2Key)");
    expect(source).toContain("asset.originalR2Key");
    expect(source).toContain("completedMultipartUpload?.r2Key");
    expect(source).toContain("recordStorageUsage(resolveStorageOwner(userId, orgId), -(assetBytes + completedMultipartBytes))");
  });
});