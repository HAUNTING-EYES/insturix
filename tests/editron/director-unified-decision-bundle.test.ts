import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  shouldInjectGlobalCaptionAction,
  shouldRunPostBundleProfileAction,
  shouldRunPostEdlUtilityScoring,
  shouldRunUtilityLiveProducer,
} from '../../lib/editron/agent/post-edl-action-policy';

const directorSource = () => readFileSync(
  join(process.cwd(), 'lib/editron/agent/director-agent.ts'),
  'utf8',
);

describe('director unified decision bundle control flow', () => {
  it('keeps Path E and Path D as producers and executes one shared decision bundle', () => {
    const source = directorSource();

    expect(source).toContain('let unifiedDecisionBundle');
    expect(source).toContain('const unifiedDecisionCandidates');
    expect(source).toContain('if (canRunPathD)');
    expect(source).toContain('planUnifiedDecisionBundleFromCandidates(unifiedDecisionCandidates, {');
    expect(source).toContain('choreographyReservations: canonicalCaptionChoreographyReservations');
    expect(source.match(/editorialPreferences: brief\?\.editorialPreferences/g)).toHaveLength(4);
    expect(source).toContain('await executeEDL(');
    expect(source).toContain('unifiedDecisionBundle.edl');
    expect(source).toContain('Unified decision bundle execution COMPLETE');

    expect(source).not.toContain('createUnifiedDecisionBundle({');
    expect(source).not.toContain('planUnifiedDecisionBundle(unifiedDecisionBundle');
    expect(source).not.toContain('mergeSignalDrivenBundle(unifiedDecisionBundle');
    expect(source).not.toContain('if (canRunPathD && !unifiedDecisionBundle)');
    expect(source).not.toContain('executeEDLPathE');
    expect(source).not.toContain('executeEDLPathD');
    expect(source).not.toContain('await executeEDLPathE');
    expect(source).not.toContain('await executeEDLPathD');
  });

  it('submits narrative MG opportunities before unified planning instead of appending executable decisions', () => {
    const source = directorSource();
    const producerIndex = source.indexOf('produceNarrativeBeatDecisions({');
    const plannerIndex = source.indexOf('planUnifiedDecisionBundleFromCandidates(unifiedDecisionCandidates, {');

    expect(producerIndex).toBeGreaterThan(0);
    expect(plannerIndex).toBeGreaterThan(producerIndex);
    expect(source).toContain('opportunities submitted to the unified planner');
    expect(source).not.toContain('unifiedDecisionBundle.edl.decisions.push(...narrativeBeatDecisions)');
    expect(source).not.toContain('unifiedDecisionBundle.edl.totalDecisions += narrativeBeatDecisions.length');
  });

  it('refuses raw-timeline overlay decisions when canonical edited timeline is unsafe', () => {
    const source = directorSource();

    expect(source).toContain('Canonical edited timeline unavailable; refusing raw-timeline overlay decisions');
    expect(source).toContain('Unsafe canonical edited timeline');
    expect(source).toContain('requiresSourceMapping');
    expect(source).toContain('isCanonicalDecisionTimeline');
    expect(source).toContain('enforceCanonicalDecisionTimeline(');
    expect(source).toContain('isCanonicalDecisionTimelineError(bundleErr)');
    expect(source).toContain('throw bundleErr');
  });

  it('records unified bundle provenance before dependent dispatch', () => {
    const source = directorSource();
    const factIndex = source.indexOf("kind: 'UNIFIED_DECISION_BUNDLE'");
    const autoBgmIndex = source.indexOf('Auto-BGM dispatch');

    expect(source).toContain('summarizeUnifiedDecisionBundle(unifiedDecisionBundle)');
    expect(source).toContain('summarizeSignalDecisionAuditForAuthority(unifiedDecisionBundle)');
    expect(source).toContain('authority: bundle.authority');
    expect(source).toContain('signalAudit: summarizeSignalDecisionAuditForAuthority(unifiedDecisionBundle)');
    expect(source).toContain("(result as any).unifiedDecisionBundle = unifiedDecisionBundleSummary");
    expect(source).toContain('await projectService.recordDirectorAuditFactV1(');
    expect(source).toContain('payload: unifiedDecisionBundleSummary');
    expect(factIndex).toBeGreaterThan(0);
    expect(autoBgmIndex).toBeGreaterThan(factIndex);
    expect(source).not.toContain('persistUnifiedDecisionBundleSummary');
  });

  it('persists final Phase-0 truth from the saved overlay set before completion events', () => {
    const source = directorSource();
    const saveIndex = source.indexOf('await projectService.saveProjectWithReceipt');
    const phase0Index = source.indexOf('await projectService.recordPhase0ProofFacts');
    const brandEventIndex = source.indexOf('Brand Intelligence: emit director_completed');

    expect(saveIndex).toBeGreaterThan(0);
    expect(phase0Index).toBeGreaterThan(saveIndex);
    expect(brandEventIndex).toBeGreaterThan(phase0Index);
    expect(source).toContain('overlays: persistableOverlays');
    expect(source).toContain('buildPhase0RenderArtifactPack(truthProject, artifactManifest');
    expect(source).toContain('artifactPack,');
    expect(source).toContain('facts: {');
    expect(source).toContain('liveTruth: snapshot as unknown as Record<string, unknown>');
    expect(source).toContain('renderedQualityEvidence: snapshot.qualityEvidence as unknown as Record<string, unknown>');
    expect(source).toContain('fixtureArtifact: buildLivePhase0FixtureArtifact(');
    expect(source).toContain("materialization: 'planned-not-rendered'");
    expect(source).toContain('targetReceipt: phase0ProofReceipt');
    expect(source).not.toContain('buildPhase0RenderedEvidenceDispatchPersistSet');
    expect(source).not.toContain('persistPhase0RenderedEvidenceDispatchState');
    expect(source).toContain('requestedAt: renderedEvidenceRequestedAt');
    expect(source).toContain('dispatch_error:');
  });

  it('labels fallback reactive authority as signal-primary instead of ambiguous', () => {
    const source = directorSource();
    const fallbackAuthorityStart = source.indexOf("source: 'fallback-reactive'");
    expect(fallbackAuthorityStart).toBeGreaterThan(0);
    const fallbackAuthorityBlock = source.slice(fallbackAuthorityStart, fallbackAuthorityStart + 420);

    expect(fallbackAuthorityBlock).toContain("decisionMode: 'signal-primary'");
    expect(fallbackAuthorityBlock).toContain("executableProducer: 'signal-driven'");
    expect(fallbackAuthorityBlock).toContain("signalDecisionRole: 'primary'");
  });
  it('does not bypass AI storyboard asset analysis just because Creative Brief is enabled', () => {
    const source = directorSource();

    expect(source).toContain("const hasRawFootage = projectDoc?.rawFootageAnalysis?.segments?.length > 0;");
    expect(source).toContain("const creativeBriefPerAssetBypassActive = process.env.USE_CREATIVE_BRIEF === 'true' && hasRawFootage;");
    expect(source).toContain('const skipPerAssetAnalysis = creativeBriefPerAssetBypassActive;');
    expect(source).not.toContain("const skipPerAssetAnalysis = process.env.USE_CREATIVE_BRIEF === 'true';");
    expect(source).toContain("'creative-brief-per-asset-analysis-bypassed'");
    expect(source).toContain("kind: 'INTELLIGENCE_SKIP_SUMMARY'");
    expect(source).toContain('reason: intelligenceReason');
  });
  it('receipts intelligence status and bounded V-JEPA evidence', () => {
    const source = directorSource();

    expect(source).toContain("kind: 'INTELLIGENCE_RUN_SUMMARY'");
    expect(source).toContain("kind: 'INTELLIGENCE_SKIP_SUMMARY'");
    expect(source).toContain("kind: 'VJEPA_COVERAGE_AUDIT'");
    expect(source).toContain('buildDirectorVjepaCoverageAuditSummaryV1(vjepaAudit)');
    expect(source).toContain('edlErr instanceof ProjectMutationConflictError');
    expect(source).not.toContain('non-fatal intelligence persistence');
    expect(source).not.toContain('non-fatal intelligence failure persistence');
    expect(source).not.toContain('const qrDb =');
    expect(source).not.toContain('const auditDb =');
    expect(source).toContain('Computed V-JEPA coverage audit evidence is invalid.');
    expect(source).toContain('committed with recordPhase0ProofFacts after the final editor save');
    expect(source.match(/collection\('projects'\)\.updateOne/g) ?? []).toHaveLength(1);
  });
  it('does not let post-EDL utility scoring override a handled unified bundle', () => {
    expect(shouldRunPostEdlUtilityScoring({
      unifiedDecisionBundleExecuted: true,
      hasSpeechCoverage: true,
      utilityEngineEnabled: true,
    })).toEqual({
      run: false,
      reason: 'unified-bundle-already-executed',
    });

    expect(shouldRunPostEdlUtilityScoring({
      unifiedDecisionBundleExecuted: false,
      hasSpeechCoverage: true,
      utilityEngineEnabled: true,
    })).toEqual({
      run: true,
      reason: 'eligible',
    });
  });

  it('blocks legacy creative profile actions after unified bundle execution', () => {
    for (const tool of [
      'add_captions',
      'add_fancy_captions',
      'add_motion_graphic',
      'add_transition',
      'batch_update_overlays',
      'generate_html_scene',
      'split_clips',
      'sync_cuts_to_beats',
    ]) {
      expect(shouldRunPostBundleProfileAction({
        tool,
        unifiedDecisionBundleExecuted: true,
      })).toEqual({
        run: false,
        reason: 'legacy-creative-profile-action',
      });
    }

    expect(shouldRunPostBundleProfileAction({
      tool: 'quality_review',
      unifiedDecisionBundleExecuted: true,
    })).toEqual({
      run: true,
      reason: 'technical-post-process',
    });

    expect(shouldRunPostBundleProfileAction({
      tool: 'audio_ducking',
      unifiedDecisionBundleExecuted: true,
    })).toEqual({
      run: true,
      reason: 'technical-post-process',
    });

    expect(shouldRunPostBundleProfileAction({
      tool: 'future_visual_tool',
      unifiedDecisionBundleExecuted: true,
    })).toEqual({
      run: false,
      reason: 'unknown-post-bundle-profile-action',
    });

    expect(shouldRunPostBundleProfileAction({
      tool: 'add_transition',
      unifiedDecisionBundleExecuted: false,
    })).toEqual({
      run: true,
      reason: 'unified-bundle-not-executed',
    });
  });

  it('applies post-bundle profile action policy before Director executes profile actions', () => {
    const source = directorSource();
    const policyFactIndex = source.indexOf("kind: 'POST_BUNDLE_PROFILE_ACTION_POLICY'");
    const actionProgressIndex = source.indexOf("'Starting Director Agent execution...'");
    const finalSaveIndex = source.indexOf('await projectService.saveProjectWithReceipt');

    expect(source).toContain('shouldRunPostBundleProfileAction({');
    expect(source).toContain('Unified bundle: Skipping legacy profile action');
    expect(source).toContain('legacy profile action(s) skipped after EDL execution');
    expect(source).toContain('payload: postBundleProfileActionPolicy');
    expect(policyFactIndex).toBeGreaterThan(0);
    expect(actionProgressIndex).toBeGreaterThan(policyFactIndex);
    expect(finalSaveIndex).toBeGreaterThan(policyFactIndex);
    expect(source).not.toContain('persistPostBundleProfileActionPolicy');
  });

  it('keeps Utility LIVE as shadow evidence during raw-footage creative brief runs', () => {
    expect(shouldRunUtilityLiveProducer({
      utilityLiveEnabled: true,
      creativeBriefEnabled: true,
      hasRawFootage: true,
    })).toEqual({
      run: false,
      reason: 'creative-brief-raw-footage-active',
    });

    expect(shouldRunUtilityLiveProducer({
      utilityLiveEnabled: true,
      creativeBriefEnabled: false,
      hasRawFootage: true,
    })).toEqual({
      run: true,
      reason: 'eligible',
    });
  });

  it('blocks legacy global captions on canonical upload-to-edit timelines', () => {
    expect(shouldInjectGlobalCaptionAction({
      captionStyle: 'word_by_word',
      hasRawFootage: true,
      hasCanonicalEditedTimeline: true,
    })).toEqual({
      run: false,
      reason: 'canonical-upload-needs-caption-track-planner',
    });

    expect(shouldInjectGlobalCaptionAction({
      captionStyle: 'word_by_word',
      hasRawFootage: false,
      hasCanonicalEditedTimeline: false,
    })).toEqual({
      run: true,
      reason: 'eligible',
    });

    expect(shouldInjectGlobalCaptionAction({
      captionStyle: 'none',
      hasRawFootage: false,
      hasCanonicalEditedTimeline: false,
    })).toEqual({
      run: false,
      reason: 'caption-style-disabled',
    });

    expect(shouldInjectGlobalCaptionAction({
      captionStyle: 'word_by_word',
      hasRawFootage: false,
      hasCanonicalEditedTimeline: false,
      editorialExecutionAllowed: false,
    })).toEqual({
      run: false,
      reason: 'user-policy-off:captions',
    });

    const source = directorSource();
    expect(source).toContain('&& captionEditorialPolicy.executionAllowed');
    expect(source).toContain('&& captionExecutionScopePolicy.run');
    expect(source).toContain('editorialExecutionAllowed: captionEditorialPolicy.executionAllowed');
  });
});
