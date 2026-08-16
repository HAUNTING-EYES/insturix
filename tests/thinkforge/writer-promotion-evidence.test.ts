import { describe, expect, it } from 'vitest';
import { buildThinkForgeWriterInvocationTrace } from '../../lib/thinkforge/provenance/generation-trace';
import {
  createWriterPromotionEvidence,
  createWriterPromotionReceipt,
  isIndependentWriterPromotionJudge,
  validateWriterPromotionEvidence,
  type WriterPromotionEvidenceRun,
  type WriterPromotionRepositoryState,
} from '../../scripts/prompt-optimization/thinkforge-writer-promotion-evidence';

const CLEAN_REPOSITORY: WriterPromotionRepositoryState = {
  commitSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  branch: '(detached)',
  clean: true,
  dirtyEntryCount: 0,
};

function writerTrace(writerType: 'post' | 'script' = 'post') {
  return buildThinkForgeWriterInvocationTrace({
    writerType,
    editorialPlan: { kind: `${writerType}-plan` },
    selectedTechniques: [],
    promptTemplate: `${writerType} writer prompt`,
    provider: 'gemini',
    model: 'gemini-test',
    cacheStatus: 'inline',
    generatedAt: '2026-08-16T00:00:00.000Z',
  });
}

function run(overrides: Partial<WriterPromotionEvidenceRun> = {}): WriterPromotionEvidenceRun {
  return {
    caseId: 9,
    runId: 1,
    outputFingerprint: 'output-9-1',
    writerPath: 'post',
    deterministicScore: 0.96,
    editorialQualityScore: 0.96,
    writerTrace: writerTrace(),
    judge: { overall: 96 },
    ...overrides,
  };
}

function evidence(runs: WriterPromotionEvidenceRun[]) {
  return createWriterPromotionEvidence({
    repositoryBefore: CLEAN_REPOSITORY,
    repositoryAfter: CLEAN_REPOSITORY,
    corpus: { version: 1, cases: [{ id: 9 }] },
    corpusCaseIds: [...new Set(runs.map((item) => item.caseId))],
    judge: { provider: 'deepseek', model: 'deepseek-chat' },
    providerBudgetSnapshot: { providerRequests: runs.length * 2, usd: 1 },
    runs,
  });
}

describe('ThinkForge writer promotion evidence', () => {
  it('validates bound evidence and issues a tamper-evident receipt only for a passing verdict', () => {
    const runs = [run()];
    const boundEvidence = evidence(runs);

    expect(validateWriterPromotionEvidence(runs, boundEvidence)).toEqual([]);
    expect(boundEvidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const receipt = createWriterPromotionReceipt({
      evidence: boundEvidence,
      runs,
      verdict: { passed: true, promotionScore: 96 },
      issuedAt: '2026-08-16T01:00:00.000Z',
    });
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.evidence).toBe(boundEvidence);
  });

  it('rejects a score or output mutation after evidence was created', () => {
    const runs = [run()];
    const boundEvidence = evidence(runs);
    const mutated = [{ ...runs[0]!, deterministicScore: 1 }];

    expect(validateWriterPromotionEvidence(mutated, boundEvidence)).toContain('promotion_run_set_hash');
  });

  it('rejects missing and writer-type-mismatched invocation traces', () => {
    const missingTraceRuns = [run({ writerTrace: undefined })];
    const mismatchedRuns = [run({ writerTrace: writerTrace('script') })];

    expect(validateWriterPromotionEvidence(missingTraceRuns, evidence(missingTraceRuns))).toEqual(
      expect.arrayContaining([
        'promotion_writer_traces_missing:1',
        'promotion_writing_knowledge_identity',
      ]),
    );
    expect(validateWriterPromotionEvidence(mismatchedRuns, evidence(mismatchedRuns))).toContain(
      'promotion_writer_trace_type_mismatches:1',
    );
  });

  it('rejects mixed writing-knowledge identities across the run set', () => {
    const first = run();
    const secondTrace = writerTrace();
    secondTrace.writingKnowledge.contentHash = 'c'.repeat(64);
    const runs = [
      first,
      run({ caseId: 10, runId: 1, outputFingerprint: 'output-10-1', writerTrace: secondTrace }),
    ];

    expect(validateWriterPromotionEvidence(runs, evidence(runs))).toEqual(
      expect.arrayContaining([
        'promotion_writing_knowledge_mixed',
        'promotion_writing_knowledge_identity',
      ]),
    );
  });

  it('rejects dirty or changed repository state and a coupled Gemini judge', () => {
    const runs = [run()];
    const boundEvidence = createWriterPromotionEvidence({
      repositoryBefore: { ...CLEAN_REPOSITORY, clean: false, dirtyEntryCount: 1 },
      repositoryAfter: { ...CLEAN_REPOSITORY, commitSha: 'd'.repeat(40) },
      corpus: { version: 1, cases: [{ id: 9 }] },
      corpusCaseIds: [9],
      judge: { provider: 'gemini', model: 'gemini-test' },
      providerBudgetSnapshot: { providerRequests: 2 },
      runs,
    });

    expect(validateWriterPromotionEvidence(runs, boundEvidence)).toEqual(
      expect.arrayContaining([
        'promotion_repository_dirty',
        'promotion_repository_dirty_count',
        'promotion_repository_changed',
        'promotion_judge_not_independent',
      ]),
    );
  });

  it('rejects Gemini identity hidden behind casing or an OpenRouter model name', () => {
    expect(isIndependentWriterPromotionJudge({
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
    })).toBe(false);
    expect(isIndependentWriterPromotionJudge({
      provider: 'openrouter',
      model: 'google/gemini-2.5-pro',
    })).toBe(false);
    expect(isIndependentWriterPromotionJudge({
      provider: 'deepseek',
      model: 'deepseek-chat',
    })).toBe(true);
  });

  it('does not issue a promotion receipt for a failed verdict', () => {
    expect(() => createWriterPromotionReceipt({
      evidence: evidence([run()]),
      runs: [run()],
      verdict: { passed: false },
    })).toThrow('A failed writer gate cannot issue a promotion receipt');
  });

  it('does not issue a receipt when runs changed after a passing verdict', () => {
    const runs = [run()];
    const boundEvidence = evidence(runs);

    expect(() => createWriterPromotionReceipt({
      evidence: boundEvidence,
      runs: [{ ...runs[0]!, editorialQualityScore: 0.5 }],
      verdict: { passed: true },
    })).toThrow('Writer promotion evidence is invalid: promotion_run_set_hash');
  });
});
