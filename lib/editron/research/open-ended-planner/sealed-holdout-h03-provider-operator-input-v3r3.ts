import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { buildCanonicalDev03MeasuredEvidenceV2 } from './dev03-measured-evidence-v2';
import {
  buildProviderNativeCohortManifestV2R,
} from './provider-native-cohort-manifest-v2r';
import {
  buildSealedH03ProviderCohortManifestV3R3,
  SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R3,
} from './sealed-holdout-h03-provider-cohort-v3r3';
import {
  buildSealedH03GeneratedCompositionModelPacketV3R,
} from './sealed-holdout-h03-model-candidate-v3r';
import type { SealedH03ProviderSourceRequestV3R3 }
  from './sealed-holdout-h03-provider-preflight-v3r3';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from './sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from './sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from './sealed-holdout-cohort-v3r2';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from './sealed-holdout-h03-target-contract-v3r';
import { buildV2RBenchmarkTaskRegistryV2 } from './v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;

export const SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R3 = Object.freeze([
  'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  'lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1.ts',
  'lib/editron/research/open-ended-planner/provider-native-generated-source-adapter-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v3r2.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-source-adapter-v3r2.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-source-executor-v3r2.ts',
] as const);

export async function buildSealedH03ProviderOperatorInputV3R3(
  repoRoot = process.cwd(),
) {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(resolve(repoRoot,
      '.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav')),
    readFile(resolve(repoRoot, 'lib/editron/services/media/beat-detection-service.ts')),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes,
    analyzerSourceBytes,
  });
  const providerManifest = buildProviderNativeCohortManifestV2R(
    buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured }),
  );
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  const baseManifest = buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
  const implementationBindings = await Promise.all(
    SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R3.map(async (filePath) => ({
      path: filePath,
      sha256: await fileSha(repoRoot, filePath),
    })),
  );
  const cohortManifest = buildSealedH03ProviderCohortManifestV3R3({
    contractSourceSha256: await fileSha(
      repoRoot,
      'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r3.ts',
    ),
    baseManifest,
    providerManifest,
    implementationBindings,
  });
  const apiImplementationHash = implementationBindings.find(({ path: filePath }) => (
    filePath.endsWith('/generated-composition-api-v1.tsx')
  ))?.sha256;
  if (!apiImplementationHash) throw new Error('SEALED_H03_PROVIDER_API_BINDING_MISSING');
  const sourceIdentity = SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R3;
  const argumentsValue = generatedArguments();
  const sourceRequest: Readonly<SealedH03ProviderSourceRequestV3R3> = Object.freeze({
    apiImplementationHash,
    sourceAArtifactSha256: sourceIdentity.sourceAArtifactSha256,
    sourceBArtifactSha256: sourceIdentity.sourceBArtifactSha256,
    arguments: argumentsValue,
    orchestratorSpecSha256: hashCanonicalJsonV1(argumentsValue),
    ownerAuthorizationOutputSha256: sourceIdentity.ownerAuthorizationOutputSha256,
    packet: buildSealedH03GeneratedCompositionModelPacketV3R({
      apiImplementationHash,
      sourceAArtifactSha256: sourceIdentity.sourceAArtifactSha256,
      sourceBArtifactSha256: sourceIdentity.sourceBArtifactSha256,
      orchestratorArguments: argumentsValue,
    }),
  });
  return Object.freeze({ baseManifest, providerManifest, cohortManifest, sourceRequest });
}

function generatedArguments(): Readonly<JsonRecord> {
  return Object.freeze({
    projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
    assetIds: ['h03-a', 'h03-b'],
    targetRange: { startFrame: 90, endFrame: 270 },
    referenceBlueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    layoutSpec: {
      panelCount: 6, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true,
      titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 },
    },
    motionSpec: {
      entryFrames: [0, 24], stableFrames: [24, 150], exitFrames: [150, 180],
      relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
    },
    typographySpec: {
      text: 'EVENT\nMOMENT', alignment: 'CENTER',
      fontAssetId: 'font-noto-sans-v27-regular',
    },
    constraints: {
      referencePixelsForbidden: true, preserveOutsideRange: true,
      returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
      titleFaceOverlapMaximumPixels: 0,
    },
    evidenceIds: ['E1', 'E2', 'E3'],
  });
}

async function fileSha(repoRoot: string, filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(resolve(repoRoot, filePath))).digest('hex');
}

function resolve(repoRoot: string, filePath: string): string {
  return path.resolve(repoRoot, ...filePath.split('/'));
}
