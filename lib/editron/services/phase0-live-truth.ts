import {
  buildPhase0FixtureManifest,
  buildPhase0RenderedQualityEvidencePayload,
  type Phase0FixtureManifest,
  type Phase0FixtureProject,
  type Phase0RenderedQualityEvidencePayload,
} from './phase0-fixture-manifest';
import {
  classifyPhase0Fixture,
  type Phase0FailureClass,
  type Phase0FailureTaxonomy,
} from './phase0-failure-taxonomy';

export const PHASE0_LIVE_TRUTH_VERSION = 'editron-phase0-live-truth-v1' as const;
const PHASE0_LIVE_FAILURE_CLASS_LIMIT = 120;

export interface Phase0LiveTruthSnapshot {
  version: typeof PHASE0_LIVE_TRUTH_VERSION;
  capturedAt: string;
  source: string;
  projectId: string;
  manifestVersion: Phase0FixtureManifest['version'];
  taxonomyVersion: Phase0FailureTaxonomy['version'];
  status: Phase0FailureTaxonomy['status'];
  summary: Phase0FailureTaxonomy['summary'];
  durationFrames: number;
  durationSeconds: number;
  overlayCounts: Phase0FixtureManifest['overlayCounts'];
  cutContinuity: Phase0FixtureManifest['cutContinuity'];
  canonicalTimeline: Phase0FixtureManifest['canonicalTimeline'];
  unifiedDecisionBundle: Phase0FixtureManifest['unifiedDecisionBundle'];
  qualityReview: Phase0FixtureManifest['qualityReview'];
  vjepaCoverage: Phase0FixtureManifest['vjepaCoverage'];
  overlayFamilies: Phase0FixtureManifest['overlayFamilies'];
  renderArtifacts: Phase0FixtureManifest['renderArtifacts'];
  qualityEvidence: Phase0RenderedQualityEvidencePayload;
  calibrationSafety: Phase0FixtureManifest['calibrationSafety'];
  failureClasses: Phase0FailureClass[];
  failureClassesTruncated: boolean;
}

export function buildPhase0LiveTruthSnapshot(
  project: Phase0FixtureProject,
  options: { capturedAt?: string; source?: string } = {},
): Phase0LiveTruthSnapshot {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const source = options.source ?? 'director-final-save';
  const manifest = buildPhase0FixtureManifest(project, {
    capturedAt,
    source,
  });
  const taxonomy = classifyPhase0Fixture(manifest);
  const failureClasses = taxonomy.classes.slice(0, PHASE0_LIVE_FAILURE_CLASS_LIMIT);

  return {
    version: PHASE0_LIVE_TRUTH_VERSION,
    capturedAt,
    source,
    projectId: manifest.projectId,
    manifestVersion: manifest.version,
    taxonomyVersion: taxonomy.version,
    status: taxonomy.status,
    summary: taxonomy.summary,
    durationFrames: manifest.durationFrames,
    durationSeconds: manifest.durationSeconds,
    overlayCounts: manifest.overlayCounts,
    cutContinuity: manifest.cutContinuity,
    canonicalTimeline: manifest.canonicalTimeline,
    unifiedDecisionBundle: manifest.unifiedDecisionBundle,
    qualityReview: manifest.qualityReview,
    vjepaCoverage: manifest.vjepaCoverage,
    overlayFamilies: manifest.overlayFamilies,
    renderArtifacts: manifest.renderArtifacts,
    qualityEvidence: buildPhase0RenderedQualityEvidencePayload(manifest),
    calibrationSafety: manifest.calibrationSafety,
    failureClasses,
    failureClassesTruncated: taxonomy.classes.length > failureClasses.length,
  };
}
