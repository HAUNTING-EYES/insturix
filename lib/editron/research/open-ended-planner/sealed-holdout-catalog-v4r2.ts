import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  sealedHoldoutOperatorCatalogIdentityV3R,
} from './sealed-holdout-catalog-v3r';
import type { SealedHoldoutOwnerSemanticPolicyV2R }
  from './sealed-holdout-owner-session-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R2 =
  'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2_1' as const;
export const SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_VERSION_V4R2 =
  'EDITRON_OE_SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R2_1' as const;
export const SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_VERSION_V4R2 =
  'EDITRON_OE_SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2_1' as const;

export const SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2 = deepFreezeV1({
  version: SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_VERSION_V4R2,
  authority: 'PUBLIC_PRE_EXECUTION_EVIDENCE_POLICY_NO_HIDDEN_CREATIVE_LOWERING' as const,
  rules: [
    {
      operationClass: 'TRANSCRIPT_RANGE_MUTATION',
      requirement:
        'An exact, unambiguous transcript occurrence and adjacent pause must resolve before a transcript-derived cut; candidate ranges are not executable evidence.',
    },
    {
      operationClass: 'REFERENCE_GENERATED_COMPOSITION',
      requirement:
        'Reference layout, protected-subject geometry and return-timeline evidence must all resolve before generated composition execution.',
    },
    {
      operationClass: 'SUBJECT_AWARE_REFRAME',
      requirement:
        'A valid spatial subject track and authored-layout evidence must both resolve before project reframe execution.',
    },
  ],
  missingOrAmbiguousDisposition: 'UNVERIFIABLE' as const,
  fallbackEditAllowed: false as const,
});

const v3 = structuredClone(SEALED_HOLDOUT_OPERATOR_CATALOG_V3R) as JsonRecord;
delete v3.catalogSha256;
const catalogMaterial: JsonRecord = {
  ...v3,
  version: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R2,
  catalogRevision: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R2,
  derivedFrom: {
    ...sealedHoldoutOperatorCatalogIdentityV3R(),
    correctionScope: [
      'pre-execution exact evidence eligibility',
      'ambiguous transcript range rejection',
      'generated-composition protected-subject evidence requirement',
      'subject-reframe spatial-track evidence requirement',
    ],
  },
  operationEvidencePolicy: SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2,
};

export const SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2: Readonly<JsonRecord> =
  deepFreezeV1({
    ...catalogMaterial,
    catalogSha256: hashCanonicalJsonV1(catalogMaterial),
  });

export function sealedHoldoutOperatorCatalogIdentityV4R2(): Readonly<JsonRecord> {
  return deepFreezeV1({
    version: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R2,
    catalogRevision: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R2,
    catalogSha256: text(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2.catalogSha256),
    derivedFromCatalogSha256:
      text(sealedHoldoutOperatorCatalogIdentityV3R().catalogSha256),
    operationEvidencePolicySha256:
      hashCanonicalJsonV1(SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2),
  });
}

export const SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R2:
Readonly<SealedHoldoutOwnerSemanticPolicyV2R> = deepFreezeV1({
  version: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_VERSION_V4R2,
  operatorCatalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2,
  assertOperationEvidence: assertSealedHoldoutOperationEvidenceV4R2,
  resolveTranscriptEdit: resolveSealedHoldoutTranscriptEditV4R2,
});

export function assertSealedHoldoutOperationEvidenceV4R2(input: Readonly<{
  caseId: string;
  operatorId: string;
  operatorKind: string;
  arguments: Readonly<JsonRecord>;
  observations: readonly Readonly<JsonRecord>[];
  evidenceRefs: readonly string[];
}>): void {
  const taskId = input.caseId.split(':', 1)[0];
  if (taskId === 'HOLD-03'
    && input.operatorId === 'generated_composition_program'
    && input.operatorKind === 'GENERATED_COMPOSITION') {
    assertEvidenceReferenceBinding(input.observations, input.evidenceRefs);
    const layout = requireObservation(input.observations, 'REFERENCE_LAYOUT');
    const faceTracks = requireObservation(input.observations, 'FACE_TRACKS');
    const timeline = requireObservation(input.observations, 'TIMELINE');
    if (positiveInteger(record(layout.value).asymmetricWindows) < 4
      || record(layout.value).gutters !== true
      || record(layout.value).centerTitle !== true
      || record(faceTracks.value).tracksAvailable !== true
      || !normalizedBounds(record(faceTracks.value).protectedRegion)
      || !framePair(record(timeline.value).replaceRange)
      || !text(record(timeline.value).returnOverlayId)) {
      fail('GENERATED_COMPOSITION_EVIDENCE_AMBIGUOUS');
    }
    return;
  }
  if (taskId === 'HOLD-04' && input.operatorId === 'cut_section') {
    assertEvidenceReferenceBinding(input.observations, input.evidenceRefs);
    const expected = resolveExactHoldoutTranscriptCutRangeV4R2(input.observations);
    if (!sameRange(record(input.arguments.targetRange), expected)) {
      fail('TRANSCRIPT_CUT_RANGE_NOT_OWNER_RESOLVED');
    }
    return;
  }
  if (taskId === 'HOLD-05' && input.operatorId === 'reframe_project') {
    assertEvidenceReferenceBinding(input.observations, input.evidenceRefs);
    const spatial = requireObservation(input.observations, 'SPATIAL_TRACK');
    const layout = requireObservation(input.observations, 'AUTHORED_LAYOUT');
    const frames = integerArray(record(spatial.value).trackFrames);
    const centers = numberArray(record(spatial.value).centersX);
    if (frames.length < 2 || frames.length !== centers.length
      || centers.some((value) => value < 0 || value > 1)
      || !text(record(layout.value).logoOverlayId)
      || !text(record(layout.value).safeRelation)) {
      fail('REFRAME_SPATIAL_EVIDENCE_AMBIGUOUS');
    }
  }
}

export function resolveSealedHoldoutTranscriptEditV4R2(input: Readonly<{
  caseId: string;
  arguments: Readonly<JsonRecord>;
  observations: readonly Readonly<JsonRecord>[];
  evidenceRefs: readonly string[];
  project: Readonly<JsonRecord>;
  currentProjectRevision: string;
}>): Readonly<JsonRecord> | null {
  if (!input.caseId.startsWith('HOLD-04:')) return null;
  const targetRange = resolveExactHoldoutTranscriptCutRangeV4R2(input.observations);
  return deepFreezeV1({
    targetOperatorId: 'cut_section',
    arguments: {
      projectId: input.arguments.projectId,
      expectedProjectRevision: input.currentProjectRevision,
      targetRange,
      evidenceIds: input.evidenceRefs,
    },
  });
}

export function resolveExactHoldoutTranscriptCutRangeV4R2(
  observations: readonly Readonly<JsonRecord>[],
): Readonly<{ startFrame: number; endFrame: number }> {
  const transcript = requireObservation(observations, 'TRANSCRIPT');
  const value = record(transcript.value);
  const first = framePair(value.firstOccurrence);
  const pause = framePair(value.pause);
  const second = framePair(value.secondOccurrence);
  if (!first || !pause || !second
    || first[1] !== pause[0]
    || pause[1] !== second[0]) {
    fail('TRANSCRIPT_EVIDENCE_AMBIGUOUS');
  }
  return deepFreezeV1({ startFrame: first[0], endFrame: pause[1] });
}

function assertEvidenceReferenceBinding(
  observations: readonly Readonly<JsonRecord>[],
  evidenceRefs: readonly string[],
): void {
  if (!evidenceRefs.length || new Set(evidenceRefs).size !== evidenceRefs.length
    || observations.length !== evidenceRefs.length
    || observations.some(({ evidenceRef }) => !evidenceRefs.includes(text(evidenceRef)))) {
    fail('REFERENCE_BINDING_INVALID');
  }
}

function requireObservation(
  observations: readonly Readonly<JsonRecord>[],
  kind: string,
): Readonly<JsonRecord> {
  const matches = observations.filter((entry) => entry.kind === kind);
  if (matches.length !== 1) fail(`REQUIRED_KIND_MISSING_OR_DUPLICATED:${kind}`);
  return matches[0];
}

function framePair(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2
    || !value.every(Number.isSafeInteger)
    || Number(value[0]) < 0 || Number(value[1]) <= Number(value[0])) return null;
  return [Number(value[0]), Number(value[1])];
}

function normalizedBounds(value: unknown): boolean {
  return Array.isArray(value) && value.length === 4
    && value.every((entry) => typeof entry === 'number' && entry >= 0 && entry <= 1)
    && Number(value[2]) > 0 && Number(value[3]) > 0
    && Number(value[0]) + Number(value[2]) <= 1
    && Number(value[1]) + Number(value[3]) <= 1;
}

function sameRange(
  candidate: Readonly<JsonRecord>,
  expected: Readonly<{ startFrame: number; endFrame: number }>,
): boolean {
  return candidate.startFrame === expected.startFrame
    && candidate.endFrame === expected.endFrame;
}

function positiveInteger(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : -1;
}

function integerArray(value: unknown): number[] {
  return Array.isArray(value) && value.every(Number.isSafeInteger)
    ? value.map(Number) : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
    ? value.map(Number) : [];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function fail(code: string): never {
  throw new Error(`SEALED_V4R2_EVIDENCE_${code}`);
}
