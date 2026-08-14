import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { evaluateDev02GeneratedCompositionTemporalSafetyV1 } from '../lib/editron/research/open-ended-planner/generated-composition-temporal-safety-v1';

interface SurvivorReplayRow {
  sourceCandidateId: string;
  programHash: string;
  hostReceiptHash: string;
  originalProxyReceiptHash: string;
  videoSha256: string;
}
interface SurvivorReplayReceipt extends Record<string, unknown> {
  receiptHash: string;
  rows: SurvivorReplayRow[];
}
interface LocalEvidenceBinding {
  kind: string;
  localPath: string;
  contentSha256: string;
}
interface LocalEvidenceReceipt extends Record<string, unknown> {
  evidenceHash: string;
  bindings: LocalEvidenceBinding[];
}

const repoRoot = process.cwd();
const replayRoot = path.resolve(
  repoRoot,
  '.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/playable-replay-7242b1d14363b736',
);
const expectedCandidates = ['OPENAI_TERRA_CANDIDATE_0', 'GOOGLE_FLASH_CANDIDATE_1'] as const;

async function main(): Promise<void> {
  const replay = await readJson<SurvivorReplayReceipt>(path.join(replayRoot, 'replay-receipt.json'));
  verifyReceiptHash(replay, 'receiptHash', 'TEMPORAL_SCREEN_REPLAY_RECEIPT_HASH_DRIFT');
  if (replay.rows.length !== expectedCandidates.length
    || expectedCandidates.some((candidateId) => !replay.rows.some(({ sourceCandidateId }) => sourceCandidateId === candidateId))) {
    throw new Error('TEMPORAL_SCREEN_SURVIVOR_SET_DRIFT');
  }
  const observedAt = new Date().toISOString();
  const implementationHash = await shaFile(path.join(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-temporal-safety-v1.ts',
  ));
  const rows = [];
  for (const candidateId of expectedCandidates) {
    const row = replay.rows.find(({ sourceCandidateId }) => sourceCandidateId === candidateId);
    if (!row) throw new Error(`TEMPORAL_SCREEN_SURVIVOR_MISSING:${candidateId}`);
    const candidateRoot = path.join(replayRoot, candidateId.toLowerCase());
    const evidence = await readJson<LocalEvidenceReceipt>(path.join(candidateRoot, 'localized-evidence.json'));
    verifyReceiptHash(evidence, 'evidenceHash', `TEMPORAL_SCREEN_LOCAL_EVIDENCE_HASH_DRIFT:${candidateId}`);
    const playable = evidence.bindings.filter(({ kind }) => kind === 'PLAYABLE_PROXY');
    if (playable.length !== 1 || playable[0].contentSha256 !== row.videoSha256) {
      throw new Error(`TEMPORAL_SCREEN_PLAYABLE_BINDING_DRIFT:${candidateId}`);
    }
    const receipt = await evaluateDev02GeneratedCompositionTemporalSafetyV1({
      playableProxyPath: playable[0].localPath,
      playableProxySha256: row.videoSha256,
      programHash: row.programHash,
      hostReceiptHash: row.hostReceiptHash,
      proxyReceiptHash: row.originalProxyReceiptHash,
      observedAt,
    });
    await writeExclusiveJson(path.join(candidateRoot, 'temporal-safety.json'), receipt);
    rows.push({
      sourceCandidateId: candidateId,
      programHash: row.programHash,
      playableProxySha256: row.videoSha256,
      temporalSafetyReceiptHash: receipt.receiptHash,
      coverageDisposition: receipt.coverage.disposition,
      heuristicDisposition: receipt.heuristicDisposition,
      regulatoryDisposition: receipt.regulatoryDisposition,
      peakFrame: receipt.summary.peakFrame,
      peakBadness: receipt.summary.peakBadness,
      thresholdExceedanceFrames: receipt.summary.thresholdExceedanceFrames,
    });
  }
  const unsigned = {
    artifactType: 'GeneratedCompositionTemporalSafetyReplayReceiptV1' as const,
    authority: 'RESEARCH_HEURISTIC_NOT_REGULATORY_CERTIFICATION' as const,
    observedAt,
    sourceReplayReceiptHash: replay.receiptHash,
    implementationHash,
    rows,
    providerCalls: [] as const,
    stateEffects: [] as const,
  };
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const receiptPath = path.join(replayRoot, 'temporal-safety-receipt.json');
  await writeExclusiveJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({ receiptPath, receiptHash: receipt.receiptHash, rows, providerCalls: 0, stateEffects: [] })}\n`);
}

function verifyReceiptHash<T extends Record<string, unknown>>(value: T, hashField: keyof T, message: string): void {
  const expected = value[hashField];
  const unsigned = { ...value };
  delete unsigned[hashField];
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || expected !== hashCanonicalJsonV1(unsigned)) {
    throw new Error(message);
  }
}
async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await fs.readFile(filePath, 'utf8')) as T; }
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
async function shaFile(filePath: string): Promise<string> { return createHash('sha256').update(await fs.readFile(filePath)).digest('hex'); }

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
