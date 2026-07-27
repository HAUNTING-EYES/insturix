import type { Phase0FixtureManifest, Phase0FixtureProject } from './phase0-fixture-manifest';

export const EDITRON_BATTLE_TEST_VERSION = 'editron-battle-test-v1' as const;

export const FABLE_OVERLAY_CONTRACT_TESTS = [
  'tests/editron/signal-driven-edge-cases.test.ts',
  'tests/editron/edl-param-contract.test.ts',
  'tests/editron/p4-budget-guardrail.test.ts',
  'tests/editron/p5-signal-owned-decisions.test.ts',
  'tests/editron/p6-provider-coverage-starvation.test.ts',
  'tests/editron/overlay-timeline-memory.test.ts',
] as const;

export const AI_MG_CONTRACT_TESTS = [
  'tests/editron/mg-live-codegen-seam.test.ts',
  'tests/editron/mg-render-job-runner.test.ts',
  'tests/editron/mg-render-job-service.test.ts',
  'tests/editron/mg-render-moment.test.ts',
  'tests/editron/mg-sequence-ingest.test.ts',
  'tests/editron/mg-sequence-asset-lifecycle.test.ts',
] as const;

export const PIPELINE_CONTRACT_TESTS = [
  'tests/editron/from-batch-storyline-route.test.ts',
  'tests/editron/asset-analysis-worker-policy.test.ts',
  'tests/editron/batch-storyline-analysis-bridge.test.ts',
  'tests/editron/mp4-duration-service.test.ts',
  'tests/editron/visual-cut-e2e.test.ts',
  'tests/editron/upload-to-edit-truth-fixture.test.ts',
  'tests/editron/director-unified-decision-bundle.test.ts',
  'tests/editron/phase0-fixture-manifest.test.ts',
  'tests/editron/phase0-render-artifact-pack.test.ts',
  'tests/editron/phase0-rendered-evidence-worker.test.ts',
] as const;

export const EDITRON_BATTLE_CONTRACT_TESTS = [
  ...FABLE_OVERLAY_CONTRACT_TESTS,
  ...AI_MG_CONTRACT_TESTS,
  ...PIPELINE_CONTRACT_TESTS,
] as const;

export type EditronBattleScenario =
  | 'auto'
  | 'speech-led'
  | 'visual-only'
  | 'mixed'
  | 'music-led'
  | 'hinglish'
  | 'mg-worthy';

export type EditronBattleCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface EditronBattleCheck {
  id: string;
  area: 'contract' | 'pipeline' | 'authority' | 'family' | 'perception' | 'quality' | 'ai-mg' | 'api';
  status: EditronBattleCheckStatus;
  blocking: boolean;
  summary: string;
  evidence: Record<string, unknown>;
  remediation?: string;
}

export interface EditronBattleStaticSuiteEvidence {
  status: 'passed' | 'failed' | 'not-run';
  command: string | null;
  exitCode: number | null;
  durationMs: number | null;
  outputTail?: string;
}

export interface EditronBattleApiEvidence {
  projectReload?: { ok: boolean; status: number | null; error?: string };
  media?: Array<{ assetId: string; url: string; ok: boolean; status: number | null; contentType?: string; error?: string }>;
  chatIsolation?: {
    status: 'passed' | 'failed' | 'not-run';
    primaryProjectId: string;
    comparisonProjectId?: string;
    canarySessionId?: string;
    leakedIntoComparison?: boolean;
    cleanupSucceeded?: boolean;
    error?: string;
  };
}

export interface EditronBattleMgFrameProbe {
  assetId: string;
  frameUrls: string[];
  reachable: boolean;
  alphaPreserved: boolean | null;
  animated: boolean | null;
  hashes: string[];
  error?: string;
}

export interface BuildEditronBattleReportInput {
  runId: string;
  capturedAt?: string;
  mode: 'existing-project' | 'existing-batch' | 'fresh-upload';
  scenario: EditronBattleScenario;
  project: Phase0FixtureProject;
  manifest: Phase0FixtureManifest;
  batch?: Record<string, unknown> | null;
  assets?: Array<Record<string, unknown>>;
  mgJobs?: Array<Record<string, unknown>>;
  mgFrameProbes?: EditronBattleMgFrameProbe[];
  apiEvidence?: EditronBattleApiEvidence;
  staticSuite?: EditronBattleStaticSuiteEvidence;
  expectedSourceDurationSec?: number | null;
  requireRenderedEvidence?: boolean;
}

export interface EditronBattleReport {
  version: typeof EDITRON_BATTLE_TEST_VERSION;
  runId: string;
  capturedAt: string;
  mode: BuildEditronBattleReportInput['mode'];
  scenario: EditronBattleScenario;
  projectId: string;
  verdict: 'pass' | 'warn' | 'fail';
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    skipped: number;
    blockingFailures: number;
  };
  project: {
    autoEditStatus: string | null;
    durationFrames: number;
    durationSeconds: number;
    overlayCounts: Record<string, number>;
    sourceDurationSeconds: number | null;
  };
  checks: EditronBattleCheck[];
}

export function buildEditronBattleReport(input: BuildEditronBattleReportInput): EditronBattleReport {
  const project = asRecord(input.project);
  const intelligence = asRecord(project.intelligence);
  const overlays = asRecords(project.overlays);
  const authority = asRecord(input.manifest.unifiedDecisionBundle.authority);
  const signalHealth = asRecord(input.manifest.unifiedDecisionBundle.signalDecisionHealth);
  const trace = asRecord(input.manifest.unifiedDecisionBundle.decisionOutputTrace);
  const checks: EditronBattleCheck[] = [];
  const projectId = String(project.projectId ?? project.id ?? input.manifest.projectId);
  const autoEditStatus = stringValue(project.autoEditStatus);
  const sourceDurationSeconds = resolveSourceDurationSeconds(project, input.assets ?? []);
  const expectedSourceDurationSec = positiveNumber(input.expectedSourceDurationSec);

  checks.push(checkStaticSuite(input.staticSuite));
  checks.push(checkProjectTerminal(autoEditStatus));
  checks.push(checkDurationTruth(input.manifest, sourceDurationSeconds, expectedSourceDurationSec));
  checks.push(checkPictureContinuity(input.manifest));
  checks.push(checkCanonicalTimeline(input.manifest, input.scenario));
  checks.push(checkUnifiedAuthority(input.manifest, authority));
  checks.push(checkSignalNormalization(signalHealth));
  checks.push(checkDecisionOutputTrace(trace));
  checks.push(checkCrossOverlayMemory(input.manifest));
  checks.push(checkBatchReadiness(input.batch));
  checks.push(checkScenarioEvidence(input.scenario, project, input.manifest, overlays));
  checks.push(checkVjepaEvidence(input.scenario, input.manifest));
  checks.push(checkRenderedEvidence(input.manifest, input.requireRenderedEvidence !== false));
  checks.push(...checkAiMgLifecycle({
    scenario: input.scenario,
    overlays,
    assets: input.assets ?? [],
    jobs: input.mgJobs ?? [],
    frameProbes: input.mgFrameProbes ?? [],
  }));
  checks.push(...checkApiEvidence(input.apiEvidence));

  const summary = summarizeChecks(checks);
  const verdict = summary.blockingFailures > 0 || summary.failed > 0
    ? 'fail'
    : summary.warnings > 0
      ? 'warn'
      : 'pass';

  return {
    version: EDITRON_BATTLE_TEST_VERSION,
    runId: input.runId,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    mode: input.mode,
    scenario: input.scenario,
    projectId,
    verdict,
    summary,
    project: {
      autoEditStatus,
      durationFrames: input.manifest.durationFrames,
      durationSeconds: input.manifest.durationSeconds,
      overlayCounts: input.manifest.overlayCounts,
      sourceDurationSeconds,
    },
    checks,
  };
}

export function renderEditronBattleReportHtml(report: EditronBattleReport): string {
  const rows = report.checks.map((check) => {
    const evidence = escapeHtml(JSON.stringify(check.evidence, null, 2));
    return `<tr class="${check.status}"><td>${escapeHtml(check.status.toUpperCase())}</td><td>${escapeHtml(check.area)}</td><td>${escapeHtml(check.id)}</td><td>${escapeHtml(check.summary)}</td><td><pre>${evidence}</pre>${check.remediation ? `<p><strong>Next:</strong> ${escapeHtml(check.remediation)}</p>` : ''}</td></tr>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Editron battle test ${escapeHtml(report.projectId)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#181818;background:#f7f7f5}h1{margin:0 0 8px}.meta{margin-bottom:20px;color:#555}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:10px;border:1px solid #ddd;vertical-align:top;text-align:left}th{background:#eee}.pass td:first-child{color:#087f23;font-weight:700}.warn td:first-child{color:#9a6700;font-weight:700}.fail td:first-child{color:#c1121f;font-weight:700}.skip td:first-child{color:#666;font-weight:700}pre{white-space:pre-wrap;max-width:560px;font-size:11px}</style></head>
<body><h1>Editron battle test: ${escapeHtml(report.verdict.toUpperCase())}</h1><div class="meta">Project ${escapeHtml(report.projectId)} | ${escapeHtml(report.scenario)} | ${escapeHtml(report.capturedAt)} | ${report.summary.passed} pass, ${report.summary.warnings} warn, ${report.summary.failed} fail, ${report.summary.skipped} skip</div>
<table><thead><tr><th>Status</th><th>Area</th><th>Check</th><th>Summary</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function checkStaticSuite(suite?: EditronBattleStaticSuiteEvidence): EditronBattleCheck {
  if (!suite || suite.status === 'not-run') return check('contract.static-suite', 'contract', 'skip', false, 'Pinned Fable, pipeline, and AI-MG contract tests were not run.', { suite: suite ?? null }, 'Run the contract suite before any credit-charging live test.');
  return suite.status === 'passed'
    ? check('contract.static-suite', 'contract', 'pass', false, 'Pinned Fable, pipeline, and AI-MG contract tests passed.', { command: suite.command, durationMs: suite.durationMs })
    : check('contract.static-suite', 'contract', 'fail', true, 'A pinned code contract failed; live output cannot be trusted.', { command: suite.command, exitCode: suite.exitCode, outputTail: suite.outputTail }, 'Fix the failing contract before rerunning live media.');
}

function checkProjectTerminal(status: string | null): EditronBattleCheck {
  if (status === 'complete' || status === 'needs_review') return check('pipeline.project-terminal', 'pipeline', status === 'complete' ? 'pass' : 'warn', false, `Project reached ${status}.`, { autoEditStatus: status });
  return check('pipeline.project-terminal', 'pipeline', 'fail', true, 'Project did not reach a usable terminal state.', { autoEditStatus: status }, 'Inspect the first failed/stalled worker stage before evaluating overlays.');
}

function checkDurationTruth(manifest: Phase0FixtureManifest, measured: number | null, expected: number | null): EditronBattleCheck {
  const evidence = { outputSeconds: manifest.durationSeconds, measuredSourceSeconds: measured, expectedSourceSeconds: expected };
  if (manifest.durationFrames <= 0) return check('pipeline.duration-truth', 'pipeline', 'fail', true, 'The final timeline has no positive duration.', evidence);
  if (expected != null && measured != null && Math.abs(measured - expected) > Math.max(1, expected * 0.05)) {
    return check('pipeline.duration-truth', 'pipeline', 'fail', true, 'Measured source duration disagrees with the declared battle fixture.', evidence, 'Repair upload metadata or MP4 probing before judging downstream editing.');
  }
  return check('pipeline.duration-truth', 'pipeline', measured == null ? 'warn' : 'pass', false, measured == null ? 'Final duration is valid, but source duration evidence is missing.' : 'Source and output durations are measurable.', evidence);
}

function checkPictureContinuity(manifest: Phase0FixtureManifest): EditronBattleCheck {
  const continuity = manifest.cutContinuity;
  const invalid = continuity.midTimelineGapCount > 0 || continuity.unclassifiedOverlapCount > 0 || continuity.tailGapFrames > 1;
  return check('pipeline.picture-continuity', 'pipeline', invalid ? 'fail' : 'pass', invalid, invalid ? 'The primary picture track contains a gap, unexplained overlap, or blank tail.' : 'The primary picture track is continuous.', {
    clipCount: continuity.clipCount,
    midTimelineGapCount: continuity.midTimelineGapCount,
    unclassifiedOverlapCount: continuity.unclassifiedOverlapCount,
    intentionalTransitionOverlapCount: continuity.intentionalTransitionOverlapCount,
    tailGapFrames: continuity.tailGapFrames,
  });
}

function checkCanonicalTimeline(manifest: Phase0FixtureManifest, scenario: EditronBattleScenario): EditronBattleCheck {
  const status = manifest.canonicalTimeline.status;
  if (status === 'ok') return check('pipeline.canonical-timeline', 'pipeline', 'pass', false, 'Final decisions are anchored to the canonical edited timeline.', { status });
  const visualScenario = scenario === 'visual-only' || scenario === 'mixed';
  return check('pipeline.canonical-timeline', 'pipeline', visualScenario && status === 'missing-raw-footage' ? 'warn' : 'fail', !visualScenario, 'Canonical transcript/source mapping is unavailable or unsafe.', { status, issue: manifest.canonicalTimeline.issue });
}

function checkUnifiedAuthority(manifest: Phase0FixtureManifest, authority: Record<string, unknown>): EditronBattleCheck {
  const producer = stringValue(authority.executableProducer);
  const role = stringValue(authority.creativeBriefRole);
  const source = manifest.unifiedDecisionBundle.source;
  const ok = manifest.unifiedDecisionBundle.status === 'present' && producer === 'unified-planner';
  return check('authority.single-owner', 'authority', ok ? 'pass' : 'fail', true, ok ? 'One unified planner owns executable decisions.' : 'Executable decision ownership is missing or still split.', { producer, creativeBriefRole: role, source }, 'Creative Brief may supply semantic context, but executeEDL must receive planner-owned decisions only.');
}

function checkSignalNormalization(signalHealth: Record<string, unknown>): EditronBattleCheck {
  const total = numberValue(signalHealth.totalCount);
  const unnormalized = numberValue(signalHealth.unnormalizedCandidateCount);
  if (total === 0) return check('authority.signal-normalization', 'authority', 'warn', false, 'No signal candidates were persisted for audit.', { total, unnormalized });
  return check('authority.signal-normalization', 'authority', unnormalized === 0 ? 'pass' : 'fail', unnormalized > 0, unnormalized === 0 ? 'All persisted signal candidates carry normalized execution evidence.' : 'Some signal candidates bypassed normalization.', { total, unnormalized });
}

function checkDecisionOutputTrace(trace: Record<string, unknown>): EditronBattleCheck {
  const samples = asRecords(trace.samples);
  const unexplained = samples.filter((sample) => stringValue(sample.outcome) === 'executed'
    && arrayValue(sample.createdOverlayIds).length === 0
    && arrayValue(sample.modifiedOverlayIds).length === 0
    && !isLicensedNoOverlayDecision(sample));
  if (stringValue(trace.status) === 'missing') return check('authority.output-trace', 'authority', 'fail', true, 'Decision-to-output trace is missing.', { status: trace.status });
  return check('authority.output-trace', 'authority', unexplained.length === 0 ? 'pass' : 'fail', unexplained.length > 0, unexplained.length === 0 ? 'Executed decisions either produced output or are licensed no-overlay operations.' : 'Some executed decisions produced no output and have no licensed no-overlay meaning.', { unexplained: unexplained.slice(0, 10) });
}

function checkCrossOverlayMemory(manifest: Phase0FixtureManifest): EditronBattleCheck {
  const final = manifest.finalOverlayChoreography;
  const bypasses = numberValue(final.bypassOverlayCount);
  return check('authority.cross-overlay-memory', 'authority', bypasses === 0 ? 'pass' : 'fail', bypasses > 0, bypasses === 0 ? 'Final overlays carry shared choreography ownership.' : 'Some final overlays bypassed shared timeline memory.', { bypassOverlayCount: bypasses, countsByFamily: final.countsByFamily, topBypasses: final.topBypasses });
}

function checkBatchReadiness(batch?: Record<string, unknown> | null): EditronBattleCheck {
  if (!batch) return check('pipeline.batch-readiness', 'pipeline', 'skip', false, 'No batch evidence was supplied for this run.', {});
  const assets = asRecords(batch.assets);
  const failed = assets.filter((asset) => stringValue(asset.readiness) === 'failed' || stringValue(asset.analysisStatus) === 'failed');
  const stuck = assets.filter((asset) => ['uploaded', 'queued', 'analyzing'].includes(stringValue(asset.analysisStatus) ?? ''));
  if (stuck.length > 0) return check('pipeline.batch-readiness', 'pipeline', 'fail', true, 'One or more assets never reached terminal analysis.', { stuck: stuck.map(assetIdentity) });
  return check('pipeline.batch-readiness', 'pipeline', failed.length > 0 ? 'warn' : 'pass', false, failed.length > 0 ? 'The batch failed forward with some unusable assets.' : 'Every batch asset reached a terminal state.', { failed: failed.map(assetIdentity), assetCount: assets.length });
}

function checkScenarioEvidence(scenario: EditronBattleScenario, project: Record<string, unknown>, manifest: Phase0FixtureManifest, overlays: Record<string, unknown>[]): EditronBattleCheck {
  if (scenario === 'auto') return check('family.scenario-evidence', 'family', 'skip', false, 'No scenario-specific expectation was requested.', {});
  const words = numberValue(manifest.canonicalTimeline.transcriptionWordCount);
  const hasCaptions = overlays.some((overlay) => stringValue(overlay.type) === 'caption');
  const hasBgm = overlays.some((overlay) => stringValue(overlay.type) === 'sound' && numberValue(overlay.row) === 1);
  const captionOff = stringValue(asRecord(project.productionBriefIntake).captionStyle) === 'off';
  if (scenario === 'speech-led' || scenario === 'hinglish') {
    const ok = words > 0 && (captionOff || hasCaptions);
    return check('family.scenario-evidence', 'family', ok ? 'pass' : 'fail', !ok, ok ? 'Speech evidence and the requested caption contract survived.' : 'Speech-led evidence or captions are missing.', { words, hasCaptions, captionOff });
  }
  if (scenario === 'music-led') {
    return check('family.scenario-evidence', 'family', hasBgm ? 'pass' : 'fail', !hasBgm, hasBgm ? 'A music-led timeline contains a BGM track.' : 'The music-led fixture produced no BGM track.', { hasBgm });
  }
  if (scenario === 'visual-only' || scenario === 'mixed') {
    const hitRate = numberValue(asRecord(manifest.vjepaCoverage).overlayHitRate);
    const ok = hitRate > 0;
    return check('family.scenario-evidence', 'family', ok ? 'pass' : 'fail', !ok, ok ? 'Visual evidence reached final timeline overlays.' : 'The visual fixture has no projected V-JEPA evidence.', { overlayHitRate: hitRate });
  }
  const hasMg = overlays.some((overlay) => stringValue(overlay.type) === 'mg-sequence');
  return check('family.scenario-evidence', 'family', hasMg ? 'pass' : 'fail', !hasMg, hasMg ? 'The MG-worthy fixture produced an AI MG sequence.' : 'The MG-worthy fixture produced no AI MG sequence.', { hasMg });
}

function checkVjepaEvidence(scenario: EditronBattleScenario, manifest: Phase0FixtureManifest): EditronBattleCheck {
  const visualRequired = scenario === 'visual-only' || scenario === 'mixed' || scenario === 'mg-worthy';
  const status = stringValue(asRecord(manifest.vjepaCoverage).status);
  if (status === 'pass') return check('perception.vjepa', 'perception', 'pass', false, 'V-JEPA coverage is healthy.', { status });
  return check('perception.vjepa', 'perception', visualRequired && status !== 'warn' ? 'fail' : 'warn', visualRequired && status !== 'warn', 'V-JEPA coverage is degraded or missing.', { status, coverage: manifest.vjepaCoverage });
}

function checkRenderedEvidence(manifest: Phase0FixtureManifest, required: boolean): EditronBattleCheck {
  const rendered = manifest.renderArtifacts.status === 'rendered' && manifest.renderArtifacts.renderedSummary != null;
  if (!rendered) return check('quality.rendered-evidence', 'quality', required ? 'fail' : 'skip', required, 'Rendered pixel/audio evidence is missing.', { renderArtifacts: manifest.renderArtifacts }, 'Fix Remotion site pinning and run the rendered Phase 0 worker; metadata cannot prove aesthetics.');
  const status = manifest.renderArtifacts.renderedSummary?.status;
  return check('quality.rendered-evidence', 'quality', status === 'fail' ? 'fail' : status === 'warn' ? 'warn' : 'pass', status === 'fail', `Rendered aesthetic evidence completed with status ${status}.`, { summary: manifest.renderArtifacts.renderedSummary, issues: manifest.renderArtifacts.renderedIssueSamples });
}

function checkAiMgLifecycle(input: { scenario: EditronBattleScenario; overlays: Record<string, unknown>[]; assets: Record<string, unknown>[]; jobs: Record<string, unknown>[]; frameProbes: EditronBattleMgFrameProbe[] }): EditronBattleCheck[] {
  const sequenceOverlays = input.overlays.filter((overlay) => stringValue(overlay.type) === 'mg-sequence');
  const sequenceAssets = input.assets.filter((asset) => stringValue(asset.type) === 'sequence');
  const terminalJobs = input.jobs.filter((job) => ['completed', 'failed'].includes(stringValue(job.status) ?? ''));
  const stuckJobs = input.jobs.filter((job) => ['queued', 'running'].includes(stringValue(job.status) ?? ''));
  const generatedJobs = input.jobs.filter((job) => stringValue(asRecord(job.result).status) === 'generated');
  const lifecycleFail = stuckJobs.length > 0 || generatedJobs.length !== sequenceOverlays.length || sequenceOverlays.length !== sequenceAssets.length;
  const lifecycleStatus: EditronBattleCheckStatus = input.jobs.length === 0 && input.scenario !== 'mg-worthy' ? 'skip' : lifecycleFail ? 'fail' : 'pass';
  const lifecycle = check('ai-mg.lifecycle', 'ai-mg', lifecycleStatus, lifecycleStatus === 'fail', lifecycleStatus === 'pass' ? 'AI MG jobs, assets, and timeline sequences reconcile.' : lifecycleStatus === 'skip' ? 'No AI MG job was licensed for this run.' : 'AI MG job, asset, and overlay counts do not reconcile.', {
    jobCount: input.jobs.length,
    terminalJobCount: terminalJobs.length,
    stuckJobs: stuckJobs.map(jobIdentity),
    generatedJobCount: generatedJobs.length,
    sequenceOverlayCount: sequenceOverlays.length,
    sequenceAssetCount: sequenceAssets.length,
  });
  const invalidAssets = sequenceAssets.filter((asset) => stringValue(asset.status) !== 'ready'
    || numberValue(asset.frameCount) <= 0
    || numberValue(asset.fps) <= 0
    || stringValue(asset.frameFormat) !== 'webp'
    || asset.transparent !== true
    || !stringValue(asset.r2Prefix));
  const assetStatus: EditronBattleCheckStatus = sequenceAssets.length === 0 ? 'skip' : invalidAssets.length === 0 ? 'pass' : 'fail';
  const assetContract = check('ai-mg.sequence-asset', 'ai-mg', assetStatus, assetStatus === 'fail', assetStatus === 'pass' ? 'Every AI MG sequence has a compact, ready, alpha-WebP asset contract.' : assetStatus === 'skip' ? 'No sequence asset was produced.' : 'One or more AI MG sequence assets are incomplete.', { invalidAssets: invalidAssets.map(assetIdentity) });
  const failedProbes = input.frameProbes.filter((probe) => !probe.reachable || probe.alphaPreserved !== true || probe.animated !== true);
  const probeStatus: EditronBattleCheckStatus = sequenceAssets.length === 0 ? 'skip' : input.frameProbes.length !== sequenceAssets.length || failedProbes.length > 0 ? 'fail' : 'pass';
  const pixelContract = check('ai-mg.pixel-proof', 'ai-mg', probeStatus, probeStatus === 'fail', probeStatus === 'pass' ? 'AI MG frames are reachable, preserve alpha, and change over time.' : probeStatus === 'skip' ? 'No AI MG sequence requires pixel probing.' : 'AI MG frame evidence is missing, opaque, static, or unreachable.', { probes: input.frameProbes, failedAssetIds: failedProbes.map((probe) => probe.assetId) });
  return [lifecycle, assetContract, pixelContract];
}

function checkApiEvidence(api?: EditronBattleApiEvidence): EditronBattleCheck[] {
  if (!api) return [check('api.live-surface', 'api', 'skip', false, 'No authenticated live API evidence was supplied.', {})];
  const checks: EditronBattleCheck[] = [];
  if (api.projectReload) checks.push(check('api.project-reload', 'api', api.projectReload.ok ? 'pass' : 'fail', !api.projectReload.ok, api.projectReload.ok ? 'The saved project reloads through the user-facing API.' : 'The saved project cannot reload through the user-facing API.', api.projectReload));
  const failedMedia = (api.media ?? []).filter((item) => !item.ok);
  checks.push(check('api.media-reachability', 'api', failedMedia.length === 0 ? 'pass' : 'fail', failedMedia.length > 0, failedMedia.length === 0 ? 'All sampled media URLs are reachable.' : 'Some sampled media URLs are unreachable.', { failedMedia, sampled: api.media?.length ?? 0 }));
  if (!api.chatIsolation || api.chatIsolation.status === 'not-run') checks.push(check('api.chat-isolation', 'api', 'skip', false, 'Project-scoped chat isolation was not exercised.', api.chatIsolation ?? {}));
  else checks.push(check('api.chat-isolation', 'api', api.chatIsolation.status === 'passed' ? 'pass' : 'fail', api.chatIsolation.status === 'failed', api.chatIsolation.status === 'passed' ? 'A canary chat session stayed inside its project and was cleaned up.' : 'A canary chat session leaked or cleanup failed.', api.chatIsolation));
  return checks;
}

function isLicensedNoOverlayDecision(sample: Record<string, unknown>): boolean {
  const type = stringValue(sample.type);
  if (type === 'pacing') return true;
  if (type !== 'transition') return false;
  const params = asRecord(sample.paramsPreview);
  const transition = stringValue(params.transitionStyle ?? params.transitionType ?? params.type);
  return transition === 'hard-cut' || transition === 'cut';
}

function resolveSourceDurationSeconds(project: Record<string, unknown>, assets: Record<string, unknown>[]): number | null {
  const brief = asRecord(project.productionBrief);
  const fromBrief = positiveNumber(brief.sourceDurationSec ?? brief.sourceDurationSeconds);
  if (fromBrief != null) return fromBrief;
  const durations = assets.map((asset) => positiveNumber(asset.duration)).filter((value): value is number => value != null);
  return durations.length > 0 ? round(durations.reduce((sum, value) => sum + value, 0)) : null;
}

function summarizeChecks(checks: EditronBattleCheck[]) {
  return {
    passed: checks.filter((item) => item.status === 'pass').length,
    warnings: checks.filter((item) => item.status === 'warn').length,
    failed: checks.filter((item) => item.status === 'fail').length,
    skipped: checks.filter((item) => item.status === 'skip').length,
    blockingFailures: checks.filter((item) => item.status === 'fail' && item.blocking).length,
  };
}

function check(id: string, area: EditronBattleCheck['area'], status: EditronBattleCheckStatus, blocking: boolean, summary: string, evidence: Record<string, unknown>, remediation?: string): EditronBattleCheck {
  return { id, area, status, blocking, summary, evidence, ...(remediation ? { remediation } : {}) };
}

function assetIdentity(asset: Record<string, unknown>) {
  return { assetId: stringValue(asset.assetId), filename: stringValue(asset.filename), type: stringValue(asset.type), status: stringValue(asset.status ?? asset.analysisStatus ?? asset.readiness) };
}

function jobIdentity(job: Record<string, unknown>) {
  return { jobId: stringValue(job._id ?? job.jobId), status: stringValue(job.status), lastError: stringValue(job.lastError) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
