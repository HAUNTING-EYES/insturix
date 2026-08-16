import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCalosGenerationRoute } from "@/lib/calos/generate/route-map";

const mocks = vi.hoisted(() => ({
  runPostWriter: vi.fn(),
  runScriptWriterExecution: vi.fn(),
}));

vi.mock("@/lib/calos/generate/generators/_post-writer", () => ({
  runPostWriter: mocks.runPostWriter,
}));
vi.mock("@/lib/calos/generate/generators/_script-writer", () => ({
  runScriptWriterExecution: mocks.runScriptWriterExecution,
}));

const params = {
  ownerUserId: "user_1",
  orgId: "org_1",
  brandId: "brand_1",
  campaignId: "campaign_1",
  deliverableId: "card_1",
  format: "text",
  platform: "linkedin",
  title: "Grounded launch",
};
const sourceLedger = {
  ledgerVersion: 1,
  entries: [{
    referenceId: "brief_user",
    kind: "user_brief",
    title: "User brief",
    summary: "Grounded launch",
    confidence: 1,
    provenance: { origin: "user_prompt", brandId: "brand_1" },
  }],
};
const snapshot = {
  version: 2,
  resolvedAt: "2026-08-16T00:00:00.000Z",
  scope: { kind: "organization", brandId: "brand_1" },
  brand: { brandId: "brand_1" },
};
const signalTrace = { outputFormat: "social_post", goal: "awareness" };
const productionBrief = { output: { platform: "linkedin", targetDurationSec: null } };
type MockVisualPrompts = {
  singleImagePrompt?: string;
  carouselPrompts?: string[];
};
const postResult = {
  content: "Grounded launch copy.",
  hashtags: ["#Launch"],
  contentAnalysis: { tone: "precise", vibe: "grounded", theme: "launch", qualityScore: 96, violations: [] },
  clickatron: {
    singleImagePrompt: "A grounded launch scene with clear negative space.",
  } as MockVisualPrompts,
  metadata: { platform: "linkedin", charCount: 21 },
};
const scriptResult = {
  content: "Seven-minute script.",
  contentAnalysis: { hooks: [], theme: "launch", emphasisPoints: [], qualityScore: 96 },
  visualMetadata: { motionInfo: "restrained", scenePrompts: ["Scene one"] },
  metadata: { platform: "youtube", estimatedTimeSeconds: 420, voiceLanguages: ["en"] },
  sidecar: { sidecarVersion: 2, acts: [] },
};

function postOutput(format = "text") {
  return {
    content: postResult.content,
    result: postResult,
    imagePrompt: postResult.clickatron.singleImagePrompt,
    route: resolveCalosGenerationRoute(format),
    userPrompt: "Grounded launch",
    sourceLedger,
    productionBrief,
    authoringContext: { snapshot, signalTrace },
  };
}

function scriptOutput() {
  return {
    content: scriptResult.content,
    result: scriptResult,
    route: resolveCalosGenerationRoute("long_video"),
    userPrompt: "Grounded launch",
    sourceLedger,
    productionBrief: { output: { platform: "youtube", targetDurationSec: 420 } },
    authoringContext: { snapshot, signalTrace: { ...signalTrace, outputFormat: "video_script" } },
  };
}

describe("CalOS canonical writer artifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runPostWriter.mockImplementation(async (input) => postOutput(input.format));
    mocks.runScriptWriterExecution.mockResolvedValue(scriptOutput());
  });

  it("preserves post writer metadata, provenance, contract, and brief", async () => {
    const { thinkforgeGenerator } = await import("@/lib/calos/generate/generators/thinkforge");
    const result = await thinkforgeGenerator(params);

    expect(result).toMatchObject({
      ok: true,
      assetText: "Grounded launch copy.",
      thinkforgeArtifact: {
        documentType: "social_post",
        briefSnapshot: productionBrief,
        authoringContextSnapshot: snapshot,
        signalTrace,
        writerOutput: {
          writerType: "post",
          hashtags: ["#Launch"],
          visualPrompts: postResult.clickatron,
          sourceLedger,
        },
      },
    });
  });

  it("preserves the script sidecar and exact runtime brief", async () => {
    const { thinkforgeGenerator } = await import("@/lib/calos/generate/generators/thinkforge");
    const result = await thinkforgeGenerator({ ...params, format: "long_video", targetDurationSeconds: 420 });

    expect(result).toMatchObject({
      ok: true,
      thinkforgeArtifact: {
        documentType: "video_script",
        briefSnapshot: { output: { targetDurationSec: 420 } },
        writerOutput: {
          writerType: "script",
          scriptSidecar: scriptResult.sidecar,
          sidecarVersion: 2,
          sourceLedger,
        },
      },
    });
  });

  it("keeps carousel prompts as a deck and does not fake one image prompt", async () => {
    const carousel = postOutput("carousel");
    carousel.result = {
      ...postResult,
      clickatron: { carouselPrompts: ["Slide one scene", "Slide two scene"] },
    };
    carousel.imagePrompt = undefined;
    mocks.runPostWriter.mockResolvedValueOnce(carousel);
    const { clickatronGenerator } = await import("@/lib/calos/generate/generators/clickatron");

    const result = await clickatronGenerator({ ...params, format: "carousel" });

    expect(result).toMatchObject({
      ok: true,
      status: "drafting",
      thinkforgeArtifact: {
        documentType: "carousel",
        writerOutput: { visualPrompts: { carouselPrompts: ["Slide one scene", "Slide two scene"] } },
      },
    });
    expect(result.imagePrompt).toBeUndefined();
  });

  it("fails unsupported routes and missing single-image prompts", async () => {
    const { thinkforgeGenerator } = await import("@/lib/calos/generate/generators/thinkforge");
    await expect(thinkforgeGenerator({ ...params, format: "newsletter" }))
      .resolves.toMatchObject({ ok: false, error: expect.stringContaining("Unsupported CalOS") });

    const missingPrompt = postOutput("image");
    missingPrompt.imagePrompt = undefined;
    missingPrompt.result = { ...postResult, clickatron: {} };
    mocks.runPostWriter.mockResolvedValueOnce(missingPrompt);
    const { clickatronGenerator } = await import("@/lib/calos/generate/generators/clickatron");
    await expect(clickatronGenerator({ ...params, format: "image" }))
      .resolves.toMatchObject({ ok: false, error: "PostWriter returned no single-image visual prompt." });
  });
});
