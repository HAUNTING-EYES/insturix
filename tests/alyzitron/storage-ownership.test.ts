import { describe, expect, it } from "vitest";
import {
  AlyzitronStorageOwnershipError,
  buildAlyzitronPublicUrl,
  getAlyzitronUserStoragePrefix,
  normalizeAlyzitronStorageKey,
  requireAlyzitronOwnedStorageKey,
  sanitizeAlyzitronFilename,
} from "@/app/api/services/alyzitron/utils/storage-ownership";

describe("Alyzitron storage ownership", () => {
  it("builds the canonical per-user upload prefix", () => {
    expect(getAlyzitronUserStoragePrefix("user_abc123")).toBe("user_abc123/alyzitron-uploads/");
    expect(getAlyzitronUserStoragePrefix("abc123")).toBe("user_abc123/alyzitron-uploads/");
  });

  it("accepts only storage keys under the authenticated user's prefix", () => {
    const key = "user_abc123/alyzitron-uploads/1710000000000_clip.mp4";

    expect(requireAlyzitronOwnedStorageKey("user_abc123", key)).toBe(key);
    expect(() => requireAlyzitronOwnedStorageKey("user_other", key)).toThrow(AlyzitronStorageOwnershipError);
  });

  it("rejects traversal and malformed storage keys", () => {
    expect(() => requireAlyzitronOwnedStorageKey("user_abc123", "user_abc123/alyzitron-uploads/../secret.mp4")).toThrow(
      AlyzitronStorageOwnershipError,
    );
    expect(() => requireAlyzitronOwnedStorageKey("user_abc123", "user_abc123\\alyzitron-uploads\\clip.mp4")).toThrow(
      AlyzitronStorageOwnershipError,
    );
    expect(() => requireAlyzitronOwnedStorageKey("user_abc123", "")).toThrow(AlyzitronStorageOwnershipError);
  });

  it("normalizes R2 and CDN URLs back to object keys before ownership checks", () => {
    process.env.R2_BUCKET_NAME = "editron-cdn";
    const key = "user_abc123/alyzitron-uploads/1710000000000_clip.mp4";

    expect(normalizeAlyzitronStorageKey(`https://acct.r2.cloudflarestorage.com/editron-cdn/${key}`)).toBe(key);
    expect(normalizeAlyzitronStorageKey(`https://cdn.example.com/asset/${key}`)).toBe(key);
    expect(requireAlyzitronOwnedStorageKey("abc123", `https://cdn.example.com/asset/${key}`)).toBe(key);
  });

  it("derives public URLs server-side", () => {
    process.env.CDN_WORKER_URL = "https://cdn.example.com/";
    expect(buildAlyzitronPublicUrl("user_abc123/alyzitron-uploads/clip.mp4", "r2")).toBe(
      "https://cdn.example.com/asset/user_abc123/alyzitron-uploads/clip.mp4",
    );

    process.env.GCS_BUCKET_NAME = "alyzitron-test";
    expect(buildAlyzitronPublicUrl("user_abc123/alyzitron-uploads/clip.mp4", "gcs")).toBe(
      "https://storage.googleapis.com/alyzitron-test/user_abc123/alyzitron-uploads/clip.mp4",
    );
  });

  it("sanitizes filenames without allowing empty output", () => {
    expect(sanitizeAlyzitronFilename("../my clip!!.mp4")).toBe(".._my_clip__.mp4");
    expect(sanitizeAlyzitronFilename("")).toBe("upload");
  });
});
