import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const remotionState = vi.hoisted(() => ({ frame: 48 }));

vi.mock("remotion", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");

  return {
    Img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => ReactActual.createElement("img", props),
    Easing: {
      bezier: () => (value: number) => value,
      cubic: (value: number) => value * value * value,
      in: (easing: (value: number) => number) => (value: number) => easing(value),
    },
    interpolate: (
      input: number,
      inputRange: number[],
      outputRange: number[],
      options?: {
        easing?: (value: number) => number;
        extrapolateLeft?: "clamp";
        extrapolateRight?: "clamp";
      },
    ) => {
      const lastIndex = inputRange.length - 1;
      let segment = 0;
      while (segment < lastIndex - 1 && input > inputRange[segment + 1]) segment += 1;

      const start = inputRange[segment] ?? 0;
      const end = inputRange[segment + 1] ?? start + 1;
      const outStart = outputRange[segment] ?? outputRange[0] ?? 0;
      const outEnd = outputRange[segment + 1] ?? outputRange[outputRange.length - 1] ?? outStart;
      const raw = end === start ? 1 : (input - start) / (end - start);
      const clamped = Math.max(0, Math.min(1, raw));
      const eased = options?.easing ? options.easing(clamped) : clamped;

      return outStart + (outEnd - outStart) * eased;
    },
    useCurrentFrame: () => remotionState.frame,
  };
});

import { GeneratedSceneLayerContent } from "@/components/editron/editor/version-7.0.0/components/core/generated-scene-layer-content";
import type { GeneratedSceneFamilyPlan } from "@/components/editron/editor/version-7.0.0/types";

describe("GeneratedSceneLayerContent director rendering", () => {
  beforeEach(() => {
    remotionState.frame = 48;
  });

  it("renders director ui_proof as a proof scene and removes prompt-like visible copy", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedSceneLayerContent, {
        overlay: makeOverlay({
          family: "ui_proof",
          visualArchetype: "UI_FULL_BLEED",
          evidenceStatus: "satisfied",
          productAssetUse: { logo: false, productImage: true, productUrl: true },
        }),
      }),
    );

    expect(html).toContain("VERIFIED UI EVIDENCE");
    expect(html).toContain("Verified screen");
    expect(html).toContain('src="https://cdn.example.com/dashboard.png"');
    expect(html).toContain("Insturix dashboard");
    expect(html).toContain('src="https://cdn.example.com/logo.svg"');
    expect(html).toContain("The product proof is on screen");
    expect(html).toContain("Keep the product proof visible");
    expect(html).not.toContain("Use verified product image");
    expect(html).not.toContain("Create a product-led SaaS explainer");
  });

  it("renders director section headers as a handoff beat instead of generic workflow", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedSceneLayerContent, {
        overlay: makeOverlay({
          family: "section_header",
          visualArchetype: "TYPE_ONLY",
          evidenceStatus: "substituted",
          productAssetUse: { logo: true, productImage: false, productUrl: false },
        }),
      }),
    );

    expect(html).toContain("NEXT PROOF");
    expect(html).toContain("Next capability");
    expect(html).toContain("Substituted");
    expect(html).not.toContain("Live product flow");
  });

  it("keeps a branded visual anchor visible on the first rendered frame", () => {
    remotionState.frame = 0;

    const html = renderToStaticMarkup(
      React.createElement(GeneratedSceneLayerContent, {
        overlay: makeOverlay({
          family: "hook",
          visualArchetype: "CURSOR_HERO",
          evidenceStatus: "satisfied",
          productAssetUse: { logo: true, productImage: true, productUrl: true },
        }),
      }),
    );

    expect(html).toContain("opacity:0.42");
    expect(html).toContain('src="https://cdn.example.com/logo.svg"');
    expect(html).toContain("Insturix workspace");
    expect(html).toContain("Live product flow");
  });
});

function makeOverlay(
  overrides: Partial<GeneratedSceneFamilyPlan> & Pick<GeneratedSceneFamilyPlan, "family">,
): any {
  const { family, ...familyOverrides } = overrides;
  const familyPlan: GeneratedSceneFamilyPlan = {
    evidenceSource: "director_contract",
    sourcePaths: ["directorContract.sequence[1]"],
    visualGoal: "Use verified product image/UI asset as the proof subject.",
    productUiState: "Insturix workspace proof",
    motionIntent: "balanced verified UI hold with light camera motion",
    copyRole: "make verified UI evidence readable",
    claimMode: "evidence_backed",
    ...familyOverrides,
    family,
  };

  return {
    id: "generated_scene_1",
    type: "generated-scene",
    from: 0,
    durationInFrames: 120,
    content: "Create a product-led SaaS explainer for Insturix",
    sceneModel: {
      schemaVersion: "saas-generated-scene/v1",
      sceneId: "saas_scene_1",
      sceneIndex: 1,
      title: "Create a scene that shows prompt language",
      productName: "Insturix",
      brand: {
        name: "Insturix",
        primaryColor: "#FF5A1F",
        accentColor: "#FF5A1F",
        backgroundColor: "#0B0B0A",
        surfaceColor: "#171A1F",
        textColor: "#F7F4EA",
        mutedTextColor: "#B9B2A3",
        fontFamily: "Inter, sans-serif",
      },
      style: {
        category: "saas_product_demo",
        pacing: "balanced",
        uiTreatment: "product-led",
        motion: "director-led",
      },
      assets: {
        logos: [{ kind: "logo", label: "Insturix logo", url: "https://cdn.example.com/logo.svg", stored: true }],
        productImages: [
          {
            kind: "product_image",
            label: "Insturix dashboard",
            url: "https://cdn.example.com/dashboard.png",
            stored: true,
          },
        ],
        productUrl: "https://insturix.example/",
        sourcePaths: ["brandContext.defaults.visual.logoAssets", "brandContext.defaults.visual.productImages", "input.productUrl"],
      },
      familyPlan,
      voiceover: null,
      elements: [
        { id: "headline", role: "headline", text: "Create a cinematic scene with prompt copy" },
        { id: "shell", role: "app-shell", label: "Insturix workspace", items: ["Brief", "Design", "Render", "Ship"] },
        { id: "panel", role: "panel", text: "Use verified product image/UI asset as the proof subject." },
        { id: "cta", role: "cta", text: "Create a product-led SaaS explainer for Insturix" },
      ],
      captionTracks: [],
      qualityGates: {
        promptLeakChecked: true,
        brandTokensApplied: true,
        readableUiProof: true,
        productSpecificVisualProof: true,
        motionChoreographyPlanned: true,
        finalVisualProof: true,
      },
    },
    sourceMap: {},
    styles: {},
  };
}
