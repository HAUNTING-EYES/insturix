import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1 } from './contracts-v1';
import { buildCanonicalDev03MeasuredEvidenceV2 } from './dev03-measured-evidence-v2';
import { buildV2RBenchmarkModelRoutesV2 } from './development-cohort-routes-v2';
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
    dispatchCount: routes.length * registry.cases.length,
  });
  return { manifest, registry, routes, preflight };
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
