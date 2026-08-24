import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { resolveExactHoldoutTranscriptCutRangeV4R2 }
  from './sealed-holdout-catalog-v4r2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCaseV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { assertSealedHoldoutH04FinalStateEquivalenceV4R }
  from './sealed-holdout-h04-native-proof-v3r2';

type JsonRecord = Record<string, unknown>;
export type SealedHoldoutFrameRangeV4R3 =
  Readonly<{ startFrame: number; endFrame: number }>;

export interface SealedHoldoutH04CutPlanAuthorizationV4R3 {
  version: 'EDITRON_OE_SEALED_HOLDOUT_H04_CUT_PLAN_AUTHORIZATION_V4R3_1';
  authority: 'DERIVED_PRE_EXECUTION_SOURCE_EFFECT_AUTHORIZATION_NO_PROJECT_AUTHORITY';
  manifestSha256: string;
  caseId: 'HOLD-04:C1' | 'HOLD-04:C2';
  projectId: string;
  initialProjectRevision: string;
  evidenceRefs: readonly string[];
  currentTimelineCuts: readonly SealedHoldoutFrameRangeV4R3[];
  expectedRemovedSourceRange: SealedHoldoutFrameRangeV4R3;
  resultingSourceState: Readonly<JsonRecord>;
  stateEffects: readonly [];
  authorizationRef: string;
}

export function authorizeSealedHoldoutH04CutPlanV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-04:C1' | 'HOLD-04:C2';
  evidenceRefs: readonly string[];
  currentTimelineCuts: readonly SealedHoldoutFrameRangeV4R3[];
}>): Readonly<SealedHoldoutH04CutPlanAuthorizationV4R3> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const taskCase = requiredCase(manifest, input.caseId);
  const evidenceRefs = sortedUnique(input.evidenceRefs);
  const observations = selectedEvidence(taskCase, evidenceRefs);
  assertEvidenceBinding(observations, evidenceRefs);
  const expectedRemovedSourceRange = resolveExactHoldoutTranscriptCutRangeV4R2(observations);
  const currentTimelineCuts = input.currentTimelineCuts.map(frameRange);
  const revisions = currentTimelineCuts.map((range, index) =>
    `H04-PLAN-${index + 1}-${hashCanonicalJsonV1(range)}`);
  const resultingSourceState = assertSealedHoldoutH04FinalStateEquivalenceV4R({
    currentTimelineCuts,
    writerIssuedProjectRevisions: revisions,
    finalReadExpectedProjectRevision: revisions.at(-1) ?? '',
    contract: {
      projectDurationInFrames: positiveInteger(
        record(record(taskCase.publicCase).project).durationFrames,
        'H04_PROJECT_DURATION_INVALID',
      ),
      expectedRemovedRange: expectedRemovedSourceRange,
    },
  });
  const project = record(record(taskCase.publicCase).project);
  const material = {
    version: 'EDITRON_OE_SEALED_HOLDOUT_H04_CUT_PLAN_AUTHORIZATION_V4R3_1' as const,
    authority:
      'DERIVED_PRE_EXECUTION_SOURCE_EFFECT_AUTHORIZATION_NO_PROJECT_AUTHORITY' as const,
    manifestSha256: manifest.manifestSha256,
    caseId: input.caseId,
    projectId: requiredText(project.projectId, 'H04_PROJECT_ID_MISSING'),
    initialProjectRevision: requiredText(
      project.expectedProjectRevision, 'H04_PROJECT_REVISION_MISSING',
    ),
    evidenceRefs,
    currentTimelineCuts,
    expectedRemovedSourceRange,
    resultingSourceState,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    authorizationRef: `OE-H04-PLAN-${hashCanonicalJsonV1(material)}`,
  });
}

function requiredCase(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>, caseId: string,
): Readonly<SealedHoldoutCaseV2R> {
  return manifest.cases.find((entry) => entry.caseId === caseId)
    ?? fail(`CASE_MISSING:${caseId}`);
}
function selectedEvidence(
  taskCase: Readonly<SealedHoldoutCaseV2R>, evidenceRefs: readonly string[],
): JsonRecord[] {
  return records(record(taskCase.ownerOnly).evidence)
    .filter(({ evidenceRef }) => evidenceRefs.includes(text(evidenceRef)));
}
function assertEvidenceBinding(observations: readonly JsonRecord[], refs: readonly string[]): void {
  if (!refs.length || new Set(refs).size !== refs.length || observations.length !== refs.length
    || observations.some(({ evidenceRef }) => !refs.includes(text(evidenceRef)))) {
    fail('REFERENCE_BINDING_INVALID');
  }
}
function frameRange(value: unknown): SealedHoldoutFrameRangeV4R3 {
  const range = record(value);
  const startFrame = nonNegativeInteger(range.startFrame, 'RANGE_START_INVALID');
  const endFrame = positiveInteger(range.endFrame, 'RANGE_END_INVALID');
  if (endFrame <= startFrame) fail('RANGE_ORDER_INVALID');
  return { startFrame, endFrame };
}
function sortedUnique(valuesInput: readonly string[]): string[] {
  const result = [...new Set(valuesInput)].sort(compare);
  if (!result.length || result.length !== valuesInput.length) fail('EVIDENCE_REFS_INVALID');
  return result;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function requiredText(value: unknown, code: string): string {
  const result = text(value); if (!result) fail(code); return result;
}
function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(code); return Number(value);
}
function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(code); return Number(value);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fail(code: string): never {
  throw new Error(`SEALED_V4R3_H04_PLAN_${code}`);
}
