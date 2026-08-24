import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertReferenceHoldout01ReviewReceiptV2R,
  finalizeReferenceHoldout01ReviewV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-review-receipt-v2r';

type JsonRecord = Record<string, unknown>;
const IDS = [
  'HREF01N-EVAL-VISUAL-SYSTEM', 'HREF01N-EVAL-TYPE-HIERARCHY',
  'HREF01N-EVAL-PROGRESSION', 'HREF01N-EVAL-RECURRING-GRAMMAR',
  'HREF01N-EVAL-HERO-MOMENTS', 'HREF01N-EVAL-CONTENT-LITERALS',
  'HREF01N-EVAL-MOTION', 'HREF01N-EVAL-AUDIO', 'HREF01N-EVAL-COVERAGE-LIMIT',
] as const;

describe('HREF-01 qualified human-review receipt V2R', () => {
  let root: string;
  let fixture: Awaited<ReturnType<typeof buildFixture>>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'editron-href01-receipt-'));
    fixture = await buildFixture(root);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('binds a complete sole-project-owner review without promoting independent agreement', async () => {
    const receipt = await finalizeReferenceHoldout01ReviewV2R(fixture.input());
    expect(receipt).toMatchObject({
      taskId: 'HREF-01-NATIVE',
      reviewerId: 'project-owner-admin',
      independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER',
      formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER',
      proofLevel: 'QUALIFIED_SINGLE_PROJECT_OWNER_REVIEW',
      stateEffects: [],
    });
    expect(Object.keys(receipt.requirements)).toEqual([...IDS]);
    expect(receipt.evidence.denseWindows).toEqual([expect.objectContaining({ windowId: 'win_01' })]);
    expect(() => assertReferenceHoldout01ReviewReceiptV2R(receipt)).not.toThrow();
  });

  it.each([
    ['missing full playback', (form: JsonRecord) => { form.completeReferencePlaybackConfirmed = false; }, 'FORM_IDENTITY_INVALID'],
    ['missing dense playback', (form: JsonRecord) => { (form.denseWindowPlaybackConfirmed as JsonRecord).win_01 = false; }, 'DENSE_PLAYBACK_INCOMPLETE'],
    ['missing requirement', (form: JsonRecord) => { delete (form.requirements as JsonRecord)[IDS[0]]; }, 'REQUIREMENTS_INVALID'],
    ['unexplained partial', (form: JsonRecord) => { (form.requirements as JsonRecord)[IDS[0]] = { decision: 'PARTIAL', correction: '', evidenceNotes: '' }; }, `REQUIREMENT_EXPLANATION_REQUIRED:${IDS[0]}`],
    ['invalid hard failure', (form: JsonRecord) => { form.hardFailuresObserved = ['MADE_UP']; }, 'HARD_FAILURES_INVALID'],
    ['duplicate hard failure', (form: JsonRecord) => { form.hardFailuresObserved = ['OMITS_TIMESTAMP_OR_MODALITY_BINDINGS', 'OMITS_TIMESTAMP_OR_MODALITY_BINDINGS']; }, 'HARD_FAILURES_INVALID'],
    ['inflated overall pass', (form: JsonRecord) => { (form.requirements as JsonRecord)[IDS[0]] = { decision: 'PARTIAL', correction: 'Fix it.', evidenceNotes: '' }; }, 'OVERALL_PASS_INCONSISTENT'],
    ['invalid correction minutes', (form: JsonRecord) => { form.correctionMinutesEstimate = -1; }, 'CORRECTION_MINUTES_INVALID'],
    ['invalid timestamp', (form: JsonRecord) => { form.completedAt = 'yesterday'; }, 'COMPLETED_AT_INVALID'],
  ])('rejects %s', async (_name, mutate, code) => {
    const form = structuredClone(fixture.form) as JsonRecord; mutate(form);
    await expect(finalizeReferenceHoldout01ReviewV2R(fixture.input(form)))
      .rejects.toThrow(`HREF01_REVIEW_RECEIPT_${code}`);
  });

  it('rejects forged pack, template, media and qualification bindings', async () => {
    const forgedManifest = { ...fixture.manifest, publicPackHash: '0'.repeat(64) };
    await expect(finalizeReferenceHoldout01ReviewV2R(fixture.input(undefined, forgedManifest)))
      .rejects.toThrow('HREF01_REVIEW_RECEIPT_MANIFEST_INVALID');
    const forgedTemplate = { ...fixture.template, templateHash: '0'.repeat(64) };
    await expect(finalizeReferenceHoldout01ReviewV2R(fixture.input(undefined, undefined, forgedTemplate)))
      .rejects.toThrow('HREF01_REVIEW_RECEIPT_TEMPLATE_INVALID');
    await writeFile(path.join(root, 'dense', 'win_01.mp4'), 'changed');
    await expect(finalizeReferenceHoldout01ReviewV2R(fixture.input()))
      .rejects.toThrow('HREF01_REVIEW_RECEIPT_DENSE_VIDEO_HASH_MISMATCH');
    await expect(finalizeReferenceHoldout01ReviewV2R({
      ...fixture.input(), qualification: { ...fixture.qualification, reviewerId: '../operator' },
    })).rejects.toThrow('HREF01_REVIEW_RECEIPT_QUALIFICATION_INVALID');
  });

  it('rejects a self-rehashed receipt that inflates the promotion boundary', async () => {
    const receipt = structuredClone(await finalizeReferenceHoldout01ReviewV2R(fixture.input())) as unknown as JsonRecord;
    receipt.formalPromotionStatus = 'PROMOTED';
    delete receipt.receiptSha256;
    receipt.receiptSha256 = hashCanonicalJsonV1(receipt);
    expect(() => assertReferenceHoldout01ReviewReceiptV2R(receipt))
      .toThrow('HREF01_REVIEW_RECEIPT_RECEIPT_INVALID');
  });
});

async function buildFixture(root: string) {
  await mkdir(path.join(root, 'dense'));
  const reference = Buffer.from('reference-video');
  const denseVideo = Buffer.from('dense-video');
  const denseAudio = Buffer.from('dense-audio');
  await Promise.all([
    writeFile(path.join(root, 'reference.mp4'), reference),
    writeFile(path.join(root, 'dense', 'win_01.mp4'), denseVideo),
    writeFile(path.join(root, 'dense', 'win_01.wav'), denseAudio),
  ]);
  const rubric = {
    inheritedHumanApprovedVisualRequirements: IDS.slice(0, 6).map(requirement),
    nativeMotionAudioReviewRequirements: IDS.slice(6).map(requirement),
    hardFailures: ['OMITS_TIMESTAMP_OR_MODALITY_BINDINGS'],
    requiredDecision: ['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIABLE'],
  };
  const manifestUnsigned = {
    version: 'EDITRON_REFERENCE_HOLDOUT_01_REVIEW_PACK_V2R_1',
    artifactType: 'ReferenceHoldout01ReviewerManifestV2R', taskId: 'HREF-01-NATIVE',
    createdAt: '2026-08-22T00:40:00.000Z', reviewStatus: 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW',
    formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER',
    identityDisposition: 'MODEL_IDENTITY_WITHHELD_FROM_REVIEWER',
    reference: { fileName: 'reference.mp4', sha256: sha(reference) }, observation: {},
    denseWindows: [{ windowId: 'win_01', range: {}, videoFile: 'dense/win_01.mp4',
      videoSha256: sha(denseVideo), audioFile: 'dense/win_01.wav', audioSha256: sha(denseAudio), expectedFrameCount: 180 }],
    rubric, reviewInstruction: 'Review everything.', stateEffects: [],
  };
  const manifest = { ...manifestUnsigned, publicPackHash: hashCanonicalJsonV1(manifestUnsigned) };
  const templateUnsigned = {
    version: 'EDITRON_REFERENCE_HOLDOUT_01_REVIEW_PACK_V2R_1', artifactType: 'ReferenceHoldout01ReviewFormV2R',
    publicPackHash: manifest.publicPackHash, reviewerId: null, completedAt: null,
    completeReferencePlaybackConfirmed: false, denseWindowPlaybackConfirmed: { win_01: false },
    requirements: Object.fromEntries(IDS.map((id) => [id, { decision: null, correction: '', evidenceNotes: '' }])),
    hardFailuresObserved: [], overallDecision: null, correctionMinutesEstimate: null, notes: '', stateEffects: [],
  };
  const template = { ...templateUnsigned, templateHash: hashCanonicalJsonV1(templateUnsigned) };
  const form = {
    ...template, reviewerId: 'project-owner-admin', completedAt: '2026-08-25T00:00:00.000Z',
    completeReferencePlaybackConfirmed: true, denseWindowPlaybackConfirmed: { win_01: true },
    requirements: Object.fromEntries(IDS.map((id) => [id, { decision: 'PASS', correction: '', evidenceNotes: 'Observed.' }])),
    overallDecision: 'PASS', correctionMinutesEstimate: 0, notes: 'Qualified sole-owner review.',
  };
  const qualification = {
    reviewerId: 'project-owner-admin', basis: 'SOLE_PROJECT_OWNER_WITH_EDITRON_PRODUCT_CONTEXT' as const,
    independentOfOtherReviewerDecisions: true as const, modelIdentityExposure: 'MAY_HAVE_BEEN_KNOWN' as const,
  };
  return {
    manifest, template, form, qualification,
    input: (completedForm: unknown = form, reviewerManifest: unknown = manifest, reviewFormTemplate: unknown = template) => ({
      reviewerRoot: root, reviewerManifest, reviewFormTemplate, completedForm, qualification,
    }),
  };
}

function requirement(requirementId: string) { return { requirementId, layer: 'TEST', requirement: requirementId, scoring: 'BLIND_SEMANTIC_EDITOR_JUDGMENT' }; }
function sha(value: Buffer): string { return createHash('sha256').update(value).digest('hex'); }
