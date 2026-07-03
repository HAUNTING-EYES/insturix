import { describe, expect, it } from "vitest";

import type { SaasProductEvidencePack } from "@/lib/editron/saas-explainer/product-evidence-pack";
import {
  buildSaasDirectorContract,
  formatSaasDirectorPromptBlock,
} from "@/lib/editron/saas-explainer/director-contract";

describe("SaaS director contract", () => {
  it("selects a launch structure and substitutes proof scenes when only UI proof is grounded", () => {
    const contract = buildSaasDirectorContract({
      input: {
        durationSec: 60,
        aspectRatio: "16:9",
        productName: "Insturix",
        productUrl: "https://insturix.example/",
        outcome: "Create a product-led launch explainer.",
        brandId: "brand_insturix",
      },
      productEvidencePack: richEvidencePack(),
      referenceProvided: false,
    });
    const promptBlock = formatSaasDirectorPromptBlock(contract);

    expect(contract.selectedStructure).toMatchObject({
      id: "launch_60s",
      sourceStructureId: "launch_60s",
      targetDurationSec: 60,
    });
    expect(contract.sequence.map((scene) => scene.family)).toEqual(expect.arrayContaining([
      "hook",
      "problem",
      "workflow_demo",
      "feature_demo",
      "ui_proof",
      "cta",
      "logo_outro",
    ]));
    expect(contract.evidenceAudit).toMatchObject({
      realProductEvidence: true,
      syntheticModeRequired: false,
      productDemoEnabled: true,
      proofMetricEnabled: false,
      socialProofEnabled: false,
    });
    expect(contract.evidenceAudit.substitutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "proof_metric+social_proof",
        to: "ui_proof",
      }),
    ]));
    expect(contract.hardGateIds).toEqual(expect.arrayContaining([
      "G1_prompt_leakage",
      "G4_fake_dashboard",
      "G5_fabricated_claims",
      "G6_product_evidence_floor",
    ]));
    expect(contract.sequence.find((scene) => scene.family === "workflow_demo")?.productAssetUse.productImage).toBe(true);
    expect(promptBlock).toContain("Selected structure: launch_60s");
    expect(promptBlock).toContain("proof_metric requires exact sourced numbers");
    expect(promptBlock).toContain("Write viewer-facing scene text only");
  });

  it("downgrades long requests without product screenshots to a declared abstract teaser floor", () => {
    const contract = buildSaasDirectorContract({
      input: {
        durationSec: 90,
        aspectRatio: "16:9",
        productName: "SparseApp",
        productUrl: "https://sparse.example/",
        outcome: "Explain onboarding.",
      },
      productEvidencePack: sparseEvidencePack(),
      referenceProvided: true,
    });
    const promptBlock = formatSaasDirectorPromptBlock(contract);

    expect(contract.selectedStructure).toMatchObject({
      id: "teaser_30s",
      sourceStructureId: "teaser_30s",
      targetDurationSec: 30,
      variant: "declared_abstract_only",
      degradedFromStructureId: "demo_90s",
    });
    expect(contract.evidenceAudit).toMatchObject({
      realProductEvidence: false,
      syntheticModeRequired: true,
      productDemoEnabled: false,
    });
    expect(contract.evidenceAudit.disabledFamilies).toEqual(expect.arrayContaining([
      "real_product_ui_families",
      "proof_metric",
      "social_proof",
      "logo_outro_logo_asset",
    ]));
    expect(contract.evidenceAudit.degradations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "core_floor_no_real_product_evidence" }),
      expect.objectContaining({ code: "duration_structure_degraded" }),
      expect.objectContaining({ code: "reference_style_only" }),
    ]));
    expect(contract.sequence.every((scene) => scene.claimPolicy === "synthetic_demo_only")).toBe(true);
    expect(contract.sequence.some((scene) => scene.visualArchetype.startsWith("UI_"))).toBe(false);
    expect(contract.evidenceAudit.substitutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "ui_proof|proof_metric",
        to: "feature_demo",
      }),
    ]));
    expect(promptBlock).toContain("Degraded from: demo_90s");
    expect(promptBlock).toContain("No framed real-product demo scenes are allowed");
  });
});

function richEvidencePack(): SaasProductEvidencePack {
  return {
    schemaVersion: "saas-product-evidence-pack/v1",
    doctrineVersion: "1.2.0",
    product: {
      name: "Insturix",
      nameSource: "brand_vault",
      productUrl: "https://insturix.example/",
      productUrlSource: "user_input",
    },
    brief: {
      audience: ["creator houses", "content teams"],
      outcome: { provided: true, length: 38 },
      script: { provided: false, length: 0 },
      productServices: [
        "Script, edit, analyze, design, distribute, and share from one workspace.",
        "Plan multi-step video production with brand context.",
      ],
      valueDrivers: ["One platform replaces scattered production handoffs."],
      painPoints: ["Creative work gets trapped between separate tools."],
      jobsToBeDone: ["Launch more content without rebuilding the workflow every time."],
      proofStyle: "demo",
    },
    visualIdentity: {
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
      hasLogo: true,
      hasProductImages: true,
      sourcePaths: ["visualIdentity.images"],
    },
    claimLedger: [
      {
        id: "outcome",
        claimType: "outcome",
        text: "Create a product-led launch explainer.",
        source: "user_input",
        admissible: true,
      },
      {
        id: "capability_1",
        claimType: "capability",
        text: "Script, edit, analyze, design, distribute, and share from one workspace.",
        source: "brand_vault",
        admissible: true,
      },
      {
        id: "value_driver_1",
        claimType: "proof",
        text: "One platform replaces scattered production handoffs.",
        source: "brand_vault",
        admissible: true,
      },
      {
        id: "pain_1",
        claimType: "pain",
        text: "Creative work gets trapped between separate tools.",
        source: "brand_vault",
        admissible: true,
      },
    ],
    coverage: {
      canUseBrandIdentity: true,
      canShowProductDemo: true,
      canUseProductUrl: true,
      canUseProofScenes: true,
      realProductEvidence: true,
      syntheticModeRequired: false,
      coverageScore: 89,
      missingInputs: [],
      counts: {
        claims: 4,
        admissibleClaims: 4,
        logos: 1,
        productImages: 1,
        colors: 3,
        fonts: 2,
      },
    },
    degradations: [],
  };
}

function sparseEvidencePack(): SaasProductEvidencePack {
  return {
    schemaVersion: "saas-product-evidence-pack/v1",
    doctrineVersion: "1.2.0",
    product: {
      name: "SparseApp",
      nameSource: "user_input",
      productUrl: "https://sparse.example/",
      productUrlSource: "user_input",
    },
    brief: {
      audience: [],
      outcome: { provided: true, length: 19 },
      script: { provided: false, length: 0 },
      productServices: [],
      valueDrivers: [],
      painPoints: [],
      jobsToBeDone: [],
    },
    visualIdentity: {
      colors: [],
      fonts: [],
      logoAssets: [],
      productImages: [],
      hasLogo: false,
      hasProductImages: false,
      sourcePaths: [],
    },
    claimLedger: [
      {
        id: "outcome",
        claimType: "outcome",
        text: "Explain onboarding.",
        source: "user_input",
        admissible: true,
      },
    ],
    coverage: {
      canUseBrandIdentity: false,
      canShowProductDemo: false,
      canUseProductUrl: true,
      canUseProofScenes: false,
      realProductEvidence: false,
      syntheticModeRequired: true,
      coverageScore: 33,
      missingInputs: ["brand_vault", "logo", "product_screenshots", "product_capabilities", "audience", "proof_claims"],
      counts: {
        claims: 1,
        admissibleClaims: 1,
        logos: 0,
        productImages: 0,
        colors: 0,
        fonts: 0,
      },
    },
    degradations: [
      {
        code: "product_url_without_visual_capture",
        severity: "info",
        message: "A product URL is present, but there are no verified product UI screenshots yet.",
      },
    ],
  };
}
