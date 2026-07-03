import { describe, expect, it } from "vitest";
import { normalizeAlyzitronAnalysisResults } from "@/lib/alyzitron/analysis-results";

describe("normalizeAlyzitronAnalysisResults", () => {
  it("preserves the current flat Gemini result shape", () => {
    const result = normalizeAlyzitronAnalysisResults({
      category: "Vlog",
      overall_score: 82,
      overview: "A short street clip.",
      remarks: "Strong everyday moment.",
      titles: ["Sunday ride"],
      descriptions: ["A quick cycling clip."],
      target_audience: "Local cycling followers",
      strengths: ["Natural motion"],
      weaknesses: ["Add a stronger hook"],
      analysis: [
        {
          category_name: "Visuals",
          metrics: [{ name: "Clarity", score: 74, description: "Clear enough." }],
        },
      ],
      compliance_risks: [
        { name: "Privacy", score: 10, description: "No private identity claim." },
      ],
    });

    expect(result).toMatchObject({
      category: "Vlog",
      overall_score: 82,
      overview: "A short street clip.",
      strengths: ["Natural motion"],
      weaknesses: ["Add a stronger hook"],
      creator_feedback: {
        strengths: ["Natural motion"],
        improvements: ["Add a stronger hook"],
      },
    });
    expect(result?.analysis[0].metrics[0]).toMatchObject({ name: "Clarity", score: 74 });
  });

  it("normalizes legacy creator feedback and metric-section results", () => {
    const result = normalizeAlyzitronAnalysisResults({
      creator_feedback: {
        strengths: ["The clip has a clear subject."],
        improvements: ["Stabilize the camera."],
      },
      visual_quality: {
        framing: { score: "71", description: "The rider stays visible." },
      },
      compliance_risks: {
        privacy_risk: { score: 20, description: "Faces are incidental." },
      },
    });

    expect(result).toMatchObject({
      category: "Analysis",
      overall_score: 0,
      strengths: ["The clip has a clear subject."],
      weaknesses: ["Stabilize the camera."],
    });
    expect(result?.analysis).toEqual([
      {
        category_name: "visual quality",
        metrics: [{ name: "framing", score: 71, description: "The rider stays visible." }],
      },
    ]);
    expect(result?.compliance_risks).toEqual([
      { name: "privacy_risk", score: 20, description: "Faces are incidental." },
    ]);
  });

  it("normalizes parser fallback results instead of rendering an empty report", () => {
    const result = normalizeAlyzitronAnalysisResults({
      summary: "The video shows a person cycling past parked cars.",
      qualityAssessment: { score: 64, notes: "Usable but rough." },
      recommendations: ["Open with the moving subject sooner."],
      contentWarnings: ["Street scene includes bystanders."],
      extractedFromText: true,
    });

    expect(result).toMatchObject({
      overall_score: 64,
      overview: "The video shows a person cycling past parked cars.",
      remarks: "Usable but rough.",
      strengths: [],
      weaknesses: ["Open with the moving subject sooner."],
      creator_feedback: {
        strengths: [],
        improvements: ["Open with the moving subject sooner."],
      },
    });
    expect(result?.compliance_risks).toEqual([
      {
        name: "Content warning",
        score: 100,
        description: "Street scene includes bystanders.",
      },
    ]);
  });
});
