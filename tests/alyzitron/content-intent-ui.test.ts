import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("Alyzitron content intent UI wiring", () => {
  it("renders explicit analysis lens controls without removing auto inference", () => {
    const selector = readRepoFile("components/dashboard/Alyzitron/ContextSelector.tsx");
    const types = readRepoFile("app/api/services/alyzitron/types/index.ts");

    expect(types).toContain("contentIntent?: AlyzitronContentIntent");
    expect(selector).toContain('value: "auto", label: "Auto"');
    expect(selector).toContain('value: "own_content", label: "My content"');
    expect(selector).toContain('value: "competitor_content", label: "Competitor"');
    expect(selector).toContain('value: "reference_content", label: "Reference"');
    expect(selector).toContain("delete next.contentIntent");
    expect(selector).toContain("onChange(nextIntent ? { ...value, contentIntent: nextIntent } : withoutContentIntent(value))");
  });

  it("promotes context-selected intent to a confirmed analyze-route selection", () => {
    const analyzeRoute = readRepoFile("app/api/services/alyzitron/analyze/route.ts");

    expect(analyzeRoute).toContain("const contextContentIntent");
    expect(analyzeRoute).toContain("userSelectedIntent: body.userSelectedIntent ?? contextContentIntent");
    expect(analyzeRoute).toContain("contentIntent: body.contentIntent ?? body.content_intent ?? contextContentIntent");
    expect(analyzeRoute).toContain("intentSource: body.intentSource ?? (contextContentIntent ? 'user_selected' : undefined)");
    expect(analyzeRoute).toContain("userConfirmedIntent: body.userConfirmedIntent ?? (contextContentIntent ? true : undefined)");
  });

  it("uses the dashboard active brand and surfaces brand-aware report fields", () => {
    const hook = readRepoFile("app/dashboard/alyzitron/hooks/useVideoAnalysis.ts");
    const reportPage = readRepoFile("app/dashboard/alyzitron/report/[id]/page.tsx");
    const reportComponents = readRepoFile("app/dashboard/alyzitron/report/[id]/components.tsx");
    const types = readRepoFile("lib/types.ts");

    expect(hook).toContain("getActiveBrandIdFromStorage");
    expect(hook).toContain("...(requestBrandId && { brandId: requestBrandId })");
    expect(hook).toContain("context: requestContext");
    expect(reportPage).toContain("content_intent: contentIntent");
    expect(reportPage).toContain("brand_fit_summary: brandFitSummary");
    expect(reportPage).toContain("applicable_takeaways: applicableTakeaways");
    expect(reportComponents).toContain("ANALYSIS LENS");
    expect(reportComponents).toContain("analysisData.brand_fit_summary");
    expect(types).toContain("applicable_takeaways?: string[]");
  });
});
