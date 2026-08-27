import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { writeDurableExclusiveJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-filesystem-port-v1';
import { STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-audit-v1';
import {
  STAGE25_FROZEN_DECISION_EVIDENCE_V1,
  STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1,
  assertStage25FrozenDecisionReceiptV1,
  finalizeStage25FrozenDecisionV1,
  type Stage25FrozenDecisionEvidenceIdV1,
} from '../../../lib/editron/research/open-ended-planner/stage25-frozen-decision-v1';
import { assertStage25HumanQualityEvidenceReceiptV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-human-quality-evidence-v1';
import { assertReferenceHoldout01ReviewReceiptV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-reference-review-receipt-v2r';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const VITEST_CLI = require.resolve('vitest/vitest.mjs');
const SOURCE_SCOPES = ['lib/editron', 'tests/editron'] as const;
const PAID_AUDIT_SOURCE =
  'lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-audit-v1.ts';
const EVIDENCE_FILES: Record<Exclude<Stage25FrozenDecisionEvidenceIdV1, 'FINAL_PAID_COHORT_AUDIT'>, Readonly<{
  relativePath: string;
  hashField: 'receiptHash' | 'receiptSha256';
}>> = {
  HREF01_REFERENCE_REVIEW: {
    relativePath: '.calibration-temp/open-ended-planner-v2/provider-native-href01-review-pack-20260822/reviewer/qualified-review-receipt.json',
    hashField: 'receiptSha256',
  },
  CORRECTED_ZERO_INFERENCE_GATE: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-final-generalisation-provider-preflight/stage25-final-provider-preflight-601beb86d-v2/readiness-receipt.json',
    hashField: 'receiptSha256',
  },
  RHC01_TECHNICAL_RENDER: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-rhc01-preview/rhc01-preview-0dcbe01c4-v1/execution-receipt.json',
    hashField: 'receiptHash',
  },
  RHC02_TECHNICAL_RENDER: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-rhc02-live-render-v1/rhc02-live-20260827151850544/rhc02-rendered-hybrid-proof-v1.json',
    hashField: 'receiptSha256',
  },
  RHC03_TECHNICAL_RENDER: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-rhc03-live-render-v1/rhc03-live-20260827162629929/rhc03-rendered-hybrid-proof-v1.json',
    hashField: 'receiptSha256',
  },
  RHC04_TECHNICAL_RENDER: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-rhc04-live-render-v1/rhc04-live-20260827171640225/rhc04-rendered-generated-proof-v1.json',
    hashField: 'receiptSha256',
  },
  PROJECTSERVICE_CONFLICT_LOCK_REBASE: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-project-service-conflict-product-v1/conflict-mongo-20260827175112063/receipt.json',
    hashField: 'receiptSha256',
  },
  RESUME_ZERO_SPEND_GATE: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-resume-zero-spend-current/stage25-resume-zero-spend-10f5640a4-v1/readiness-receipt.json',
    hashField: 'receiptSha256',
  },
  LONG_FORM_PRODUCT_EVIDENCE: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-long-form-product-evidence/stage25-long-form-product-56723463a-v1/readiness-receipt.json',
    hashField: 'receiptSha256',
  },
  HUMAN_QUALITY_EVIDENCE: {
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-human-quality-evidence/stage25-human-quality-6071c0857-v1/human-quality-evidence-receipt.json',
    hashField: 'receiptSha256',
  },
};
type JsonRecord = Record<string, unknown>;

export async function runStage25FrozenDecisionOperatorV1(input: Readonly<{
  workspaceRoot: string;
  artifactParent: string;
  executionSuffix?: string;
}>) {
  const source = await sourceIdentity(input.workspaceRoot);
  const suffix = input.executionSuffix ?? 'v1';
  if (!/^v[1-9][0-9]*$/.test(suffix)) fail('EXECUTION_SUFFIX_INVALID');
  const executionId = `stage25-frozen-decision-${source.commitSha.slice(0, 9)}-${suffix}`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await mkdir(input.artifactParent, { recursive: true });
  await mkdir(executionRoot);

  const ownerTests = await runOwnerTests(input.workspaceRoot, executionRoot);
  const evidence = [];
  for (const expected of STAGE25_FROZEN_DECISION_EVIDENCE_V1) {
    if (expected.evidenceId === 'FINAL_PAID_COHORT_AUDIT') {
      const bytes = await readFile(path.resolve(input.workspaceRoot, PAID_AUDIT_SOURCE));
      validateAudit();
      evidence.push({ ...expected, canonicalSha256: STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1.auditSha256, fileSha256: sha(bytes) });
      continue;
    }
    const spec = EVIDENCE_FILES[expected.evidenceId];
    const filePath = path.resolve(input.workspaceRoot, spec.relativePath);
    const { bytes, value } = await readCanonical(filePath, spec.hashField, expected.canonicalSha256);
    validateDisposition(expected.evidenceId, value);
    evidence.push({ ...expected, fileSha256: sha(bytes) });
  }
  const receipt = finalizeStage25FrozenDecisionV1({
    source, generatedAt: new Date().toISOString(), ownerTests, evidence,
    successorWholeEpisode: {
      disposition: 'NOT_RUN_NOT_AUTHORIZED_AND_NOT_DECISION_CRITICAL',
      providerInferenceCalls: 0, providerSpendUsd: 0,
    },
  });
  assertStage25FrozenDecisionReceiptV1(receipt);
  const receiptPath = path.join(executionRoot, 'stage25-frozen-decision-receipt.json');
  await writeDurableExclusiveJsonV1({ filePath: receiptPath, value: receipt, forbiddenSecrets: [] });
  return {
    executionId, executionRoot, receiptPath, receiptSha256: receipt.receiptSha256,
    decision: receipt.decision, stage25Status: receipt.stage25Status,
    stage3ProductionModelDrivenMutation: receipt.stage3ProductionModelDrivenMutation,
    successorWholeEpisode: receipt.successorWholeEpisode.disposition,
  };
}

function validateAudit() {
  const audit = STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1;
  const unsigned = structuredClone(audit) as JsonRecord;
  delete unsigned.auditSha256;
  if (hashCanonicalJsonV1(unsigned) !== audit.auditSha256
    || audit.auditedClassification.validStructuralRows.length !== 7
    || audit.auditedClassification.validOwnerSupportedSafeStopRows.length !== 9
    || audit.auditedClassification.genuineModelOrTaskFailureRows.length !== 2
    || audit.auditedClassification.confoundedRows.length !== 5
    || audit.auditedClassification.providerResourceNonEvaluationRows.length !== 1
    || audit.aggregateUsePolicy.paidRerunAuthorized) fail('PAID_AUDIT_INVALID');
}

function validateDisposition(evidenceId: Exclude<Stage25FrozenDecisionEvidenceIdV1, 'FINAL_PAID_COHORT_AUDIT'>, value: JsonRecord) {
  if (evidenceId === 'HREF01_REFERENCE_REVIEW') {
    assertReferenceHoldout01ReviewReceiptV2R(value);
    if (value.overallDecision !== 'PASS'
      || value.independentAgreement !== 'UNVERIFIABLE_SINGLE_REVIEWER'
      || value.formalPromotionStatus !== 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER') fail('HREF_DISPOSITION_INVALID');
  } else if (evidenceId === 'CORRECTED_ZERO_INFERENCE_GATE') {
    if (value.readiness !== 'READY_FOR_EXPLICIT_CAPPED_24_ROW_PAID_AUTHORIZATION_NOT_INFERENCE'
      || value.paidProviderDispatchAuthorized !== false || value.providerInferenceCallCount !== 0) fail('PREFLIGHT_DISPOSITION_INVALID');
  } else if (evidenceId === 'RHC01_TECHNICAL_RENDER') {
    if (record(value.blindReview, 'RHC01_REVIEW_INVALID').reviewStatus !== 'AWAITING_ONE_QUALIFIED_HUMAN_REVIEW'
      || record(value.proof, 'RHC01_PROOF_INVALID').productExecution !== 'NOT_AUTHORIZED') fail('RHC01_DISPOSITION_INVALID');
  } else if (['RHC02_TECHNICAL_RENDER', 'RHC03_TECHNICAL_RENDER', 'RHC04_TECHNICAL_RENDER'].includes(evidenceId)) {
    if (value.humanQuality !== 'UNJUDGED' || value.stage25Completion !== 'NOT_CLAIMED'
      || value.providerModelInference !== 'NONE') fail('RHC_DISPOSITION_INVALID');
  } else if (evidenceId === 'PROJECTSERVICE_CONFLICT_LOCK_REBASE') {
    if (value.assessment !== 'PASS_BOUNDED_REAL_MONGODB_PROJECTSERVICE_CONFLICT_LOCK_REBASE'
      || record(value.cleanup, 'CONFLICT_CLEANUP_INVALID').disposition !== 'DELETED_AND_VERIFIED_ABSENT') fail('CONFLICT_DISPOSITION_INVALID');
  } else if (evidenceId === 'RESUME_ZERO_SPEND_GATE') {
    if (value.assessment !== 'PASS_ZERO_SPEND_EXECUTABLE_RESUME_GATE'
      || value.paidResumeDisposition !== 'NOT_AUTHORIZED' || value.paidProviderDispatchCount !== 0) fail('RESUME_DISPOSITION_INVALID');
  } else if (evidenceId === 'LONG_FORM_PRODUCT_EVIDENCE') {
    if (value.assessment !== 'MODIFY_LONG_FORM_PRODUCT_EVIDENCE_INCOMPLETE'
      || value.providerInferenceCalls !== 0 || value.canonicalProjectMutations !== 0) fail('LONG_FORM_DISPOSITION_INVALID');
  } else if (evidenceId === 'HUMAN_QUALITY_EVIDENCE') {
    assertStage25HumanQualityEvidenceReceiptV1(value);
    if (value.qualifiedHumanReviewReceiptCount !== 0) fail('HUMAN_DISPOSITION_INVALID');
  }
}

async function readCanonical(filePath: string, hashField: string, expectedHash: string) {
  const bytes = await readFile(filePath);
  const value = record(JSON.parse(bytes.toString('utf8')), 'JSON_INVALID');
  if (value[hashField] !== expectedHash) fail('CANONICAL_HASH_MISMATCH');
  const unsigned = structuredClone(value); delete unsigned[hashField];
  if (hashCanonicalJsonV1(unsigned) !== expectedHash) fail('CANONICAL_RECEIPT_INVALID');
  return { bytes, value };
}

async function runOwnerTests(workspaceRoot: string, executionRoot: string) {
  const reportPath = path.join(executionRoot, 'vitest-report.json');
  await execFileAsync(process.execPath, [VITEST_CLI, 'run', ...STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1, '--reporter=json', `--outputFile=${reportPath}`], {
    cwd: workspaceRoot, windowsHide: true, timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
  });
  const bytes = await readFile(reportPath);
  const report = record(JSON.parse(bytes.toString('utf8')), 'TEST_REPORT_INVALID');
  if (report.success !== true || report.numFailedTests !== 0
    || report.numPassedTests !== report.numTotalTests || !Number.isSafeInteger(report.numPassedTests)) fail('OWNER_TESTS_FAILED');
  return { reportSha256: sha(bytes), testFiles: [...STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1], passedTestCount: Number(report.numPassedTests), failedTestCount: 0 as const };
}

async function sourceIdentity(workspaceRoot: string) {
  const commitSha = await git(workspaceRoot, ['rev-parse', 'HEAD']);
  const treeSha = await git(workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const relevantStatusEntries = lines(await git(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...SOURCE_SCOPES]));
  const tracked = lines(await git(workspaceRoot, ['ls-files', '-s', '--', ...SOURCE_SCOPES]));
  if (!tracked.length) fail('SOURCE_SCOPE_EMPTY');
  return { commitSha, treeSha, relevantScopeSha256: hashCanonicalJsonV1(tracked), relevantTrackedFileCount: tracked.length, relevantStatusEntries };
}
async function git(root: string, args: readonly string[]) {
  const result = await execFileAsync('git', [...args], { cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: 12 * 1024 * 1024 });
  return result.stdout.trim();
}
function sha(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function lines(value: string) { return value ? value.split(/\r?\n/).filter(Boolean) : []; }
function record(value: unknown, code: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as JsonRecord; }
function fail(code: string): never { throw new Error(`STAGE25_FROZEN_DECISION_OPERATOR_${code}`); }

async function main() {
  const [artifactParent, suffix] = process.argv.slice(2);
  if (!artifactParent) fail('USAGE_INVALID');
  const result = await runStage25FrozenDecisionOperatorV1({
    workspaceRoot: process.cwd(), artifactParent,
    ...(suffix ? { executionSuffix: suffix } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
