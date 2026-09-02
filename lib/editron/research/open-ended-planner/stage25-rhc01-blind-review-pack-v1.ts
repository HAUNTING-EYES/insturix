import { createHash, randomBytes } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_RHC01_BLIND_REVIEW_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC01_BLIND_REVIEW_V1_1' as const;

export interface Stage25Rhc01BlindCandidateV1 {
  sourceCandidateId: string;
  route: 'NATIVE' | 'GENERATED_COMPOSITION' | 'HYBRID';
  videoPath: string;
  videoSha256: string;
  contactSheetPath: string;
  contactSheetSha256: string;
  boundaryEvidence: unknown;
  structuralEditabilityDisposition: string;
}

export async function buildStage25Rhc01BlindReviewPackV1(input: {
  outputRoot: string;
  createdAt: string;
  taskSha256: string;
  candidateSetHash: string;
  publicBrief: string;
  targetPredicates: readonly unknown[];
  preservationPredicates: readonly unknown[];
  candidates: readonly [
    Stage25Rhc01BlindCandidateV1,
    Stage25Rhc01BlindCandidateV1,
    Stage25Rhc01BlindCandidateV1,
  ];
  randomSource?: (size: number) => Uint8Array;
}) {
  if (new Date(input.createdAt).toISOString() !== input.createdAt) fail('TIMESTAMP_INVALID');
  if (![input.taskSha256, input.candidateSetHash].every(isSha256)) fail('SOURCE_IDENTITY_INVALID');
  if (new Set(input.candidates.map(({ sourceCandidateId }) => sourceCandidateId)).size !== 3
    || new Set(input.candidates.map(({ route }) => route)).size !== 3) fail('CANDIDATES_NOT_DISTINCT');
  for (const candidate of input.candidates) await validateCandidate(candidate);

  const entropy = Buffer.from((input.randomSource ?? randomBytes)(32));
  if (entropy.length !== 32) fail('RANDOM_SOURCE_INVALID');
  const outputRoot = safeNewDirectory(input.outputRoot);
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot);
  const reviewerRoot = path.join(outputRoot, 'reviewer');
  const operatorRoot = path.join(outputRoot, 'operator-only');
  await Promise.all([mkdir(reviewerRoot), mkdir(operatorRoot)]);

  const ordered = deterministicShuffle([...input.candidates], entropy);
  const publicCandidates = [];
  const mappings = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const candidate = ordered[index];
    const candidateId = String.fromCharCode(65 + index) as 'A' | 'B' | 'C';
    const videoFileName = `candidate-${candidateId}.mp4`;
    const sheetFileName = `candidate-${candidateId}-contact-sheet.png`;
    const videoPath = path.join(reviewerRoot, videoFileName);
    const contactSheetPath = path.join(reviewerRoot, sheetFileName);
    await Promise.all([
      copyFile(candidate.videoPath, videoPath),
      copyFile(candidate.contactSheetPath, contactSheetPath),
    ]);
    if (sha256(await readRegularFile(videoPath)) !== candidate.videoSha256
      || sha256(await readRegularFile(contactSheetPath)) !== candidate.contactSheetSha256) {
      fail(`COPIED_EVIDENCE_DRIFT:${candidateId}`);
    }
    publicCandidates.push({
      candidateId,
      videoFileName,
      videoSha256: candidate.videoSha256,
      contactSheetFileName: sheetFileName,
      contactSheetSha256: candidate.contactSheetSha256,
      renderedEvidenceDisposition: 'CAPTURED_UNJUDGED' as const,
    });
    mappings.push({
      candidateId,
      sourceCandidateId: candidate.sourceCandidateId,
      route: candidate.route,
      videoSha256: candidate.videoSha256,
      contactSheetSha256: candidate.contactSheetSha256,
      boundaryEvidence: candidate.boundaryEvidence,
      structuralEditabilityDisposition: candidate.structuralEditabilityDisposition,
    });
  }

  const publicUnsigned = {
    version: STAGE25_RHC01_BLIND_REVIEW_VERSION_V1,
    artifactType: 'Stage25Rhc01BlindReviewerManifestV1' as const,
    createdAt: input.createdAt,
    taskSha256: input.taskSha256,
    candidateSetHash: input.candidateSetHash,
    reviewStatus: 'AWAITING_ONE_QUALIFIED_HUMAN_REVIEW' as const,
    independentAgreement: 'UNAVAILABLE_SINGLE_REVIEWER' as const,
    identityDisposition: 'ROUTE_AND_IMPLEMENTATION_WITHHELD' as const,
    instruction: 'Watch each full video and inspect its contact sheet before scoring. Judge only the supplied target; do not infer route identity.',
    publicBrief: input.publicBrief,
    targetPredicates: input.targetPredicates,
    preservationPredicates: input.preservationPredicates,
    fixtureLimitation: 'SYNTHETIC_SILENT_MECHANICS_FIXTURE_NOT_PRODUCTION_AESTHETIC_OR_AUDIO_PROOF' as const,
    candidates: publicCandidates,
    rubric: {
      scale: {
        minimum: 1,
        maximum: 5,
        anchors: {
          1: 'materially_wrong_or_unusable',
          3: 'target_present_but_editor_correction_needed',
          5: 'target_faithful_and_editor_ready_for_this_fixture',
        },
      },
      scoredDimensions: [
        'ordered-label-reveal',
        'simultaneous-three-source-hold',
        'board-to-full-screen-continuity',
        'motion-and-layout-quality',
        'title-legibility',
        'overall-target-fidelity',
      ],
      operatorOnlyDimensions: [
        'independent-editability',
        'font-and-source-rights-binding',
        'project-mutation-safety',
      ],
      automaticFailureConditions: [
        'wrong-label-order',
        'no-simultaneous-three-source-state',
        'wrong-final-source',
        'missing-or-unplayable-video',
      ],
    },
    stateEffects: [{ kind: 'LOCAL_RESEARCH_REVIEW_PACK_WRITE' as const, root: reviewerRoot }],
  };
  const publicManifest = {
    ...publicUnsigned,
    publicPackHash: hashCanonicalJsonV1(publicUnsigned),
  };
  const reviewFormUnsigned = {
    version: STAGE25_RHC01_BLIND_REVIEW_VERSION_V1,
    artifactType: 'Stage25Rhc01BlindReviewFormV1' as const,
    publicPackHash: publicManifest.publicPackHash,
    reviewerId: null,
    completedAt: null,
    fullyWatchedCandidateIds: [] as string[],
    candidates: Object.fromEntries(publicCandidates.map(({ candidateId }) => [candidateId, {
      scores: {},
      automaticFailures: [],
      correctionMinutesEstimate: null,
      notes: '',
    }])),
    rankedCandidates: [] as string[],
    preferredCandidate: null,
    preferenceReason: '',
    stateEffects: [] as const,
  };
  const reviewForm = {
    ...reviewFormUnsigned,
    templateHash: hashCanonicalJsonV1(reviewFormUnsigned),
  };
  const operatorUnsigned = {
    version: STAGE25_RHC01_BLIND_REVIEW_VERSION_V1,
    artifactType: 'Stage25Rhc01BlindOperatorKeyV1' as const,
    publicPackHash: publicManifest.publicPackHash,
    randomizationCommitment: sha256(entropy),
    mappings,
    disclosurePolicy: 'DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL' as const,
    stateEffects: [{ kind: 'LOCAL_RESEARCH_OPERATOR_KEY_WRITE' as const, root: operatorRoot }],
  };
  const operatorKey = {
    ...operatorUnsigned,
    operatorKeyHash: hashCanonicalJsonV1(operatorUnsigned),
  };
  const reviewerManifestPath = path.join(reviewerRoot, 'manifest.json');
  const reviewFormPath = path.join(reviewerRoot, 'review-form-template.json');
  const operatorKeyPath = path.join(operatorRoot, 'candidate-key.json');
  await Promise.all([
    writeExclusiveJson(reviewerManifestPath, publicManifest),
    writeExclusiveJson(reviewFormPath, reviewForm),
    writeExclusiveJson(operatorKeyPath, operatorKey),
  ]);
  return Object.freeze({
    version: STAGE25_RHC01_BLIND_REVIEW_VERSION_V1,
    artifactType: 'Stage25Rhc01BlindReviewPackV1' as const,
    reviewStatus: publicManifest.reviewStatus,
    independentAgreement: publicManifest.independentAgreement,
    reviewerManifestPath,
    reviewFormPath,
    operatorKeyPath,
    publicPackHash: publicManifest.publicPackHash,
    operatorKeyHash: operatorKey.operatorKeyHash,
    stateEffects: [
      ...publicManifest.stateEffects,
      ...operatorKey.stateEffects,
    ],
  });
}

async function validateCandidate(value: Stage25Rhc01BlindCandidateV1): Promise<void> {
  if (!value.sourceCandidateId || !isSha256(value.videoSha256)
    || !isSha256(value.contactSheetSha256)) fail('CANDIDATE_IDENTITY_INVALID');
  const [video, sheet] = await Promise.all([
    readRegularFile(value.videoPath),
    readRegularFile(value.contactSheetPath),
  ]);
  if (path.extname(value.videoPath).toLowerCase() !== '.mp4'
    || path.extname(value.contactSheetPath).toLowerCase() !== '.png'
    || sha256(video) !== value.videoSha256 || sha256(sheet) !== value.contactSheetSha256) {
    fail(`CANDIDATE_EVIDENCE_INVALID:${value.sourceCandidateId}`);
  }
}

function deterministicShuffle<T>(values: T[], entropy: Uint8Array): T[] {
  const result = [...values];
  for (let index = result.length - 1, offset = 0; index > 0; index -= 1, offset += 1) {
    const swap = entropy[offset] % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
async function readRegularFile(filePath: string): Promise<Buffer> {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('FILE_INVALID');
  return readFile(filePath);
}
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
function safeNewDirectory(value: string): string {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) fail('OUTPUT_ROOT_UNSAFE');
  return root;
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function isSha256(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function fail(code: string): never { throw new Error(`STAGE25_RHC01_BLIND_REVIEW_${code}`); }
