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
        version: 1,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    }));
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
