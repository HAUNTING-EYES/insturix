import { describe, expect, it } from "vitest";

import type { SaasDirectorContract, SaasDirectorSceneBeat } from "@/lib/editron/saas-explainer/director-contract";
import type { SaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import { buildSaasGeneratedSceneOverlays } from "@/lib/editron/saas-explainer/generated-scene";
import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";

describe("SaaS GeneratedScene director bridge", () => {
  it("uses director scene beats before text-based family inference", () => {
    const overlays = buildSaasGeneratedSceneOverlays({
      scenes: [
        scene({
          sceneIndex: 0,
          title: "Proof metric: 400% ROI",
          narration: "Move through the workspace and show the production path.",
          visualDescription: "This text would previously look like proof_metric, but director says workflow.",
        }),
      ],
      dimensions: { fps: 30, width: 1920, height: 1080 },
      input: intake(),
      brandContext: acceptedBrandContext(),
      directorContract: directorContract([
        directorBeat({
          family: "workflow_demo",
          visualArchetype: "UI_FRAMED",
          evidenceDuty: ["Show the verified product workflow image and hold long enough for UI proof."],
          admissibleClaimIds: ["capability_1"],
          productAssetUse: { logo: false, productImage: true, productUrl: true },
          copyRole: "explain the product workflow",
        }),
      ]),
    });

    const generated = overlays.find((overlay) => overlay.type === "generated-scene");

    expect(generated?.sceneModel.familyPlan).toMatchObject({
      family: "workflow_demo",
      evidenceSource: "director_contract",
      claimMode: "evidence_backed",
      visualArchetype: "UI_FRAMED",
      evidenceStatus: "satisfied",
      directorBeatIndex: 0,
      admissibleClaimIds: ["capability_1"],
      productAssetUse: { logo: false, productImage: true, productUrl: true },
    });
    expect(generated?.metadata).toMatchObject({
      directorStructureId: "launch_60s",
      directorBeatIndex: 0,
    });
    expect(generated?.sourceMap.director).toMatchObject({
      structureId: "launch_60s",
      beatIndex: 0,
      admissibleClaimIds: ["capability_1"],
    });
    expect(generated?.sceneModel.assets).toMatchObject({
      productUrl: "https://insturix.example/",
      logos: [expect.objectContaining({ label: "Insturix mark", url: "https://insturix.example/logo.svg" })],
      productImages: [expect.objectContaining({ label: "Insturix workspace", url: "https://insturix.example/dashboard.png" })],
    });
    expect(generated?.sourceMap.brand.visualAssets).toMatchObject({
      logos: ["https://insturix.example/logo.svg"],
      productImages: ["https://insturix.example/dashboard.png"],
    });
    expect(generated?.sceneModel.qualityGates.productSpecificVisualProof).toBe(true);
  });

  it("keeps director-declared synthetic mode from passing as real product proof", () => {
    const overlays = buildSaasGeneratedSceneOverlays({
      scenes: [
        scene({
          sceneIndex: 0,
          title: "Real dashboard walkthrough",
          narration: "Explain the abstract onboarding flow.",
          visualDescription: "Declared abstract diagram, not the actual product UI.",
        }),
      ],
      dimensions: { fps: 30, width: 1920, height: 1080 },
      input: intake(),
      brandContext: sparseBrandContext(),
      directorContract: directorContract([
        directorBeat({
          family: "feature_demo",
          visualArchetype: "DIAGRAM_SCHEMATIC",
          claimPolicy: "synthetic_demo_only",
          evidenceStatus: "degraded",
          evidenceDuty: ["Declare abstraction; do not costume generated UI as the real product."],
          productAssetUse: { logo: false, productImage: false, productUrl: false },
          copyRole: "explain one abstract product-adjacent capability",
        }),
      ], {
        syntheticModeRequired: true,
        realProductEvidence: false,
        productDemoEnabled: false,
      }),
    });

    const generated = overlays.find((overlay) => overlay.type === "generated-scene");

    expect(generated?.sceneModel.familyPlan).toMatchObject({
      family: "feature_demo",
      evidenceSource: "director_contract",
      claimMode: "synthetic_demo_only",
      visualArchetype: "DIAGRAM_SCHEMATIC",
      evidenceStatus: "degraded",
      productAssetUse: { logo: false, productImage: false, productUrl: false },
    });
    expect(generated?.sceneModel.qualityGates.productSpecificVisualProof).toBe(false);
    expect(generated?.sceneModel.qualityGates.finalVisualProof).toBe(false);
  });

  it("assigns deterministic fallback archetypes when no director contract is present", () => {
    const overlays = buildSaasGeneratedSceneOverlays({
      scenes: [
        scene({ sceneIndex: 0, title: "Open Insturix", visualDescription: "Introduce the product workspace." }),
        scene({
          sceneIndex: 1,
          title: "Feature: script and edit",
          visualDescription: "Show the feature capability inside the product workspace.",
        }),
        scene({
          sceneIndex: 2,
          title: "Feature: analyze and distribute",
          visualDescription: "Show another feature capability with a different product focus.",
        }),
        scene({ sceneIndex: 3, title: "Get started", visualDescription: "CTA with product URL." }),
      ],
      dimensions: { fps: 30, width: 1920, height: 1080 },
      input: intake(),
      brandContext: acceptedBrandContext(),
    });

    const featurePlans = overlays
      .filter((overlay) => overlay.type === "generated-scene")
      .map((overlay) => overlay.sceneModel.familyPlan)
      .filter((plan) => plan.family === "feature_demo");

    expect(featurePlans).toHaveLength(2);
    expect(featurePlans.map((plan) => plan.visualArchetype)).toEqual(["UI_FRAMED", "CURSOR_HERO"]);
    expect(featurePlans.every((plan) => plan.evidenceSource === "product_url")).toBe(true);
  });
});

function scene(overrides: Partial<SceneDescriptor>): SceneDescriptor {
  return {
    sceneIndex: 0,
    title: "Scene",
    narration: "Narration.",
    visualDescription: "Visual.",
    videoMotionPrompt: "Measured UI movement.",
    audioDescription: "",
    musicDescription: "",
    sfxDescription: "",
    durationSeconds: 6,
    mood: "focused",
    imageQualityTokens: "clean SaaS UI",
    videoQualityTokens: "readable UI motion",
    generationUnitId: "unit_1",
    primaryVisualForUnit: true,
    sceneType: "continuous",
    assetRecommendation: "ai-video",
    ...overrides,
  };
}

function intake(): NormalizedSaasExplainerIntake {
  return {
    durationSec: 60,
    aspectRatio: "16:9",
    productName: "Insturix",
    productUrl: "https://insturix.example/",
    outcome: "Create a product-led launch explainer.",
    brandId: "brand_insturix",
  };
}

function directorBeat(overrides: Partial<SaasDirectorSceneBeat>): SaasDirectorSceneBeat {
  return {
    index: 0,
    family: "workflow_demo",
    sourceFamilyExpression: "workflow_demo",
    startSec: 0,
    endSec: 6,
    durationSec: 6,
    visualArchetype: "UI_FRAMED",
    claimPolicy: "evidence_backed",
    evidenceStatus: "satisfied",
    evidenceDuty: ["Show verified product evidence."],
    admissibleClaimIds: [],
    productAssetUse: { logo: false, productImage: true, productUrl: true },
    copyRole: "explain the product workflow",
    directorNotes: [],
    ...overrides,
  };
}

function directorContract(
  sequence: SaasDirectorSceneBeat[],
  evidenceAuditOverrides: Partial<SaasDirectorContract["evidenceAudit"]> = {},
): SaasDirectorContract {
  return {
    schemaVersion: "saas-director-contract/v1",
    doctrineVersion: "1.2.0",
    selectedStructure: {
      id: "launch_60s",
      sourceStructureId: "launch_60s",
      requestedDurationSec: 60,
      targetDurationSec: 60,
      selectionReason: "test",
    },
    narrationMode: "vo",
    evidenceAudit: {
      realProductEvidence: true,
      syntheticModeRequired: false,
      proofMetricEnabled: false,
      socialProofEnabled: false,
      productDemoEnabled: true,
      disabledFamilies: [],
      substitutions: [],
      degradations: [],
      ...evidenceAuditOverrides,
    },
    sequence,
    hardGateIds: ["G1_prompt_leakage", "G4_fake_dashboard", "G6_product_evidence_floor"],
    antiPatternsToAvoid: ["fake_dashboard"],
    referenceUsage: { provided: false, policy: "style_parameters_only" },
    directives: ["Use director beats."],
  };
}

function acceptedBrandContext(): SaasExplainerBrandContext {
  return {
    promptBlock: "<brand>Insturix</brand>",
    brandInputs: {
      primaryColor: "#121212",
      accentColor: "#ff5a1f",
      headingFont: "Inter",
    },
    defaults: {
      brief: {
        productName: "Insturix",
        productServices: ["Unified production workspace"],
        audience: ["creator houses"],
        valueDrivers: ["One platform replaces scattered production handoffs."],
        painPoints: ["Creative work gets trapped between separate tools."],
        jobsToBeDone: ["Launch more content without rebuilding the workflow every time."],
        proofStyle: "demo",
      },
      visual: {
        colors: ["#121212", "#ff5a1f"],
        fonts: ["Inter"],
        logoAssets: [
          {
            kind: "logo",
            label: "Insturix mark",
            url: "https://insturix.example/logo.svg",
            stored: true,
          },
        ],
        productImages: [
          {
            kind: "product_image",
            label: "Insturix workspace",
            url: "https://insturix.example/dashboard.png",
            stored: true,
          },
        ],
        signalPaths: ["visualIdentity.images"],
      },
      motion: {
        motionEnergy: 0.64,
        signalPaths: ["motion.motionEnergy"],
      },
    },
    missingInputs: [],
    metadata: {
      source: "brand_vault",
      brandId: "brand_insturix",
      acceptedProfile: true,
      promptContextProvided: true,
      brandInputKeys: ["primaryColor", "accentColor", "headingFont"],
      missingInputs: [],
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
