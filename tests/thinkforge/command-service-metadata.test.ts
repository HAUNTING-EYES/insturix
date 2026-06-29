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
  it('routes Instagram post requests to the post writer path', () => {
    expect(detectContentPath('Write an Instagram post from the original user brief.')).toBe('post');
    expect(detectContentPath('Write the post from the selected idea.', 'Instagram post')).toBe('post');
    expect(detectContentPath('Write the post from the selected idea.', 'instagram_post')).toBe('post');
    expect(detectContentPath('Write a LinkedIn post about video production workflows.')).toBe('post');
  });

  it('keeps explicit video/script formats on the script writer path', () => {
    expect(detectContentPath('Write an Instagram reel script with camera direction.')).toBe('script');
    expect(detectContentPath('Write the draft.', 'video_script')).toBe('script');
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
        documentType: 'post',
      }),
      0,
      'doc_002'
    );
    if (result.ok) {
      expect(result.script.documentType).toBe('post');
    }
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
        metadata: { signalTrace },
      },
    }, 'user_001');

    expect(result.ok).toBe(true);
    expect(dbMock.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_001',
      expect.objectContaining({
        metadata: { signalTrace },
      }),
      0,
      'doc_001'
    );
    if (result.ok) {
      expect(result.script.metadata).toEqual({ signalTrace });
    }
  });

  it('preserves existing signalTrace metadata during block edits', async () => {
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
      expect.objectContaining({ metadata }),
      1,
      'doc_001'
    );
    if (result.ok) {
      expect(result.script.metadata).toEqual(metadata);
    }
  });
});
