import { describe, expect, it } from "vitest";
import {
  StorageOwnershipError,
  buildClickatronStorageKey,
  buildUploaderXStorageKey,
  normalizeStorageKey,
  requireClickatronOwnedStorageKey,
  requireKnownImageProxyStorageKey,
  requireUploaderXOwnedStorageKey,
  sanitizeStorageFilename,
} from "@/app/api/services/shared/storage-ownership";

describe("shared storage ownership", () => {
  it("builds server-owned upload keys with sanitized filenames", () => {
    expect(buildUploaderXStorageKey("user_123", "video_1", "../clip one.mp4")).toBe(
      "uploads/user_123/video_1-_clip_one.mp4",
    );
    expect(buildClickatronStorageKey("user_123", "asset_1", "mask/one.png")).toBe(
      "user_user_123/clickatron-uploads/asset_1/mask_one.png",
    );
    expect(sanitizeStorageFilename("")).toBe("upload");
  });

  it("accepts only UploaderX keys owned by the authenticated user", () => {
    const key = "uploads/user_123/video_1-clip.mp4";

    expect(requireUploaderXOwnedStorageKey("user_123", key)).toBe(key);
    expect(() => requireUploaderXOwnedStorageKey("user_999", key)).toThrow(StorageOwnershipError);
    expect(() => requireUploaderXOwnedStorageKey("user_123", "uploads/user_123/../secret.mp4")).toThrow(
      StorageOwnershipError,
    );
  });

  it("accepts only Clickatron keys owned by the authenticated user", () => {
    const key = "user_user_123/clickatron-thumbnails/session_1/variation_1/image.jpg";

    expect(requireClickatronOwnedStorageKey("user_123", key)).toBe(key);
    expect(() => requireClickatronOwnedStorageKey("user_999", key)).toThrow(StorageOwnershipError);
    expect(() => requireClickatronOwnedStorageKey("user_123", "user_user_123/other-service/image.jpg")).toThrow(
      StorageOwnershipError,
    );
  });

  it("normalizes public URLs before ownership checks", () => {
    process.env.CLICKATRON_R2_WORKER_URL = "https://cdn.example.com";
    process.env.R2_PUBLIC_BASE_URL_CLICKATRON = "https://public.example.com/assets";
    const key = "user_user_123/clickatron-masks/session_1/variation_1/mask.png";

    expect(normalizeStorageKey(`https://cdn.example.com/clickatron/${key}`)).toBe(key);
    expect(normalizeStorageKey(`https://public.example.com/assets/${key}?download=1`)).toBe(key);
    expect(requireClickatronOwnedStorageKey("user_123", `https://cdn.example.com/clickatron/${key}`)).toBe(key);
  });

  it("allows the image proxy to fetch only known user-owned image namespaces", () => {
    expect(requireKnownImageProxyStorageKey("user_123", "editron/user_123/media/asset.png")).toBe(
      "editron/user_123/media/asset.png",
    );
    expect(requireKnownImageProxyStorageKey("user_123", "socialize/banners/user_user_123/banner.png")).toBe(
      "socialize/banners/user_user_123/banner.png",
    );
    expect(requireKnownImageProxyStorageKey("user_123", "user_123/alyzitron-uploads/clip.png")).toBe(
      "user_123/alyzitron-uploads/clip.png",
    );
    expect(() => requireKnownImageProxyStorageKey("user_123", "editron/user_999/media/asset.png")).toThrow(
      StorageOwnershipError,
    );
    expect(() => requireKnownImageProxyStorageKey("user_123", "public/asset.png")).toThrow(StorageOwnershipError);
  });
});
