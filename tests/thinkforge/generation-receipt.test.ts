import { describe, expect, it } from 'vitest';
import {
  buildThinkForgeDocumentGenerationTrace,
  buildThinkForgeWriterInvocationTrace,
} from '@/lib/thinkforge/provenance/generation-trace';
import {
  buildThinkForgeGenerationReceipt,
  verifyThinkForgeGenerationReceipt,
} from '@/lib/thinkforge/provenance/generation-receipt';

function createMetadata(outputContent = 'Saved post copy.') {
  const snapshot = {
    version: 3,
    resolvedAt: '2026-08-17T00:00:00.000Z',
    scope: { kind: 'personal', brandId: 'brand_b' },
    brand: {
      brandId: 'brand_b',
      recordId: 'profile_b_13',
      profileUpdatedAt: '2026-08-17T00:00:00.000Z',
      profileFingerprint: 'b'.repeat(64),
    },
    retrieval: {
      projectFactIds: ['fact_b'],
      globalFactIds: [],
      interactionPatternTypes: [],
      diagnostics: { version: 1 },
    },
    writingKnowledgeVersion: 'knowledge-v9',
  };
  const signalTrace = { outputFormat: 'social_post' };
  const briefSnapshot = { platform: 'linkedin' };
  const sourceLedger = {
    ledgerVersion: 1 as const,
    entries: [{
      referenceId: 'brief_user',
      kind: 'user_brief' as const,
      title: 'User brief',
      summary: 'Write a saved post.',
      confidence: 1,
      provenance: { origin: 'user_request' },
    }],
  };
  const profileCompliance = { status: 'passed' };
  const writerTrace = buildThinkForgeWriterInvocationTrace({
    writerType: 'post',
    editorialPlan: { version: 2, writerKind: 'post' },
    selectedTechniques: [],
    promptTemplate: 'post writer prompt',
    sourceLedger,
    provider: 'gemini',
    model: 'gemini-private',
    cacheStatus: 'hit',
    generatedAt: '2026-08-17T00:00:00.000Z',
  });
  const generationTrace = buildThinkForgeDocumentGenerationTrace({
    operation: { kind: 'create', id: 'generation_b' },
    document: {
      sessionId: 'session_b',
      scriptId: 'script_b',
      expectedVersion: 1,
      writerType: 'post',
    },
    writerTrace,
    authoringContextSnapshot: snapshot,
    signalTrace,
    productionBrief: briefSnapshot,
    sourceLedger,
    outputContent,
    qualityGateEvidence: profileCompliance,
  });
  return {
    authoringContextSnapshot: snapshot,
    signalTrace,
    briefSnapshot,
    writerOutput: { generationTrace, sourceLedger, profileCompliance },
  };
}

describe('ThinkForge generation receipts', () => {
  it('creates a deterministic identity and verifiable immutable evidence envelope', () => {
    const metadata = createMetadata();
    const first = buildThinkForgeGenerationReceipt({
      userId: 'user_b',
      orgId: null,
      sessionId: 'session_b',
      scriptId: 'script_b',
      documentVersion: 1,
      outputContent: 'Saved post copy.',
      metadata,
      persistedAt: new Date('2026-08-17T00:01:00.000Z'),
    });
    const second = buildThinkForgeGenerationReceipt({
      userId: 'user_b',
      orgId: null,
      sessionId: 'session_b',
      scriptId: 'script_b',
      documentVersion: 1,
      outputContent: 'Saved post copy.',
      metadata,
      persistedAt: new Date('2026-08-17T00:01:00.000Z'),
    });

    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first?.id).toMatch(/^tfgr_[a-f0-9]{48}$/u);
    expect(verifyThinkForgeGenerationReceipt(first)).toEqual(first);
    expect(first?.authoringContextSnapshot).toMatchObject({
      brand: { brandId: 'brand_b', recordId: 'profile_b_13' },
      retrieval: { projectFactIds: ['fact_b'] },
    });
  });

  it('refuses output, document, and receipt tampering', () => {
    const metadata = createMetadata();
    expect(() => buildThinkForgeGenerationReceipt({
      userId: 'user_b',
      sessionId: 'session_b',
      scriptId: 'script_b',
      documentVersion: 1,
      outputContent: 'Tampered output.',
      metadata,
    })).toThrow(/persisted output/u);
    expect(() => buildThinkForgeGenerationReceipt({
      userId: 'user_b',
      sessionId: 'session_other',
      scriptId: 'script_b',
      documentVersion: 1,
      outputContent: 'Saved post copy.',
      metadata,
    })).toThrow(/persistence target/u);

    const receipt = buildThinkForgeGenerationReceipt({
      userId: 'user_b',
      sessionId: 'session_b',
      scriptId: 'script_b',
      documentVersion: 1,
      outputContent: 'Saved post copy.',
      metadata,
    });
    expect(() => verifyThinkForgeGenerationReceipt({
      ...receipt,
      actor: { userId: 'attacker', orgId: null },
    })).toThrow(/receipt hash/u);
  });

  it('does not invent a receipt for non-generation metadata', () => {
    expect(buildThinkForgeGenerationReceipt({
      userId: 'user_b',
      sessionId: 'session_b',
      scriptId: 'script_b',
      documentVersion: 1,
      outputContent: 'Manual document.',
      metadata: { source: 'user' },
    })).toBeNull();
  });
});
