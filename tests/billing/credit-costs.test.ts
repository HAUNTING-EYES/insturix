import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SERVICE_PRICING_CONFIGS } from "@/lib/config/serviceLimits";
import { CHAT_MODEL_NAME } from "@/lib/editron/utils/gemini-model-factory";
import {
  CREDIT_PACKAGES,
  CreditCostConfigurationError,
  CREDITS_PER_USD,
  SUBSCRIPTION_PLANS,
  creditsForUsd,
  getCreditCost,
  getPlanCreditAllocation,
  getCheapestVideoCreditsPerSecond,
  getPlanMediaCapacity,
} from "@/lib/config/creditCosts";

const readRoute = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("credit pricing", () => {
  it("uses 30 credits per USD for plans and credit packs", () => {
    expect(CREDITS_PER_USD).toBe(30);
    expect(creditsForUsd(1)).toBe(30);

    for (const plan of SUBSCRIPTION_PLANS) {
      expect(plan.credits).toBe(creditsForUsd(plan.price));
      expect(plan.yearlyPrice).toBe(plan.price * 10);
    }

    for (const pack of CREDIT_PACKAGES) {
      expect(pack.credits).toBe(creditsForUsd(pack.prices.USD));
    }
  });

  it("keeps legacy plan aliases aligned to the same conversion", () => {
    expect(getPlanCreditAllocation("plus")).toBe(creditsForUsd(20));
    expect(getPlanCreditAllocation("pro")).toBe(creditsForUsd(49));
    expect(getPlanCreditAllocation("premium")).toBe(creditsForUsd(99));
    expect(getPlanCreditAllocation("agency_starter")).toBe(creditsForUsd(100));
    expect(getPlanCreditAllocation("Agency Starter")).toBe(creditsForUsd(100));
    expect(getPlanCreditAllocation("agency_growth")).toBe(creditsForUsd(500));
    expect(getPlanCreditAllocation("agency_scale")).toBe(creditsForUsd(1000));
  });

  it("charges pipeline video by model-second instead of flat clips", () => {
    expect(getCreditCost("pipeline", "video_generation", { model: "kling-2.1", durationSeconds: 10 })).toBe(50);
    expect(getCreditCost("pipeline", "video_generation", { model: "kling-2.6", durationSeconds: 10 })).toBe(70);
    expect(getCreditCost("pipeline", "video_generation", { model: "veo-3.1", durationSeconds: 10 })).toBe(180);
    expect(getCreditCost("pipeline", "video_generation", { model: "seedance-2.0", durationSeconds: 10 })).toBe(120);
  });

  it("covers critical media and import pricing rows", () => {
    expect(getCreditCost("pipeline", "script_import")).toBe(5);
    expect(getCreditCost("pipeline", "storyboard_finalize")).toBe(8);
    expect(getCreditCost("pipeline", "storyboard_image_generation", { model: "fal-ai/nano-banana-pro" })).toBe(6);
    expect(getCreditCost("pipeline", "storyboard_image_generation", { model: "photon-1" })).toBe(4);
    expect(getCreditCost("pipeline", "voiceover_generation", { characterCount: 1000, requestType: "kokoro" })).toBe(3);
    expect(getCreditCost("pipeline", "voiceover_generation", { characterCount: 2000, requestType: "deepgram" })).toBe(6);
    expect(getCreditCost("pipeline", "bgm_generation", { durationSeconds: 60, requestType: "cassetteai" })).toBe(6);
    expect(getCreditCost("pipeline", "sfx_generation", { durationSeconds: 10, requestType: "library_or_ai" })).toBe(5);
    expect(getCreditCost("pipeline", "sfx_generation", { durationSeconds: 10, requestType: "synced_video" })).toBe(7.5);
    expect(getCreditCost("alyzitron", "video_analysis", { durationMinutes: 2 })).toBe(16);
    expect(getCreditCost("alyzitron", "transcription", { durationMinutes: 2 })).toBe(6);
    expect(getCreditCost("alyzitron", "chat_message", { model: "gemini-2.5-flash", tokenCount: 2000 })).toBe(1);
    expect(getCreditCost("editron", "render_export", { durationMinutes: 2, requestType: "standard" })).toBe(6);
    expect(getCreditCost("editron", "render_export", { durationMinutes: 2, requestType: "chapter" })).toBe(9);
    expect(getCreditCost("editron", "render_export", { durationMinutes: 2, requestType: "uhd" })).toBe(18);
    expect(getCreditCost("editron", "auto_edit_analysis", { durationMinutes: 2, requestType: "standard" })).toBe(24);
    expect(getCreditCost("editron", "auto_edit_analysis", { durationMinutes: 2, requestType: "reference_guided" })).toBe(30);
    expect(getCreditCost("editron", "auto_edit_analysis", { durationMinutes: 2, requestType: "long_form" })).toBe(36);
    expect(getCreditCost("editron", "asset_analysis", { durationMinutes: 2, requestType: "video" })).toBe(12);
    expect(getCreditCost("editron", "asset_analysis", { durationMinutes: 1, requestType: "image" })).toBe(3);
    expect(getCreditCost("editron", "asset_analysis", { durationMinutes: 1, requestType: "audio" })).toBe(3);
    expect(getCreditCost("calos", "ai_plan")).toBe(20);
    expect(getCreditCost("calos", "generate_deliverable", { requestType: "thinkforge" })).toBe(5);
    expect(getCreditCost("calos", "generate_deliverable", { requestType: "clickatron" })).toBe(5);
    expect(getCreditCost("brand_vault", "brand_scan", { requestType: "base" })).toBe(15);
    expect(getCreditCost("brand_vault", "brand_scan", { requestType: "deep" })).toBe(30);
    expect(getCreditCost("uploaderx", "platform_publish", { requestType: "twitter" })).toBe(3);
    expect(getCreditCost("uploaderx", "platform_publish", { requestType: "x" })).toBe(3);
    expect(getCreditCost("uploaderx", "platform_publish", { requestType: "youtube" })).toBe(1);
    expect(getCreditCost("uploaderx", "platform_publish", { requestType: "facebook" })).toBe(1);
    expect(getCreditCost("uploaderx", "platform_publish", { requestType: "instagram" })).toBe(1);
    expect(getCreditCost("uploaderx", "platform_publish", { requestType: "linkedin" })).toBe(1);
    expect(getCreditCost("musitron", "music_generation", { model: "fal-ai/stable-audio/v2.5" })).toBe(30);
    expect(getCreditCost("musitron", "music_generation", { model: "beatoven/music-generation" })).toBe(15);
    expect(getCreditCost("clickatron", "variation", { model: "fal-ai/nano-banana-pro" })).toBe(6);
  });

  it("applies batch quantity inside canonical credit pricing", () => {
    expect(getCreditCost("clickatron", "variation", { quantity: 3 })).toBe(3);
    expect(getCreditCost("clickatron", "variation", { model: "fal-ai/nano-banana-pro", quantity: 2 })).toBe(12);
    expect(getCreditCost("pipeline", "storyboard_image_generation", { model: "photon-1", quantity: 4 })).toBe(16);
    expect(getCreditCost("clickatron", "variation", { quantity: 0 })).toBe(1);
    expect(getCreditCost("clickatron", "variation", { quantity: -2 })).toBe(1);
    expect(getCreditCost("clickatron", "variation", { quantity: 2.2 })).toBe(3);

    const creditsServiceSource = readRoute("lib/services/creditsService.ts");
    expect(creditsServiceSource).toContain("const cost = getCreditCost(service, action, options);");
    expect(creditsServiceSource).not.toContain("baseCost * (options?.quantity || 1)");
  });

  it("fails closed when a service or action is not priced", () => {
    expect(() => getCreditCost("unknown_service", "anything")).toThrow(CreditCostConfigurationError);
    expect(() => getCreditCost("clickatron", "generate_variation")).toThrow(/clickatron\.generate_variation/);
  });

  it("meters pipeline storyboard images by selected image model before worker dispatch", () => {
    const source = readRoute("app/api/services/pipeline/storyboard/generate/route.ts");

    expect(source).toContain("getCreditCost('pipeline', 'storyboard_image_generation', { model: resolvedModelId })");
    expect(source).toContain("{ model: resolvedModelId, quantity: scenes.length }");
    expect(source.indexOf("const resolvedModelId =")).toBeLessThan(
      source.indexOf("const costPerScene = getCreditCost"),
    );
    expect(source.indexOf("const costPerScene = getCreditCost")).toBeLessThan(
      source.indexOf("await createStoryboardImageBatch"),
    );
    expect(source).not.toContain("const costPerScene = 2");
  });

  it("meters pipeline voiceover by narration characters and provider", () => {
    const source = readRoute("app/api/services/pipeline/storyboard/[id]/voiceover/route.ts");

    expect(source).toContain("getBillableVoiceoverCharacterCount");
    expect(source).toContain("getVoiceoverProvider");
    expect(source).toContain("getCreditCost('pipeline', 'voiceover_generation'");
    expect(source).toContain("characterCount: billableCharacters");
    expect(source).toContain("requestType: voiceoverProvider");
    expect(source).toContain("refundVoiceoverCredits");
    expect(source.indexOf("const requiredCredits = getCreditCost")).toBeLessThan(
      source.indexOf("await generateVoiceover"),
    );
    expect(source).not.toContain("{ quantity: scenesWithNarration.length }");
  });
  it("meters pipeline BGM and SFX separately from storyboard finalize", () => {
    const source = readRoute("app/api/services/pipeline/storyboard/[id]/finalize/route.ts");

    expect(source).toContain("'storyboard_finalize'");
    expect(source).toContain("getBillableBgmDurationSeconds");
    expect(source).toContain("getBillableSfxDurationSeconds");
    expect(source).toContain("getSfxGenerationRequestType");
    expect(source).toContain("action: 'bgm_generation'");
    expect(source).toContain("action: 'sfx_generation'");
    expect(source).toContain("requestType: BGM_BILLING_PROVIDER");
    expect(source).toContain("requestType: getSfxGenerationRequestType(sfxInputs)");
    expect(source).toContain("refundPipelineAudioCredits");
    const conditionedBgmGeneration = "generateBackgroundMusic(musicPrompt, userId, totalDurationSec, {";
    expect(source).toContain(conditionedBgmGeneration);
    expect(source.indexOf("bgmCreditCharge = await deductPipelineAudioCredits")).toBeLessThan(
      source.indexOf(conditionedBgmGeneration),
    );
    expect(source.indexOf("action: 'sfx_generation'")).toBeLessThan(
      source.indexOf("type: 'sfx'"),
    );
  });
  it("keeps Clickatron generation routes wired to model-aware variation billing", () => {
    const routes = [
      "app/api/services/clickatron/session/route.ts",
      "app/api/services/clickatron/session/[id]/variation/route.ts",
      "app/api/services/clickatron/session/[id]/generative-fill/route.ts",
      "app/api/services/clickatron/session/[id]/sketch-to-edit/route.ts",
      "app/api/services/clickatron/sketch-to-edit/route.ts",
    ];

    for (const route of routes) {
      const source = readRoute(route);
      expect(source).not.toMatch(/checkCredits\(userId,\s*['"]clickatron['"],\s*['"]variation['"]\s*\)/);
      expect(source).toMatch(/checkCredits\(userId,\s*['"]clickatron['"],\s*['"]variation['"],\s*\{/);
    }
  });

  it("keeps Musitron refunds tied to model-aware generation pricing", () => {
    const source = readRoute("app/api/services/musitron/processor/route.ts");

    expect(source).not.toMatch(/refundCredits\([^,\n]+,\s*8,/);
    expect(source).toContain('getCreditCost("musitron", "music_generation"');
  });

  it("keeps Alyzitron refunds tied to analysis pricing", () => {
    const source = readRoute("app/api/services/alyzitron/processor/route.ts");

    expect(source).not.toContain("(task.usageMinutes || 1) * 2");
    expect(source).toContain('getCreditCost("alyzitron", "video_analysis"');
  });

  it("maps agency plans to paid legacy service-limit tiers", () => {
    const source = readRoute("lib/services/serviceUsageService.ts");

    expect(source).toContain("'agency_starter': 'plus'");
    expect(source).toContain("'agency_growth': 'pro'");
    expect(source).toContain("'agency_scale': 'premium'");
    expect(source).toContain(".replace(/[\\s-]+/g, '_')");
  });

  it("keeps unknown credit costs from becoming no-charge middleware grants", () => {
    const source = readRoute("lib/services/creditsMiddleware.ts");

    expect(source).toContain("CreditCostConfigurationError");
    expect(source).toContain("CREDIT_COST_NOT_CONFIGURED");
  });

  it("keeps Editron chat billing tied to the canonical chat model", () => {
    // gemini-3.1-flash-lite is GA (since 2026-05-07) and replaces the pulled -preview
    // variant. Chat is pinned to it via CHAT_MODEL_NAME (billing multiplier = 1).
    expect(CHAT_MODEL_NAME).toBe("gemini-3.1-flash-lite");

    const source = readRoute("app/api/services/editron/chat/stream/route.ts");

    expect(source).toContain("CHAT_MODEL_NAME");
    expect(source).toContain("new TokenTracker(CHAT_MODEL_NAME)");
    expect(source).toContain("model: tokenTracker.getModel()");
    expect(source).not.toContain("new TokenTracker('gemini-2.5-flash')");
    expect(source).not.toContain("model: 'gemini-2.5-flash'");
  });

  it("meters Editron render/export before Lambda or chapter render starts", () => {
    const source = readRoute("app/api/services/editron/cloudrun/render/route.ts");

    expect(source).toContain("checkCredits(userId, 'editron', 'render_export'");
    expect(source).toContain("durationMinutes: getBillableRenderMinutes(totalFrames, renderFps)");
    expect(source).toContain("requestType: getRenderExportRequestType(resolvedProps, usesChapterRendering)");
    expect(source).toContain("await renderCreditCheck.deduct()");
    expect(source).toContain("refundRenderExportCredits");
    expect(source.indexOf("await renderCreditCheck.deduct()")).toBeLessThan(
      source.indexOf("const { jobId, chapters } = await startChapterRender"),
    );
    expect(source.indexOf("await renderCreditCheck.deduct()")).toBeLessThan(
      source.indexOf("const { bucketName, renderId } = await renderMediaOnLambda"),
    );
  });
  it("meters Editron auto-edit analysis before project creation and worker dispatch", () => {
    const source = readRoute("app/api/services/editron/auto-edit/from-asset/route.ts");

    expect(source).toContain("checkCredits(userId, 'editron', 'auto_edit_analysis'");
    expect(source).toContain("durationMinutes: getBillableAutoEditMinutes(durationSec)");
    expect(source).toContain("requestType: getAutoEditAnalysisRequestType({ durationSec, referenceAssetId, imageAssetIds })");
    expect(source).toContain("await autoEditCreditCheck.deduct()");
    expect(source).toContain("refundAutoEditAnalysisCredits");
    expect(source.indexOf("await autoEditCreditCheck.deduct()")).toBeLessThan(
      source.indexOf("const projectName ="),
    );
    expect(source.indexOf("await autoEditCreditCheck.deduct()")).toBeLessThan(
      source.indexOf("const qstashRes = await fetch"),
    );
    expect(source.indexOf("autoEditAnalysisStarted = true;")).toBeGreaterThan(
      source.indexOf("if (!qstashRes.ok)"),
    );
  });
  it("meters Editron upload-triggered asset analysis before worker dispatch", () => {
    const source = readRoute("app/api/services/editron/media/upload/route.ts");

    expect(source).toContain("checkCredits(userId, 'editron', 'asset_analysis'");
    expect(source).toContain("durationMinutes: getBillableAssetAnalysisMinutes(fileType, verifiedDuration)");
    expect(source).toContain("requestType: getAssetAnalysisRequestType(fileType)");
    expect(source).toContain("await analysisCreditCheck.deduct()");
    expect(source).toContain("analysisSkippedReason: 'insufficient_credits'");
    expect(source).toContain("refundAssetAnalysisCredits");
    expect(source.indexOf("await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(mediaAsset)")).toBeLessThan(
      source.indexOf("checkCredits(userId, 'editron', 'asset_analysis'"),
    );
    expect(source.indexOf("await analysisCreditCheck.deduct()")).toBeLessThan(
      source.indexOf("/api/internal/workers/asset-analysis"),
    );
    expect(source.indexOf("analysisQueued = true;")).toBeLessThan(
      source.indexOf("/api/internal/workers/graph-sync"),
    );
  });
  it("meters Alyzitron chat and standalone transcription routes", () => {
    const chatRoute = readRoute("app/api/services/alyzitron/chat/route.ts");
    const transcribeRoute = readRoute("app/api/services/alyzitron/transcribe/route.ts");

    expect(chatRoute).toContain("await auth()");
    expect(chatRoute).toContain('"alyzitron"');
    expect(chatRoute).toContain('"chat_message"');
    expect(chatRoute).toContain("CreditsService.hasCredits");
    expect(chatRoute).toContain("CreditsService.deductCredits");
    expect(chatRoute).toContain("CreditsService.refundCredits");
    expect(chatRoute).toContain("model: ALYZITRON_CHAT_MODEL");

    expect(transcribeRoute).toContain("await auth()");
    expect(transcribeRoute).toContain('"transcription"');
    expect(transcribeRoute).toContain("getRequestedDurationMinutes");
    expect(transcribeRoute).toContain("CreditsService.hasCredits");
    expect(transcribeRoute).toContain("CreditsService.deductCredits");
    expect(transcribeRoute).toContain("CreditsService.refundCredits");
  });
  it("meters CalOS AI planning and wired deliverable generation", () => {
    const aiPlanRoute = readRoute("app/api/services/calos/ai-plan/route.ts");
    const generateRoute = readRoute("app/api/services/calos/generate/route.ts");

    expect(aiPlanRoute).toContain('checkCredits(userId, "calos", "ai_plan")');
    expect(aiPlanRoute).toContain("await creditCheck.deduct()");
    expect(aiPlanRoute).toContain("refundAiPlanCredits");

    expect(generateRoute).toContain('checkCredits(userId, "calos", "generate_deliverable", {');
    expect(generateRoute).toContain("requestType: service");
    expect(generateRoute).toContain("await generationCreditCheck.deduct()");
    expect(generateRoute).toContain("refundGenerationCredits");
    expect(generateRoute.indexOf("if (!generator)")).toBeLessThan(
      generateRoute.indexOf('checkCredits(userId, "calos", "generate_deliverable"'),
    );
  });
  it("meters Brand Vault refinery scans before queue scheduling", () => {
    const source = readRoute("app/api/brand-vault/refinery/jobs/route.ts");

    expect(source).toContain("checkCredits(userId, 'brand_vault', 'brand_scan'");
    expect(source).toContain("requestType: scanRequestType");
    expect(source).toContain("await creditCheck.deduct()");
    expect(source).toContain("refundBrandScanCredits");
    expect(source.indexOf("await creditCheck.deduct()")).toBeLessThan(
      source.indexOf("start = await startQueuedBrandVaultRefineryJobFromWebsite"),
    );
    expect(source.indexOf("start.response.status !== 202")).toBeLessThan(
      source.indexOf("scheduleQueueRun(() => runQueuedScan()"),
    );
  });
  it("meters X/Twitter UploaderX publish routes before paid tweet creation", () => {
    const twitterRoute = readRoute("app/api/services/uploaderx/twitter/route.ts");
    const chunkRoute = readRoute("app/api/services/uploaderx/twitter/chunk/route.ts");

    expect(twitterRoute).toContain('checkCredits(session.userId, "uploaderx", "platform_publish"');
    expect(twitterRoute).toContain('requestType: "twitter"');
    expect(twitterRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(twitterRoute.indexOf("if (existingTweetId)")).toBeLessThan(
      twitterRoute.indexOf('checkCredits(session.userId, "uploaderx", "platform_publish"'),
    );
    expect(twitterRoute.indexOf('checkCredits(session.userId, "uploaderx", "platform_publish"')).toBeLessThan(
      twitterRoute.indexOf('fetch("https://api.x.com/2/tweets"'),
    );

    expect(chunkRoute).toContain('phase === "publish"');
    expect(chunkRoute).toContain('checkCredits(session.userId, "uploaderx", "platform_publish"');
    expect(chunkRoute).toContain('requestType: "twitter"');
    expect(chunkRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(chunkRoute.indexOf('phase === "publish"')).toBeLessThan(
      chunkRoute.indexOf('checkCredits(session.userId, "uploaderx", "platform_publish"'),
    );
    expect(chunkRoute.indexOf('checkCredits(session.userId, "uploaderx", "platform_publish"')).toBeLessThan(
      chunkRoute.indexOf('fetch("https://api.x.com/2/tweets"'),
    );
  });
  it("meters Facebook and YouTube direct UploaderX publish routes before provider mutations", () => {
    const facebookRoute = readRoute("app/api/services/uploaderx/facebook/route.ts");
    const youtubeRoute = readRoute("app/api/services/uploaderx/youtube/route.ts");

    const facebookGate = 'checkCredits(session.userId, "uploaderx", "platform_publish"';
    const facebookExistingGateIndex = facebookRoute.indexOf(facebookGate);
    const facebookNewUploadGateIndex = facebookRoute.indexOf(facebookGate, facebookExistingGateIndex + 1);

    expect(facebookRoute).toContain(facebookGate);
    expect(facebookRoute).toContain('requestType: "facebook"');
    expect(facebookRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(facebookExistingGateIndex).toBeLessThan(
      facebookRoute.indexOf("const updateRes = await fetch"),
    );
    expect(facebookNewUploadGateIndex).toBeGreaterThan(facebookExistingGateIndex);
    expect(facebookNewUploadGateIndex).toBeLessThan(facebookRoute.indexOf("simpleUploadUrl"));

    expect(youtubeRoute).toContain('checkCredits(session.userId, "uploaderx", "platform_publish"');
    expect(youtubeRoute).toContain('requestType: "youtube"');
    expect(youtubeRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(youtubeRoute.indexOf('checkCredits(session.userId, "uploaderx", "platform_publish"')).toBeLessThan(
      youtubeRoute.indexOf("youtube.videos.update"),
    );
    expect(youtubeRoute.indexOf('checkCredits(session.userId, "uploaderx", "platform_publish"')).toBeLessThan(
      youtubeRoute.indexOf("youtube.videos.insert"),
    );
  });
  it("meters Instagram and LinkedIn direct UploaderX publish routes before provider mutations", () => {
    const instagramRoute = readRoute("app/api/services/uploaderx/instagram/route.ts");
    const linkedinRoute = readRoute("app/api/services/uploaderx/linkedin/route.ts");

    const instagramGate = 'checkCredits(session.userId, "uploaderx", "platform_publish"';
    const instagramGateIndex = instagramRoute.indexOf(instagramGate);
    expect(instagramRoute).toContain(instagramGate);
    expect(instagramRoute).toContain('requestType: "instagram"');
    expect(instagramRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(instagramRoute.indexOf("if (existingIgMediaId")).toBeLessThan(instagramGateIndex);
    expect(instagramGateIndex).toBeLessThan(instagramRoute.indexOf("graph.instagram.com/v21.0/me/media"));

    const linkedinGate = 'checkCredits(session.userId, "uploaderx", "platform_publish"';
    const linkedinGateIndex = linkedinRoute.indexOf(linkedinGate);
    expect(linkedinRoute).toContain(linkedinGate);
    expect(linkedinRoute).toContain('requestType: "linkedin"');
    expect(linkedinRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(linkedinRoute.indexOf("if (existingPost)")).toBeLessThan(linkedinGateIndex);
    expect(linkedinGateIndex).toBeLessThan(linkedinRoute.indexOf("const useRestMediaPath"));
    expect(linkedinGateIndex).toBeLessThan(linkedinRoute.indexOf("createLinkedInRestPost"));
  });
  it("meters UploaderX chunk publish routes before provider upload and finalize mutations", () => {
    const youtubeChunkRoute = readRoute("app/api/services/uploaderx/youtube/chunk/route.ts");
    const facebookChunkRoute = readRoute("app/api/services/uploaderx/facebook/chunk/route.ts");
    const instagramChunkRoute = readRoute("app/api/services/uploaderx/instagram/chunk/route.ts");
    const linkedinChunkRoute = readRoute("app/api/services/uploaderx/linkedin/chunk/route.ts");
    const gate = 'checkCredits(session.userId, "uploaderx", "platform_publish"';

    expect(youtubeChunkRoute).toContain('requestType: "youtube"');
    expect(youtubeChunkRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(youtubeChunkRoute.indexOf(gate)).toBeLessThan(
      youtubeChunkRoute.indexOf('"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable'),
    );
    expect(youtubeChunkRoute.indexOf(gate, youtubeChunkRoute.indexOf(gate) + 1)).toBeLessThan(
      youtubeChunkRoute.indexOf("const response = await fetch(uploadUrl"),
    );
    expect(youtubeChunkRoute.lastIndexOf(gate)).toBeLessThan(
      youtubeChunkRoute.indexOf("await UploaderXVideo.updateOne"),
    );

    expect(facebookChunkRoute).toContain('requestType: "facebook"');
    expect(facebookChunkRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(facebookChunkRoute.indexOf(gate)).toBeLessThan(
      facebookChunkRoute.indexOf("video_reels?access_token"),
    );
    expect(facebookChunkRoute.indexOf(gate, facebookChunkRoute.indexOf(gate) + 1)).toBeLessThan(
      facebookChunkRoute.indexOf("await axios.post(safeUploadUrl"),
    );
    expect(facebookChunkRoute.lastIndexOf(gate)).toBeLessThan(
      facebookChunkRoute.indexOf("video_reels", facebookChunkRoute.indexOf('phase === "finish"')),
    );

    expect(instagramChunkRoute).toContain('requestType: "instagram"');
    expect(instagramChunkRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(instagramChunkRoute.indexOf(gate)).toBeLessThan(
      instagramChunkRoute.indexOf("graph.instagram.com/v21.0/me/media"),
    );
    expect(instagramChunkRoute.indexOf(gate, instagramChunkRoute.indexOf(gate) + 1)).toBeLessThan(
      instagramChunkRoute.indexOf("rupload.facebook.com/ig-api-upload"),
    );
    expect(instagramChunkRoute.lastIndexOf(gate)).toBeLessThan(
      instagramChunkRoute.indexOf("graph.instagram.com/v21.0/me/media_publish"),
    );

    expect(linkedinChunkRoute).toContain('requestType: "linkedin"');
    expect(linkedinChunkRoute).toContain("await deductPublishCredits(publishCreditCheck)");
    expect(linkedinChunkRoute.indexOf(gate)).toBeLessThan(
      linkedinChunkRoute.indexOf("https://api.linkedin.com/rest/videos?action=initializeUpload"),
    );
    expect(linkedinChunkRoute.indexOf(gate, linkedinChunkRoute.indexOf(gate) + 1)).toBeLessThan(
      linkedinChunkRoute.indexOf("const uploadResponse = await fetch(safeUploadUrl"),
    );
    expect(linkedinChunkRoute.lastIndexOf(gate)).toBeLessThan(
      linkedinChunkRoute.indexOf("https://api.linkedin.com/rest/videos?action=finalizeUpload"),
    );
  });
  it("keeps Clickatron failure refunds on the configured variation action", () => {
    const source = readRoute("lib/services/tasks/handle-failure.ts");

    expect(source).not.toContain("generate_variation");
    expect(source).not.toContain("generate_ad");
    expect(source).toContain("const action = 'variation'");
    expect(source).toContain("getCreditCost('clickatron', action, { model })");
  });

  it("keeps Razorpay seed prices aligned to public agency subscription prices", () => {
    const expectedUsdMonthly = {
      agency_starter: 100,
      agency_growth: 500,
      agency_scale: 1000,
    } as const;

    for (const [planId, monthlyPrice] of Object.entries(expectedUsdMonthly)) {
      const publicPlan = SUBSCRIPTION_PLANS.find((plan) => plan.id === planId);
      expect(publicPlan?.price).toBe(monthlyPrice);
      expect(SERVICE_PRICING_CONFIGS[planId].USD.monthly.amount).toBe(monthlyPrice);
      expect(SERVICE_PRICING_CONFIGS[planId].USD.yearly.amount).toBe(monthlyPrice * 10);
    }
  });
});

describe("media capacity shown on the pricing card", () => {
  it("derives the cheapest video rate from the real credit costs", () => {
    // Cheapest current video model is kling-2.1 at 5 credits/sec. If a reprice makes
    // something cheaper, this updates automatically — the pricing card follows it.
    expect(getCheapestVideoCreditsPerSecond()).toBe(5);
  });

  it("computes plan media capacity (images + video seconds) from real prices", () => {
    // Images are 1 credit each, so image ceiling == the plan's media allocation.
    // Video seconds == allocation / cheapest-per-second. These are exactly what the
    // upgrade page renders, so the shown '~N min' can never drift from what we charge.
    const perSec = getCheapestVideoCreditsPerSecond();
    for (const planId of ["agency_starter", "agency_growth", "agency_scale"]) {
      const cap = getPlanMediaCapacity(planId);
      expect(cap.videoSeconds).toBe(Math.round(cap.images / perSec));
    }
    // Concrete anchors matching the live allocations (300 / 900 / 1500).
    expect(getPlanMediaCapacity("agency_starter")).toEqual({ images: 300, videoSeconds: 60 });
    expect(getPlanMediaCapacity("agency_growth")).toEqual({ images: 900, videoSeconds: 180 });
    expect(getPlanMediaCapacity("agency_scale")).toEqual({ images: 1500, videoSeconds: 300 });
  });
});
