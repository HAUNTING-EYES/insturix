import { execFileSync } from 'node:child_process';
import {
  ThinkForgeWriterInvocationTraceV1Schema,
  hashThinkForgeTraceValue,
  type ThinkForgeWriterInvocationTraceV1,
} from '../../lib/thinkforge/provenance/generation-trace';

export const THINKFORGE_WRITER_PROMOTION_EVIDENCE_VERSION = 1;
export const THINKFORGE_WRITER_PROMOTION_RECEIPT_VERSION = 1;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40,64}$/;

export interface WriterPromotionRepositoryState {
  commitSha: string;
  treeSha: string;
  branch: string;
  clean: boolean;
  dirtyEntryCount: number;
}

export interface WriterPromotionEvidenceRun {
  caseId: number;
  runId: number;
  outputFingerprint: string;
  writerPath: 'post' | 'script';
  deterministicScore: number;
  editorialQualityScore: number;
  error?: string;
  judge?: unknown;
  judgeError?: string;
  writerTrace?: unknown;
}

interface WriterPromotionTraceSummary {
  missing: number;
  invalid: number;
  writerTypeMismatches: number;
  traceSetHash: string;
  promptTemplateHashes: Array<{ writerType: 'post' | 'script'; hash: string }>;
  writerModels: Array<{ provider: string; model: string }>;
  writingKnowledge: ThinkForgeWriterInvocationTraceV1['writingKnowledge'] | null;
  mixedWritingKnowledge: boolean;
}

export interface ThinkForgeWriterPromotionEvidenceV1 {
  version: number;
  repositoryBefore: WriterPromotionRepositoryState;
  repositoryAfter: WriterPromotionRepositoryState;
  corpusHash: string;
  corpusCaseIds: number[];
  judge: { provider: string; model: string };
  providerBudgetHash: string;
  runSetHash: string;
  traceSetHash: string;
  promptTemplateHashes: Array<{ writerType: 'post' | 'script'; hash: string }>;
  writerModels: Array<{ provider: string; model: string }>;
  writingKnowledge: ThinkForgeWriterInvocationTraceV1['writingKnowledge'] | null;
  evidenceHash: string;
}

export interface ThinkForgeWriterPromotionReceiptV1<TVerdict = unknown> {
  version: number;
  issuedAt: string;
  evidence: ThinkForgeWriterPromotionEvidenceV1;
  verdict: TVerdict;
  receiptHash: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function readWriterPromotionRepositoryState(
  cwd = process.cwd(),
): WriterPromotionRepositoryState {
  const status = git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']);
  const dirtyEntryCount = status ? status.split(/\r?\n/).filter(Boolean).length : 0;
  const branch = git(cwd, ['branch', '--show-current']);
  return {
    commitSha: git(cwd, ['rev-parse', '--verify', 'HEAD']),
    treeSha: git(cwd, ['rev-parse', 'HEAD^{tree}']),
    branch: branch || '(detached)',
    clean: dirtyEntryCount === 0,
    dirtyEntryCount,
  };
}

function canonicalRuns(runs: readonly WriterPromotionEvidenceRun[]) {
  return [...runs]
    .sort((left, right) => left.caseId - right.caseId || left.runId - right.runId)
    .map((run) => ({
      caseId: run.caseId,
      runId: run.runId,
      outputFingerprint: run.outputFingerprint,
      writerPath: run.writerPath,
      deterministicScore: run.deterministicScore,
      editorialQualityScore: run.editorialQualityScore,
      error: run.error ?? null,
      judge: run.judge ?? null,
      judgeError: run.judgeError ?? null,
      writerTrace: run.writerTrace ?? null,
    }));
}

function summarizeTraces(runs: readonly WriterPromotionEvidenceRun[]): WriterPromotionTraceSummary {
  let missing = 0;
  let invalid = 0;
  let writerTypeMismatches = 0;
  const traces: Array<{ caseId: number; runId: number; trace: ThinkForgeWriterInvocationTraceV1 }> = [];

  for (const run of runs) {
    if (run.writerTrace === undefined) {
      missing += 1;
      continue;
    }
    const parsed = ThinkForgeWriterInvocationTraceV1Schema.safeParse(run.writerTrace);
    if (!parsed.success) {
      invalid += 1;
      continue;
    }
    if (parsed.data.writerType !== run.writerPath) writerTypeMismatches += 1;
    traces.push({ caseId: run.caseId, runId: run.runId, trace: parsed.data });
  }

  traces.sort((left, right) => left.caseId - right.caseId || left.runId - right.runId);
  const promptTemplateHashes = [...new Map(traces.map(({ trace }) => [
    `${trace.writerType}:${trace.promptTemplateHash}`,
    { writerType: trace.writerType, hash: trace.promptTemplateHash },
  ])).values()].sort((left, right) => (
    left.writerType.localeCompare(right.writerType) || left.hash.localeCompare(right.hash)
  ));
  const writerModels = [...new Map(traces.map(({ trace }) => [
    `${trace.provider.provider}:${trace.provider.model}`,
    { provider: trace.provider.provider, model: trace.provider.model },
  ])).values()].sort((left, right) => (
    left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)
  ));
  const writingKnowledgeByHash = new Map(traces.map(({ trace }) => [
    hashThinkForgeTraceValue(trace.writingKnowledge),
    trace.writingKnowledge,
  ]));

  return {
    missing,
    invalid,
    writerTypeMismatches,
    traceSetHash: hashThinkForgeTraceValue(traces),
    promptTemplateHashes,
    writerModels,
    writingKnowledge: writingKnowledgeByHash.size === 1
      ? [...writingKnowledgeByHash.values()][0] ?? null
      : null,
    mixedWritingKnowledge: writingKnowledgeByHash.size > 1,
  };
}

function withoutEvidenceHash(
  evidence: ThinkForgeWriterPromotionEvidenceV1,
): Omit<ThinkForgeWriterPromotionEvidenceV1, 'evidenceHash'> {
  const { evidenceHash: _evidenceHash, ...rest } = evidence;
  return rest;
}

export function createWriterPromotionEvidence(input: {
  repositoryBefore: WriterPromotionRepositoryState;
  repositoryAfter: WriterPromotionRepositoryState;
  corpus: unknown;
  corpusCaseIds: readonly number[];
  judge: { provider: string; model: string };
  providerBudgetSnapshot: unknown;
  runs: readonly WriterPromotionEvidenceRun[];
}): ThinkForgeWriterPromotionEvidenceV1 {
  const summary = summarizeTraces(input.runs);
  const evidenceWithoutHash = {
    version: THINKFORGE_WRITER_PROMOTION_EVIDENCE_VERSION,
    repositoryBefore: input.repositoryBefore,
    repositoryAfter: input.repositoryAfter,
    corpusHash: hashThinkForgeTraceValue(input.corpus),
    corpusCaseIds: [...new Set(input.corpusCaseIds)].sort((left, right) => left - right),
    judge: input.judge,
    providerBudgetHash: hashThinkForgeTraceValue(input.providerBudgetSnapshot),
    runSetHash: hashThinkForgeTraceValue(canonicalRuns(input.runs)),
    traceSetHash: summary.traceSetHash,
    promptTemplateHashes: summary.promptTemplateHashes,
    writerModels: summary.writerModels,
    writingKnowledge: summary.writingKnowledge,
  };
  return {
    ...evidenceWithoutHash,
    evidenceHash: hashThinkForgeTraceValue(evidenceWithoutHash),
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return hashThinkForgeTraceValue(left) === hashThinkForgeTraceValue(right);
}

export function isIndependentWriterPromotionJudge(
  judge: { provider: string; model: string },
): boolean {
  const provider = judge.provider.trim().toLowerCase();
  const model = judge.model.trim().toLowerCase();
  return provider.length > 0
    && model.length > 0
    && provider !== 'gemini'
    && !model.includes('gemini');
}

export function validateWriterPromotionEvidence(
  runs: readonly WriterPromotionEvidenceRun[],
  evidence?: ThinkForgeWriterPromotionEvidenceV1,
): string[] {
  if (!evidence) return ['missing_promotion_evidence'];
  const failures: string[] = [];
  const summary = summarizeTraces(runs);
  const runCaseIds = [...new Set(runs.map((run) => run.caseId))].sort((left, right) => left - right);

  if (evidence.version !== THINKFORGE_WRITER_PROMOTION_EVIDENCE_VERSION) failures.push('promotion_evidence_version');
  if (!evidence.repositoryBefore.clean || !evidence.repositoryAfter.clean) failures.push('promotion_repository_dirty');
  if (evidence.repositoryBefore.dirtyEntryCount !== 0 || evidence.repositoryAfter.dirtyEntryCount !== 0) {
    failures.push('promotion_repository_dirty_count');
  }
  if (!GIT_OBJECT_PATTERN.test(evidence.repositoryBefore.commitSha)
    || !GIT_OBJECT_PATTERN.test(evidence.repositoryBefore.treeSha)) failures.push('promotion_repository_identity');
  if (!evidence.repositoryBefore.branch.trim()) failures.push('promotion_repository_branch');
  if (!sameValue(evidence.repositoryBefore, evidence.repositoryAfter)) failures.push('promotion_repository_changed');
  if (!SHA256_PATTERN.test(evidence.corpusHash)) failures.push('promotion_corpus_hash');
  if (!sameValue(evidence.corpusCaseIds, runCaseIds)) failures.push('promotion_corpus_case_set');
  if (!evidence.judge.provider.trim() || !evidence.judge.model.trim()) failures.push('promotion_judge_identity');
  if (!isIndependentWriterPromotionJudge(evidence.judge)) failures.push('promotion_judge_not_independent');
  if (!SHA256_PATTERN.test(evidence.providerBudgetHash)) failures.push('promotion_budget_hash');
  if (evidence.runSetHash !== hashThinkForgeTraceValue(canonicalRuns(runs))) failures.push('promotion_run_set_hash');
  if (summary.missing > 0) failures.push(`promotion_writer_traces_missing:${summary.missing}`);
  if (summary.invalid > 0) failures.push(`promotion_writer_traces_invalid:${summary.invalid}`);
  if (summary.writerTypeMismatches > 0) {
    failures.push(`promotion_writer_trace_type_mismatches:${summary.writerTypeMismatches}`);
  }
  if (summary.mixedWritingKnowledge) failures.push('promotion_writing_knowledge_mixed');
  if (!summary.writingKnowledge || !sameValue(evidence.writingKnowledge, summary.writingKnowledge)) {
    failures.push('promotion_writing_knowledge_identity');
  }
  if (evidence.traceSetHash !== summary.traceSetHash) failures.push('promotion_trace_set_hash');
  if (!sameValue(evidence.promptTemplateHashes, summary.promptTemplateHashes)) failures.push('promotion_prompt_hashes');
  if (!sameValue(evidence.writerModels, summary.writerModels)) failures.push('promotion_writer_models');
  if (evidence.evidenceHash !== hashThinkForgeTraceValue(withoutEvidenceHash(evidence))) {
    failures.push('promotion_evidence_hash');
  }
  return failures;
}

export function createWriterPromotionReceipt<TVerdict extends { passed: boolean }>(input: {
  evidence: ThinkForgeWriterPromotionEvidenceV1;
  runs: readonly WriterPromotionEvidenceRun[];
  verdict: TVerdict;
  issuedAt?: string;
}): ThinkForgeWriterPromotionReceiptV1<TVerdict> {
  if (!input.verdict.passed) throw new Error('A failed writer gate cannot issue a promotion receipt');
  const evidenceFailures = validateWriterPromotionEvidence(input.runs, input.evidence);
  if (evidenceFailures.length > 0) {
    throw new Error(`Writer promotion evidence is invalid: ${evidenceFailures.join(', ')}`);
  }
  const receiptWithoutHash = {
    version: THINKFORGE_WRITER_PROMOTION_RECEIPT_VERSION,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    evidence: input.evidence,
    verdict: input.verdict,
  };
  return {
    ...receiptWithoutHash,
    receiptHash: hashThinkForgeTraceValue(receiptWithoutHash),
  };
}
