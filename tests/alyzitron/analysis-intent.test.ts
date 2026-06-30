import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inferAlyzitronMediaSourceKind,
  normalizeAlyzitronContentIntent,
  resolveAlyzitronContentIntent,
} from "@/lib/alyzitron/analysis-intent";

describe("Alyzitron analysis intent resolver", () => {
  it("lets explicit user-selected intent win over local upload and active brand inference", () => {
    const result = resolveAlyzitronContentIntent({
      userSelectedIntent: "competitor_content",
      mediaSourceKind: "file",
      brandId: "brand_123",
    });

    expect(result).toEqual({
      contentIntent: "competitor_content",
      source: "user_selected",
      confidence: 1,
      rationale: ["User explicitly selected the analysis intent."],
      userConfirmed: true,
    });
  });

  it("keeps a user-confirmed resolution authoritative", () => {
    const result = resolveAlyzitronContentIntent({
      intentResolution: {
        contentIntent: "reference_content",
        source: "system_inferred",
        confidence: 0.61,
        rationale: ["chip was confirmed"],
        userConfirmed: true,
      },
      mediaSourceKind: "file",
      brandId: "brand_123",
    });

    expect(result.contentIntent).toBe("reference_content");
    expect(result.source).toBe("user_selected");
    expect(result.userConfirmed).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it("infers own content for local upload with an active brand", () => {
    const result = resolveAlyzitronContentIntent({
      mediaSourceKind: "file",
      brandId: "brand_123",
    });

    expect(result).toMatchObject({
      contentIntent: "own_content",
      source: "system_inferred",
      confidence: 0.7,
      userConfirmed: false,
    });
  });

  it("infers competitor content from user language even when media is locally uploaded", () => {
    const result = resolveAlyzitronContentIntent({
      mediaSourceKind: "file",
      brandId: "brand_123",
      userText: "Analyze this competitor ad and tell me what we can learn.",
    });

    expect(result.contentIntent).toBe("competitor_content");
    expect(result.source).toBe("system_inferred");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("defaults external URLs to reference content when no stronger signal exists", () => {
    const result = resolveAlyzitronContentIntent({
      videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      brandId: "brand_123",
    });

    expect(inferAlyzitronMediaSourceKind({ videoUrl: "https://www.youtube.com/watch?v=abcdefghijk" })).toBe("youtube_url");
    expect(result).toMatchObject({
      contentIntent: "reference_content",
      source: "defaulted",
      confidence: 0.45,
    });
  });

  it("fails closed to unknown when there is no reliable ownership signal", () => {
    const result = resolveAlyzitronContentIntent({ mediaSourceKind: "file" });

    expect(result).toMatchObject({
      contentIntent: "unknown",
      source: "defaulted",
      confidence: 0.3,
      userConfirmed: false,
    });
  });

  it("does not confuse media source labels with content intent labels", () => {
    expect(normalizeAlyzitronContentIntent("file")).toBeUndefined();
    expect(inferAlyzitronMediaSourceKind({ mediaSourceKind: "external_url" })).toBe("external_url");
  });

  it("does not introduce an Alyzitron Brand Vault writer helper", () => {
    expect(existsSync(join(process.cwd(), "lib/alyzitron/services/brand-vault-integration.ts"))).toBe(false);
  });
});
