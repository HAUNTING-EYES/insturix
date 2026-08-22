import { buildCap2aPlannerToolSheetV2R } from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  sealedHoldoutOperatorCatalogIdentityV3R,
} from './sealed-holdout-catalog-v3r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCaseV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_COHORT_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_COHORT_V3R_1' as const;
export const SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R =
  'lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r.ts' as const;
const SEALED_HOLDOUT_BASE_VERSION_V3R = 'EDITRON_OE_SEALED_HOLDOUT_COHORT_V2R_2';
const SEALED_HOLDOUT_BASE_MANIFEST_SHA256_V3R =
  '5a7ceece49f33378b8f13876e5e386e0ced41f642468d42671a67bcd35bdedaa';
const SEALED_HOLDOUT_BASE_CONTRACT_SHA256_V3R =
  'fae09443bde25364dfa5859e4213b2a027e8bdb3f7c8423b030612c8b60ddb92';

export interface SealedHoldoutCohortManifestV3R {
  version: typeof SEALED_HOLDOUT_COHORT_VERSION_V3R;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION';
  contractSource: Readonly<{
    path: typeof SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R;
    sha256: string;
  }>;
  baseCohortIdentity: Readonly<JsonRecord>;
  operatorCatalogIdentity: Readonly<JsonRecord>;
  cap2CurrentTruthBinding: Readonly<JsonRecord>;
  mediaIdentity: Readonly<JsonRecord>;
  sharedModelContext: Readonly<JsonRecord>;
  sharedModelContextSha256: string;
  cases: readonly Readonly<SealedHoldoutCaseV2R>[];
  correctionLedger: readonly string[];
  executionPolicy: Readonly<JsonRecord>;
  manifestSha256: string;
}

export function buildSealedHoldoutCohortManifestV3R(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
}>): Readonly<SealedHoldoutCohortManifestV3R> {
  requireSha(input.contractSourceSha256, 'HOLDOUT_V3_COHORT_SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  assertBaseIdentityV3R(base);
  const operators = records(SEALED_HOLDOUT_OPERATOR_CATALOG_V3R.operators);
  if (operators.length !== 40) fail('HOLDOUT_V3_OPERATOR_COUNT_INVALID');
  const callableOperatorIds = operators
    .filter((operator) => text(operator.compilerEligibility) !== 'NOT_COMPILABLE')
    .map((operator) => text(operator.operatorId));
  const unavailableOperatorIds = operators
    .filter((operator) => text(operator.compilerEligibility) === 'NOT_COMPILABLE')
    .map((operator) => text(operator.operatorId));
  if (callableOperatorIds.length !== 33 || unavailableOperatorIds.length !== 7) {
    fail('HOLDOUT_V3_OPERATOR_ELIGIBILITY_DRIFT');
  }
  const operatorCatalogIdentity = sealedHoldoutOperatorCatalogIdentityV3R();
  const sharedModelContext = deepFreezeV1({
    version: 'EDITRON_OE_SEALED_HOLDOUT_SHARED_MODEL_CONTEXT_V3R_1',
    rule: 'Every V3R case receives the same complete forty-operation dossier; unavailable operations remain visible and uncallable.',
    operatorCatalogIdentity,
    operatorCatalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
    planningToolSheet: buildCap2aPlannerToolSheetV2R(operators),
    callableOperatorIds,
    unavailableOperatorIds,
  });
  assertNoEvaluatorLeakV2(sharedModelContext);
  const sharedModelContextSha256 = hashCanonicalJsonV1(sharedModelContext);
  const cases = base.cases.map((entry) => amendCaseV3R(
    entry,
    base.mediaIdentity,
    sharedModelContextSha256,
  ));
  const material = {
    version: SEALED_HOLDOUT_COHORT_VERSION_V3R,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION' as const,
    contractSource: {
      path: SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
      sha256: input.contractSourceSha256,
    },
    baseCohortIdentity: {
      version: base.version,
      manifestSha256: base.manifestSha256,
      contractSource: base.contractSource,
    },
    operatorCatalogIdentity,
    cap2CurrentTruthBinding: base.cap2CurrentTruthBinding,
    mediaIdentity: base.mediaIdentity,
    sharedModelContext,
    sharedModelContextSha256,
    cases,
    correctionLedger: [
      'HOLD-01 incoming search interval is distinct from measured eligible source-start window',
      'every synthetic source exposes hash-bound duration and rational edit rate',
      'shared context opts into the immutable V3R operator catalog',
    ],
    executionPolicy: {
      ...base.executionPolicy,
      dispatchAuthorized: false as const,
      derivedIdentityOnly: true as const,
    },
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutCohortManifestV3R(
  candidate: unknown,
): Readonly<SealedHoldoutCohortManifestV3R> {
  if (!isRecord(candidate)) fail('HOLDOUT_V3_COHORT_MANIFEST_MISSING');
  const manifest = candidate as unknown as SealedHoldoutCohortManifestV3R;
  const { manifestSha256, ...material } = manifest;
  const catalogIdentity = sealedHoldoutOperatorCatalogIdentityV3R();
  const baseIdentity = record(manifest.baseCohortIdentity);
  const baseSource = record(baseIdentity.contractSource);
  if (manifest.version !== SEALED_HOLDOUT_COHORT_VERSION_V3R
    || manifest.authority !== 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION'
    || manifest.contractSource.path !== SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R
    || manifest.cases.length !== 16
    || manifest.sharedModelContextSha256 !== hashCanonicalJsonV1(manifest.sharedModelContext)
    || hashCanonicalJsonV1(manifest.operatorCatalogIdentity)
      !== hashCanonicalJsonV1(catalogIdentity)
    || baseIdentity.version !== SEALED_HOLDOUT_BASE_VERSION_V3R
    || baseIdentity.manifestSha256 !== SEALED_HOLDOUT_BASE_MANIFEST_SHA256_V3R
    || baseSource.sha256 !== SEALED_HOLDOUT_BASE_CONTRACT_SHA256_V3R
    || manifestSha256 !== hashCanonicalJsonV1(material)
    || manifest.executionPolicy.dispatchAuthorized !== false) {
    fail('HOLDOUT_V3_COHORT_MANIFEST_DRIFT');
  }
  assertNoEvaluatorLeakV2(manifest.sharedModelContext);
  for (const entry of manifest.cases) {
    assertNoEvaluatorLeakV2(entry.publicCase);
    if (entry.publicCaseSha256 !== hashCanonicalJsonV1(entry.publicCase)
      || entry.ownerOnlySha256 !== hashCanonicalJsonV1(entry.ownerOnly)
      || entry.evaluatorOnlySha256 !== hashCanonicalJsonV1(entry.evaluatorOnly)) {
      fail(`HOLDOUT_V3_CASE_HASH_DRIFT:${entry.caseId}`);
    }
    assertMediaDurationV3R(entry, text(manifest.mediaIdentity.manifestSha256));
  }
  assertH01EvidenceV3R(manifest.cases);
  return deepFreezeV1(manifest);
}

function amendCaseV3R(
  entry: Readonly<SealedHoldoutCaseV2R>,
  mediaIdentity: Readonly<JsonRecord>,
  sharedModelContextSha256: string,
): Readonly<SealedHoldoutCaseV2R> {
  const publicCase = structuredClone(entry.publicCase) as JsonRecord;
  const project = record(publicCase.project);
  const durationFrames = positiveInteger(project.durationFrames);
  publicCase.sharedModelContextSha256 = sharedModelContextSha256;
  publicCase.media = records(publicCase.media).map((media) => ({
    ...media,
    durationFrames,
    sourceTimebase: { rate: { numerator: '30', denominator: '1' }, coordinateDomain: 'SOURCE_FRAME' },
    durationBinding: {
      authority: 'HASH_BOUND_SYNTHETIC_RECIPE_AND_MATERIALIZER_V3R',
      mediaManifestSha256: text(mediaIdentity.manifestSha256),
      recipeSha256: media.recipeSha256,
    },
  }));
  const ownerOnly = structuredClone(entry.ownerOnly) as JsonRecord;
  if (publicCase.taskId === 'HOLD-01' && publicCase.conditionArm === 'C1') {
    ownerOnly.evidence = records(ownerOnly.evidence).map(amendH01EvidenceV3R);
  }
  const frozenPublic = deepFreezeV1(publicCase);
  const frozenOwner = deepFreezeV1(ownerOnly);
  return deepFreezeV1({
    caseId: entry.caseId,
    publicCase: frozenPublic,
    ownerOnly: frozenOwner,
    evaluatorOnly: entry.evaluatorOnly,
    publicCaseSha256: hashCanonicalJsonV1(frozenPublic),
    ownerOnlySha256: hashCanonicalJsonV1(frozenOwner),
    evaluatorOnlySha256: hashCanonicalJsonV1(entry.evaluatorOnly),
  });
}

function amendH01EvidenceV3R(evidence: JsonRecord): JsonRecord {
  if (evidence.kind !== 'VISUAL_WINDOWS') return evidence;
  const value = record(evidence.value);
  const outgoing = record(value.outgoing);
  const incoming = record(value.incoming);
  if (hashCanonicalJsonV1(outgoing.range) !== hashCanonicalJsonV1([80, 150])
    || hashCanonicalJsonV1(incoming.range) !== hashCanonicalJsonV1([30, 120])
    || incoming.assetId !== 'h01-dial') {
    fail('HOLDOUT_V3_H01_BASE_EVIDENCE_DRIFT');
  }
  return {
    ...evidence,
    binding: `${text(evidence.binding)}+measured-start-window-v3r1`,
    value: {
      outgoing: {
        assetId: outgoing.assetId,
        searchRange: outgoing.range,
        selectedAdjacentFrame: 149,
      },
      incoming: {
        assetId: incoming.assetId,
        searchRange: incoming.range,
        validStartFrameWindow: [30, 37],
      },
      matchMeasurement: {
        analyzer: 'HOLDOUT_COLOR_BOUNDS_GEOMETRY_V2R_1',
        raster: { width: 640, height: 360 },
        maximumNormalizedCenterDistance: 0.03,
        measuredEligibleStartFrames: [30, 31, 32, 33, 34, 35, 36],
      },
    },
  };
}

function assertMediaDurationV3R(
  entry: Readonly<SealedHoldoutCaseV2R>,
  mediaManifestSha256: string,
): void {
  const publicCase = record(entry.publicCase);
  const durationFrames = positiveInteger(record(publicCase.project).durationFrames);
  for (const media of records(publicCase.media)) {
    if (media.durationFrames !== durationFrames
      || text(record(record(media.sourceTimebase).rate).numerator) !== '30'
      || text(record(record(media.sourceTimebase).rate).denominator) !== '1'
      || text(record(media.sourceTimebase).coordinateDomain) !== 'SOURCE_FRAME'
      || text(record(media.durationBinding).mediaManifestSha256) !== mediaManifestSha256
      || record(media.durationBinding).recipeSha256 !== media.recipeSha256) {
      fail(`HOLDOUT_V3_MEDIA_DURATION_DRIFT:${entry.caseId}`);
    }
  }
}

function assertBaseIdentityV3R(base: Readonly<SealedHoldoutCohortManifestV2R>): void {
  if (base.version !== SEALED_HOLDOUT_BASE_VERSION_V3R
    || base.manifestSha256 !== SEALED_HOLDOUT_BASE_MANIFEST_SHA256_V3R
    || base.contractSource.sha256 !== SEALED_HOLDOUT_BASE_CONTRACT_SHA256_V3R) {
    fail('HOLDOUT_V3_BASE_COHORT_IDENTITY_DRIFT');
  }
}

function assertH01EvidenceV3R(cases: readonly Readonly<SealedHoldoutCaseV2R>[]): void {
  const h01 = cases.find(({ caseId }) => caseId === 'HOLD-01:C1');
  const visual = records(record(h01?.ownerOnly).evidence)
    .find((entry) => entry.kind === 'VISUAL_WINDOWS');
  const incoming = record(record(visual?.value).incoming);
  const measurement = record(record(visual?.value).matchMeasurement);
  if (hashCanonicalJsonV1(incoming.validStartFrameWindow) !== hashCanonicalJsonV1([30, 37])
    || hashCanonicalJsonV1(measurement.measuredEligibleStartFrames)
      !== hashCanonicalJsonV1([30, 31, 32, 33, 34, 35, 36])) {
    fail('HOLDOUT_V3_H01_EVIDENCE_DRIFT');
  }
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail('HOLDOUT_V3_DURATION_INVALID');
  return Number(value);
}
function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(code); }
