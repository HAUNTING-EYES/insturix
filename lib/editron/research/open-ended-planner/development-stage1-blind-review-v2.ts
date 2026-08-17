import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants, createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEVELOPMENT_COHORT_TASK_IDS_V2,
  type DevelopmentCohortReceiptV2,
  type DevelopmentCohortTaskIdV2,
} from './development-cohort-runner-v2';
import {
  validateProviderStageArtifactV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

export const DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2 =
  'EDITRON_OE_DEVELOPMENT_STAGE1_BLIND_REVIEW_V2' as const;

type JsonRecord = Record<string, unknown>;

export interface DevelopmentStage1BlindReviewPackV2 {
  schemaVersion: typeof DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2;
  createdAt: string;
  reviewStatus: 'AWAITING_TWO_INDEPENDENT_HUMAN_REVIEWS';
  reviewerManifestPath: string;
  reviewFormTemplatePath: string;
  operatorKeyPath: string;
  publicPackHash: string;
  operatorKeyHash: string;
  stateEffects: readonly [];
}

interface Candidate {
  taskId: DevelopmentCohortTaskIdV2;
  sourceCandidateId: string;
  routeId: string;
  modelIdentity: string;
  packetHash: string;
  artifact: Readonly<JsonRecord>;
  artifactHash: string;
}

export async function buildDevelopmentStage1BlindReviewPackV2(input: {
  outputRoot: string;
  createdAt: string;
  cohortReceipt: Readonly<DevelopmentCohortReceiptV2>;
  stageOnePackets: readonly HashedStagePacketV2[];
  randomSource?: (size: number) => Uint8Array;
}): Promise<Readonly<DevelopmentStage1BlindReviewPackV2>> {
  if (new Date(input.createdAt).toISOString() !== input.createdAt) {
    throw new Error('DEVELOPMENT_STAGE1_REVIEW_TIMESTAMP_INVALID');
  }
  validateReceipt(input.cohortReceipt);
  const packets = validatePackets(input.cohortReceipt, input.stageOnePackets);
  const { candidatesByTask, unavailable } = collectCandidates(input.cohortReceipt, packets);
  const entropy = Buffer.from((input.randomSource ?? randomBytes)(32));
  if (entropy.byteLength !== 32) throw new Error('DEVELOPMENT_STAGE1_REVIEW_RANDOM_SOURCE_INVALID');

  const outputRoot = path.resolve(input.outputRoot);
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  await fs.mkdir(outputRoot);
  const reviewerRoot = path.join(outputRoot, 'reviewer');
  const operatorRoot = path.join(outputRoot, 'operator-only');
  await Promise.all([fs.mkdir(reviewerRoot), fs.mkdir(operatorRoot)]);

  const publicTasks = [];
  const operatorMappings = [];
  for (const taskId of DEVELOPMENT_COHORT_TASK_IDS_V2) {
    const packet = requiredPacket(packets, taskId);
    const taskRoot = path.join(reviewerRoot, taskId.toLowerCase());
    const candidateRoot = path.join(taskRoot, 'candidates');
    const inputRoot = path.join(taskRoot, 'input');
    await fs.mkdir(taskRoot);
    await Promise.all([fs.mkdir(candidateRoot), fs.mkdir(inputRoot)]);
    const referenceFiles = await copyReferenceFiles(packet, inputRoot);
    const context = {
      schemaVersion: DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2,
      artifactType: 'DevelopmentStage1ReviewerTaskContextV2' as const,
      taskId,
      instruction: 'Judge each candidate only against this request/evidence and the referenced media. Do not infer provider identity.',
      inputArm: packet.packet.inputArm,
      modelInput: packet.packet.modelInput,
      referenceFiles,
    };
    const contextPath = path.join(taskRoot, 'task-context.json');
    await writeExclusiveJson(contextPath, context);

    const ordered = deterministicShuffle(requiredCandidates(candidatesByTask, taskId), entropyForTask(entropy, taskId));
    const publicCandidates = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index];
      const candidateId = alias(index);
      const fileName = `${candidateId}.json`;
      const candidatePath = path.join(candidateRoot, fileName);
      await writeExclusiveJson(candidatePath, candidate.artifact);
      publicCandidates.push({ candidateId, fileName: `candidates/${fileName}`, artifactHash: candidate.artifactHash });
      operatorMappings.push({
        taskId, candidateId, sourceCandidateId: candidate.sourceCandidateId,
        routeId: candidate.routeId, modelIdentity: candidate.modelIdentity,
        packetHash: candidate.packetHash, artifactHash: candidate.artifactHash,
      });
    }
    publicTasks.push({
      taskId,
      contextFile: `${taskId.toLowerCase()}/task-context.json`,
      contextHash: hashCanonicalJsonV1(context),
      candidates: publicCandidates,
      unavailableCandidateCount: unavailable.filter((entry) => entry.taskId === taskId).length,
    });
  }

  const publicUnsigned = {
    schemaVersion: DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2,
    artifactType: 'DevelopmentStage1ReviewerManifestV2' as const,
    createdAt: input.createdAt,
    reviewStatus: 'AWAITING_TWO_INDEPENDENT_HUMAN_REVIEWS' as const,
    requiredIndependentReviewerCount: 2,
    identityDisposition: 'MODEL_PROVIDER_AND_SOURCE_ROW_WITHHELD' as const,
    operatorKeyAccess: 'FORBIDDEN_UNTIL_BOTH_REVIEW_FORMS_ARE_FINAL' as const,
    tasks: publicTasks,
    rubric: {
      scale: { minimum: 1, maximum: 5, anchors: { 1: 'materially_wrong_or_unusable', 3: 'useful_but_requires_editor_correction', 5: 'accurate_and_editor_ready_target_reconstruction' } },
      dimensions: ['observable-target-fidelity', 'important-detail-coverage', 'temporal-and-audiovisual-understanding', 'uncertainty-honesty', 'preservation-awareness', 'editorial-usefulness'],
      requiredPerCandidateFields: ['scores', 'blockingErrors', 'correctionMinutesEstimate', 'notes'],
      requiredPerTaskFields: ['rankedCandidates', 'preferredCandidate', 'preferenceReason', 'confidence'],
    },
    stateEffects: [] as const,
  };
  const publicManifest = { ...publicUnsigned, publicPackHash: hashCanonicalJsonV1(publicUnsigned) };
  const reviewFormUnsigned = {
    schemaVersion: DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2,
    artifactType: 'DevelopmentStage1ReviewFormV2' as const,
    publicPackHash: publicManifest.publicPackHash,
    reviewerId: null,
    completedAt: null,
    independenceConfirmed: false,
    tasks: Object.fromEntries(publicTasks.map((task) => [task.taskId, {
      inputAndReferencesInspected: false,
      candidates: Object.fromEntries(task.candidates.map((candidate) => [candidate.candidateId, {
        fullyInspected: false, scores: {}, blockingErrors: [], correctionMinutesEstimate: null, notes: '',
      }])),
      comparison: { rankedCandidates: [], preferredCandidate: null, preferenceReason: '', confidence: null },
    }])),
    stateEffects: [] as const,
  };
  const reviewForm = { ...reviewFormUnsigned, templateHash: hashCanonicalJsonV1(reviewFormUnsigned) };
  const operatorUnsigned = {
    schemaVersion: DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2,
    artifactType: 'DevelopmentStage1OperatorKeyV2' as const,
    publicPackHash: publicManifest.publicPackHash,
    sourceCohortReceiptHash: input.cohortReceipt.receiptHash,
    randomizationCommitment: sha256(entropy),
    mappings: operatorMappings,
    unavailable,
    disclosurePolicy: 'DO_NOT_OPEN_UNTIL_BOTH_REVIEW_FORMS_ARE_FINAL' as const,
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
    schemaVersion: DEVELOPMENT_STAGE1_BLIND_REVIEW_VERSION_V2,
    createdAt: input.createdAt,
    reviewStatus: 'AWAITING_TWO_INDEPENDENT_HUMAN_REVIEWS' as const,
    reviewerManifestPath, reviewFormTemplatePath, operatorKeyPath,
    publicPackHash: publicManifest.publicPackHash,
    operatorKeyHash: operatorKey.operatorKeyHash,
    stateEffects: [] as const,
  });
}

function validateReceipt(receipt: Readonly<DevelopmentCohortReceiptV2>): void {
  const material = structuredClone(receipt) as unknown as JsonRecord;
  const receiptHash = text(material.receiptHash);
  delete material.receiptHash;
  if (receipt.receiptVersion !== 'EDITRON_OE_DEVELOPMENT_COHORT_RECEIPT_V2'
    || receipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receipt.handoffMode !== 'ISOLATED_COMPETENCY_WITH_EVALUATOR_APPROVED_CANONICAL_PRIOR'
    || receipt.stage7Disposition !== 'PENDING_REAL_HUMAN_REVIEW'
    || receipt.stateEffects.length || hashCanonicalJsonV1(material) !== receiptHash) {
    throw new Error('DEVELOPMENT_STAGE1_REVIEW_COHORT_RECEIPT_INVALID');
  }
}

function validatePackets(receipt: Readonly<DevelopmentCohortReceiptV2>, values: readonly HashedStagePacketV2[]): Map<string, HashedStagePacketV2> {
  const packets = new Map(values.map((packet) => [packet.packet.taskId, packet]));
  if (packets.size !== DEVELOPMENT_COHORT_TASK_IDS_V2.length) throw new Error('DEVELOPMENT_STAGE1_REVIEW_PACKET_SET_INVALID');
  for (const taskId of DEVELOPMENT_COHORT_TASK_IDS_V2) {
    const packet = requiredPacket(packets, taskId);
    const task = receipt.tasks.find((entry) => entry.taskId === taskId);
    const binding = task?.packetHashes.find(({ stage }) => stage === 1);
    if (packet.packet.stage !== 1 || packet.packet.conditionId !== 'BASELINE'
      || packet.packetHash !== hashCanonicalJsonV1(packet.packet)
      || packet.transportHash !== hashCanonicalJsonV1(packet.transportAttachments)
      || binding?.packetHash !== packet.packetHash || binding.transportHash !== packet.transportHash) {
      throw new Error(`DEVELOPMENT_STAGE1_REVIEW_PACKET_INVALID:${taskId}`);
    }
  }
  return packets;
}

function collectCandidates(receipt: Readonly<DevelopmentCohortReceiptV2>, packets: Map<string, HashedStagePacketV2>) {
  const candidatesByTask = new Map<DevelopmentCohortTaskIdV2, Candidate[]>();
  const unavailable: Array<{ taskId: DevelopmentCohortTaskIdV2; routeId: string; modelIdentity: string; transportDisposition: string }> = [];
  for (const route of receipt.routes) for (const taskId of DEVELOPMENT_COHORT_TASK_IDS_V2) {
    const rows = route.rows.filter((row) => row.taskId === taskId && row.stage === 1);
    if (rows.length !== 1) throw new Error(`DEVELOPMENT_STAGE1_REVIEW_ROW_CARDINALITY:${route.routeId}/${taskId}`);
    const row = rows[0];
    if (row.transportDisposition !== 'ARTIFACT_ACCEPTED' || !row.providerRun.artifact) {
      unavailable.push({ taskId, routeId: route.routeId, modelIdentity: route.claimedModelIdentity, transportDisposition: row.transportDisposition });
      continue;
    }
    const packet = requiredPacket(packets, taskId);
    if (row.packetHash !== packet.packetHash || row.providerRun.packetHash !== packet.packetHash
      || row.evaluation.disposition !== 'HUMAN_REVIEW_REQUIRED'
      || validateProviderStageArtifactV2(packet, row.providerRun.artifact).length) {
      throw new Error(`DEVELOPMENT_STAGE1_REVIEW_ACCEPTED_ROW_INVALID:${route.routeId}/${taskId}`);
    }
    const candidate: Candidate = {
      taskId, sourceCandidateId: `${route.routeId}/${taskId}/STAGE-1`,
      routeId: route.routeId, modelIdentity: route.claimedModelIdentity,
      packetHash: row.packetHash, artifact: row.providerRun.artifact,
      artifactHash: hashCanonicalJsonV1(row.providerRun.artifact),
    };
    candidatesByTask.set(taskId, [...(candidatesByTask.get(taskId) ?? []), candidate]);
  }
  return { candidatesByTask, unavailable };
}

async function copyReferenceFiles(packet: HashedStagePacketV2, inputRoot: string) {
  const result = [];
  for (let index = 0; index < packet.transportAttachments.length; index += 1) {
    const attachment = packet.transportAttachments[index];
    const source = path.resolve(attachment.artifactPath);
    const stat = await fs.lstat(source);
    const expectedSha256 = normalizeSha256(attachment.artifactSha256);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== attachment.bytes
      || await sha256File(source) !== expectedSha256) {
      throw new Error(`DEVELOPMENT_STAGE1_REVIEW_REFERENCE_INVALID:${attachment.assetId}`);
    }
    const fileName = `reference-${String(index + 1).padStart(2, '0')}${path.extname(source).toLowerCase()}`;
    const destination = path.join(inputRoot, fileName);
    await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    result.push({ fileName: `input/${fileName}`, sha256: expectedSha256, bytes: attachment.bytes, evidenceRole: attachment.evidenceRole ?? null, timestampMilliseconds: attachment.timestampMilliseconds ?? null });
  }
  return result;
}

function requiredPacket(packets: Map<string, HashedStagePacketV2>, taskId: string): HashedStagePacketV2 {
  const packet = packets.get(taskId);
  if (!packet) throw new Error(`DEVELOPMENT_STAGE1_REVIEW_PACKET_MISSING:${taskId}`);
  return packet;
}
function requiredCandidates(values: Map<DevelopmentCohortTaskIdV2, Candidate[]>, taskId: DevelopmentCohortTaskIdV2): Candidate[] {
  const candidates = values.get(taskId) ?? [];
  if (candidates.length < 2) throw new Error(`DEVELOPMENT_STAGE1_REVIEW_CANDIDATES_INSUFFICIENT:${taskId}`);
  return candidates;
}
function deterministicShuffle<T>(values: readonly T[], entropy: Buffer): T[] { const result = [...values]; for (let index = result.length - 1, byte = 0; index > 0; index -= 1, byte += 1) { const swap = entropy[byte] % (index + 1); [result[index], result[swap]] = [result[swap], result[index]]; } return result; }
function entropyForTask(entropy: Buffer, taskId: string): Buffer { return createHash('sha256').update(entropy).update(taskId).digest(); }
function alias(index: number): string { if (index < 0 || index >= 26) throw new Error('DEVELOPMENT_STAGE1_REVIEW_ALIAS_EXHAUSTED'); return `candidate-${String.fromCharCode(97 + index)}`; }
function normalizeSha256(value: string): string { const digest = value.startsWith('sha256:') ? value.slice(7) : value; if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('DEVELOPMENT_STAGE1_REVIEW_REFERENCE_HASH_INVALID'); return digest; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
async function sha256File(filePath: string): Promise<string> { const hash = createHash('sha256'); await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); }); return hash.digest('hex'); }
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
