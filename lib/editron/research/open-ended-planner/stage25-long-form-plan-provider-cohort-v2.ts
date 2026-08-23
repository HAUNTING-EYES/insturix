import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildStage25LongFormProviderCohortManifestV1,
  type Stage25LongFormProviderCohortManifestV1,
} from './stage25-long-form-plan-provider-cohort-v1';
import { STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V1 }
  from './stage25-long-form-plan-provider-evaluator-v1';
import { STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V1 }
  from './stage25-long-form-plan-provider-protocol-v1';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';

export const STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_COHORT_V2_1' as const;
export const STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2 =
  'YES_I_CONFIRM_9_LONG_FORM_PLAN_ROWS' as const;

const SOURCE_PATHS = {
  cohort: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v2.ts',
  holdout: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-holdout-v1.ts',
  compiler: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-compiler-v1.ts',
  protocol: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-protocol-v1.ts',
  evaluator: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-evaluator-v1.ts',
  preflight: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-preflight-v2.ts',
  authorization: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-authorization-v2.ts',
  runnerContract: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-runner-contract-v2.ts',
  runner: 'lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-runner-v2.ts',
  operator: 'scripts/run-stage25-long-form-provider-cohort-v2.ts',
} as const;

export type SourceRoleV2 = keyof typeof SOURCE_PATHS;
export type Stage25LongFormProviderSourceBindingInputV2 = Readonly<{
  sourceCommit: string;
  sourceSha256: Readonly<Record<SourceRoleV2, string>>;
}>;

export interface Stage25LongFormProviderCohortManifestV2 {
  version: typeof STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V2;
  authority: 'RESEARCH_PLANNING_ONLY_NO_PROJECT_MUTATION';
  experimentId: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROVIDER_COHORT_V2';
  sourceBinding: Readonly<{
    sourceCommit: string;
    sourceFiles: readonly Readonly<{
      role: SourceRoleV2;
      path: string;
      sha256: string;
    }>[];
    sourceBindingSha256: string;
  }>;
  baseManifest: Readonly<Stage25LongFormProviderCohortManifestV1>;
  evaluatorVersion: typeof STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V1;
  argumentHandoffMode: typeof STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V1;
  rows: readonly Readonly<{
    rowId: string;
    routeId: ProviderNativeRouteV2R['routeId'];
    model: ProviderNativeRouteV2R['model'];
    presentationOrdinal: number;
    absoluteMaxRowSpendNanoUsd: number;
  }>[];
  dispatchPolicy: Readonly<{
    maximumProviderInferenceCalls: 9;
    maximumAttemptsPerRow: 1;
    automaticProviderRetries: 0;
    projectReadsAuthorized: 0;
    projectMutationsAuthorized: 0;
  }>;
  absoluteMaxSpendNanoUsd: number;
  confirmation: typeof STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildStage25LongFormProviderCohortManifestV2(
  input: Stage25LongFormProviderSourceBindingInputV2,
): Readonly<Stage25LongFormProviderCohortManifestV2> {
  assertSha(input.sourceCommit, 40, 'SOURCE_COMMIT');
  const sourceFiles = (Object.keys(SOURCE_PATHS) as SourceRoleV2[])
    .map((role) => {
      assertSha(input.sourceSha256[role], 64, `SOURCE_${role.toUpperCase()}`);
      return { role, path: SOURCE_PATHS[role], sha256: input.sourceSha256[role] };
    });
  const sourceBindingMaterial = { sourceCommit: input.sourceCommit, sourceFiles };
  const baseManifest = buildStage25LongFormProviderCohortManifestV1({
    sourceCommit: input.sourceCommit,
    holdoutSourceSha256: input.sourceSha256.holdout,
    compilerSourceSha256: input.sourceSha256.compiler,
    protocolSourceSha256: input.sourceSha256.protocol,
  });
  const rows = baseManifest.rows.map((row) => ({
    rowId: row.rowId,
    routeId: row.routeId as ProviderNativeRouteV2R['routeId'],
    model: row.model as ProviderNativeRouteV2R['model'],
    presentationOrdinal: row.presentationOrdinal,
    absoluteMaxRowSpendNanoUsd: usdToNano(row.absoluteMaxRowSpendUsd),
  }));
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V2,
    authority: 'RESEARCH_PLANNING_ONLY_NO_PROJECT_MUTATION' as const,
    experimentId: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROVIDER_COHORT_V2' as const,
    sourceBinding: {
      ...sourceBindingMaterial,
      sourceBindingSha256: hashCanonicalJsonV1(sourceBindingMaterial),
    },
    baseManifest,
    evaluatorVersion: STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V1,
    argumentHandoffMode: STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V1,
    rows,
    dispatchPolicy: {
      maximumProviderInferenceCalls: 9 as const,
      maximumAttemptsPerRow: 1 as const,
      automaticProviderRetries: 0 as const,
      projectReadsAuthorized: 0 as const,
      projectMutationsAuthorized: 0 as const,
    },
    absoluteMaxSpendNanoUsd: rows.reduce(
      (sum, row) => sum + row.absoluteMaxRowSpendNanoUsd, 0,
    ),
    confirmation: STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25LongFormProviderCohortManifestV2(
  value: unknown,
): Readonly<Stage25LongFormProviderCohortManifestV2> {
  const candidate = value as Stage25LongFormProviderCohortManifestV2;
  const files = candidate?.sourceBinding?.sourceFiles ?? [];
  const sourceSha256 = Object.fromEntries(
    files.map(({ role, sha256 }) => [role, sha256]),
  ) as Record<SourceRoleV2, string>;
  const rebuilt = buildStage25LongFormProviderCohortManifestV2({
    sourceCommit: candidate?.sourceBinding?.sourceCommit,
    sourceSha256,
  });
  if (hashCanonicalJsonV1(candidate) !== hashCanonicalJsonV1(rebuilt)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_MANIFEST_V2_DRIFT');
  }
  return deepFreezeV1(structuredClone(candidate));
}

export function stage25LongFormProviderMaxSpendUsdV2(
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>,
): string {
  return (manifest.absoluteMaxSpendNanoUsd / 1_000_000_000).toFixed(9);
}

export function stage25LongFormProviderSourceEntriesV2(): readonly Readonly<{
  role: SourceRoleV2;
  path: string;
}>[] {
  return deepFreezeV1((Object.keys(SOURCE_PATHS) as SourceRoleV2[])
    .map((role) => ({ role, path: SOURCE_PATHS[role] })));
}

function usdToNano(value: number): number {
  const nano = Math.ceil(value * 1_000_000_000);
  if (!Number.isSafeInteger(nano) || nano < 1) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_SPEND_NANO_INVALID');
  }
  return nano;
}
function assertSha(value: string, length: number, label: string): void {
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new Error(`STAGE25_LONG_FORM_PROVIDER_${label}_INVALID`);
  }
}
