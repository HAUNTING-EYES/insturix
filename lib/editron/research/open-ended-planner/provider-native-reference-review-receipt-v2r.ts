import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R }
  from './provider-native-reference-review-pack-v2r';

const SHA256 = /^[a-f0-9]{64}$/;
const REVIEW_DECISIONS = ['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIABLE'] as const;
const HARD_FAILURES = [
  'INVENTS_UNSUPPORTED_AUDIO_MOTION_OR_EASING',
  'TREATS_LITERAL_CONTENT_AS_TRANSFERABLE_STYLE',
  'CHOOSES_EDITING_OPERATORS_OR_EXECUTION_FORM_DURING_OBSERVATION',
  'OMITS_TIMESTAMP_OR_MODALITY_BINDINGS',
  'REPORTS_SOURCE_FRAME_COMPLETENESS_FROM_PROVIDER_NATIVE_SAMPLING',
  'REPORTS_SUCCESS_WHILE_REQUIRED_MATERIAL_IS_UNVERIFIABLE',
] as const;

type JsonRecord = Record<string, unknown>;
export type ReferenceReviewDecisionV2R = typeof REVIEW_DECISIONS[number];
export type ReferenceReviewHardFailureV2R = typeof HARD_FAILURES[number];

export interface ReferenceHoldout01ReviewerQualificationV2R {
  reviewerId: string;
  basis: 'SOLE_PROJECT_OWNER_WITH_EDITRON_PRODUCT_CONTEXT';
  independentOfOtherReviewerDecisions: true;
  modelIdentityExposure: 'NOT_ACCESSED_BEFORE_COMPLETION' | 'MAY_HAVE_BEEN_KNOWN';
}

export interface ReferenceHoldout01ReviewReceiptV2R {
  version: 'EDITRON_REFERENCE_HOLDOUT_01_QUALIFIED_REVIEW_RECEIPT_V2R_1';
  artifactType: 'ReferenceHoldout01QualifiedReviewReceiptV2R';
  taskId: 'HREF-01-NATIVE';
  publicPackHash: string;
  templateHash: string;
  reviewerId: string;
  qualification: ReferenceHoldout01ReviewerQualificationV2R;
  completedAt: string;
  completeReferencePlaybackConfirmed: true;
  denseWindowPlaybackConfirmed: Readonly<Record<string, true>>;
  requirements: Readonly<Record<string, Readonly<{
    decision: ReferenceReviewDecisionV2R;
    correction: string;
    evidenceNotes: string;
  }>>>;
  hardFailuresObserved: readonly ReferenceReviewHardFailureV2R[];
  overallDecision: ReferenceReviewDecisionV2R;
  correctionMinutesEstimate: number;
  notes: string;
  evidence: Readonly<{
    referenceSha256: string;
    denseWindows: readonly Readonly<{
      windowId: string;
      videoSha256: string;
      audioSha256: string;
      expectedFrameCount: number;
    }>[];
  }>;
  independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER';
  formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER';
  proofLevel: 'QUALIFIED_SINGLE_PROJECT_OWNER_REVIEW';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function finalizeReferenceHoldout01ReviewV2R(input: Readonly<{
  reviewerRoot: string;
  reviewerManifest: unknown;
  reviewFormTemplate: unknown;
  completedForm: unknown;
  qualification: Readonly<ReferenceHoldout01ReviewerQualificationV2R>;
}>): Promise<Readonly<ReferenceHoldout01ReviewReceiptV2R>> {
  const root = path.resolve(input.reviewerRoot);
  if (!path.isAbsolute(input.reviewerRoot) || root === path.parse(root).root) fail('REVIEWER_ROOT_INVALID');
  const manifest = record(input.reviewerManifest, 'MANIFEST_MISSING');
  const template = record(input.reviewFormTemplate, 'TEMPLATE_MISSING');
  const form = record(input.completedForm, 'FORM_MISSING');
  assertManifest(manifest);
  assertTemplate(template, manifest);
  assertQualification(input.qualification);
  const requirements = validateCompletedForm(form, template, manifest, input.qualification);
  const evidence = await validateMedia(root, manifest);
  const hardFailuresObserved = strings(form.hardFailuresObserved, 'HARD_FAILURES_INVALID');
  assertUniqueAllowed(hardFailuresObserved, HARD_FAILURES, 'HARD_FAILURES_INVALID');
  const overallDecision = decision(form.overallDecision, 'OVERALL_DECISION_INVALID');
  if (overallDecision === 'PASS' && (hardFailuresObserved.length
    || Object.values(requirements).some(({ decision: value }) => value !== 'PASS'))) {
    fail('OVERALL_PASS_INCONSISTENT');
  }
  const correctionMinutesEstimate = finiteNumber(form.correctionMinutesEstimate, 'CORRECTION_MINUTES_INVALID');
  if (correctionMinutesEstimate < 0 || correctionMinutesEstimate > 10_000) fail('CORRECTION_MINUTES_INVALID');
  const completedAt = iso(form.completedAt, 'COMPLETED_AT_INVALID');
  const notes = boundedText(form.notes, 8_000, 'NOTES_INVALID');
  const qualification = { ...input.qualification };
  const unsigned = {
    version: 'EDITRON_REFERENCE_HOLDOUT_01_QUALIFIED_REVIEW_RECEIPT_V2R_1' as const,
    artifactType: 'ReferenceHoldout01QualifiedReviewReceiptV2R' as const,
    taskId: 'HREF-01-NATIVE' as const,
    publicPackHash: String(manifest.publicPackHash),
    templateHash: String(template.templateHash),
    reviewerId: input.qualification.reviewerId,
    qualification,
    completedAt,
    completeReferencePlaybackConfirmed: true as const,
    denseWindowPlaybackConfirmed: Object.fromEntries(evidence.denseWindows.map(({ windowId }) => [windowId, true])) as Record<string, true>,
    requirements,
    hardFailuresObserved,
    overallDecision,
    correctionMinutesEstimate,
    notes,
    evidence,
    independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER' as const,
    formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER' as const,
    proofLevel: 'QUALIFIED_SINGLE_PROJECT_OWNER_REVIEW' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...unsigned, receiptSha256: hashCanonicalJsonV1(unsigned) });
}

export function assertReferenceHoldout01ReviewReceiptV2R(
  value: unknown,
): asserts value is Readonly<ReferenceHoldout01ReviewReceiptV2R> {
  const candidate = record(value, 'RECEIPT_MISSING');
  const receiptSha256 = String(candidate.receiptSha256 ?? '');
  const unsigned = structuredClone(candidate);
  delete unsigned.receiptSha256;
  if (!SHA256.test(receiptSha256) || receiptSha256 !== hashCanonicalJsonV1(unsigned)
    || candidate.version !== 'EDITRON_REFERENCE_HOLDOUT_01_QUALIFIED_REVIEW_RECEIPT_V2R_1'
    || candidate.artifactType !== 'ReferenceHoldout01QualifiedReviewReceiptV2R'
    || candidate.taskId !== 'HREF-01-NATIVE'
    || candidate.independentAgreement !== 'UNVERIFIABLE_SINGLE_REVIEWER'
    || candidate.formalPromotionStatus !== 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER'
    || candidate.proofLevel !== 'QUALIFIED_SINGLE_PROJECT_OWNER_REVIEW'
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length) fail('RECEIPT_INVALID');
}

function assertManifest(manifest: JsonRecord): void {
  const publicPackHash = String(manifest.publicPackHash ?? '');
  const unsigned = structuredClone(manifest); delete unsigned.publicPackHash;
  if (manifest.version !== REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R
    || manifest.artifactType !== 'ReferenceHoldout01ReviewerManifestV2R'
    || manifest.taskId !== 'HREF-01-NATIVE' || manifest.reviewStatus !== 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW'
    || manifest.formalPromotionStatus !== 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER'
    || !SHA256.test(publicPackHash) || hashCanonicalJsonV1(unsigned) !== publicPackHash
    || !Array.isArray(manifest.stateEffects) || manifest.stateEffects.length) fail('MANIFEST_INVALID');
}

function assertTemplate(template: JsonRecord, manifest: JsonRecord): void {
  const templateHash = String(template.templateHash ?? '');
  const unsigned = structuredClone(template); delete unsigned.templateHash;
  if (template.version !== REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R
    || template.artifactType !== 'ReferenceHoldout01ReviewFormV2R'
    || template.publicPackHash !== manifest.publicPackHash || !SHA256.test(templateHash)
    || hashCanonicalJsonV1(unsigned) !== templateHash || template.reviewerId !== null
    || template.completedAt !== null || template.completeReferencePlaybackConfirmed !== false
    || template.overallDecision !== null || template.correctionMinutesEstimate !== null
    || !Array.isArray(template.stateEffects) || template.stateEffects.length) fail('TEMPLATE_INVALID');
}

function validateCompletedForm(
  form: JsonRecord, template: JsonRecord, manifest: JsonRecord,
  qualification: Readonly<ReferenceHoldout01ReviewerQualificationV2R>,
): ReferenceHoldout01ReviewReceiptV2R['requirements'] {
  if (form.version !== template.version || form.artifactType !== template.artifactType
    || form.publicPackHash !== manifest.publicPackHash || form.templateHash !== template.templateHash
    || form.reviewerId !== qualification.reviewerId || form.completeReferencePlaybackConfirmed !== true
    || !Array.isArray(form.stateEffects) || form.stateEffects.length) fail('FORM_IDENTITY_INVALID');
  const dense = record(form.denseWindowPlaybackConfirmed, 'DENSE_PLAYBACK_INVALID');
  const windows = array(manifest.denseWindows, 'DENSE_WINDOWS_INVALID').map((value) => record(value, 'DENSE_WINDOW_INVALID'));
  assertExactKeys(dense, windows.map(({ windowId }) => String(windowId)), 'DENSE_PLAYBACK_INVALID');
  if (Object.values(dense).some((value) => value !== true)) fail('DENSE_PLAYBACK_INCOMPLETE');
  const rubric = record(manifest.rubric, 'RUBRIC_INVALID');
  const entries = [
    ...array(rubric.inheritedHumanApprovedVisualRequirements, 'RUBRIC_INVALID'),
    ...array(rubric.nativeMotionAudioReviewRequirements, 'RUBRIC_INVALID'),
  ].map((value) => record(value, 'RUBRIC_INVALID'));
  const ids = entries.map(({ requirementId }) => String(requirementId));
  const supplied = record(form.requirements, 'REQUIREMENTS_INVALID');
  assertExactKeys(supplied, ids, 'REQUIREMENTS_INVALID');
  return Object.fromEntries(ids.map((id) => {
    const item = record(supplied[id], `REQUIREMENT_INVALID:${id}`);
    const result = {
      decision: decision(item.decision, `REQUIREMENT_DECISION_INVALID:${id}`),
      correction: boundedText(item.correction, 4_000, `REQUIREMENT_CORRECTION_INVALID:${id}`),
      evidenceNotes: boundedText(item.evidenceNotes, 4_000, `REQUIREMENT_EVIDENCE_INVALID:${id}`),
    };
    if (result.decision !== 'PASS' && !result.correction.trim() && !result.evidenceNotes.trim()) {
      fail(`REQUIREMENT_EXPLANATION_REQUIRED:${id}`);
    }
    return [id, result];
  }));
}

async function validateMedia(root: string, manifest: JsonRecord) {
  const reference = record(manifest.reference, 'REFERENCE_INVALID');
  const referenceSha256 = String(reference.sha256 ?? '');
  await assertFileHash(root, String(reference.fileName ?? ''), referenceSha256, 'REFERENCE');
  const denseWindows = [];
  for (const raw of array(manifest.denseWindows, 'DENSE_WINDOWS_INVALID')) {
    const window = record(raw, 'DENSE_WINDOW_INVALID');
    const videoSha256 = String(window.videoSha256 ?? ''); const audioSha256 = String(window.audioSha256 ?? '');
    await assertFileHash(root, String(window.videoFile ?? ''), videoSha256, 'DENSE_VIDEO');
    await assertFileHash(root, String(window.audioFile ?? ''), audioSha256, 'DENSE_AUDIO');
    const expectedFrameCount = finiteNumber(window.expectedFrameCount, 'DENSE_FRAME_COUNT_INVALID');
    if (!Number.isInteger(expectedFrameCount) || expectedFrameCount < 1) fail('DENSE_FRAME_COUNT_INVALID');
    denseWindows.push({ windowId: String(window.windowId), videoSha256, audioSha256, expectedFrameCount });
  }
  if (!denseWindows.length) fail('DENSE_WINDOWS_INVALID');
  return { referenceSha256, denseWindows };
}

async function assertFileHash(root: string, relative: string, expected: string, label: string): Promise<void> {
  if (!SHA256.test(expected) || !relative || path.isAbsolute(relative)) fail(`${label}_INVALID`);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail(`${label}_PATH_INVALID`);
  const stat = await lstat(resolved); if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label}_INVALID`);
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(resolved); stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject); stream.on('end', resolve);
  });
  if (hash.digest('hex') !== expected) fail(`${label}_HASH_MISMATCH`);
}

function assertQualification(value: Readonly<ReferenceHoldout01ReviewerQualificationV2R>): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(value.reviewerId)
    || value.basis !== 'SOLE_PROJECT_OWNER_WITH_EDITRON_PRODUCT_CONTEXT'
    || value.independentOfOtherReviewerDecisions !== true
    || !['NOT_ACCESSED_BEFORE_COMPLETION', 'MAY_HAVE_BEEN_KNOWN'].includes(value.modelIdentityExposure)) fail('QUALIFICATION_INVALID');
}
function record(value: unknown, code: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as JsonRecord; }
function array(value: unknown, code: string): unknown[] { if (!Array.isArray(value)) fail(code); return value; }
function strings(value: unknown, code: string): string[] { const values = array(value, code); if (values.some((item) => typeof item !== 'string')) fail(code); return values as string[]; }
function assertExactKeys(value: JsonRecord, expected: string[], code: string): void { if ([...Object.keys(value)].sort().join('|') !== [...expected].sort().join('|')) fail(code); }
function assertUniqueAllowed<T extends string>(values: string[], allowed: readonly T[], code: string): asserts values is T[] { if (new Set(values).size !== values.length || values.some((value) => !allowed.includes(value as T))) fail(code); }
function decision(value: unknown, code: string): ReferenceReviewDecisionV2R { if (!REVIEW_DECISIONS.includes(value as ReferenceReviewDecisionV2R)) fail(code); return value as ReferenceReviewDecisionV2R; }
function finiteNumber(value: unknown, code: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) fail(code); return value; }
function boundedText(value: unknown, max: number, code: string): string { if (typeof value !== 'string' || value.length > max) fail(code); return value; }
function iso(value: unknown, code: string): string { if (typeof value !== 'string') fail(code); try { if (new Date(value).toISOString() !== value) fail(code); } catch { fail(code); } return value; }
function fail(code: string): never { throw new Error(`HREF01_REVIEW_RECEIPT_${code}`); }
