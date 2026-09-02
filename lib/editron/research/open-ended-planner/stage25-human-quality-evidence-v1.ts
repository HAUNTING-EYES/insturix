import {
  assertBlindQualityReviewContractV1,
  type BlindQualityArtifactBindingV1,
  type BlindQualityReviewContractV1,
} from './blind-quality-review-receipt-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_HUMAN_QUALITY_EVIDENCE_VERSION_V1 =
  'EDITRON_OE_STAGE25_HUMAN_QUALITY_EVIDENCE_V1' as const;

export const STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1 = [
  'tests/editron/blind-quality-review-receipt-v1.test.ts',
  'tests/editron/stage25-human-quality-evidence-v1.test.ts',
] as const;

export const STAGE25_HUMAN_QUALITY_TASK_IDS_V1 = [
  'RHC-01', 'RHC-02', 'RHC-03', 'RHC-04',
] as const;
export type Stage25HumanQualityTaskIdV1 = typeof STAGE25_HUMAN_QUALITY_TASK_IDS_V1[number];

type Playback = BlindQualityArtifactBindingV1['requiredPlaybackConfirmation'];
type AcceptedTask = Readonly<{
  technicalReceiptSha256: string;
  technicalAssessment: string;
  publicPackSha256: string | null;
  rubricDimensionIds: readonly string[];
  mediaBindings: readonly Readonly<{ artifactId: string; sha256: string; durationMilliseconds: number | null; requiredPlaybackConfirmation: Playback }>[];
  resultBindings: readonly Readonly<{ artifactId: string; sha256: string; durationMilliseconds: number; requiredPlaybackConfirmation: Playback }>[];
  correctionDisposition: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION' | 'NOT_PERFORMED_REQUIRED_MEASURED_HANDS_ON_SESSION';
  latencyDisposition: 'UNVERIFIABLE_NOT_RECORDED' | 'MEASURED_TECHNICAL_RENDER_ONLY';
  renderWallTimesMs: readonly number[];
  costDisposition: 'UNVERIFIABLE_LOCAL_COMPUTE_NOT_METERED' | 'UNVERIFIABLE_PROVIDER_BILLING_NOT_EXPOSED';
}>;

export const STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1: Readonly<Record<Stage25HumanQualityTaskIdV1, AcceptedTask>> = {
  'RHC-01': {
    technicalReceiptSha256: '312a112ffda3cdd63fb815bf9876d562ae82f8ede99a6753b2dd61c713e5cadb',
    technicalAssessment: 'THREE_RENDERED_RESEARCH_PREVIEWS_CAPTURED_UNJUDGED',
    publicPackSha256: 'cc3b15b7fed713f1decfe7c90d0702671ebbf5d150c32e3ba5cb8ca7d97b3852',
    rubricDimensionIds: ['ordered-label-reveal', 'simultaneous-three-source-hold', 'board-to-full-screen-continuity', 'motion-and-layout-quality', 'title-legibility', 'overall-target-fidelity'],
    mediaBindings: [
      binding('candidate-A-contact-sheet', '390d5a54e76a93de6c63fd0c5fa18905e3af4eced02b5086c21ecb81cbd8e4eb', null, 'COMPLETE_STATIC_OR_STRUCTURED_INSPECTION'),
      binding('candidate-B-contact-sheet', '5b1217d0ac27350b621cb30bdfc5d8d6ff49dd949635796f527507f8e0480891', null, 'COMPLETE_STATIC_OR_STRUCTURED_INSPECTION'),
      binding('candidate-C-contact-sheet', '1f9fbfa1d465af317ea362451bc6ea32bcdf963ccbd214e5b38d5905146367b2', null, 'COMPLETE_STATIC_OR_STRUCTURED_INSPECTION'),
    ],
    resultBindings: [
      binding('candidate-A-video', 'fabf0a9a6fce74e1e28c78d946340c2e49fc1fdd44c808b1b391fbef1fcb7532', 7_000, 'FULL_NORMAL_SPEED_VISUAL'),
      binding('candidate-B-video', 'e74dd467d6b8badad798cd2a820f6296ee5c7f625fcd394cc9062dc42d407364', 7_000, 'FULL_NORMAL_SPEED_VISUAL'),
      binding('candidate-C-video', '1804d044b367f3858db816bc27019a728c6a622b97a9ab1348b07aa2b9414c0a', 7_000, 'FULL_NORMAL_SPEED_VISUAL'),
    ],
    correctionDisposition: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION',
    latencyDisposition: 'UNVERIFIABLE_NOT_RECORDED', renderWallTimesMs: [],
    costDisposition: 'UNVERIFIABLE_LOCAL_COMPUTE_NOT_METERED',
  },
  'RHC-02': {
    technicalReceiptSha256: 'e0cb167f3faaf2fed05a174cd4884079e05db72b6ce011c75b929370dafa2a98',
    technicalAssessment: 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED',
    publicPackSha256: null,
    rubricDimensionIds: ['RHC02-T1', 'RHC02-T2', 'RHC02-T3', 'RHC02-P1', 'RHC02-P2', 'RHC02-P3', 'RHC02-Q1-EDITORIAL-FINISH'],
    mediaBindings: [],
    resultBindings: [binding('candidate-A-video', '9e126b0dcc00339ed02f4850b99100389a1a6d26d8efa9a949e7c467359d61d3', 15_000, 'FULL_NORMAL_SPEED_AUDIOVISUAL')],
    correctionDisposition: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION',
    latencyDisposition: 'MEASURED_TECHNICAL_RENDER_ONLY', renderWallTimesMs: [24_000],
    costDisposition: 'UNVERIFIABLE_PROVIDER_BILLING_NOT_EXPOSED',
  },
  'RHC-03': {
    technicalReceiptSha256: '29883e01bbc1be34803b67d1f2e8eb2af8c08e9c837c9ea6d778c94a80031f32',
    technicalAssessment: 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED',
    publicPackSha256: null,
    rubricDimensionIds: ['RHC03-T1', 'RHC03-T2', 'RHC03-T3', 'RHC03-T4', 'RHC03-P1', 'RHC03-P2', 'RHC03-Q1-EDITORIAL-FINISH'],
    mediaBindings: [],
    resultBindings: [binding('candidate-A-video', '7bad9e3ce2b1956dd093837b050bddd253ec47e4c396e3758cee82930f9ae327', 7_000, 'FULL_NORMAL_SPEED_AUDIOVISUAL')],
    correctionDisposition: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION',
    latencyDisposition: 'MEASURED_TECHNICAL_RENDER_ONLY', renderWallTimesMs: [114_430],
    costDisposition: 'UNVERIFIABLE_PROVIDER_BILLING_NOT_EXPOSED',
  },
  'RHC-04': {
    technicalReceiptSha256: '17e102ae2af9eb8350a704e775de9734f0881bc010c0354996bbda5da322ab0e',
    technicalAssessment: 'PASS_TECHNICAL_RENDERED_GENERATED_CORRECTION_UNJUDGED',
    publicPackSha256: null,
    rubricDimensionIds: ['RHC04-T1', 'RHC04-T2', 'RHC04-T3', 'RHC04-P1', 'RHC04-P2', 'RHC04-Q1-EDITORIAL-FINISH'],
    mediaBindings: [],
    resultBindings: [
      binding('initial-video', 'f4addc94a40127e97b50fc4d90bee5355b66cb0adce630fe22bb01afe34709e3', 6_000, 'FULL_NORMAL_SPEED_VISUAL'),
      binding('corrected-video', '177dc39827eff76db04c9c93f90139c394c8fe70fdf218226a4c2e391620ab75', 6_000, 'FULL_NORMAL_SPEED_VISUAL'),
    ],
    correctionDisposition: 'NOT_PERFORMED_REQUIRED_MEASURED_HANDS_ON_SESSION',
    latencyDisposition: 'MEASURED_TECHNICAL_RENDER_ONLY', renderWallTimesMs: [31_465, 31_609],
    costDisposition: 'UNVERIFIABLE_PROVIDER_BILLING_NOT_EXPOSED',
  },
};

export interface Stage25HumanQualityTaskEvidenceInputV1 {
  taskId: Stage25HumanQualityTaskIdV1;
  taskSha256: string;
  technicalReceipt: Readonly<{ receiptSha256: string; receiptFileSha256: string; assessment: string; humanQuality: 'UNJUDGED' }>;
  publicPackHash: string;
  reviewContract: Readonly<BlindQualityReviewContractV1>;
  humanReviewReceiptSha256: null;
  correctionDisposition: AcceptedTask['correctionDisposition'];
  telemetry: Readonly<{ latencyDisposition: AcceptedTask['latencyDisposition']; renderWallTimesMs: readonly number[]; costDisposition: AcceptedTask['costDisposition']; costUsd: null; sourceReceiptSha256: string }>;
}

export interface Stage25HumanQualityEvidenceInputV1 {
  source: Readonly<{ commitSha: string; treeSha: string; relevantScopeSha256: string; relevantTrackedFileCount: number; relevantStatusEntries: readonly string[] }>;
  generatedAt: string;
  reviewerPacketSha256: string;
  ownerTests: Readonly<{ reportSha256: string; testFiles: readonly string[]; passedTestCount: number; failedTestCount: number }>;
  tasks: readonly Stage25HumanQualityTaskEvidenceInputV1[];
}

export function finalizeStage25HumanQualityEvidenceV1(input: Readonly<Stage25HumanQualityEvidenceInputV1>) {
  validateInput(input);
  const material = {
    version: STAGE25_HUMAN_QUALITY_EVIDENCE_VERSION_V1,
    artifactType: 'Stage25HumanQualityEvidenceReceiptV1' as const,
    authority: 'RESEARCH_EVIDENCE_AVAILABILITY_ONLY_EXISTING_BLIND_REVIEW_OWNER_RETAINED' as const,
    source: structuredClone(input.source), generatedAt: input.generatedAt,
    reviewerPacketSha256: input.reviewerPacketSha256, ownerTests: structuredClone(input.ownerTests),
    tasks: input.tasks.map((task) => ({
      taskId: task.taskId, taskSha256: task.taskSha256,
      technicalReceipt: structuredClone(task.technicalReceipt), publicPackHash: task.publicPackHash,
      reviewContractHash: task.reviewContract.contractHash,
      mediaBindingsHash: hashCanonicalJsonV1(task.reviewContract.mediaBindings),
      resultBindingsHash: hashCanonicalJsonV1(task.reviewContract.resultBindings),
      humanQualityDisposition: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION' as const,
      qualifiedReviewReceiptSha256: null, correctionDisposition: task.correctionDisposition,
      telemetry: structuredClone(task.telemetry),
    })),
    qualifiedHumanReviewReceiptCount: 0 as const,
    independentAgreement: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION' as const,
    providerInferenceCalls: 0 as const, providerEmbeddingCalls: 0 as const,
    canonicalProjectReads: 0 as const, canonicalProjectMutations: 0 as const,
    assessment: 'MODIFY_HUMAN_QUALITY_CORRECTION_EVIDENCE_INCOMPLETE' as const,
    proofCeiling: 'HASH_BOUND_PLAYABLE_REVIEW_INPUTS_AND_TECHNICAL_TELEMETRY_ONLY' as const,
    unresolvedRequirements: ['QUALIFIED_BLIND_REVIEW_RHC01_TO_RHC04', 'RHC04_MEASURED_HANDS_ON_CORRECTION', 'RENDER_PROVIDER_BILLING_OR_COMPLETE_COST_ACCOUNTING'] as const,
    stage25DecisionImpact: 'BLOCKS_GO_SUPPORTS_MODIFY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25HumanQualityEvidenceReceiptV1(value: unknown): void {
  const receipt = record(value, 'RECEIPT_INVALID');
  const unsigned = structuredClone(receipt); delete unsigned.receiptSha256;
  if (receipt.version !== STAGE25_HUMAN_QUALITY_EVIDENCE_VERSION_V1
    || receipt.artifactType !== 'Stage25HumanQualityEvidenceReceiptV1'
    || receipt.assessment !== 'MODIFY_HUMAN_QUALITY_CORRECTION_EVIDENCE_INCOMPLETE'
    || receipt.qualifiedHumanReviewReceiptCount !== 0
    || receipt.providerInferenceCalls !== 0 || receipt.canonicalProjectMutations !== 0
    || !isSha(receipt.receiptSha256) || hashCanonicalJsonV1(unsigned) !== receipt.receiptSha256) fail('RECEIPT_INVALID');
}

function validateInput(input: Readonly<Stage25HumanQualityEvidenceInputV1>): void {
  if (!/^[a-f0-9]{40}$/.test(input.source.commitSha) || !/^[a-f0-9]{40}$/.test(input.source.treeSha)
    || !isSha(input.source.relevantScopeSha256) || input.source.relevantTrackedFileCount < 1
    || input.source.relevantStatusEntries.length || !Number.isFinite(Date.parse(input.generatedAt))
    || !isSha(input.reviewerPacketSha256) || !isSha(input.ownerTests.reportSha256)
    || input.ownerTests.failedTestCount !== 0 || input.ownerTests.passedTestCount < 1
    || hashCanonicalJsonV1([...input.ownerTests.testFiles].sort()) !== hashCanonicalJsonV1([...STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1].sort())) fail('SOURCE_OR_TEST_IDENTITY_INVALID');
  if (input.tasks.length !== STAGE25_HUMAN_QUALITY_TASK_IDS_V1.length
    || input.tasks.some((task, index) => task.taskId !== STAGE25_HUMAN_QUALITY_TASK_IDS_V1[index])) fail('TASK_SET_INVALID');
  for (const task of input.tasks) validateTask(task);
}

function validateTask(task: Readonly<Stage25HumanQualityTaskEvidenceInputV1>): void {
  const accepted = STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1[task.taskId];
  assertBlindQualityReviewContractV1(task.reviewContract);
  if (!isSha(task.taskSha256) || !isSha(task.technicalReceipt.receiptFileSha256)
    || task.technicalReceipt.receiptSha256 !== accepted.technicalReceiptSha256
    || task.technicalReceipt.assessment !== accepted.technicalAssessment
    || task.technicalReceipt.humanQuality !== 'UNJUDGED' || !isSha(task.publicPackHash)
    || (accepted.publicPackSha256 !== null && task.publicPackHash !== accepted.publicPackSha256)
    || task.reviewContract.taskId !== task.taskId || task.reviewContract.publicPackHash !== task.publicPackHash
    || task.humanReviewReceiptSha256 !== null || task.correctionDisposition !== accepted.correctionDisposition
    || task.telemetry.latencyDisposition !== accepted.latencyDisposition
    || hashCanonicalJsonV1(task.telemetry.renderWallTimesMs) !== hashCanonicalJsonV1(accepted.renderWallTimesMs)
    || task.telemetry.costDisposition !== accepted.costDisposition || task.telemetry.costUsd !== null
    || task.telemetry.sourceReceiptSha256 !== task.technicalReceipt.receiptSha256) fail(`TASK_EVIDENCE_INVALID:${task.taskId}`);
  const dimensions = task.reviewContract.rubricDimensions.map(({ dimensionId }) => dimensionId);
  if (hashCanonicalJsonV1(dimensions) !== hashCanonicalJsonV1(accepted.rubricDimensionIds)
    || task.reviewContract.rubricDimensions.some(({ requiredForPass }) => !requiredForPass)
    || hashCanonicalJsonV1(task.reviewContract.mediaBindings) !== hashCanonicalJsonV1(accepted.mediaBindings)
    || hashCanonicalJsonV1(task.reviewContract.resultBindings) !== hashCanonicalJsonV1(accepted.resultBindings)) fail(`REVIEW_CONTRACT_INVALID:${task.taskId}`);
}

function binding<T extends number | null>(artifactId: string, sha256: string, durationMilliseconds: T, requiredPlaybackConfirmation: Playback) {
  return { artifactId, sha256, durationMilliseconds, requiredPlaybackConfirmation };
}
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function record(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as Record<string, unknown>; }
function fail(code: string): never { throw new Error(`STAGE25_HUMAN_QUALITY_EVIDENCE_${code}`); }
