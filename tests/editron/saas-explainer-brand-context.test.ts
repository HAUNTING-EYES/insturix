import { describe, expect, it } from "vitest";

import { resolveSaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import { buildSaasGeneratedSceneOverlays } from "@/lib/editron/saas-explainer/generated-scene";
import {
  acceptBrandVaultSignalProfileDraft,
  createBrandVaultWebsiteDraftJob,
} from "@/lib/shared/brand-vault-draft-orchestrator";
import { createInMemoryBrandVaultRefineryStore } from "@/lib/shared/brand-vault-refinery-api";

const NOW = "2026-06-30T12:00:00.000Z";

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Signal House - Video systems for B2B teams</title>
    <meta name="description" content="Signal House helps agencies launch trusted video systems with fast production workflows.">
    <meta property="og:site_name" content="Signal House">
    <meta property="og:image" content="/share-card.jpg">
    <meta name="theme-color" content="#0b1b2b">
    <style>
      :root { --brand: #0b1b2b; --accent: #2ee6a6; --paper: #f5f7fa; }
      body { color: #0b1b2b; background: #f5f7fa; font-family: "Inter", system-ui, sans-serif; }
      a { color: #2ee6a6; }
    </style>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Signal House",
        "description": "A video operations partner for B2B agencies.",
        "logo": "https://signal.example/logo.svg"
      }
    </script>
  </head>
  <body>
    <h1>Launch trusted video systems in days</h1>
    <h2>Fast workflows for agency operators</h2>
    <a href="/demo">Book a demo</a>
    <blockquote>Trusted by 120 agency teams to ship faster.</blockquote>
    <img alt="Signal House logo" src="/logo.svg">
    <img alt="Signal House product dashboard" class="product-card" src="/product-dashboard.png">
  </body>
</html>
`;

function htmlResponse(): Response {
  return new Response(HTML, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

describe("SaaS explainer Brand Vault context", () => {
  it("builds context from accepted record, review payload, visual identity, uploads, and diagnostics", async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const draft = await createBrandVaultWebsiteDraftJob(
      {
        userId: "user_signal",
        orgId: "org_signal",
        brandId: "brand_signal",
        websiteUrl: "signal.example",
        socialLinks: ["https://x.com/signalhouse"],
        jobId: "job_signal_saas",
        profileRecordId: "record_signal_saas",
        now: NOW,
        sourceEvidence: [
          {
            kind: "uploaded_guideline",
            name: "brand-book.pdf",
            mimeType: "application/pdf",
            sizeBytes: 420_000,
            text: [
              "Color palette: #102033 #ffcc33 #f7f7f7",
              "Tone: precise, editorial, operator-first.",
              "Do not use stock-photo language.",
              "Avoid neon gradients.",
            ].join("\n"),
            assetRole: "brand_book",
          },
          {
            kind: "uploaded_asset",
            name: "primary-logo.svg",
            url: "https://signal.example/assets/primary-logo.svg",
            mimeType: "image/svg+xml",
            dominantColors: ["#102033", "#ffcc33"],
            assetRole: "logo",
          },
        ],
      },
      {
        repository: store,
        fetchOptions: {
          fetchFn: async (url, init) => {
            const target = String(url);
            if (init?.method === "HEAD" && /\.(?:svg|png|jpg)$/i.test(target)) {
              return new Response("", {
                status: 200,
                headers: { "content-type": target.endsWith(".svg") ? "image/svg+xml" : "image/png" },
              });
            }
            return htmlResponse();
          },
        },
      },
    );

    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error.message);

    await store.saveJobSnapshot({
      job: draft.job,
      recordId: draft.record.id,
      normalizedUrl: draft.normalizedUrl,
      candidates: draft.candidates,
      reviewPayload: draft.reviewPayload,
    });
    const accepted = acceptBrandVaultSignalProfileDraft(store, draft.record.id, {
      actorId: "brand_manager",
      now: "2026-06-30T12:05:00.000Z",
    });
    expect(accepted.ok).toBe(true);

    const context = await resolveSaasExplainerBrandContext({
      userId: "user_signal",
      orgId: "org_signal",
      brandId: "brand_signal",
      store,
    });

    expect(context.metadata).toMatchObject({
      source: "brand_vault",
      brandId: "brand_signal",
      recordId: "record_signal_saas",
      jobId: "job_signal_saas",
      acceptedProfile: true,
      reviewPayloadProvided: true,
      intakeStatuses: {
        website: "complete",
        social: "needs_auth",
        uploads: "complete",
      },
    });
    expect(context.metadata.candidateCount).toBeGreaterThan(0);
    expect(context.metadata.evidenceCount).toBeGreaterThan(0);
    expect(context.metadata.visualIdentityCounts).toMatchObject({
      colors: expect.any(Number),
      fonts: expect.any(Number),
      logos: expect.any(Number),
      images: expect.any(Number),
    });
    expect(context.metadata.visualIdentityCounts?.logos).toBeGreaterThan(0);
    expect(context.metadata.visualIdentityCounts?.images).toBeGreaterThan(0);
    expect(context.metadata.diagnosticSummary?.signalCount).toBeGreaterThan(0);
    expect(context.metadata.defaultContract).toMatchObject({
      productName: "Signal House",
      productServices: expect.any(Number),
      audience: expect.any(Number),
      outcomeHintProvided: true,
      logoAssetCount: expect.any(Number),
      productImageCount: expect.any(Number),
    });
    expect(context.metadata.defaultContract?.productServices).toBeGreaterThan(0);
    expect(context.metadata.defaultContract?.logoAssetCount).toBeGreaterThan(0);
    expect(context.metadata.defaultContract?.productImageCount).toBeGreaterThan(0);

    expect(context.defaults.brief.productName).toBe("Signal House");
    expect(context.defaults.brief.productServices.length).toBeGreaterThan(0);
    expect(Array.isArray(context.defaults.brief.audience)).toBe(true);
    expect(context.defaults.brief.outcomeHint).toContain("product-led SaaS explainer");
    expect(context.defaults.visual.colors).toEqual(expect.arrayContaining(["#0b1b2b", "#2ee6a6"]));
    expect(context.defaults.visual.fonts.join(" ")).toContain("Inter");
    expect(context.defaults.visual.logoAssets[0]).toMatchObject({
      kind: "logo",
      stored: expect.any(Boolean),
    });
    expect(context.defaults.visual.productImages.length).toBeGreaterThan(0);
    expect(Array.isArray(context.defaults.visual.signalPaths)).toBe(true);
    expect(Array.isArray(context.defaults.motion.signalPaths)).toBe(true);

    expect(context.brandInputs.primaryColor).toBe("#0b1b2b");
    expect(context.brandInputs.accentColor).toBe("#2ee6a6");
    expect(context.brandInputs.headingFont).toContain("Inter");
    expect(context.missingInputs).not.toEqual(expect.arrayContaining([
      "brand_review_payload",
      "brand_product_images",
      "brand_logo",
    ]));
    expect(context.promptBlock).toContain("<brand_default_brief>");
    expect(context.promptBlock).toContain("Default product name: Signal House");
    expect(context.promptBlock).toContain("<brand_visual_defaults>");
    expect(context.promptBlock).toContain("<brand_visual_identity>");
    expect(context.promptBlock).toContain("Logo assets:");
    expect(context.promptBlock).toContain("Product/social/preview images:");
    expect(context.promptBlock).toContain("Fonts: Inter");
    expect(context.promptBlock).toContain("<brand_vault_evidence>");
    expect(context.promptBlock).toContain("uploaded_guideline");
    expect(context.promptBlock).toContain("<brand_signal_diagnostics>");
    expect(context.promptBlock).toContain("Do not use stock-photo language");

    const overlays = buildSaasGeneratedSceneOverlays({
      scenes: [{
        sceneIndex: 0,
        title: "Hook",
        narration: "Launch trusted video systems in days.",
        visualDescription: "Show the product dashboard and proof panel.",
        videoMotionPrompt: "Slow push across the dashboard.",
        audioDescription: "",
        musicDescription: "",
        sfxDescription: "",
        durationSeconds: 6,
        mood: "energetic",
        imageQualityTokens: "clean SaaS dashboard",
        videoQualityTokens: "subtle product demo motion",
        generationUnitId: "unit_1",
        primaryVisualForUnit: true,
        sceneType: "continuous",
        assetRecommendation: "ai-video",
      }],
      dimensions: { width: 1920, height: 1080, fps: 30 },
      input: { durationSec: 45, aspectRatio: "16:9", brandId: "brand_signal" },
      brandContext: context,
    });
    const generatedScene = overlays.find((overlay) => overlay.type === "generated-scene");
    expect(generatedScene).toBeTruthy();
    expect(generatedScene.sceneModel.productName).toBe("Signal House");
    expect(generatedScene.sceneModel.brandContext).toMatchObject({
      defaultProductName: "Signal House",
      visual: expect.objectContaining({
        logoAssetCount: expect.any(Number),
        productImageCount: expect.any(Number),
      }),
      motion: expect.objectContaining({ signalPaths: expect.any(Array) }),
    });
    expect(generatedScene.sceneModel.brandContext.productServices.length).toBeGreaterThan(0);
    expect(Array.isArray(generatedScene.sceneModel.brandContext.audience)).toBe(true);
    expect(generatedScene.sceneModel.qualityGates).toMatchObject({
      productSpecificVisualProof: true,
      finalVisualProof: false,
    });
    expect(generatedScene.sourceMap.brand).toMatchObject({
      defaultProductName: "Signal House",
      visualAssetCounts: expect.objectContaining({
        logos: expect.any(Number),
        productImages: expect.any(Number),
      }),
      motionSignalPaths: expect.any(Array),
    });
  });
});
