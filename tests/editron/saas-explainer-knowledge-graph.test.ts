import { describe, expect, it } from "vitest";
import {
  getSaasExplainerKnowledgeGraph,
  listSaasExplainerHardQualityGateIds,
  listSaasExplainerSceneFamilyIds,
  listSaasExplainerStoryStructureIds,
} from "@/lib/editron/saas-explainer/knowledge-graph";

describe("SaaS explainer knowledge graph", () => {
  it("loads the content-bible graph with the production SaaS explainer contract", () => {
    const graph = getSaasExplainerKnowledgeGraph();

    expect(graph.meta).toMatchObject({
      name: "saas-explainer-knowledge-graph",
      version: "1.2.0",
      sourceDoctrine: "saas-explainer-bible v1.2.0",
    });
    expect(graph.narrationModes.modes).toEqual(expect.arrayContaining([
      "vo",
      "founder_vo",
      "talking_head",
      "testimonial_led",
      "text_driven",
      "ambient_demo",
    ]));
  });

  it("contains the scene families and structures the SaaS Director will need", () => {
    expect(listSaasExplainerSceneFamilyIds()).toEqual(expect.arrayContaining([
      "hook",
      "problem",
      "promise",
      "workflow_demo",
      "feature_demo",
      "ui_proof",
      "proof_metric",
      "comparison",
      "social_proof",
      "objection_handling",
      "cta",
      "logo_outro",
      "section_header",
    ]));
    expect(listSaasExplainerStoryStructureIds()).toEqual(expect.arrayContaining([
      "teaser_30s",
      "explainer_45s",
      "launch_60s",
      "demo_90s",
      "founder_walkthrough",
      "enterprise_proof_led",
    ]));
  });

  it("preserves hard gates for the exact failures seen in weak generated outputs", () => {
    expect(listSaasExplainerHardQualityGateIds()).toEqual(expect.arrayContaining([
      "G1_prompt_leakage",
      "G2_static_output",
      "G3_unreadable_text",
      "G4_fake_dashboard",
      "G5_fabricated_claims",
      "G6_product_evidence_floor",
      "G7_brand_adherence",
      "G8_motion_variety",
      "G9_narration_desync",
      "G10_reference_copying",
    ]));

    const graphText = JSON.stringify(getSaasExplainerKnowledgeGraph());
    expect(graphText).toContain("reference_cloning");
    expect(graphText).toContain("fake_dashboard");
    expect(graphText).toContain("ledger_audit");
  });
});