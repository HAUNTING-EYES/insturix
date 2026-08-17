import { describe, expect, it } from 'vitest';
import {
  buildThinkForgeDocumentGenerationTrace,
  buildThinkForgeWriterInvocationTrace,
} from '@/lib/thinkforge/provenance/generation-trace';
import { buildThinkForgeGenerationReceipt } from '@/lib/thinkforge/provenance/generation-receipt';
import { diagnoseThinkForgeDocumentEvidence } from '@/lib/thinkforge/operations/operational-diagnostics';

function createEvidence() {
  const snapshot = {
    version: 3,
    resolvedAt: '2026-08-17T00:00:00.000Z',
    scope: { kind: 'personal', brandId: 'brand_b' },
    brand: {
      brandId: 'brand_b',
      recordId: 'profile_b_13',
      profileUpdatedAt: '2026-08-17T00:00:00.000Z',
      profileFingerprint: 'a'.repeat(64),
    },
    retrieval: {
      projectFactIds: ['fact_project_b'],
      globalFactIds: ['fact_global_b'],
      interactionPatternTypes: ['short-paragraphs'],
      diagnostics: { version: 1 },
    },
    writingKnowledgeVersion: 'knowledge-v9',
  };
  const signalTrace = { profile: 'brand_b' };
  const briefSnapshot = { targetDurationSec: 420 };
  const sourceLedger = {
    ledgerVersion: 1 as const,
    entries: [{
      referenceId: 'brief_user',
      kind: 'user_brief' as const,
      title: 'User brief',
      summary: 'The user requested a complete saved script.',
      confidence: 1,
      provenance: { origin: 'user_request' },
    }],
  };
  const profileCompliance = { status: 'passed' };
  const content = 'A complete saved script.';
  const writerTrace = buildThinkForgeWriterInvocationTrace({
    writerType: 'script',
    editorialPlan: { version: 2, writerKind: 'script' },
    selectedTechniques: [],
    promptTemplate: 'writer prompt',
    sourceLedger,
    provider: 'gemini',
    model: 'gemini-private',
    cacheStatus: 'hit',
    generatedAt: '2026-08-17T00:00:00.000Z',
  });
  const generationTrace = buildThinkForgeDocumentGenerationTrace({
    operation: { kind: 'create', id: 'generation_1' },
    document: {
      sessionId: 'session_b',
      scriptId: 'script_b',
      expectedVersion: 1,
      writerType: 'script',
    },
    writerTrace,
    authoringContextSnapshot: snapshot,
    signalTrace,
    productionBrief: briefSnapshot,
    sourceLedger,
    outputContent: content,
    qualityGateEvidence: profileCompliance,
  });
  const metadata = {
    authoringContextSnapshot: snapshot,
    signalTrace,
    briefSnapshot,
    writerOutput: {
      generationTrace,
      sourceLedger,
      profileCompliance,
    },
  };
  const generationReceipt = buildThinkForgeGenerationReceipt({
    userId: 'user_b',
    sessionId: 'session_b',
    scriptId: 'script_b',
    documentVersion: 1,
    outputContent: content,
    metadata,
    persistedAt: new Date('2026-08-17T00:01:00.000Z'),
  });
  return {
    snapshot,
    signalTrace,
    briefSnapshot,
    sourceLedger,
    profileCompliance,
    content,
    generationTrace,
    metadata,
    generationReceipt,
  };
}

describe('ThinkForge operational document diagnostics', () => {
  it('proves the bound brand, fact IDs, provider, and immutable trace hashes without returning content', () => {
    const evidence = createEvidence();
    const diagnostics = diagnoseThinkForgeDocumentEvidence({
      sessionId: 'session_b',
      scriptId: 'script_b',
      session: {
        projectMeta: { brandBinding: { version: 2, brandId: 'brand_b', scope: 'personal' } },
        activeGeneration: {
          id: 'generation_1',
          type: 'script_generate',
          status: 'completed',
          updatedAt: new Date('2026-08-17T00:01:00.000Z'),
          billing: { status: 'settled', transactionId: 'private-transaction' },
        },
      },
      script: {
        version: 1,
        documentType: 'script',
        contentContract: { outputKind: 'video_script' },
        content: evidence.content,
        metadata: evidence.metadata,
      },
      generationReceipt: evidence.generationReceipt,
    });

    expect(diagnostics.traceIntegrity).toEqual({ valid: true, codes: [] });
    expect(diagnostics.generationReceipt).toMatchObject({
      id: expect.stringMatching(/^tfgr_/),
      valid: true,
      codes: [],
    });
    expect(diagnostics.authoringContext).toMatchObject({
      brand: { brandId: 'brand_b', recordId: 'profile_b_13' },
      projectFactIds: ['fact_project_b'],
      globalFactIds: ['fact_global_b'],
      writingKnowledgeVersion: 'knowledge-v9',
    });
    expect(diagnostics.writer).toMatchObject({ provider: 'gemini', model: 'gemini-private' });
    expect(JSON.stringify(diagnostics)).not.toContain(evidence.content);
    expect(JSON.stringify(diagnostics)).not.toContain('private-transaction');
  });

  it('fails trace integrity when the session brand or persisted evidence changes', () => {
    const evidence = createEvidence();
    const diagnostics = diagnoseThinkForgeDocumentEvidence({
      sessionId: 'session_b',
      scriptId: 'script_b',
      session: { projectMeta: { brandBinding: { version: 2, brandId: 'brand_a' } } },
      script: {
        version: 2,
        documentType: 'script',
        contentContract: { outputKind: 'video_script' },
        content: 'Tampered output',
        metadata: {
          authoringContextSnapshot: evidence.snapshot,
          signalTrace: evidence.signalTrace,
          briefSnapshot: evidence.briefSnapshot,
          writerOutput: {
            generationTrace: evidence.generationTrace,
            sourceLedger: evidence.sourceLedger,
            profileCompliance: evidence.profileCompliance,
          },
        },
      },
      generationReceipt: evidence.generationReceipt,
    });

    expect(diagnostics.traceIntegrity.valid).toBe(false);
    expect(diagnostics.traceIntegrity.codes).toEqual(expect.arrayContaining([
      'brand_binding_snapshot_mismatch',
      'document_version_trace_mismatch',
      'generation_receipt_document_mismatch',
      'output_hash_mismatch',
    ]));
  });

  it('fails closed when a traced document has no immutable generation receipt', () => {
    const evidence = createEvidence();
    const diagnostics = diagnoseThinkForgeDocumentEvidence({
      sessionId: 'session_b',
      scriptId: 'script_b',
      session: { projectMeta: { brandBinding: { version: 2, brandId: 'brand_b' } } },
      script: {
        version: 1,
        documentType: 'script',
        contentContract: { outputKind: 'video_script' },
        content: evidence.content,
        metadata: evidence.metadata,
      },
      generationReceipt: null,
    });

    expect(diagnostics.generationReceipt).toBeNull();
    expect(diagnostics.traceIntegrity).toEqual({
      valid: false,
      codes: ['generation_receipt_missing'],
    });
  });

  it('reports a tampered immutable receipt independently of document trace parsing', () => {
    const evidence = createEvidence();
    const diagnostics = diagnoseThinkForgeDocumentEvidence({
      sessionId: 'session_b',
      scriptId: 'script_b',
      session: { projectMeta: { brandBinding: { version: 2, brandId: 'brand_b' } } },
      script: {
        version: 1,
        documentType: 'script',
        contentContract: { outputKind: 'video_script' },
        content: evidence.content,
        metadata: evidence.metadata,
      },
      generationReceipt: {
        ...evidence.generationReceipt,
        receiptHash: '0'.repeat(64),
      },
    });

    expect(diagnostics.generationReceipt).toMatchObject({
      valid: false,
      codes: ['generation_receipt_invalid'],
    });
    expect(diagnostics.traceIntegrity.codes).toContain('generation_receipt_invalid');
  });
});
