import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCurrentWriterOutputBinding,
  verifyWriterOutputBinding,
} from '@/lib/thinkforge/persistence/writer-output-binding';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

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

const contract = createThinkForgeWriterContract('social_post');

function block(text: string) {
  return {
    id: 'block_1',
    kind: 'paragraph' as const,
    content: [{ type: 'text' as const, text, styles: {} }],
  };
}

function writerOutput(prompt = 'A restrained editorial proof card.') {
  return {
    writerType: 'post',
    contentAnalysis: { hook: 'Proof before promise.' },
    visualPrompts: { singleImagePrompt: prompt },
    writerMetadata: { platform: 'linkedin' },
  };
}

function existingDocument(content: string, version: number, binding?: unknown) {
  return {
    _id: 'mongo_post_1',
    sessionId: 'session_1',
    scriptId: 'post_1',
    title: 'Bound post',
    content,
    blocks: [block(content)],
    metadata: {
      source: 'ai',
      writerOutput: {
        ...writerOutput(),
        ...(binding !== undefined ? { artifactBinding: binding } : {}),
      },
    },
    documentType: 'social_post',
    contentContract: contract,
    version,
    createdAt: new Date('2026-08-16T00:00:00Z'),
    updatedAt: new Date('2026-08-16T00:00:00Z'),
  };
}

async function replace(input: {
  content: string;
  version: number;
  source: 'user' | 'ai';
  metadata?: Record<string, unknown>;
}) {
  return applyCommand({
    type: 'ReplaceDocument',
    sessionId: 'session_1',
    baseVersion: input.version,
    source: input.source,
    payload: {
      scriptId: 'post_1',
      title: 'Bound post',
      content: input.content,
      blocks: [block(input.content)],
      documentType: 'social_post',
      contentContract: contract,
      metadata: input.metadata,
    },
  }, 'user_1');
}

function savedWriterOutput(): Record<string, any> {
  return dbMock.saveScriptWithVersion.mock.calls.at(-1)?.[1]?.metadata?.writerOutput ?? {};
}

describe('ThinkForge writer output content binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1' });
    dbMock.saveScriptWithVersion.mockImplementation(async (sessionId, script, baseVersion, scriptId) => ({
      ok: true,
      script: { ...script, sessionId, scriptId, version: baseVersion + 1 },
    }));
  });

  it('binds a fresh post writer envelope to the exact saved content and version', async () => {
    dbMock.getScript.mockResolvedValue(null);
    await replace({
      content: 'Fresh post',
      version: 0,
      source: 'ai',
      metadata: { writerOutput: writerOutput() },
    });

    expect(verifyWriterOutputBinding({
      binding: savedWriterOutput().artifactBinding,
      documentContent: 'Fresh post',
      documentVersion: 1,
      writerOutput: savedWriterOutput(),
    }).current).toBe(true);
  });

  it('marks hidden prompts stale after a visible edit and ignores forged browser metadata', async () => {
    const original = 'Original post';
    const current = createCurrentWriterOutputBinding({
      documentContent: original,
      documentVersion: 3,
      writerOutput: writerOutput(),
    });
    dbMock.getScript.mockResolvedValue(existingDocument(original, 3, current));

    await replace({
      content: 'User-edited post',
      version: 3,
      source: 'user',
      metadata: { writerOutput: writerOutput('Forged hidden prompt') },
    });

    expect(savedWriterOutput().visualPrompts.singleImagePrompt).toBe('A restrained editorial proof card.');
    expect(savedWriterOutput().artifactBinding).toMatchObject({
      status: 'stale',
      staleReason: 'content_changed_without_fresh_writer_output',
      staleAtVersion: 4,
    });
  });

  it('rebinds unchanged content but detects hidden prompt tampering', async () => {
    const content = 'Unchanged post';
    const current = createCurrentWriterOutputBinding({
      documentContent: content,
      documentVersion: 2,
      writerOutput: writerOutput(),
    });
    dbMock.getScript.mockResolvedValue(existingDocument(content, 2, current));
    await replace({ content, version: 2, source: 'user' });

    expect(savedWriterOutput().artifactBinding).toMatchObject({ status: 'current', boundDocumentVersion: 3 });
    expect(verifyWriterOutputBinding({
      binding: savedWriterOutput().artifactBinding,
      documentContent: content,
      documentVersion: 3,
      writerOutput: { ...savedWriterOutput(), visualPrompts: { singleImagePrompt: 'Tampered' } },
    })).toMatchObject({ current: false, reason: 'writer_output_hash_mismatch' });
  });

  it('rejects an incomplete canonical AI writer envelope before persistence', async () => {
    dbMock.getScript.mockResolvedValue(null);
    const result = await replace({
      content: 'Broken post',
      version: 0,
      source: 'ai',
      metadata: { writerOutput: { writerType: 'post' } },
    });

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('Fresh writer output must include structured visualPrompts'),
    });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });
});
