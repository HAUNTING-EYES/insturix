import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 }
  from '../capability-census/cap2-current-truth-reissue-audit-v7';
import { EDITORIAL_PLAN_VERSION_V1 } from '../../services/editorial-plan-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  providerNativeCohortRoutesV2R,
  type ProviderNativeCohortRouteV2R,
} from './provider-native-cohort-manifest-v2r';
import {
  STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V1,
} from './stage25-long-form-plan-compiler-v1';
import {
  STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1,
  buildStage25LongFormPlanHoldoutContextV1,
} from './stage25-long-form-plan-holdout-v1';
import {
  buildStage25LongFormProviderContextV1,
  buildStage25LongFormProviderFinishSchemaV1,
  buildStage25LongFormProviderToolSetV1,
  STAGE25_LONG_FORM_PROVIDER_MAX_INPUT_TOKENS_V1,
  STAGE25_LONG_FORM_PROVIDER_MAX_OUTPUT_TOKENS_V1,
  STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V1,
  STAGE25_LONG_FORM_PROVIDER_PRESENTATION_SEED_V1,
  STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V1,
} from './stage25-long-form-plan-provider-protocol-v1';

export const STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_COHORT_V1_1' as const;
export const STAGE25_LONG_FORM_PROVIDER_HOLDOUT_SOURCE_PATH_V1 =
  'lib/editron/research/open-ended-planner/stage25-long-form-plan-holdout-v1.ts' as const;
export const STAGE25_LONG_FORM_PROVIDER_COMPILER_SOURCE_PATH_V1 =
  'lib/editron/research/open-ended-planner/stage25-long-form-plan-compiler-v1.ts' as const;
export const STAGE25_LONG_FORM_PROVIDER_PROTOCOL_SOURCE_PATH_V1 =
  'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-protocol-v1.ts' as const;

interface SourceBindingInputV1 {
  sourceCommit: string;
  holdoutSourceSha256: string;
  compilerSourceSha256: string;
  protocolSourceSha256: string;
}

export interface Stage25LongFormProviderCohortManifestV1 {
  version: typeof STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V1;
  authority: 'RESEARCH_PLANNING_ONLY_NO_PROJECT_MUTATION';
  experimentId: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROVIDER_COHORT_V1';
  sourceBinding: Readonly<SourceBindingInputV1 & {
    holdoutSourcePath: typeof STAGE25_LONG_FORM_PROVIDER_HOLDOUT_SOURCE_PATH_V1;
    compilerSourcePath: typeof STAGE25_LONG_FORM_PROVIDER_COMPILER_SOURCE_PATH_V1;
    protocolSourcePath: typeof STAGE25_LONG_FORM_PROVIDER_PROTOCOL_SOURCE_PATH_V1;
    holdoutVersion: typeof STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1;
    compilerVersion: typeof STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V1;
    protocolVersion: typeof STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V1;
    editorialPlanVersion: typeof EDITORIAL_PLAN_VERSION_V1;
    cap2ManifestSha256: string;
    cap2SourceSnapshotSha256: string;
    cap2SourceCommit: string;
  }>;
  canonicalContextSha256: string;
  finishSchemaSha256: string;
  toolSetSha256: string;
  routeRoster: readonly Readonly<ProviderNativeCohortRouteV2R>[];
  routeRosterSha256: string;
  presentationSeed: typeof STAGE25_LONG_FORM_PROVIDER_PRESENTATION_SEED_V1;
  presentations: readonly Readonly<{
    ordinal: number;
    providerContextSha256: string;
  }>[];
  rows: readonly Readonly<{
    rowId: string;
    routeId: string;
    model: string;
    presentationOrdinal: number;
    absoluteMaxRowSpendUsd: number;
  }>[];
  maxInputTokensPerRow: typeof STAGE25_LONG_FORM_PROVIDER_MAX_INPUT_TOKENS_V1;
  maxOutputTokensPerRow: typeof STAGE25_LONG_FORM_PROVIDER_MAX_OUTPUT_TOKENS_V1;
  rowCount: 9;
  absoluteMaxSpendUsd: number;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildStage25LongFormProviderCohortManifestV1(
  input: SourceBindingInputV1,
): Readonly<Stage25LongFormProviderCohortManifestV1> {
  assertSha(input.sourceCommit, 40, 'SOURCE_COMMIT');
  assertSha(input.holdoutSourceSha256, 64, 'HOLDOUT_SOURCE');
  assertSha(input.compilerSourceSha256, 64, 'COMPILER_SOURCE');
  assertSha(input.protocolSourceSha256, 64, 'PROTOCOL_SOURCE');
  const routeRoster = providerNativeCohortRoutesV2R();
  assertRoutes(routeRoster);
  const canonicalContext = buildStage25LongFormPlanHoldoutContextV1();
  const finishSchema = buildStage25LongFormProviderFinishSchemaV1();
  const toolSet = buildStage25LongFormProviderToolSetV1();
  const presentations = Array.from(
    { length: STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V1 },
    (_, index) => {
      const ordinal = index + 1;
      return {
        ordinal,
        providerContextSha256: hashCanonicalJsonV1(
          buildStage25LongFormProviderContextV1(ordinal),
        ),
      };
    },
  );
  const rows = routeRoster.flatMap((entry) => presentations.map((presentation) => ({
    rowId: `${entry.route.routeId}:P${presentation.ordinal}`,
    routeId: entry.route.routeId,
    model: entry.route.model,
    presentationOrdinal: presentation.ordinal,
    absoluteMaxRowSpendUsd: maximumRowSpend(entry),
  })));
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V1,
    authority: 'RESEARCH_PLANNING_ONLY_NO_PROJECT_MUTATION' as const,
    experimentId: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROVIDER_COHORT_V1' as const,
    sourceBinding: {
      ...input,
      holdoutSourcePath: STAGE25_LONG_FORM_PROVIDER_HOLDOUT_SOURCE_PATH_V1,
      compilerSourcePath: STAGE25_LONG_FORM_PROVIDER_COMPILER_SOURCE_PATH_V1,
      protocolSourcePath: STAGE25_LONG_FORM_PROVIDER_PROTOCOL_SOURCE_PATH_V1,
      holdoutVersion: STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1,
      compilerVersion: STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V1,
      protocolVersion: STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V1,
      editorialPlanVersion: EDITORIAL_PLAN_VERSION_V1,
      cap2ManifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash,
      cap2SourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.normalizedSourceSnapshotHash,
      cap2SourceCommit: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.commit,
    },
    canonicalContextSha256: canonicalContext.contextSha256,
    finishSchemaSha256: hashCanonicalJsonV1(finishSchema),
    toolSetSha256: toolSet.toolSetSha256,
    routeRoster,
    routeRosterSha256: hashCanonicalJsonV1(routeRoster),
    presentationSeed: STAGE25_LONG_FORM_PROVIDER_PRESENTATION_SEED_V1,
    presentations,
    rows,
    maxInputTokensPerRow: STAGE25_LONG_FORM_PROVIDER_MAX_INPUT_TOKENS_V1,
    maxOutputTokensPerRow: STAGE25_LONG_FORM_PROVIDER_MAX_OUTPUT_TOKENS_V1,
    rowCount: 9 as const,
    absoluteMaxSpendUsd: roundUsd(rows.reduce(
      (sum, row) => sum + row.absoluteMaxRowSpendUsd, 0,
    )),
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material, manifestSha256: hashCanonicalJsonV1(material),
  });
}

export function assertStage25LongFormProviderCohortManifestV1(
  value: unknown,
): Readonly<Stage25LongFormProviderCohortManifestV1> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_MANIFEST_MISSING');
  }
  const candidate = value as Stage25LongFormProviderCohortManifestV1;
  const rebuilt = buildStage25LongFormProviderCohortManifestV1({
    sourceCommit: candidate.sourceBinding?.sourceCommit,
    holdoutSourceSha256: candidate.sourceBinding?.holdoutSourceSha256,
    compilerSourceSha256: candidate.sourceBinding?.compilerSourceSha256,
    protocolSourceSha256: candidate.sourceBinding?.protocolSourceSha256,
  });
  if (hashCanonicalJsonV1(candidate) !== hashCanonicalJsonV1(rebuilt)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_MANIFEST_DRIFT');
  }
  return deepFreezeV1(structuredClone(candidate));
}

function maximumRowSpend(entry: Readonly<ProviderNativeCohortRouteV2R>): number {
  const inputRate = Math.max(
    entry.pricing.inputUsdPerMillion,
    entry.pricing.cacheWriteUsdPerMillion,
  );
  return roundUsd((
    STAGE25_LONG_FORM_PROVIDER_MAX_INPUT_TOKENS_V1 * inputRate
      + STAGE25_LONG_FORM_PROVIDER_MAX_OUTPUT_TOKENS_V1
        * entry.pricing.outputUsdPerMillion
  ) / 1_000_000);
}

function assertRoutes(routes: readonly Readonly<ProviderNativeCohortRouteV2R>[]): void {
  const roster = routes.map(({ route }) => `${route.routeId}:${route.model}`).join('|');
  if (roster !== [
    'OPENAI_LUNA:gpt-5.6-luna',
    'OPENAI_TERRA:gpt-5.6-terra',
    'GOOGLE_FLASH:gemini-3.7-flash',
  ].join('|')) throw new Error('STAGE25_LONG_FORM_PROVIDER_ROUTE_ROSTER_DRIFT');
}

function assertSha(value: string, length: number, label: string): void {
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new Error(`STAGE25_LONG_FORM_PROVIDER_${label}_INVALID`);
  }
}
function roundUsd(value: number): number {
  return Math.ceil(value * 1_000_000_000) / 1_000_000_000;
}
