import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import {
  buildThinkForgeDocumentGenerationTrace,
  buildThinkForgeWriterInvocationTrace,
} from '@/lib/thinkforge/provenance/generation-trace';

const dbMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getScript: vi.fn(),
  saveScriptWithVersion: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: dbMock.getSession,
  getScript: dbMock.getScript,
  saveScriptWithVersion: dbMock.saveScriptWithVersion,
}));

import { applyCommand } from '@/lib/thinkforge/services/command-service';

const content = 'Saved post copy.';
const block: ThinkForgeBlock = {
  id: 'block_receipt',
  kind: 'paragraph',
  content: [{ type: 'text', text: content, styles: {} }],
};

function buildMetadata() {
  const authoringContextSnapshot = {
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
    authoringContextSnapshot,
    signalTrace,
    productionBrief: briefSnapshot,
    sourceLedger,
    outputContent: content,
    qualityGateEvidence: profileCompliance,
  });
  return {
    authoringContextSnapshot,
    signalTrace,
    briefSnapshot,
    writerOutput: {
      writerType: 'post',
      visualPrompts: { singleImagePrompt: 'Text-free approval workflow.' },
      generationTrace,
      sourceLedger,
      profileCompliance,
    },
  };
}

describe('ThinkForge command generation receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getSession.mockResolvedValue({ _id: 'session_b', userId: 'user_b', projectMeta: {} });
    dbMock.getScript.mockResolvedValue(null);
    dbMock.saveScriptWithVersion.mockImplementation(async (sessionId, script, _baseVersion, scriptId) => ({
      ok: true,
      script: {
        sessionId,
        scriptId,
        ...script,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }));
  });

  it('passes a verified append-only receipt with a traced AI document write', async () => {
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_b',
      baseVersion: 0,
      source: 'ai',
      payload: {
        scriptId: 'script_b',
        title: 'Saved post',
        content,
        blocks: [block],
        contentContract: createThinkForgeWriterContract('social_post'),
        metadata: buildMetadata(),
      },
    }, 'user_b');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledTimes(1);
    const receipt = dbMock.saveScriptWithVersion.mock.calls[0]?.[4];
    expect(receipt).toMatchObject({
      actor: { userId: 'user_b', orgId: null },
      document: { sessionId: 'session_b', scriptId: 'script_b', version: 1 },
      operation: { kind: 'create', id: 'generation_b' },
      authoringContextSnapshot: {
        brand: { brandId: 'brand_b', recordId: 'profile_b_13' },
      },
    });
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects a traced output whose hash does not match the document', async () => {
    const metadata = buildMetadata();
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_b',
      baseVersion: 0,
      source: 'ai',
      payload: {
        scriptId: 'script_b',
        title: 'Tampered post',
        content: 'Different content.',
        blocks: [{ ...block, content: [{ type: 'text', text: 'Different content.', styles: {} }] }],
        contentContract: createThinkForgeWriterContract('social_post'),
        metadata,
      },
    }, 'user_b');

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('persisted output') });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });
});
