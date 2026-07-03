import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('storyboard source session lineage contract', () => {
  it('stores sourceSessionId separately from the mutable storyboard projectId', () => {
    const schema = read('lib/pipeline/schemas/storyboard.ts');
    const generateRoute = read('app/api/services/pipeline/storyboard/generate/route.ts');
    const exportHook = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');

    expect(schema).toContain('sourceSessionId?: string;');
    expect(exportHook).toContain('sourceSessionId,');
    expect(exportHook).not.toContain('projectId: sourceSessionId');
    expect(generateRoute).toContain('sourceSessionId,');
    expect(generateRoute).toContain('sourceSessionId: normalizedSourceSessionId');
    expect(generateRoute).toContain('findLinkBySessionId(userId, normalizedSourceSessionId)');
    expect(generateRoute).toContain('sessionId: normalizedSourceSessionId');
  });

  it('requires production coverage before storyboard exports can collapse into partial videos', () => {
    const exportRoute = read('app/api/services/thinkforge/script/export-for-editron/route.ts');
    const exportHook = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');
    const generateRoute = read('app/api/services/pipeline/storyboard/generate/route.ts');
    const finalizeRoute = read('app/api/services/pipeline/storyboard/[id]/finalize/route.ts');

    expect(exportRoute).toContain('productionManifest');
    expect(exportRoute).toContain('targetDurationSeconds');
    expect(exportRoute).toContain("coveragePolicy: 'production-require-all-scenes'");
    expect(exportRoute).toContain('expectedStoryboardImages: scenes.length');
    expect(exportRoute).toContain("assetRecommendation && assetRecommendation !== 'ai-video'");
    expect(exportHook).toContain('setProductionManifest(exportData.productionManifest || null)');
    expect(exportHook).toContain('productionManifest: productionManifest || undefined');
    expect(exportHook).toContain('requireVideoCoverage: generateVideos');
    expect(exportHook).toContain('Storyboard coverage incomplete');
    expect(exportHook).toContain('Video coverage incomplete');
    expect(exportHook).toContain('videoGenFailed = true');
    expect(exportHook).not.toContain('Continuing with available clips');
    expect(generateRoute).toContain('normalizeProductionManifest(productionManifest, scenes');
    expect(generateRoute).toContain('Math.max(positiveInteger(input.expectedStoryboardImages) ?? scenes.length, scenes.length)');
    expect(generateRoute).toContain('countExpectedAiVideoClips(scenes)');
    expect(generateRoute).toContain('productionManifest: normalizedProductionManifest');
    expect(finalizeRoute).toContain('resolveProductionCoverageIssue(storyboard');
    expect(finalizeRoute).toContain("reason: 'production-coverage-incomplete'");
    const coverageCheckIndex = finalizeRoute.indexOf('resolveProductionCoverageIssue(storyboard');
    const finalizeChargeIndex = finalizeRoute.indexOf("'storyboard_finalize'");
    expect(coverageCheckIndex).toBeGreaterThanOrEqual(0);
    expect(finalizeChargeIndex).toBeGreaterThanOrEqual(0);
    expect(coverageCheckIndex).toBeLessThan(finalizeChargeIndex);
  });

  it('finalize reuses or tags projects from explicit sourceSessionId before legacy projectId fallback', () => {
    const finalizeRoute = read('app/api/services/pipeline/storyboard/[id]/finalize/route.ts');

    expect(finalizeRoute).toContain('function getStoryboardSourceSessionId');
    expect(finalizeRoute).toContain('const explicit = nonEmptyString(storyboard.sourceSessionId)');
    expect(finalizeRoute).toContain("!legacyProjectId.startsWith('proj_')");
    expect(finalizeRoute).toContain('findProjectBySessionId(userId, storyboardSourceSessionId)');
    expect(finalizeRoute).toContain('sourceSessionId: storyboardSourceSessionId');
  });

  it('keeps brand-owned product references evidence backed before storyboard handoff', () => {
    const refGenerateRoute = read('app/api/services/pipeline/reference-images/generate/route.ts');
    const exportHook = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');
    const subjectTypes = read('components/dashboard/ThinkForge/export/types.ts');
    const subjectCard = read('components/dashboard/ThinkForge/export/SubjectCard.tsx');

    expect(refGenerateRoute).toContain('resolveEffectiveBrandWithProfile');
    expect(refGenerateRoute).toContain("service: 'editron'");
    expect(refGenerateRoute).toContain('strict: true');
    expect(refGenerateRoute).toContain("referenceProvenance: 'brand-vault'");
    expect(refGenerateRoute).toContain("referenceProvenance: 'missing-brand-evidence'");
    expect(refGenerateRoute).toContain('subjectsNeedingGeneration.length * costPerSubject');
    expect(refGenerateRoute).toContain('subjectsNeedingGeneration.map((s) => ({ subjectId: s.id, name: s.name }))');
    expect(exportHook).toContain('brandId: sourceBrandId || undefined');
    expect(exportHook).toContain('mergeReferenceSubjects');
    expect(exportHook).toContain('missingBrandEvidence');
    expect(exportHook).toContain('Brand evidence required before storyboard generation');
    expect(exportHook).toContain('Brand-owned references require uploaded or Brand Vault evidence');
    expect(exportHook).toContain('referenceProvenance: data.referenceProvenance || "uploaded"');
    expect(exportHook).toContain('brandEvidenceStatus: data.brandEvidenceStatus');
    expect(subjectTypes).toContain('referenceProvenance?: ReferenceImageProvenance;');
    expect(subjectCard).toContain('isBrandEvidenceLocked');
    expect(subjectCard).toContain('Upload brand evidence');
    expect(subjectCard).toContain('Brand-owned references need real evidence');
    expect(subjectCard).toContain('referenceProvenanceLabel');
    expect(subjectCard).toContain('Evidence required');
  });
});
