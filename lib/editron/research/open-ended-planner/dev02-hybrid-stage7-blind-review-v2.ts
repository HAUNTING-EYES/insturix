import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants, createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV02_HYBRID_STAGE6_VERSION_V2,
  hasValidDev02HybridStage6ReceiptHashV2,
  type Dev02HybridStage6ReceiptV2,
} from './dev02-hybrid-stage6-contract-v2';

export const DEV02_HYBRID_STAGE7_VERSION_V2 =
  'EDITRON_OE_DEV02_HYBRID_STAGE7_BLIND_REVIEW_V2' as const;

type CandidateAlias = 'candidate-a' | 'candidate-b' | 'candidate-c';

export interface Dev02HybridStage7CandidateV2 {
  sourceCandidateId: string;
  modelIdentity: string;
  stage6ReceiptPath: string;
  stage6ReceiptHash: string;
  videoPath: string;
  videoSha256: string;
}

export interface Dev02HybridStage7BlindReviewPackV2 {
  schemaVersion: typeof DEV02_HYBRID_STAGE7_VERSION_V2;
  taskId: 'DEV-02';
  createdAt: string;
  reviewStatus: 'AWAITING_REAL_HUMAN_REVIEW';
  reviewerManifestPath: string;
  reviewFormTemplatePath: string;
  operatorKeyPath: string;
  publicPackHash: string;
  operatorKeyHash: string;
  candidateVideos: readonly {
    candidateId: CandidateAlias;
    path: string;
    sha256: string;
  }[];
  stateEffects: readonly [];
}

export async function buildDev02HybridStage7BlindReviewPackV2(input: {
  outputRoot: string;
  createdAt: string;
  candidates: readonly [
    Dev02HybridStage7CandidateV2,
    Dev02HybridStage7CandidateV2,
    Dev02HybridStage7CandidateV2,
  ];
  randomSource?: (size: number) => Uint8Array;
}): Promise<Readonly<Dev02HybridStage7BlindReviewPackV2>> {
  if (new Date(input.createdAt).toISOString() !== input.createdAt) {
    throw new Error('DEV02_HYBRID_STAGE7_TIMESTAMP_INVALID');
  }
  assertDistinct(input.candidates.map(({ sourceCandidateId }) => sourceCandidateId), 'SOURCE_CANDIDATE');
  assertDistinct(input.candidates.map(({ modelIdentity }) => modelIdentity), 'MODEL_IDENTITY');
  assertDistinct(input.candidates.map(({ stage6ReceiptHash }) => stage6ReceiptHash), 'STAGE6_RECEIPT');
  assertDistinct(input.candidates.map(({ videoSha256 }) => videoSha256), 'VIDEO');
  const validated = await Promise.all(input.candidates.map(validateCandidate));

  const outputRoot = path.resolve(input.outputRoot);
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  await fs.mkdir(outputRoot);
  const reviewerRoot = path.join(outputRoot, 'reviewer');
  const operatorRoot = path.join(outputRoot, 'operator-only');
  await Promise.all([fs.mkdir(reviewerRoot), fs.mkdir(operatorRoot)]);

  const entropy = Buffer.from((input.randomSource ?? randomBytes)(32));
  if (entropy.byteLength !== 32) throw new Error('DEV02_HYBRID_STAGE7_RANDOM_SOURCE_INVALID');
  const ordered = deterministicShuffle(validated, entropy);
  const aliases: readonly CandidateAlias[] = ['candidate-a', 'candidate-b', 'candidate-c'];
  const publicCandidates = [];
  const operatorMappings = [];
  for (let index = 0; index < aliases.length; index += 1) {
    const alias = aliases[index];
    const candidate = ordered[index];
    const destination = path.join(reviewerRoot, `${alias}.mp4`);
    await fs.copyFile(candidate.videoPath, destination, fsConstants.COPYFILE_EXCL);
    const commitment = sha256(Buffer.concat([
      entropy,
      Buffer.from(alias, 'utf8'),
      Buffer.from(candidate.videoSha256, 'hex'),
      Buffer.from(candidate.stage6ReceiptHash, 'hex'),
    ]));
    await fs.appendFile(destination, identityFreeBox(commitment));
    const reviewSha = await sha256File(destination);
    const reviewStat = await fs.lstat(destination);
    if (reviewSha === candidate.videoSha256
      || reviewStat.size !== candidate.videoByteLength + 40
      || await sha256FilePrefix(destination, candidate.videoByteLength) !== candidate.videoSha256) {
      throw new Error(`DEV02_HYBRID_STAGE7_COPY_DRIFT:${alias}`);
    }
    publicCandidates.push({
      candidateId: alias,
      fileName: `${alias}.mp4`,
      sha256: reviewSha,
      byteLength: reviewStat.size,
    });
    operatorMappings.push({
      candidateId: alias,
      sourceCandidateId: candidate.sourceCandidateId,
      modelIdentity: candidate.modelIdentity,
      stage6ReceiptHash: candidate.stage6ReceiptHash,
      programHash: candidate.receipt.inputs.island.programHash,
      generatedProofHash: candidate.receipt.inputs.island.renderedProofHash,
      sourceVideoSha256: candidate.videoSha256,
      reviewVideoSha256: reviewSha,
      blindingCommitment: commitment,
    });
  }

  const publicUnsigned = {
    schemaVersion: DEV02_HYBRID_STAGE7_VERSION_V2,
    artifactType: 'Dev02HybridStage7ReviewerManifestV2' as const,
    taskId: 'DEV-02' as const,
    createdAt: input.createdAt,
    modelIdentityDisposition: 'WITHHELD_FROM_REVIEWER' as const,
    sourceIdentityDisposition: 'WITHHELD_RANDOMIZED_REVIEW_COPY' as const,
    reviewerIsolationRequirement: 'REVIEWER_MUST_NOT_ACCESS_OPERATOR_KEY_OR_SOURCE_ARTIFACTS' as const,
    reviewStatus: 'AWAITING_REAL_HUMAN_REVIEW' as const,
    playbackRequirement: 'WATCH_EACH_COMPLETE_11_5_SECOND_VIDEO_AT_NORMAL_SPEED_BEFORE_RATING' as const,
    candidates: publicCandidates,
    rubric: {
      scale: {
        minimum: 1,
        maximum: 5,
        anchors: {
          1: 'unusable',
          3: 'usable_with_visible_corrections',
          5: 'client_ready_for_this_bounded_hybrid_reel',
        },
      },
      dimensions: [
        'five-panel-readability', 'black-gutter-integrity', 'title-legibility',
        'opposed-entry-motion', 'centre-takeover-quality', 'generated-to-native-continuity',
        'native-continuation-quality', 'full-sequence-timing-and-stability', 'overall-editorial-quality',
      ],
      requiredPerCandidateFields: ['scores', 'blockingDefects', 'correctionMinutesEstimate', 'notes'],
      requiredComparisonFields: ['rankedCandidates', 'preferredCandidate', 'preferenceReason', 'confidence'],
    },
    stateEffects: [] as const,
  };
  const publicManifest = { ...publicUnsigned, publicPackHash: hashCanonicalJsonV1(publicUnsigned) };
  const formUnsigned = {
    schemaVersion: DEV02_HYBRID_STAGE7_VERSION_V2,
    artifactType: 'Dev02HybridStage7ReviewFormV2' as const,
    taskId: 'DEV-02' as const,
    publicPackHash: publicManifest.publicPackHash,
    reviewerId: null,
    completedAt: null,
    playbackConfirmed: Object.fromEntries(aliases.map((alias) => [alias, false])),
    candidates: Object.fromEntries(aliases.map((alias) => [alias, {
      scores: {}, blockingDefects: [], correctionMinutesEstimate: null, notes: '',
    }])),
    comparison: { rankedCandidates: [], preferredCandidate: null, preferenceReason: '', confidence: null },
    stateEffects: [] as const,
  };
  const reviewForm = { ...formUnsigned, templateHash: hashCanonicalJsonV1(formUnsigned) };
  const operatorUnsigned = {
    schemaVersion: DEV02_HYBRID_STAGE7_VERSION_V2,
    artifactType: 'Dev02HybridStage7OperatorKeyV2' as const,
    taskId: 'DEV-02' as const,
    publicPackHash: publicManifest.publicPackHash,
    randomizationCommitment: sha256(entropy),
    mappings: operatorMappings,
    disclosurePolicy: 'DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL' as const,
    stateEffects: [] as const,
  };
  const operatorKey = { ...operatorUnsigned, operatorKeyHash: hashCanonicalJsonV1(operatorUnsigned) };
  const reviewerManifestPath = path.join(reviewerRoot, 'manifest.json');
  const reviewFormTemplatePath = path.join(reviewerRoot, 'review-form-template.json');
  const operatorKeyPath = path.join(operatorRoot, 'candidate-key.json');
  await Promise.all([
    writeExclusiveJson(reviewerManifestPath, publicManifest),
    writeExclusiveJson(reviewFormTemplatePath, reviewForm),
    writeExclusiveJson(operatorKeyPath, operatorKey),
  ]);
  return Object.freeze({
    schemaVersion: DEV02_HYBRID_STAGE7_VERSION_V2,
    taskId: 'DEV-02' as const,
    createdAt: input.createdAt,
    reviewStatus: 'AWAITING_REAL_HUMAN_REVIEW' as const,
    reviewerManifestPath,
    reviewFormTemplatePath,
    operatorKeyPath,
    publicPackHash: publicManifest.publicPackHash,
    operatorKeyHash: operatorKey.operatorKeyHash,
    candidateVideos: publicCandidates.map(({ candidateId, fileName, sha256: digest }) => ({
      candidateId, path: path.join(reviewerRoot, fileName), sha256: digest,
    })),
    stateEffects: [] as const,
  });
}

async function validateCandidate(candidate: Dev02HybridStage7CandidateV2) {
  assertSha(candidate.stage6ReceiptHash, 'STAGE6_RECEIPT');
  assertSha(candidate.videoSha256, 'VIDEO');
  const receipt = JSON.parse(await fs.readFile(candidate.stage6ReceiptPath, 'utf8')) as Dev02HybridStage6ReceiptV2;
  if (receipt.receiptHash !== candidate.stage6ReceiptHash || !hasValidDev02HybridStage6ReceiptHashV2(receipt)
    || receipt.schemaVersion !== DEV02_HYBRID_STAGE6_VERSION_V2
    || receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION'
    || receipt.proof.generatedIslandHardGates !== 'PASS' || receipt.proof.hybridTiming !== 'PASS'
    || receipt.proof.boundaryContinuity !== 'PASS' || receipt.proof.nativeContinuation !== 'PASS'
    || receipt.proof.projectMutation !== 'NONE' || receipt.stateEffects.length) {
    throw new Error(`DEV02_HYBRID_STAGE7_STAGE6_RECEIPT_INVALID:${candidate.sourceCandidateId}`);
  }
  const artifact = receipt.artifacts.find(({ artifactId }) => artifactId === 'FULL_HYBRID_PROXY');
  const stat = await fs.lstat(candidate.videoPath);
  if (!artifact || artifact.path !== candidate.videoPath || artifact.sha256 !== candidate.videoSha256
    || artifact.byteLength !== stat.size || !stat.isFile() || stat.isSymbolicLink()
    || path.extname(candidate.videoPath).toLowerCase() !== '.mp4'
    || await sha256File(candidate.videoPath) !== candidate.videoSha256) {
    throw new Error(`DEV02_HYBRID_STAGE7_VIDEO_INVALID:${candidate.sourceCandidateId}`);
  }
  return { ...candidate, receipt, videoByteLength: stat.size };
}

function deterministicShuffle<T>(values: readonly T[], entropy: Buffer): T[] {
  const result = [...values];
  for (let index = result.length - 1, byte = 0; index > 0; index -= 1, byte += 1) {
    const swap = entropy[byte] % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
function assertDistinct(values: string[], label: string): void {
  if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
    throw new Error(`DEV02_HYBRID_STAGE7_${label}_SET_INVALID`);
  }
}
function assertSha(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`DEV02_HYBRID_STAGE7_${label}_HASH_INVALID`);
}
function identityFreeBox(commitment: string): Buffer {
  const box = Buffer.alloc(40); box.writeUInt32BE(40, 0); box.write('free', 4, 'ascii');
  Buffer.from(commitment, 'hex').copy(box, 8); return box;
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve);
  });
  return hash.digest('hex');
}
async function sha256FilePrefix(filePath: string, byteLength: number): Promise<string> {
  const hash = createHash('sha256'); let observed = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start: 0, end: byteLength - 1 });
    stream.on('data', (chunk) => { observed += chunk.length; hash.update(chunk); });
    stream.on('error', reject); stream.on('end', resolve);
  });
  if (observed !== byteLength) throw new Error('DEV02_HYBRID_STAGE7_PREFIX_COVERAGE_DRIFT');
  return hash.digest('hex');
}
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}
