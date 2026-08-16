import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';

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
import { detectContentPath } from '@/lib/thinkforge/agents/prompt-utils';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals/content-signal-resolver';
import { ScriptPayloadSchema } from '@/lib/thinkforge/schemas/route-validation';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const block: ThinkForgeBlock = {
  id: 'block_001',
  kind: 'paragraph',
  content: [{ type: 'text', text: 'Draft caption', styles: {} }],
};

const session = {
  _id: 'session_001',
  userId: 'user_001',
  createdAt: new Date('2026-06-15T00:00:00Z'),
  updatedAt: new Date('2026-06-15T00:00:00Z'),
};

describe('ThinkForge content-path routing', () => {
  it('routes selected post documents to the post writer path', () => {
    expect(detectContentPath('Write an Instagram post from the original user brief.', 'social_post')).toBe('post');
    expect(detectContentPath('Write the post from the selected idea.', 'Instagram post')).toBe('post');
    expect(detectContentPath('Write the post from the selected idea.', 'instagram_post')).toBe('post');
    expect(detectContentPath('Write a LinkedIn post about video production workflows.', 'social_post')).toBe('post');
  });

  it('keeps explicit video/script formats on the script writer path', () => {
    expect(detectContentPath('Write an Instagram reel script with camera direction.', 'video_script')).toBe('script');
    expect(detectContentPath('Write the draft.', 'video_script')).toBe('script');
  });

  it('rejects prompt-only routing instead of silently guessing a document kind', () => {
    expect(() => detectContentPath('Write a LinkedIn post about video production workflows.'))
      .toThrow(/choose a post, carousel, or script document/i);
  });

  it('keeps signal resolution on the post contract when the topic mentions video', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a LinkedIn post about video production workflows.',
      documentType: 'post',
      platform: 'LinkedIn',
    });

    expect(resolved.intent.outputFormat).toBe('social_post');
    expect(resolved.profile.constraints.output_format).toBe('social_post');
  });

  it('rejects contradictory API document classifications', () => {
    const conflicting = ScriptPayloadSchema.safeParse({
      documentType: 'post',
      contentContract: createThinkForgeWriterContract('video_script'),
    });

    expect(conflicting.success).toBe(false);
    expect(ScriptPayloadSchema.safeParse({ documentType: 'screenplay' }).success).toBe(true);
  });
});

describe('ThinkForge command-service metadata persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getSession.mockResolvedValue(session);
    dbMock.saveScriptWithVersion.mockImplementation(async (sessionId, script, _baseVersion, scriptId) => ({
      ok: true,
      script: {
        _id: 'mongo_script_001',
        sessionId,
        scriptId,
        title: script.title,
        content: script.content,
        blocks: script.blocks,
        richText: script.richText,
        metadata: script.metadata,
        documentType: script.documentType,
        contentContract: script.contentContract,
        version: 1,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    }));
  });

  it('stores generated post documentType when replacing a document', async () => {
    dbMock.getScript.mockResolvedValue(null);

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 0,
      source: 'ai',
      payload: {
        scriptId: 'doc_002',
        title: 'Instagram Post',
        content: 'Draft caption',
        blocks: [block],
        documentType: 'post',
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        documentType: 'social_post',
        contentContract: createThinkForgeWriterContract('social_post'),
      }),
      0,
      'doc_002'
    );
    if (result.ok) {
      expect(result.script.documentType).toBe('social_post');
      expect(result.script.contentContract).toEqual(createThinkForgeWriterContract('social_post'));
    }
  });

  it('rejects contradictory direct command classifications before persistence', async () => {
    dbMock.getScript.mockResolvedValue(null);

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 0,
      source: 'ai',
      payload: {
        scriptId: 'doc_conflict',
        blocks: [block],
        documentType: 'post',
        contentContract: createThinkForgeWriterContract('video_script'),
      },
    }, 'user_001');

    expect(result).toEqual({ ok: false, error: 'Document contract conflicts with document type' });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });

  it('stores signalTrace metadata when replacing a generated document', async () => {
    const signalTrace = {
      outputFormat: 'social_post',
      selectedIntent: 'Convert a trend into a founder-led LinkedIn post',
      warnings: [],
    };
    dbMock.getScript.mockResolvedValue(null);

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 0,
      source: 'ai',
      payload: {
        scriptId: 'doc_001',
        title: 'Trend Post',
        content: 'Draft caption',
        blocks: [block],
        contentContract: createThinkForgeWriterContract('social_post'),
        metadata: { signalTrace },
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        metadata: { signalTrace, source: 'ai' },
      }),
      0,
      'doc_001'
    );
    if (result.ok) {
      expect(result.script.metadata).toEqual({ signalTrace, source: 'ai' });
    }
  });

  it('preserves server-owned provenance when a browser save submits forged metadata', async () => {
    const acceptedSnapshot = { brand: { brandId: 'brand_1', recordId: 'record_12' } };
    dbMock.getScript.mockResolvedValue({
      _id: 'mongo_script_001',
      sessionId: 'session_001',
      scriptId: 'doc_001',
      title: 'Brand post',
      content: 'Draft caption',
      blocks: [block],
      metadata: {
        source: 'ai',
        workflow: 'create',
        authoringContextSnapshot: acceptedSnapshot,
        signalTrace: { outputFormat: 'social_post' },
        writerOutput: { sidecarVersion: 1 },
      },
      documentType: 'social_post',
      contentContract: createThinkForgeWriterContract('social_post'),
      version: 2,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 2,
      source: 'user',
      payload: {
        scriptId: 'doc_001',
        blocks: [block],
        metadata: {
          canonicalFormat: 'tiptap',
          source: 'ai',
          workflow: 'forged',
          authoringContextSnapshot: { brand: { brandId: 'brand_2' } },
          writerOutput: { sidecarVersion: 999 },
        },
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        metadata: {
          source: 'ai',
          workflow: 'create',
          canonicalFormat: 'tiptap',
          authoringContextSnapshot: acceptedSnapshot,
          signalTrace: { outputFormat: 'social_post' },
          writerOutput: { sidecarVersion: 1 },
        },
      }),
      2,
      'doc_001',
    );
  });

  it('merges server AI evidence and rejects reclassifying an existing document', async () => {
    const acceptedSnapshot = { brand: { brandId: 'brand_1', recordId: 'record_12' } };
    dbMock.getScript.mockResolvedValue({
      _id: 'mongo_script_001',
      sessionId: 'session_001',
      scriptId: 'doc_001',
      title: 'Brand post',
      content: 'Draft caption',
      blocks: [block],
      metadata: { authoringContextSnapshot: acceptedSnapshot, workflow: 'create', source: 'ai' },
      documentType: 'social_post',
      contentContract: createThinkForgeWriterContract('social_post'),
      version: 2,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    const aiResult = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 2,
      source: 'ai',
      payload: {
        scriptId: 'doc_001',
        blocks: [block],
        metadata: { workflow: 'edit', writerOutput: { revision: 2 } },
      },
    }, 'user_001');

    expect(aiResult.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        metadata: {
          authoringContextSnapshot: acceptedSnapshot,
          workflow: 'edit',
          source: 'ai',
          writerOutput: { revision: 2 },
        },
      }),
      2,
      'doc_001',
    );

    dbMock.saveScriptWithVersion.mockClear();
    const reclassified = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 2,
      source: 'ai',
      payload: {
        scriptId: 'doc_001',
        blocks: [block],
        contentContract: createThinkForgeWriterContract('video_script'),
      },
    }, 'user_001');

    expect(reclassified).toEqual({ ok: false, error: 'Document contract is immutable' });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });

  it('rejects an unclassified new document instead of silently creating a video script', async () => {
    dbMock.getScript.mockResolvedValue(null);

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 0,
      source: 'user',
      payload: {
        scriptId: 'doc_unclassified',
        title: 'Untitled',
        blocks: [block],
      },
    }, 'user_001');

    expect(result).toEqual({ ok: false, error: 'Document contract is required for a new document' });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });

  it('does not turn a stale or mistyped document identity into a new document', async () => {
    dbMock.getScript.mockResolvedValue(null);

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 4,
      source: 'user',
      payload: {
        scriptId: 'mistyped_document_id',
        title: 'Local draft',
        blocks: [block],
        contentContract: createThinkForgeWriterContract('social_post'),
      },
    }, 'user_001');

    expect(result).toEqual({ ok: false, error: 'Version conflict', currentVersion: 0 });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });

  it('rejects a missing document identity before reading or writing the database', async () => {
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 0,
      source: 'user',
      payload: {
        title: 'No identity',
        blocks: [block],
      },
    }, 'user_001');

    expect(result).toEqual({ ok: false, error: 'Document identity is required' });
    expect(dbMock.getSession).not.toHaveBeenCalled();
    expect(dbMock.getScript).not.toHaveBeenCalled();
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });

  it('uses the session-owned contract for a new document when the client omits it', async () => {
    dbMock.getScript.mockResolvedValue(null);
    dbMock.getSession.mockResolvedValue({
      ...session,
      projectMeta: { contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }) },
    });

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 0,
      source: 'user',
      payload: {
        scriptId: 'doc_session_contract',
        title: 'Carousel Draft',
        blocks: [block],
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        documentType: 'carousel',
        contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
      }),
      0,
      'doc_session_contract',
    );
  });

  it('rejects changing the persisted carousel slide count through an explicit contract', async () => {
    const storedContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
    dbMock.getScript.mockResolvedValue({
      _id: 'mongo_script_carousel',
      sessionId: 'session_001',
      scriptId: 'doc_carousel',
      title: 'Carousel Draft',
      content: 'Draft caption',
      blocks: [block],
      documentType: 'carousel',
      contentContract: storedContract,
      version: 2,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 2,
      source: 'user',
      payload: {
        scriptId: 'doc_carousel',
        blocks: [block],
        contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 6 }),
      },
    }, 'user_001');

    expect(result).toEqual({ ok: false, error: 'Document contract is immutable' });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });

  it('accepts a count-less carousel type update without erasing the persisted slide count', async () => {
    const storedContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
    dbMock.getScript.mockResolvedValue({
      _id: 'mongo_script_carousel',
      sessionId: 'session_001',
      scriptId: 'doc_carousel',
      title: 'Carousel Draft',
      content: 'Draft caption',
      blocks: [block],
      documentType: 'carousel',
      contentContract: storedContract,
      version: 2,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_001',
      baseVersion: 2,
      source: 'user',
      payload: {
        scriptId: 'doc_carousel',
        blocks: [block],
        documentType: 'carousel',
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({ contentContract: storedContract }),
      2,
      'doc_carousel',
    );
  });

  it('dual-reads legacy post aliases and preserves their contract during block edits', async () => {
    const metadata = {
      signalTrace: {
        outputFormat: 'social_post',
        selectedIntent: 'Preserve trace through editor edits',
      },
    };
    dbMock.getScript.mockResolvedValue({
      _id: 'mongo_script_001',
      sessionId: 'session_001',
      scriptId: 'doc_001',
      title: 'Trend Post',
      content: 'Draft caption',
      blocks: [block],
      metadata,
      documentType: 'post',
      version: 1,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    const result = await applyCommand({
      type: 'UpdateBlock',
      sessionId: 'session_001',
      baseVersion: 1,
      source: 'user',
      payload: {
        scriptId: 'doc_001',
        blockId: 'block_001',
        text: 'Updated caption',
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        metadata,
        documentType: 'social_post',
        contentContract: createThinkForgeWriterContract('social_post'),
      }),
      1,
      'doc_001'
    );
    if (result.ok) {
      expect(result.script.metadata).toEqual(metadata);
      expect(result.script.documentType).toBe('social_post');
      expect(result.script.contentContract).toEqual(createThinkForgeWriterContract('social_post'));
    }
  });
});
