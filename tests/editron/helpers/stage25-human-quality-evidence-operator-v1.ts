import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createBlindQualityReviewContractV1 }
  from '../../../lib/editron/research/open-ended-planner/blind-quality-review-receipt-v1';
import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { writeDurableExclusiveJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-filesystem-port-v1';
import { buildStage25HeldoutRoutePublicPacketV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-heldout-route-freeze-v1';
import {
  STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1,
  STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1,
  STAGE25_HUMAN_QUALITY_TASK_IDS_V1,
  finalizeStage25HumanQualityEvidenceV1,
  type Stage25HumanQualityTaskIdV1,
} from '../../../lib/editron/research/open-ended-planner/stage25-human-quality-evidence-v1';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const VITEST_CLI = require.resolve('vitest/vitest.mjs');
const SOURCE_SCOPES = ['lib/editron', 'tests/editron'] as const;
const CREATIVE_KNOWLEDGE_PATH = 'lib/editron/data/creative-knowledge-graph.json';
const CREATIVE_KNOWLEDGE_IDS = [
  'intent:principle.universal_override',
  'intent:authority.safe_zone_enforcement',
  'signal:audio.ambient_type',
  'mapping:visual.screen_direction_continuity',
  'mapping:caption.caption_position_adjustment',
  'technique:transition.hard_cut',
] as const;
const RHC01_ROOT = '.calibration-temp/open-ended-planner-v2/stage25-rhc01-preview/rhc01-preview-0dcbe01c4-v1';
const TECHNICAL_ROOTS: Record<Exclude<Stage25HumanQualityTaskIdV1, 'RHC-01'>, Readonly<{ root: string; receipt: string }>> = {
  'RHC-02': { root: '.calibration-temp/open-ended-planner-v2/stage25-rhc02-live-render-v1/rhc02-live-20260827151850544', receipt: 'rhc02-rendered-hybrid-proof-v1.json' },
  'RHC-03': { root: '.calibration-temp/open-ended-planner-v2/stage25-rhc03-live-render-v1/rhc03-live-20260827162629929', receipt: 'rhc03-rendered-hybrid-proof-v1.json' },
  'RHC-04': { root: '.calibration-temp/open-ended-planner-v2/stage25-rhc04-live-render-v1/rhc04-live-20260827171640225', receipt: 'rhc04-rendered-generated-proof-v1.json' },
};
type JsonRecord = Record<string, unknown>;

export async function runStage25HumanQualityEvidenceOperatorV1(input: Readonly<{
  workspaceRoot: string;
  artifactParent: string;
  executionSuffix?: string;
}>) {
  const source = await sourceIdentity(input.workspaceRoot);
  const suffix = input.executionSuffix ?? 'v1';
  if (!/^v[1-9][0-9]*$/.test(suffix)) fail('EXECUTION_SUFFIX_INVALID');
  const executionId = `stage25-human-quality-${source.commitSha.slice(0, 9)}-${suffix}`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await mkdir(input.artifactParent, { recursive: true });
  await mkdir(executionRoot);

  const ownerTests = await runOwnerTests(input.workspaceRoot, executionRoot);
  const creativeKnowledge = await readCreativeKnowledge(input.workspaceRoot);
  const taskOutputs = [];
  for (const taskId of STAGE25_HUMAN_QUALITY_TASK_IDS_V1) {
    taskOutputs.push(await materializeTask({ taskId, workspaceRoot: input.workspaceRoot, executionRoot }));
  }
  const reviewerPacketMaterial = {
    version: 'EDITRON_OE_STAGE25_HUMAN_REVIEWER_PACKET_V1' as const,
    artifactType: 'Stage25HumanReviewerPacketV1' as const,
    reviewStatus: 'AWAITING_QUALIFIED_HUMAN_SUBMISSIONS' as const,
    instruction: 'Review each task independently. Fully play every result at normal speed, inspect every declared static artifact, do not inspect route identities, and do not infer creative quality from technical receipts.',
    correctionInstruction: 'RHC-04 hands-on correction time may be reported only from a fresh isolated clone with the evidence required by BlindQualityReviewContractV1.',
    creativeKnowledge,
    tasks: taskOutputs.map(({ publicTask }) => publicTask),
    stateEffects: [{ kind: 'LOCAL_RESEARCH_REVIEW_PACKET_WRITE' as const, root: executionRoot }],
  };
  const reviewerPacket = {
    ...reviewerPacketMaterial,
    packetSha256: hashCanonicalJsonV1(reviewerPacketMaterial),
  };
  const contracts = {
    version: 'EDITRON_OE_STAGE25_HUMAN_REVIEW_CONTRACT_SET_V1' as const,
    artifactType: 'Stage25HumanReviewContractSetV1' as const,
    reviewerPacketSha256: reviewerPacket.packetSha256,
    contracts: taskOutputs.map(({ contract }) => contract),
    stateEffects: [] as const,
  };
  await Promise.all([
    writeDurableExclusiveJsonV1({ filePath: path.join(executionRoot, 'reviewer-packet.json'), value: reviewerPacket, forbiddenSecrets: [] }),
    writeDurableExclusiveJsonV1({ filePath: path.join(executionRoot, 'review-contracts.json'), value: contracts, forbiddenSecrets: [] }),
  ]);
  const receipt = finalizeStage25HumanQualityEvidenceV1({
    source, generatedAt: new Date().toISOString(), reviewerPacketSha256: reviewerPacket.packetSha256,
    ownerTests, tasks: taskOutputs.map(({ evidence }) => evidence),
  });
  const receiptPath = path.join(executionRoot, 'human-quality-evidence-receipt.json');
  await writeDurableExclusiveJsonV1({ filePath: receiptPath, value: receipt, forbiddenSecrets: [] });
  return {
    executionId, executionRoot, reviewerPacketPath: path.join(executionRoot, 'reviewer-packet.json'),
    contractsPath: path.join(executionRoot, 'review-contracts.json'), receiptPath,
    reviewerPacketSha256: reviewerPacket.packetSha256, receiptSha256: receipt.receiptSha256,
    assessment: receipt.assessment, qualifiedHumanReviewReceiptCount: 0,
  };
}

async function materializeTask(input: {
  taskId: Stage25HumanQualityTaskIdV1; workspaceRoot: string; executionRoot: string;
}) {
  const accepted = STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1[input.taskId];
  const packet = buildStage25HeldoutRoutePublicPacketV1({ taskId: input.taskId, arm: 'FREE_CHOICE' });
  const task = record(packet.task, 'FROZEN_TASK_INVALID');
  const taskSha256 = stringValue(task.taskSha256, 'FROZEN_TASK_HASH_INVALID');
  const taskRoot = path.join(input.executionRoot, 'reviewer', input.taskId);
  await mkdir(taskRoot, { recursive: true });

  const technical = input.taskId === 'RHC-01'
    ? await materializeRhc01(input.workspaceRoot, taskRoot)
    : await materializeTechnicalTask(input.taskId, input.workspaceRoot, taskRoot);
  const rubricDimensions = accepted.rubricDimensionIds.map((dimensionId) => ({
    dimensionId, requiredForPass: true,
  }));
  const publicTaskMaterial = {
    version: 'EDITRON_OE_STAGE25_HUMAN_REVIEW_PUBLIC_TASK_V1' as const,
    artifactType: 'Stage25HumanReviewPublicTaskV1' as const,
    taskId: input.taskId, taskSha256,
    reviewStatus: 'AWAITING_ONE_QUALIFIED_HUMAN_REVIEW' as const,
    identityDisposition: 'ROUTE_AND_IMPLEMENTATION_WITHHELD' as const,
    publicBrief: task.publicBrief,
    targetPredicates: task.targetPredicates,
    preservationPredicates: task.preservationPredicates,
    correctionTrial: task.correctionTrial,
    rubricDimensions,
    reviewerArtifacts: technical.reviewerArtifacts,
    sourcePublicPackHash: technical.sourcePublicPackHash,
  };
  const publicPackHash = technical.sourcePublicPackHash
    ?? hashCanonicalJsonV1(publicTaskMaterial);
  if (accepted.publicPackSha256 !== null && publicPackHash !== accepted.publicPackSha256) {
    fail(`PUBLIC_PACK_MISMATCH:${input.taskId}`);
  }
  const contract = createBlindQualityReviewContractV1({
    taskId: input.taskId, publicPackHash,
    rubricHash: hashCanonicalJsonV1(rubricDimensions), rubricDimensions,
    mediaBindings: accepted.mediaBindings, resultBindings: accepted.resultBindings,
  });
  return {
    publicTask: { ...publicTaskMaterial, publicPackHash, reviewContractHash: contract.contractHash },
    contract,
    evidence: {
      taskId: input.taskId, taskSha256,
      technicalReceipt: technical.technicalReceipt,
      publicPackHash, reviewContract: contract, humanReviewReceiptSha256: null,
      correctionDisposition: accepted.correctionDisposition,
      telemetry: {
        latencyDisposition: accepted.latencyDisposition,
        renderWallTimesMs: accepted.renderWallTimesMs,
        costDisposition: accepted.costDisposition, costUsd: null,
        sourceReceiptSha256: accepted.technicalReceiptSha256,
      },
    },
  };
}

async function materializeRhc01(workspaceRoot: string, taskRoot: string) {
  const root = path.resolve(workspaceRoot, RHC01_ROOT);
  const executionPath = path.join(root, 'execution-receipt.json');
  const execution = await readCanonicalReceipt(executionPath, 'receiptHash',
    STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1['RHC-01'].technicalReceiptSha256);
  const reviewerRoot = path.join(root, 'blind-review', 'reviewer');
  const manifestPath = path.join(reviewerRoot, 'manifest.json');
  const manifest = await readCanonicalReceipt(manifestPath, 'publicPackHash',
    STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1['RHC-01'].publicPackSha256 ?? fail('RHC01_PACK_MISSING'));
  if (record(execution.blindReview, 'RHC01_BLIND_REVIEW_INVALID').reviewStatus
      !== 'AWAITING_ONE_QUALIFIED_HUMAN_REVIEW'
    || execution.proof && record(execution.proof, 'RHC01_PROOF_INVALID').productExecution !== 'NOT_AUTHORIZED') {
    fail('RHC01_DISPOSITION_INVALID');
  }
  const mapping: Record<string, string> = {
    'candidate-A-contact-sheet': 'candidate-A-contact-sheet.png',
    'candidate-B-contact-sheet': 'candidate-B-contact-sheet.png',
    'candidate-C-contact-sheet': 'candidate-C-contact-sheet.png',
    'candidate-A-video': 'candidate-A.mp4', 'candidate-B-video': 'candidate-B.mp4',
    'candidate-C-video': 'candidate-C.mp4',
  };
  const reviewerArtifacts = [];
  for (const binding of [...STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1['RHC-01'].mediaBindings,
    ...STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1['RHC-01'].resultBindings]) {
    const fileName = mapping[binding.artifactId] ?? fail('RHC01_ARTIFACT_MAPPING_MISSING');
    await copyVerified(path.join(reviewerRoot, fileName), path.join(taskRoot, fileName), binding.sha256);
    reviewerArtifacts.push({ ...binding, fileName });
  }
  await copyVerified(manifestPath, path.join(taskRoot, 'source-manifest.json'), sha(await readFile(manifestPath)));
  return {
    sourcePublicPackHash: String(manifest.publicPackHash), reviewerArtifacts,
    technicalReceipt: {
      receiptSha256: String(execution.receiptHash), receiptFileSha256: sha(await readFile(executionPath)),
      assessment: 'THREE_RENDERED_RESEARCH_PREVIEWS_CAPTURED_UNJUDGED', humanQuality: 'UNJUDGED' as const,
    },
  };
}

async function materializeTechnicalTask(taskId: Exclude<Stage25HumanQualityTaskIdV1, 'RHC-01'>, workspaceRoot: string, taskRoot: string) {
  const spec = TECHNICAL_ROOTS[taskId];
  const root = path.resolve(workspaceRoot, spec.root);
  const receiptPath = path.join(root, spec.receipt);
  const accepted = STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1[taskId];
  const receipt = await readCanonicalReceipt(receiptPath, 'receiptSha256', accepted.technicalReceiptSha256);
  if (receipt.assessment !== accepted.technicalAssessment || receipt.humanQuality !== 'UNJUDGED'
    || receipt.providerModelInference !== 'NONE' || receipt.stage25Completion !== 'NOT_CLAIMED') {
    fail(`TECHNICAL_DISPOSITION_INVALID:${taskId}`);
  }
  const localArtifacts = array(receipt.localEvidenceArtifacts, 'LOCAL_ARTIFACTS_INVALID')
    .map((value) => record(value, 'LOCAL_ARTIFACT_INVALID'));
  const reviewerArtifacts = [];
  for (const binding of [...accepted.mediaBindings, ...accepted.resultBindings]) {
    const artifact = localArtifacts.find(({ sha256 }) => sha256 === binding.sha256)
      ?? fail(`REVIEW_ARTIFACT_MISSING:${taskId}:${binding.artifactId}`);
    const relativePath = stringValue(artifact.relativePath, 'ARTIFACT_PATH_INVALID');
    const sourcePath = path.resolve(root, relativePath);
    if (!sourcePath.startsWith(`${root}${path.sep}`)) fail('ARTIFACT_PATH_UNSAFE');
    const extension = path.extname(relativePath).toLowerCase();
    const fileName = `${binding.artifactId}${extension}`;
    await copyVerified(sourcePath, path.join(taskRoot, fileName), binding.sha256);
    reviewerArtifacts.push({ ...binding, fileName });
  }
  return {
    sourcePublicPackHash: null, reviewerArtifacts,
    technicalReceipt: {
      receiptSha256: String(receipt.receiptSha256), receiptFileSha256: sha(await readFile(receiptPath)),
      assessment: String(receipt.assessment), humanQuality: 'UNJUDGED' as const,
    },
  };
}

async function readCreativeKnowledge(workspaceRoot: string) {
  const filePath = path.resolve(workspaceRoot, CREATIVE_KNOWLEDGE_PATH);
  const bytes = await readFile(filePath);
  const text = bytes.toString('utf8');
  if (CREATIVE_KNOWLEDGE_IDS.some((id) => !text.includes(`"id": "${id}"`))) {
    fail('CREATIVE_KNOWLEDGE_ID_MISSING');
  }
  return { sourcePath: CREATIVE_KNOWLEDGE_PATH, sourceFileSha256: sha(bytes), selectedConstraintIds: [...CREATIVE_KNOWLEDGE_IDS] };
}

async function runOwnerTests(workspaceRoot: string, executionRoot: string) {
  const reportPath = path.join(executionRoot, 'vitest-report.json');
  await execFileAsync(process.execPath, [VITEST_CLI, 'run', ...STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1, '--reporter=json', `--outputFile=${reportPath}`], {
    cwd: workspaceRoot, windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  const bytes = await readFile(reportPath);
  const report = record(JSON.parse(bytes.toString('utf8')), 'TEST_REPORT_INVALID');
  if (report.success !== true || report.numFailedTests !== 0
    || report.numPassedTests !== report.numTotalTests || !Number.isSafeInteger(report.numPassedTests)) fail('OWNER_TESTS_FAILED');
  return { reportSha256: sha(bytes), testFiles: [...STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1], passedTestCount: Number(report.numPassedTests), failedTestCount: 0 as const };
}

async function sourceIdentity(workspaceRoot: string) {
  const commitSha = await git(workspaceRoot, ['rev-parse', 'HEAD']);
  const treeSha = await git(workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const relevantStatusEntries = lines(await git(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...SOURCE_SCOPES]));
  const tracked = lines(await git(workspaceRoot, ['ls-files', '-s', '--', ...SOURCE_SCOPES]));
  if (!tracked.length) fail('SOURCE_SCOPE_EMPTY');
  return { commitSha, treeSha, relevantScopeSha256: hashCanonicalJsonV1(tracked), relevantTrackedFileCount: tracked.length, relevantStatusEntries };
}

async function readCanonicalReceipt(filePath: string, hashField: string, expectedHash: string) {
  const bytes = await readFile(filePath);
  const value = record(JSON.parse(bytes.toString('utf8')), 'JSON_INVALID');
  if (value[hashField] !== expectedHash) fail('CANONICAL_HASH_MISMATCH');
  const unsigned = structuredClone(value); delete unsigned[hashField];
  if (hashCanonicalJsonV1(unsigned) !== expectedHash) fail('CANONICAL_RECEIPT_INVALID');
  return value;
}
async function copyVerified(source: string, destination: string, expectedHash: string) {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) fail('SOURCE_ARTIFACT_INVALID');
  if (sha(await readFile(source)) !== expectedHash) fail('SOURCE_ARTIFACT_HASH_MISMATCH');
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  if (sha(await readFile(destination)) !== expectedHash) fail('COPIED_ARTIFACT_HASH_MISMATCH');
}
async function git(root: string, args: readonly string[]) {
  const result = await execFileAsync('git', [...args], { cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: 12 * 1024 * 1024 });
  return result.stdout.trim();
}
function sha(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function lines(value: string) { return value ? value.split(/\r?\n/).filter(Boolean) : []; }
function stringValue(value: unknown, code: string) { if (typeof value !== 'string' || !value) fail(code); return value; }
function record(value: unknown, code: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as JsonRecord; }
function array(value: unknown, code: string): unknown[] { if (!Array.isArray(value)) fail(code); return value; }
function fail(code: string): never { throw new Error(`STAGE25_HUMAN_QUALITY_OPERATOR_${code}`); }

async function main() {
  const [artifactParent, suffix] = process.argv.slice(2);
  if (!artifactParent) fail('USAGE_INVALID');
  const result = await runStage25HumanQualityEvidenceOperatorV1({
    workspaceRoot: process.cwd(), artifactParent,
    ...(suffix ? { executionSuffix: suffix } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
