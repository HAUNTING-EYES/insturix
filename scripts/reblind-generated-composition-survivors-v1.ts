import { promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildGeneratedCompositionBlindReviewPackV1,
  type GeneratedCompositionBlindReviewCandidateV1,
} from '../lib/editron/research/open-ended-planner/generated-composition-blind-review-v1';

interface ReplayRow {
  sourceCandidateId: string;
  modelIdentity: string;
  programHash: string;
  hostReceiptHash: string;
  proofHash: string;
  videoSha256: string;
}
interface ReplayReceipt extends Record<string, unknown> {
  receiptHash: string;
  rows: ReplayRow[];
  blindReview: { publicPackHash: string };
}
interface LocalEvidence extends Record<string, unknown> {
  evidenceHash: string;
  bindings: { kind: string; localPath: string; contentSha256: string }[];
}

const repoRoot = process.cwd();
const replayRoot = path.resolve(
  repoRoot,
  '.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/playable-replay-7242b1d14363b736',
);

async function main(): Promise<void> {
  const replay = await readJson<ReplayReceipt>(path.join(replayRoot, 'replay-receipt.json'));
  verifyHash(replay, 'receiptHash', 'REBLIND_REPLAY_RECEIPT_HASH_DRIFT');
  if (replay.rows.length !== 2) throw new Error('REBLIND_SURVIVOR_COUNT_DRIFT');
  const candidates: GeneratedCompositionBlindReviewCandidateV1[] = [];
  for (const row of replay.rows) {
    const candidateRoot = path.join(replayRoot, row.sourceCandidateId.toLowerCase());
    const evidence = await readJson<LocalEvidence>(path.join(candidateRoot, 'localized-evidence.json'));
    verifyHash(evidence, 'evidenceHash', `REBLIND_LOCAL_EVIDENCE_HASH_DRIFT:${row.sourceCandidateId}`);
    const playable = evidence.bindings.filter(({ kind }) => kind === 'PLAYABLE_PROXY');
    if (playable.length !== 1 || playable[0].contentSha256 !== row.videoSha256) {
      throw new Error(`REBLIND_PLAYABLE_BINDING_DRIFT:${row.sourceCandidateId}`);
    }
    candidates.push({
      sourceCandidateId: row.sourceCandidateId, modelIdentity: row.modelIdentity,
      programHash: row.programHash, hostReceiptHash: row.hostReceiptHash, proofHash: row.proofHash,
      videoPath: playable[0].localPath, videoSha256: row.videoSha256,
    });
  }
  if (candidates.length !== 2) throw new Error('REBLIND_CANDIDATE_SET_DRIFT');
  const createdAt = new Date().toISOString();
  const pack = await buildGeneratedCompositionBlindReviewPackV1({
    outputRoot: path.join(replayRoot, 'blind-review-v2'), createdAt,
    candidates: [candidates[0], candidates[1]],
  });
  const unsigned = {
    artifactType: 'GeneratedCompositionBlindReviewReplacementReceiptV1' as const,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_CALL_NO_PROJECT_MUTATION' as const,
    createdAt,
    sourceReplayReceiptHash: replay.receiptHash,
    supersededPublicPackHash: replay.blindReview.publicPackHash,
    replacementPublicPackHash: pack.publicPackHash,
    replacementOperatorKeyHash: pack.operatorKeyHash,
    correction: 'PUBLIC_REVIEW_COPY_HASH_NO_LONGER_EQUALS_SOURCE_VIDEO_HASH' as const,
    reviewerManifestPath: pack.reviewerManifestPath,
    reviewFormTemplatePath: pack.reviewFormTemplatePath,
    reviewerIsolationRequired: true,
    providerCalls: [] as const,
    stateEffects: [] as const,
  };
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const receiptPath = path.join(replayRoot, 'blind-review-v2-replacement-receipt.json');
  await writeExclusiveJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({
    receiptPath, receiptHash: receipt.receiptHash, publicPackHash: pack.publicPackHash,
    reviewStatus: pack.reviewStatus, reviewerIsolationRequired: true, providerCalls: 0, stateEffects: [],
  })}\n`);
}

function verifyHash<T extends Record<string, unknown>>(value: T, field: keyof T, message: string): void {
  const expected = value[field]; const unsigned = { ...value }; delete unsigned[field];
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || expected !== hashCanonicalJsonV1(unsigned)) throw new Error(message);
}
async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await fs.readFile(filePath, 'utf8')) as T; }
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
