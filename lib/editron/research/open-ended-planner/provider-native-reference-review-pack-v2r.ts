import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants as fsConstants, createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R,
  type ReferenceNativeObservationMapV2R,
  type ReferenceNativeObserverSubmissionV2R,
  validateReferenceNativeObserverSubmissionV2R,
} from './provider-native-reference-observation-contract-v2r';
import {
  buildReferenceHoldout01NativeManifestV2R,
  REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
} from './provider-native-reference-holdout-01-v2r';
import { materializeReferenceHoldout01NativeVideoInputV2R }
  from './provider-native-reference-holdout-01-preflight-v2r';
import type { ReferenceObserverEpisodeReceiptV2R }
  from './provider-native-reference-observer-episode-v2r';
type JsonRecord = Record<string, unknown>;
const execFileAsync = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/;
export const REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_REVIEW_PACK_V2R_1' as const;
export interface ReferenceHoldout01ReviewPackV2R {
  version: typeof REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R;
  taskId: 'HREF-01-NATIVE';
  reviewStatus: 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW';
  formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER';
  reviewerManifestPath: string;
  reviewFormTemplatePath: string;
  operatorKeyPath: string;
  publicPackHash: string;
  operatorKeyHash: string;
  denseWindows: readonly Readonly<{
    windowId: string;
    videoPath: string;
    videoSha256: string;
    audioPath: string;
    audioSha256: string;
    expectedFrameCount: number;
  }>[];
  stateEffects: readonly [];
}
export async function buildReferenceHoldout01ReviewPackV2R(input: {
  sourcePath: string;
  outputRoot: string;
  createdAt: string;
  episodeReceipt: Readonly<ReferenceObserverEpisodeReceiptV2R>;
  ffmpegPath?: string;
}): Promise<Readonly<ReferenceHoldout01ReviewPackV2R>> {
  if (new Date(input.createdAt).toISOString() !== input.createdAt) {
    throw new Error('HREF01_REVIEW_PACK_TIMESTAMP_INVALID');
  }
  const sourceStat = await fs.lstat(input.sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error('HREF01_REVIEW_PACK_SOURCE_INVALID');
  }
  const materialized = await materializeReferenceHoldout01NativeVideoInputV2R({
    sourcePath: input.sourcePath,
  });
  const submission = validatedSubmission(input.episodeReceipt);
  const windows = submission.observation?.requestedDenseReinspectionWindows ?? [];
  assertWindowSet(windows);

  const outputRoot = path.resolve(input.outputRoot);
  if (!path.isAbsolute(input.outputRoot) || outputRoot === path.parse(outputRoot).root) {
    throw new Error('HREF01_REVIEW_PACK_OUTPUT_ROOT_INVALID');
  }
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  await fs.mkdir(outputRoot);
  const reviewerRoot = path.join(outputRoot, 'reviewer');
  const denseRoot = path.join(reviewerRoot, 'dense');
  const operatorRoot = path.join(outputRoot, 'operator-only');
  await fs.mkdir(reviewerRoot);
  await Promise.all([fs.mkdir(denseRoot), fs.mkdir(operatorRoot)]);
  const referencePath = path.join(reviewerRoot, 'reference.mp4');
  await fs.copyFile(input.sourcePath, referencePath, fsConstants.COPYFILE_EXCL);
  if (await sha256File(referencePath) !== materialized.sourceSha256) {
    throw new Error('HREF01_REVIEW_PACK_REFERENCE_COPY_DRIFT');
  }
  const ffmpegPath = input.ffmpegPath ?? getFFmpegPath();
  const ffmpegSha256 = await sha256File(ffmpegPath);
  const denseWindows = [];
  for (const window of windows) {
    denseWindows.push(await materializeDenseWindow({
      sourcePath: input.sourcePath,
      denseRoot,
      ffmpegPath,
      window,
    }));
  }

  const evaluator = buildReferenceHoldout01NativeManifestV2R().evaluatorOnly;
  const publicUnsigned = {
    version: REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R,
    artifactType: 'ReferenceHoldout01ReviewerManifestV2R' as const,
    taskId: 'HREF-01-NATIVE' as const,
    createdAt: input.createdAt,
    reviewStatus: 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW' as const,
    formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER' as const,
    identityDisposition: 'MODEL_IDENTITY_WITHHELD_FROM_REVIEWER' as const,
    reference: { fileName: 'reference.mp4', sha256: materialized.sourceSha256 },
    observation: submission.observation,
    denseWindows: denseWindows.map((window) => ({
      windowId: window.windowId,
      range: window.range,
      videoFile: `dense/${path.basename(window.videoPath)}`,
      videoSha256: window.videoSha256,
      audioFile: `dense/${path.basename(window.audioPath)}`,
      audioSha256: window.audioSha256,
      expectedFrameCount: window.expectedFrameCount,
    })),
    rubric: {
      inheritedHumanApprovedVisualRequirements: evaluator.inheritedHumanApprovedVisualRequirements,
      nativeMotionAudioReviewRequirements: evaluator.nativeMotionAudioReviewRequirements,
      hardFailures: evaluator.hardFailures,
      requiredDecision: ['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIABLE'],
    },
    reviewInstruction: 'Watch the complete reference with sound, inspect every dense clip and WAV, then judge only the supplied observation against the rubric.',
    stateEffects: [] as const,
  };
  const publicManifest = { ...publicUnsigned, publicPackHash: hashCanonicalJsonV1(publicUnsigned) };
  const formUnsigned = {
    version: REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R,
    artifactType: 'ReferenceHoldout01ReviewFormV2R' as const,
    publicPackHash: publicManifest.publicPackHash,
    reviewerId: null,
    completedAt: null,
    completeReferencePlaybackConfirmed: false,
    denseWindowPlaybackConfirmed: Object.fromEntries(denseWindows.map(({ windowId }) => [windowId, false])),
    requirements: Object.fromEntries([
      ...evaluator.inheritedHumanApprovedVisualRequirements,
      ...evaluator.nativeMotionAudioReviewRequirements,
    ].map((entry) => [String(entry.requirementId), {
      decision: null,
      correction: '',
      evidenceNotes: '',
    }])),
    hardFailuresObserved: [],
    overallDecision: null,
    correctionMinutesEstimate: null,
    notes: '',
    stateEffects: [] as const,
  };
  const reviewForm = { ...formUnsigned, templateHash: hashCanonicalJsonV1(formUnsigned) };
  const operatorUnsigned = {
    version: REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R,
    artifactType: 'ReferenceHoldout01OperatorKeyV2R' as const,
    publicPackHash: publicManifest.publicPackHash,
    sourceEpisodeReceiptSha256: input.episodeReceipt.receiptSha256,
    route: input.episodeReceipt.route,
    referenceInputManifestSha256: REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
    ffmpegSha256,
    disclosurePolicy: 'DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL' as const,
    stateEffects: [] as const,
  };
  const operatorKey = { ...operatorUnsigned, operatorKeyHash: hashCanonicalJsonV1(operatorUnsigned) };
  const reviewerManifestPath = path.join(reviewerRoot, 'manifest.json');
  const reviewFormTemplatePath = path.join(reviewerRoot, 'review-form-template.json');
  const operatorKeyPath = path.join(operatorRoot, 'candidate-key.json');
  await Promise.all([
    writeJson(reviewerManifestPath, publicManifest),
    writeJson(reviewFormTemplatePath, reviewForm),
    writeJson(operatorKeyPath, operatorKey),
  ]);
  return Object.freeze({
    version: REFERENCE_HOLDOUT_01_REVIEW_PACK_VERSION_V2R,
    taskId: 'HREF-01-NATIVE' as const,
    reviewStatus: 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW' as const,
    formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER' as const,
    reviewerManifestPath,
    reviewFormTemplatePath,
    operatorKeyPath,
    publicPackHash: publicManifest.publicPackHash,
    operatorKeyHash: operatorKey.operatorKeyHash,
    denseWindows,
    stateEffects: [] as const,
  });
}

function validatedSubmission(receipt: Readonly<ReferenceObserverEpisodeReceiptV2R>): ReferenceNativeObserverSubmissionV2R {
  const material = structuredClone(receipt) as unknown as JsonRecord;
  const receiptSha256 = String(material.receiptSha256 ?? '');
  delete material.receiptSha256;
  if (!SHA256.test(receiptSha256) || hashCanonicalJsonV1(material) !== receiptSha256
    || receipt.authority !== 'RESEARCH_REFERENCE_OBSERVATION_ONLY_NO_PROJECT_MUTATION'
    || receipt.terminal.disposition !== 'READY_FOR_EVALUATION'
    || receipt.exposedEditingOperatorIds.length || receipt.selectedEditingOperatorIds.length
    || receipt.stateEffects.length || !receipt.observation) {
    throw new Error('HREF01_REVIEW_PACK_EPISODE_RECEIPT_INVALID');
  }
  const submission: ReferenceNativeObserverSubmissionV2R = {
    submissionVersion: REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R,
    taskManifestSha256: receipt.taskManifestSha256,
    referenceInputManifestSha256: receipt.referenceInputManifestSha256,
    disposition: 'READY_FOR_EVALUATION',
    reasonCodes: [...receipt.terminal.reasonCodes],
    evidenceIds: [...receipt.terminal.evidenceIds],
    summary: receipt.terminal.summary,
    observation: receipt.observation as Readonly<ReferenceNativeObservationMapV2R>,
  };
  const validation = validateReferenceNativeObserverSubmissionV2R(submission);
  if (validation.disposition !== 'PASS') {
    throw new Error(`HREF01_REVIEW_PACK_OBSERVATION_INVALID:${validation.diagnostics.join('|')}`);
  }
  return submission;
}

function assertWindowSet(windows: readonly Readonly<JsonRecord>[]): void {
  if (!windows.length || windows.length > 8) throw new Error('HREF01_REVIEW_PACK_WINDOW_COUNT_INVALID');
  let totalDurationUs = BigInt(0);
  for (const window of windows) {
    const start = BigInt(String(window.startTimestampUs));
    const end = BigInt(String(window.endTimestampUsExclusive));
    const rate = window.requestedRate as JsonRecord;
    const numerator = BigInt(String(rate.numerator));
    const denominator = BigInt(String(rate.denominator));
    const duration = end - start;
    if (window.requiredModality !== 'CUSTOM_FPS_VIDEO' || duration <= BigInt(0)
      || duration > BigInt(10_000_000) || numerator > BigInt(60) * denominator
      || (duration * numerator) % (BigInt(1_000_000) * denominator) !== BigInt(0)) {
      throw new Error(`HREF01_REVIEW_PACK_WINDOW_INVALID:${String(window.windowId)}`);
    }
    totalDurationUs += duration;
  }
  if (totalDurationUs > BigInt(30_000_000)) throw new Error('HREF01_REVIEW_PACK_TOTAL_DURATION_INVALID');
}

async function materializeDenseWindow(input: {
  sourcePath: string;
  denseRoot: string;
  ffmpegPath: string;
  window: Readonly<JsonRecord>;
}) {
  const windowId = String(input.window.windowId);
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(windowId)) throw new Error('HREF01_REVIEW_PACK_WINDOW_ID_INVALID');
  const startUs = BigInt(String(input.window.startTimestampUs));
  const endUs = BigInt(String(input.window.endTimestampUsExclusive));
  const rate = input.window.requestedRate as JsonRecord;
  const numerator = BigInt(String(rate.numerator));
  const denominator = BigInt(String(rate.denominator));
  const expectedFrameCount = Number((endUs - startUs) * numerator / (BigInt(1_000_000) * denominator));
  const videoPath = path.join(input.denseRoot, `${windowId}.mp4`);
  const audioPath = path.join(input.denseRoot, `${windowId}.wav`);
  const start = seconds(startUs); const duration = seconds(endUs - startUs);
  await runFfmpeg(input.ffmpegPath, [
    '-nostdin', '-hide_banner', '-n', '-i', input.sourcePath, '-ss', start, '-t', duration,
    '-map', '0:v:0', '-map', '0:a:0', '-vf', `fps=${numerator}/${denominator}`,
    '-frames:v', String(expectedFrameCount), '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k',
    '-ar', '96000', '-ac', '2', '-movflags', '+faststart', videoPath,
  ]);
  await runFfmpeg(input.ffmpegPath, [
    '-nostdin', '-hide_banner', '-n', '-i', input.sourcePath, '-ss', start, '-t', duration,
    '-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le', '-ar', '96000', '-ac', '2', audioPath,
  ]);
  const inspection = await runFfmpeg(input.ffmpegPath, [
    '-nostdin', '-hide_banner', '-i', videoPath, '-map', '0:v:0', '-an', '-f', 'null', '-',
  ]);
  const frames = [...inspection.matchAll(/frame=\s*([0-9]+)/g)].at(-1)?.[1];
  if (Number(frames) !== expectedFrameCount) throw new Error(`HREF01_REVIEW_PACK_FRAME_COUNT_INVALID:${windowId}`);
  await runFfmpeg(input.ffmpegPath, [
    '-nostdin', '-hide_banner', '-i', audioPath, '-map', '0:a:0', '-vn', '-f', 'null', '-',
  ]);
  return Object.freeze({
    windowId,
    range: { startTimestampUs: String(startUs), endTimestampUsExclusive: String(endUs), rate: { numerator: String(numerator), denominator: String(denominator) } },
    videoPath,
    videoSha256: await sha256File(videoPath),
    audioPath,
    audioSha256: await sha256File(audioPath),
    expectedFrameCount,
  });
}

async function runFfmpeg(binary: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync(binary, [...args], {
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    encoding: 'utf8',
  });
  return `${result.stdout}\n${result.stderr}`;
}
function seconds(valueUs: bigint): string { return `${valueUs / BigInt(1_000_000)}.${String(valueUs % BigInt(1_000_000)).padStart(6, '0')}`; }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject); stream.on('end', resolve);
  });
  return hash.digest('hex');
}
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}
