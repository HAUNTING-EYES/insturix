import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants, createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';

export interface GeneratedCompositionBlindReviewCandidateV1 {
  sourceCandidateId: string;
  modelIdentity: string;
  programHash: string;
  hostReceiptHash: string;
  proofHash: string;
  videoPath: string;
  videoSha256: string;
}

export interface GeneratedCompositionBlindReviewPackV1 {
  artifactType: 'GeneratedCompositionBlindReviewPackV1';
  taskId: 'DEV-02';
  createdAt: string;
  reviewStatus: 'AWAITING_REAL_HUMAN_REVIEW';
  reviewerManifestPath: string;
  reviewFormTemplatePath: string;
  operatorKeyPath: string;
  publicPackHash: string;
  operatorKeyHash: string;
  candidateVideos: readonly { candidateId: 'candidate-a' | 'candidate-b'; path: string; sha256: string }[];
  stateEffects: readonly [];
}

export async function buildGeneratedCompositionBlindReviewPackV1(input: {
  outputRoot: string;
  createdAt: string;
  candidates: readonly [GeneratedCompositionBlindReviewCandidateV1, GeneratedCompositionBlindReviewCandidateV1];
  randomSource?: (size: number) => Uint8Array;
}): Promise<Readonly<GeneratedCompositionBlindReviewPackV1>> {
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('GENERATED_COMPOSITION_BLIND_REVIEW_TIMESTAMP_INVALID');
  if (new Set(input.candidates.map(({ sourceCandidateId }) => sourceCandidateId)).size !== 2
    || new Set(input.candidates.map(({ programHash }) => programHash)).size !== 2) {
    throw new Error('GENERATED_COMPOSITION_BLIND_REVIEW_CANDIDATES_NOT_DISTINCT');
  }
  const outputRoot = path.resolve(input.outputRoot);
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  await fs.mkdir(outputRoot);
  const reviewerRoot = path.join(outputRoot, 'reviewer');
  const operatorRoot = path.join(outputRoot, 'operator-only');
  await Promise.all([fs.mkdir(reviewerRoot), fs.mkdir(operatorRoot)]);

  const entropy = Buffer.from((input.randomSource ?? randomBytes)(32));
  if (entropy.byteLength !== 32) throw new Error('GENERATED_COMPOSITION_BLIND_REVIEW_RANDOM_SOURCE_INVALID');
  const ordered = entropy[0] % 2 === 0 ? [...input.candidates] : [...input.candidates].reverse();
  const aliases = ['candidate-a', 'candidate-b'] as const;
  const publicCandidates = [];
  const operatorMappings = [];
  for (let index = 0; index < aliases.length; index += 1) {
    const alias = aliases[index]; const candidate = ordered[index];
    assertSha(candidate.programHash, 'program'); assertSha(candidate.hostReceiptHash, 'host receipt');
    assertSha(candidate.proofHash, 'proof'); assertSha(candidate.videoSha256, 'video');
    const sourceStat = await fs.lstat(candidate.videoPath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size <= 0
      || path.extname(candidate.videoPath).toLowerCase() !== '.mp4'
      || await sha256File(candidate.videoPath) !== candidate.videoSha256) {
      throw new Error(`GENERATED_COMPOSITION_BLIND_REVIEW_VIDEO_INVALID:${candidate.sourceCandidateId}`);
    }
    const fileName = `${alias}.mp4`; const destination = path.join(reviewerRoot, fileName);
    await fs.copyFile(candidate.videoPath, destination, fsConstants.COPYFILE_EXCL);
    const blindingCommitment = sha256(Buffer.concat([entropy, Buffer.from(alias, 'utf8'), Buffer.from(candidate.videoSha256, 'hex')]));
    await fs.appendFile(destination, reviewIdentityFreeBox(blindingCommitment));
    const reviewSha256 = await sha256File(destination); const reviewStat = await fs.lstat(destination);
    if (reviewSha256 === candidate.videoSha256 || reviewStat.size !== sourceStat.size + 40
      || await sha256FilePrefix(destination, sourceStat.size) !== candidate.videoSha256) {
      throw new Error(`GENERATED_COMPOSITION_BLIND_REVIEW_COPY_DRIFT:${alias}`);
    }
    publicCandidates.push({ candidateId: alias, fileName, sha256: reviewSha256, byteLength: reviewStat.size });
    operatorMappings.push({
      candidateId: alias, sourceCandidateId: candidate.sourceCandidateId, modelIdentity: candidate.modelIdentity,
      programHash: candidate.programHash, hostReceiptHash: candidate.hostReceiptHash, proofHash: candidate.proofHash,
      sourceVideoSha256: candidate.videoSha256, reviewVideoSha256: reviewSha256, blindingCommitment,
    });
  }

  const publicUnsigned = {
    artifactType: 'GeneratedCompositionBlindReviewManifestV1' as const,
    taskId: 'DEV-02' as const,
    createdAt: input.createdAt,
    modelIdentityDisposition: 'WITHHELD_FROM_REVIEWER' as const,
    sourceIdentityDisposition: 'WITHHELD_RANDOMIZED_REVIEW_COPY' as const,
    reviewerIsolationRequirement: 'REVIEWER_MUST_NOT_ACCESS_OPERATOR_KEY_OR_SOURCE_ARTIFACTS' as const,
    reviewStatus: 'AWAITING_REAL_HUMAN_REVIEW' as const,
    playbackRequirement: 'WATCH_EACH_COMPLETE_VIDEO_AT_NORMAL_SPEED_BEFORE_RATING' as const,
    candidates: publicCandidates,
    rubric: {
      scale: { minimum: 1, maximum: 5, anchors: { 1: 'unusable', 3: 'usable_with_visible_corrections', 5: 'client_ready_for_this_bounded_moment' } },
      dimensions: ['five-panel-readability', 'black-gutter-integrity', 'title-legibility', 'opposed-entry-motion', 'centre-takeover-continuity', 'timing-and-stability', 'overall-editorial-quality'],
      requiredPerCandidateFields: ['scores', 'blockingDefects', 'correctionMinutesEstimate', 'notes'],
      requiredComparisonFields: ['preferredCandidate', 'preferenceReason', 'confidence'],
    },
    stateEffects: [] as const,
  };
  const publicManifest = { ...publicUnsigned, publicPackHash: hashCanonicalJsonV1(publicUnsigned) };
  const formUnsigned = {
    artifactType: 'GeneratedCompositionBlindReviewFormV1' as const,
    taskId: 'DEV-02' as const,
    publicPackHash: publicManifest.publicPackHash,
    reviewerId: null, completedAt: null,
    playbackConfirmed: { 'candidate-a': false, 'candidate-b': false },
    candidates: {
      'candidate-a': { scores: {}, blockingDefects: [], correctionMinutesEstimate: null, notes: '' },
      'candidate-b': { scores: {}, blockingDefects: [], correctionMinutesEstimate: null, notes: '' },
    },
    comparison: { preferredCandidate: null, preferenceReason: '', confidence: null },
    stateEffects: [] as const,
  };
  const reviewForm = { ...formUnsigned, templateHash: hashCanonicalJsonV1(formUnsigned) };
  const operatorUnsigned = {
    artifactType: 'GeneratedCompositionBlindReviewOperatorKeyV1' as const,
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
    artifactType: 'GeneratedCompositionBlindReviewPackV1' as const,
    taskId: 'DEV-02' as const,
    createdAt: input.createdAt,
    reviewStatus: 'AWAITING_REAL_HUMAN_REVIEW' as const,
    reviewerManifestPath,
    reviewFormTemplatePath,
    operatorKeyPath,
    publicPackHash: publicManifest.publicPackHash,
    operatorKeyHash: operatorKey.operatorKeyHash,
    candidateVideos: publicCandidates.map(({ candidateId, fileName, sha256 }) => ({ candidateId, path: path.join(reviewerRoot, fileName), sha256 })),
    stateEffects: [] as const,
  });
}

function assertSha(value: string, label: string): void { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`GENERATED_COMPOSITION_BLIND_REVIEW_${label.toUpperCase().replaceAll(' ', '_')}_HASH_INVALID`); }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function reviewIdentityFreeBox(commitment: string): Buffer {
  assertSha(commitment, 'blinding commitment');
  const box = Buffer.alloc(40); box.writeUInt32BE(box.byteLength, 0); box.write('free', 4, 'ascii'); Buffer.from(commitment, 'hex').copy(box, 8);
  return box;
}
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
async function sha256FilePrefix(filePath: string, byteLength: number): Promise<string> {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) throw new Error('GENERATED_COMPOSITION_BLIND_REVIEW_PREFIX_LENGTH_INVALID');
  const hash = createHash('sha256'); let observed = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start: 0, end: byteLength - 1 });
    stream.on('data', (chunk) => { observed += chunk.length; hash.update(chunk); }); stream.on('error', reject); stream.on('end', resolve);
  });
  if (observed !== byteLength) throw new Error('GENERATED_COMPOSITION_BLIND_REVIEW_PREFIX_COVERAGE_DRIFT');
  return hash.digest('hex');
}
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
