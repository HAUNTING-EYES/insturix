import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1 } from './contracts-v1';
import { cap2aEnrichmentCoverageV2R } from './cap2a-planner-dossier-v2r';
import { buildCanonicalDev03MeasuredEvidenceV2 } from './dev03-measured-evidence-v2';
import { buildV2RBenchmarkModelRoutesV2 } from './development-cohort-routes-v2';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import { runV2RBenchmarkCohortV2R } from './v2r-benchmark-cohort-v2r';
import { buildV2RBenchmarkTaskRegistryV2 } from './v2r-benchmark-task-registry';
import { buildV2RPreregistrationManifest } from './v2r-preregistration-manifest';

const DEV03_AUDIO_PATH = '.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav';
const DEV03_ANALYZER_PATH = 'lib/editron/services/media/beat-detection-service.ts';

export async function prepareV2RLiveCohortV2R(input: {
  environment: Readonly<Record<string, string | undefined>>;
}) {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(path.resolve(DEV03_AUDIO_PATH)),
    readFile(path.resolve(DEV03_ANALYZER_PATH)),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const manifest = buildV2RPreregistrationManifest();
  const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
  const routes = buildV2RBenchmarkModelRoutesV2({
    environment: input.environment,
    qwenBudgetMode: 'FAIR_STAGE_BUDGET',
  });
  const operatorRecords = Array.isArray(V2R_OPERATOR_CATALOG.operators)
    ? V2R_OPERATOR_CATALOG.operators.filter(isRecord)
    : [];
  const dossierCoverage = cap2aEnrichmentCoverageV2R(operatorRecords);
  if (dossierCoverage.total !== 40 || dossierCoverage.enriched !== 40
    || dossierCoverage.unmapped.length !== 0) {
    throw new Error('V2R_LIVE_PREFLIGHT_CAPABILITY_DOSSIER_INCOMPLETE');
  }
  const maximumAttemptsPerStage = manifest.perAttemptBudget
    .providerStageSchedule.maximumAttemptsPerStage;
  const perEpisodeMaximumUsd = Object.values(manifest.perAttemptBudget
    .providerStageSchedule.stageBudgets)
    .reduce((sum, budget) => sum + budget.maxProviderCostUsd, 0)
    * maximumAttemptsPerStage;
  const meteredRouteCount = routes.filter(({ costBasis }) => costBasis === 'USD_METERED').length;
  const absoluteMaxMeteredSpendUsd = Number((
    perEpisodeMaximumUsd * registry.cases.length * meteredRouteCount
  ).toFixed(2));
  const preflight = deepFreezeV1({
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    preregistrationManifestSha256: manifest.manifestSha256,
    taskRegistrySha256: registry.registrySha256,
    caseIds: registry.cases.map(({ caseId }) => caseId),
    routes: routes.map(({ routeId, claimedModelIdentity, costBasis }) => ({
      routeId, claimedModelIdentity, costBasis,
    })),
    dev03Evidence: {
      artifactSha256: measured.sourceBinding.artifactSha256,
      analyzerSha256: measured.analyzerBinding.implementationSha256,
      strongPeakFrames: measured.analysis.strongPeaks.map(({ projectFrame }) => projectFrame),
    },
    providerCredentialsValidatedPresent: true as const,
    capabilityDossierCoverage: dossierCoverage,
    maximumAttemptsPerStage,
    maximumProviderStageDispatches: routes.length * registry.cases.length * 3,
    maximumProviderAttempts: routes.length * registry.cases.length * 3
      * maximumAttemptsPerStage,
    absoluteMaxMeteredSpendUsd,
    unpricedRouteIds: routes.filter(({ costBasis }) => costBasis !== 'USD_METERED')
      .map(({ routeId }) => routeId),
    dispatchCount: routes.length * registry.cases.length,
  });
  return { manifest, registry, routes, preflight };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function runV2RLiveCohortV2R(input: {
  environment: Readonly<Record<string, string | undefined>>;
  cohortId: string;
  createdAt: string;
  outputDir: string;
}) {
  const prepared = await prepareV2RLiveCohortV2R({ environment: input.environment });
  return runV2RBenchmarkCohortV2R({
    manifest: prepared.manifest,
    registry: prepared.registry,
    routes: prepared.routes,
    cohortId: input.cohortId,
    createdAt: input.createdAt,
    outputDir: input.outputDir,
  });
}
