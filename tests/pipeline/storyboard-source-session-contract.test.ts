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

  it('preflights direct script imports before spending credits or writing Editron project state', () => {
    const exportHook = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');

    expect(exportHook).toContain('setScriptImportPreflight(null)');
    expect(exportHook).toContain('runSubjectExtractionAndReferences(exportData.scenes || [], projectTitle)');
    expect(exportHook).toContain('Cannot preflight Editron import: ThinkForge session id is missing.');
    expect(exportHook).toContain('dryRun: true');
    expect(exportHook).toContain('Failed to preflight Editron import');
    expect(exportHook).toContain('preflightData.creditsDeducted !== 0');
    expect(exportHook).toContain('preflightData.writeOperationsSkipped !== true');
    expect(exportHook).toContain('Editron import preflight produced no timeline overlays.');
    expect(exportHook).toContain('setScriptImportPreflight(preflightData as EditronImportPreflightResult)');
    expect(exportHook.indexOf('dryRun: true')).toBeLessThan(exportHook.lastIndexOf('Failed to create Editron project'));
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
    const refEvidence = read('lib/pipeline/reference-brand-evidence.ts');
    const refGenerateRoute = read('app/api/services/pipeline/reference-images/generate/route.ts');
    const addSubjectRoute = read('app/api/services/pipeline/reference-images/[refSetId]/add-subject/route.ts');
    const brandReferenceGuard = read('lib/pipeline/storyboard-brand-reference-guard.ts');
    const videoRoute = read('app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts');
    const finalizeRoute = read('app/api/services/pipeline/storyboard/[id]/finalize/route.ts');
    const exportHook = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');
    const referencePanel = read('components/dashboard/ThinkForge/export/ReferenceImagePanel.tsx');
    const subjectTypes = read('components/dashboard/ThinkForge/export/types.ts');
    const subjectCard = read('components/dashboard/ThinkForge/export/SubjectCard.tsx');

    expect(refEvidence).toContain('resolveEffectiveBrandWithProfile');
    expect(refEvidence).toContain("service: 'editron'");
    expect(refEvidence).toContain('strict: true');
    expect(refEvidence).toContain('requiresBrandReferenceEvidence');
    expect(refEvidence).toContain("'platform'");
    expect(refEvidence).toContain('brandReferenceEvidenceImages');
    expect(refEvidence).toContain('socialPreviewImages');
    expect(refEvidence).toContain("referenceProvenance: 'brand-vault'");
    expect(refEvidence).toContain("referenceProvenance: 'website-screenshot'");
    expect(refGenerateRoute).toContain('resolveBrandReferenceContext');
    expect(refGenerateRoute).toContain('requiresBrandReferenceEvidence');
    expect(refGenerateRoute).toContain('brandId: normalizedBrandId');
    expect(refGenerateRoute).toContain('brandEvidence[nextBrandEvidenceIndex++ % brandEvidence.length]');
    expect(refGenerateRoute).toContain('source: evidence.source');
    expect(refGenerateRoute).toContain("referenceProvenance: 'missing-brand-evidence'");
    expect(addSubjectRoute).toContain('resolveBrandReferenceContext');
    expect(addSubjectRoute).toContain('requiresBrandReferenceEvidence');
    expect(addSubjectRoute).toContain('CreditsService.deductCredits');
    expect(addSubjectRoute.indexOf('if (requiresBrandEvidence)')).toBeLessThan(addSubjectRoute.indexOf('CreditsService.deductCredits'));
    expect(brandReferenceGuard).toContain('getReferenceImageSet(refSetId, userId)');
    expect(brandReferenceGuard).toContain('VERIFIED_REFERENCE_PROVENANCES');
    expect(brandReferenceGuard).toContain("'uploaded'");
    expect(brandReferenceGuard).toContain("'generated'");
    expect(brandReferenceGuard).toContain('requiresBrandReferenceEvidence');
    expect(videoRoute).toContain('resolveStoryboardBrandReferenceIssue');
    expect(finalizeRoute).toContain('resolveStoryboardBrandReferenceIssue');
    const videoGuardIndex = videoRoute.indexOf('const brandReferenceIssue = await resolveStoryboardBrandReferenceIssue');
    const videoCreditIndex = videoRoute.indexOf('CreditsService.hasCredits');
    expect(videoGuardIndex).toBeGreaterThanOrEqual(0);
    expect(videoCreditIndex).toBeGreaterThanOrEqual(0);
    expect(videoGuardIndex).toBeLessThan(videoCreditIndex);
    const finalizeGuardIndex = finalizeRoute.indexOf('const brandReferenceIssue = await resolveStoryboardBrandReferenceIssue');
    const finalizeCreditIndex = finalizeRoute.indexOf("'storyboard_finalize'");
    expect(finalizeGuardIndex).toBeGreaterThanOrEqual(0);
    expect(finalizeCreditIndex).toBeGreaterThanOrEqual(0);
    expect(finalizeGuardIndex).toBeLessThan(finalizeCreditIndex);
    expect(exportHook).toContain('brandId: sourceBrandId || undefined');
    const videoRequestIndex = exportHook.indexOf('generate-videos`, {');
    const videoBrandIdIndex = exportHook.indexOf('brandId: sourceBrandId || undefined', videoRequestIndex);
    const videoRequestEndIndex = exportHook.indexOf('const enqueueData', videoRequestIndex);
    expect(videoRequestIndex).toBeGreaterThanOrEqual(0);
    expect(videoBrandIdIndex).toBeGreaterThanOrEqual(0);
    expect(videoBrandIdIndex).toBeLessThan(videoRequestEndIndex);
    expect(exportHook).toContain('mergeReferenceSubjects');
    expect(exportHook).toContain('missingBrandEvidenceSubjects');
    expect(exportHook).toContain('generatedBrandOwnedSubjects');
    expect(exportHook).toContain('referenceContinueBlocked');
    expect(exportHook).toContain('buildSubjectRefFromResponse');
    expect(exportHook).toContain('applyBrandReferenceWarnings');
    expect(exportHook).toContain('Brand-owned references cannot use generated/fake or legacy-unverified imagery');
    expect(referencePanel).toContain('referenceActionDisabled');
    expect(referencePanel).toContain('referenceContinueMessage');
    expect(subjectTypes).toContain('referenceProvenance?: ReferenceImageProvenance;');
    expect(subjectCard).toContain('isBrandEvidenceLocked');
    expect(subjectCard).toContain('Upload brand evidence');
    expect(subjectCard).toContain('Brand-owned references need real evidence');
    expect(subjectCard).toContain('referenceProvenanceLabel');
    expect(subjectCard).toContain('Website screenshot');
    expect(subjectCard).toContain('Generated');
    expect(subjectCard).toContain('Evidence required');
  });
});
