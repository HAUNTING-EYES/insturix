import { describe, expect, it } from "vitest";
import {
  normalizeLinkedInUploadInstruction,
  requireAllowedUploaderXUploadUrl,
  UploaderXUploadUrlError,
} from "@/app/api/services/uploaderx/utils/platform-upload-url";

describe("UploaderX platform upload URL guard", () => {
  it("allows known provider-owned HTTPS upload hosts", () => {
    expect(requireAllowedUploaderXUploadUrl("https://rupload.facebook.com/video-upload/v21.0/123", "facebook")).toBe(
      "https://rupload.facebook.com/video-upload/v21.0/123",
    );
    expect(requireAllowedUploaderXUploadUrl("https://www.linkedin.com/dms-uploads/sp/D123", "linkedin")).toBe(
      "https://www.linkedin.com/dms-uploads/sp/D123",
    );
  });

  it("rejects upload URLs that could leak tokens", () => {
    expect(() => requireAllowedUploaderXUploadUrl("http://rupload.facebook.com/video-upload", "facebook")).toThrow(
      UploaderXUploadUrlError,
    );
    expect(() => requireAllowedUploaderXUploadUrl("https://evil.example/upload", "facebook")).toThrow(
      UploaderXUploadUrlError,
    );
    expect(() => requireAllowedUploaderXUploadUrl("https://token@rupload.facebook.com/video-upload", "facebook")).toThrow(
      UploaderXUploadUrlError,
    );
    expect(() => requireAllowedUploaderXUploadUrl("https://rupload.facebook.com:444/video-upload", "facebook")).toThrow(
      UploaderXUploadUrlError,
    );
  });

  it("normalizes LinkedIn upload instructions and rejects invalid ranges", () => {
    expect(
      normalizeLinkedInUploadInstruction({
        uploadUrl: "https://api.linkedin.com/mediaUpload/C123",
        firstByte: 0,
        lastByte: 1023,
      }),
    ).toEqual({
      uploadUrl: "https://api.linkedin.com/mediaUpload/C123",
      firstByte: 0,
      lastByte: 1023,
    });

    expect(() =>
      normalizeLinkedInUploadInstruction({
        uploadUrl: "https://api.linkedin.com/mediaUpload/C123",
        firstByte: 1024,
        lastByte: 1,
      }),
    ).toThrow(UploaderXUploadUrlError);
  });
});
