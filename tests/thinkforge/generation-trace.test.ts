import { describe, expect, it } from 'vitest';
import {
  buildThinkForgeDocumentGenerationTrace,
  buildThinkForgeWriterInvocationTrace,
  hashThinkForgeTraceValue,
  ThinkForgeDocumentGenerationTraceV1Schema,
  ThinkForgeWriterInvocationTraceV1Schema,
} from '@/lib/thinkforge/provenance/generation-trace';

describe('ThinkForge writer invocation trace', () => {
  it('binds doctrine, prompt template, sources, provider, and repair evidence', () => {
    const trace = buildThinkForgeWriterInvocationTrace({
      writerType: 'script',
      editorialPlan: {
        runtime: { policy: 'exact', targetDurationSeconds: 420 },
        structure: { hierarchyPolicy: 'content_led' },
      },
      selectedTechniques: [
        { id: 'narration_complement', sourceLines: [800, 820] },
        { id: 'narration_complement', sourceLines: [800, 820] },
        { id: 'problem_agitate_solve', sourceLines: [1200, 1230] },
      ],
      promptTemplate: 'Trusted script writer template v1',
      sourceLedger: {
        ledgerVersion: 1,
        entries: [{
          referenceId: 'brief_user',
          kind: 'user_brief',
          title: 'User brief',
          summary: 'A seven-minute workflow documentary.',
          confidence: 1,
          provenance: { origin: 'user_prompt' },
        }],
      },
      provider: 'gemini',
      model: 'models/gemini-2.5-flash',
      cacheStatus: 'hit',
      repairFailureCodes: ['narration_density_below_mode:3/357'],
      repairCacheStatus: 'created',
      generatedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(ThinkForgeWriterInvocationTraceV1Schema.parse(trace)).toEqual(trace);
    expect(trace.selectedTechniqueIds).toEqual([
      'narration_complement',
      'problem_agitate_solve',
    ]);
    expect(trace.techniqueEvidence[0]).toEqual({
      id: 'narration_complement',
      sourceLines: [800, 820],
    });
    expect(trace.repair).toEqual({
      applied: true,
      failureCodes: ['narration_density_below_mode:3/357'],
      cacheStatus: 'created',
    });
    expect(trace.editorialPlanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(trace.promptTemplateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(trace.sourceLedgerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(trace.writingKnowledge.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes source and template hashes when their canonical evidence changes', () => {
    const base = {
      writerType: 'post' as const,
      editorialPlan: { ctaMode: 'none' },
      selectedTechniques: [{ id: 'open_loop', sourceLines: [50, 70] as [number, number] }],
      sourceLedger: {
        ledgerVersion: 1 as const,
        entries: [{
          referenceId: 'brief_user',
          kind: 'user_brief' as const,
          title: 'User brief',
          summary: 'Original fact.',
          confidence: 1,
          provenance: { origin: 'user_prompt' },
        }],
      },
      provider: 'gemini' as const,
      model: 'models/gemini-2.5-flash',
      cacheStatus: 'inline' as const,
      generatedAt: '2026-08-16T00:00:00.000Z',
    };
    const first = buildThinkForgeWriterInvocationTrace({
      ...base,
      promptTemplate: 'Post template A',
    });
    const second = buildThinkForgeWriterInvocationTrace({
      ...base,
      promptTemplate: 'Post template B',
      sourceLedger: {
        ...base.sourceLedger,
        entries: [{ ...base.sourceLedger.entries[0], summary: 'Changed fact.' }],
      },
    });

    expect(second.promptTemplateHash).not.toBe(first.promptTemplateHash);
    expect(second.sourceLedgerHash).not.toBe(first.sourceLedgerHash);
    expect(first.repair).toEqual({ applied: false, failureCodes: [] });
  });

  it('binds a saved document version to its writer, context, sources, output, and quality gate', () => {
    const sourceLedger = {
      ledgerVersion: 1 as const,
      entries: [{
        referenceId: 'brief_user',
        kind: 'user_brief' as const,
        title: 'User brief',
        summary: 'A seven-minute documentary.',
        confidence: 1,
        provenance: { origin: 'user_prompt' },
      }],
    };
    const writerTrace = buildThinkForgeWriterInvocationTrace({
      writerType: 'script',
      editorialPlan: { runtime: { targetDurationSeconds: 420 } },
      selectedTechniques: [{ id: 'narration_complement', sourceLines: [800, 820] }],
      promptTemplate: 'Trusted script writer template v1',
      sourceLedger,
      provider: 'gemini',
      model: 'models/gemini-2.5-flash',
      cacheStatus: 'hit',
      generatedAt: '2026-08-16T00:00:00.000Z',
    });
    const outputContent = 'A complete, source-grounded documentary script.';
    const trace = buildThinkForgeDocumentGenerationTrace({
      operation: { kind: 'create', id: 'generation_1' },
      document: {
        sessionId: 'session_1',
        scriptId: 'script_1',
        expectedVersion: 4,
        writerType: 'script',
      },
      writerTrace,
      authoringContextSnapshot: { brand: { brandId: 'brand_b', revision: 13 } },
      signalTrace: { selectedIntent: { outputFormat: 'video_script' } },
      productionBrief: { output: { platform: 'youtube' }, targetDurationSec: 420 },
      sourceLedger,
      outputContent,
      qualityGateEvidence: { score: 100, violationIds: [] },
    });

    expect(ThinkForgeDocumentGenerationTraceV1Schema.parse(trace)).toEqual(trace);
    expect(trace.document).toMatchObject({ expectedVersion: 4, writerType: 'script' });
    expect(trace.sourceLedgerHash).toBe(writerTrace.sourceLedgerHash);
    expect(trace.outputHash).toBe(hashThinkForgeTraceValue(outputContent));
    expect(trace.qualityGate.status).toBe('passed');

    expect(() => ThinkForgeDocumentGenerationTraceV1Schema.parse({
      ...trace,
      document: { ...trace.document, writerType: 'post' },
    })).toThrow(/writer type does not match/i);
  });
});
