import { describe, expect, it } from "vitest";

import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import type { SaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import {
  buildSaasProductEvidencePack,
  formatSaasProductEvidencePromptBlock,
} from "@/lib/editron/saas-explainer/product-evidence-pack";

describe("SaaS product evidence pack", () => {
  it("promotes accepted Brand Vault product and visual evidence into an admissible pack", () => {
    const input: NormalizedSaasExplainerIntake = {
      durationSec: 60,
      aspectRatio: "16:9",
      productUrl: "https://insturix.example/",
      productName: "Insturix",
      audience: "creator houses",
      outcome: "Show how teams run script, edit, analyze, design, and distribute in one workspace.",
      script: "Get your entire content production on one platform.",
      brandId: "brand_insturix",
    };
    const originalInput: NormalizedSaasExplainerIntake = {
      durationSec: 60,
      aspectRatio: "16:9",
      productUrl: "https://insturix.example/",
      brandId: "brand_insturix",
      script: "Get your entire content production on one platform.",
    };

    const pack = buildSaasProductEvidencePack({
      input,
      originalInput,
      productUrl: input.productUrl,
      brandContext: acceptedBrandContext(),
    });
    const promptBlock = formatSaasProductEvidencePromptBlock(pack);

    expect(pack.product).toMatchObject({
      name: "Insturix",
      nameSource: "brand_vault",
      productUrl: "https://insturix.example/",
      productUrlSource: "user_input",
    });
    expect(pack.coverage).toMatchObject({
      canUseBrandIdentity: true,
      canShowProductDemo: true,
      canUseProductUrl: true,
      canUseProofScenes: true,
      realProductEvidence: true,
      syntheticModeRequired: false,
    });
    expect(pack.coverage.coverageScore).toBeGreaterThanOrEqual(85);
    expect(pack.coverage.missingInputs).not.toEqual(expect.arrayContaining([
      "logo",
      "product_screenshots",
      "product_capabilities",
      "audience",
      "proof_claims",
      "script_or_outcome",
    ]));
    expect(pack.claimLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimType: "capability",
        text: "Script, edit, analyze, design, distribute, and share from one content production floor.",
        source: "brand_vault",
        admissible: true,
      }),
      expect.objectContaining({
        claimType: "proof",
        text: "One platform replaces scattered production handoffs.",
        source: "brand_vault",
        admissible: true,
      }),
      expect.objectContaining({
        claimType: "script",
        source: "script",
        admissible: true,
      }),
    ]));
    expect(promptBlock).toContain("Real product UI evidence: yes");
    expect(promptBlock).toContain("Product UI/image assets: Insturix workspace <https://insturix.example/dashboard.png>");
    expect(promptBlock).toContain("Use only admissible claim-ledger facts");
  });

  it("marks product URL without screenshots as synthetic mode, not real product proof", () => {
    const input: NormalizedSaasExplainerIntake = {
      durationSec: 45,
      aspectRatio: "16:9",
      productUrl: "https://sparse.example/",
      productName: "SparseApp",
      outcome: "Explain the onboarding workflow.",
    };

    const pack = buildSaasProductEvidencePack({
      input,
      productUrl: input.productUrl,
      brandContext: sparseBrandContext(),
    });
    const promptBlock = formatSaasProductEvidencePromptBlock(pack);

    expect(pack.coverage).toMatchObject({
      canUseBrandIdentity: false,
      canShowProductDemo: false,
      canUseProductUrl: true,
      canUseProofScenes: false,
      realProductEvidence: false,
      syntheticModeRequired: true,
    });
    expect(pack.coverage.missingInputs).toEqual(expect.arrayContaining([
      "brand_vault",
      "logo",
      "product_screenshots",
      "product_capabilities",
      "audience",
      "proof_claims",
    ]));
    expect(pack.coverage.missingInputs).not.toEqual(expect.arrayContaining([
      "product_name",
      "product_url",
      "script_or_outcome",
    ]));
    expect(pack.degradations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "product_url_without_visual_capture",
        severity: "info",
      }),
      expect.objectContaining({
        code: "product_screenshots",
        severity: "warning",
      }),
    ]));
    expect(promptBlock).toContain("Real product UI evidence: no");
    expect(promptBlock).toContain("Synthetic mode required: yes");
    expect(promptBlock).toContain("do not pretend abstract/generated UI is the real product");
  });
});

function acceptedBrandContext(): SaasExplainerBrandContext {
  return {
    promptBlock: "<saas_explainer_brand_vault_context>Insturix</saas_explainer_brand_vault_context>",
    brandInputs: {
      primaryColor: "#121212",
      accentColor: "#ff5a1f",
      headingFont: "Inter",
    },
    defaults: {
      brief: {
        productName: "Insturix",
        productServices: [
          "Script, edit, analyze, design, distribute, and share from one content production floor.",
        ],
        audience: ["creator houses", "content teams"],
        valueDrivers: ["One platform replaces scattered production handoffs."],
        painPoints: ["Creative work gets trapped between separate tools."],
        jobsToBeDone: ["Launch more content without rebuilding the workflow every time."],
        proofStyle: "demo",
        outcomeHint: "Create a product-led SaaS explainer for Insturix.",
      },
      visual: {
        colors: ["#121212", "#ff5a1f", "#f7f2ea"],
        fonts: ["Inter", "Geist"],
        logoAssets: [
          {
            kind: "logo",
            label: "Insturix mark",
            url: "https://insturix.example/logo.svg",
            stored: true,
            signalPath: "visualIdentity.logos[0]",
            sourceType: "uploaded_asset",
          },
        ],
        productImages: [
          {
            kind: "product_image",
            label: "Insturix workspace",
            url: "https://insturix.example/dashboard.png",
            stored: true,
            signalPath: "visualIdentity.images[0]",
            sourceType: "first_party_website",
          },
        ],
        signalPaths: ["visualIdentity.colors", "visualIdentity.images"],
      },
      motion: {
        motionEnergy: 0.64,
        transitionSharpness: 0.72,
        signalPaths: ["motion.motionEnergy"],
      },
    },
    voiceSignals: {
      assertiveness: 0.74,
      warmth: 0.52,
      recurringPhrases: ["production floor"],
      signalPaths: ["voice.assertiveness"],
    },
    missingInputs: [],
    metadata: {
      source: "brand_vault",
      brandId: "brand_insturix",
      recordId: "record_insturix",
      jobId: "job_insturix",
      acceptedProfile: true,
      promptContextProvided: true,
      brandInputKeys: ["primaryColor", "accentColor", "headingFont"],
      missingInputs: [],
      defaultContract: {
        productName: "Insturix",
        productServices: 1,
        audience: 2,
        valueDrivers: 1,
        painPoints: 1,
        jobsToBeDone: 1,
        proofStyle: "demo",
        outcomeHintProvided: true,
        colorCount: 3,
        fontCount: 2,
        logoAssetCount: 1,
        productImageCount: 1,
        visualSignalPaths: ["visualIdentity.colors", "visualIdentity.images"],
        motionSignalPaths: ["motion.motionEnergy"],
      },
    },
  };
}

function sparseBrandContext(): SaasExplainerBrandContext {
  return {
    promptBlock: "",
    brandInputs: {},
    defaults: {
      brief: {
        productServices: [],
        audience: [],
        valueDrivers: [],
        painPoints: [],
        jobsToBeDone: [],
      },
      visual: {
        colors: [],
        fonts: [],
        logoAssets: [],
        productImages: [],
        signalPaths: [],
      },
      motion: {
        signalPaths: [],
      },
    },
    missingInputs: ["accepted_brand_vault_profile", "brand_logo", "brand_product_images"],
    metadata: {
      source: "not_requested",
      acceptedProfile: false,
      promptContextProvided: false,
      brandInputKeys: [],
      missingInputs: ["accepted_brand_vault_profile", "brand_logo", "brand_product_images"],
    },
  };
}
