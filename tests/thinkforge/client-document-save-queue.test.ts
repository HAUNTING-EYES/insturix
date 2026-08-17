import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptThinkForgeServerDocument,
  clearThinkForgeConflictDraft,
  clearThinkForgeDocumentSaveQueuesForTests,
  commitThinkForgeRebasedDocument,
  enqueueThinkForgeDocumentSave,
  preserveThinkForgeConflictDraft,
  readThinkForgeConflictDraft,
  restoreThinkForgeDocumentConflict,
  type ThinkForgeDocumentSaveRequest,
  type ThinkForgeDocumentSaveTransport,
} from '../../lib/thinkforge/client-document-save-queue';

function request(contentHash: string, baseVersion = 1): ThinkForgeDocumentSaveRequest {
  const baseRichText = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: `base_${baseVersion}` }] }],
  };
  return {
    sessionId: 'session_1',
    scriptId: 'default',
    baseVersion,
    baseTitle: 'Draft',
    baseRichText,
    baseContentHash: JSON.stringify(baseRichText),
    title: 'Draft',
    content: '',
    richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: contentHash }] }] },
    contentHash,
  };
}

describe('ThinkForge document save queue', () => {
  beforeEach(() => clearThinkForgeDocumentSaveQueuesForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes saves for one document and carries the committed version forward', async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const seen: ThinkForgeDocumentSaveRequest[] = [];
    const transport: ThinkForgeDocumentSaveTransport = vi.fn(async (input) => {
      seen.push(input);
      if (seen.length === 1) await firstBlocked;
      return { status: 'saved' as const, version: input.baseVersion + 1, contentHash: input.contentHash };
    });

    const first = enqueueThinkForgeDocumentSave(request('hash_1'), transport);
    const second = enqueueThinkForgeDocumentSave(request('hash_2'), transport);
    await Promise.resolve();
    expect(seen).toHaveLength(1);
    releaseFirst();

    await expect(first).resolves.toMatchObject({ status: 'saved', version: 2 });
    await expect(second).resolves.toMatchObject({ status: 'saved', version: 3 });
    expect(seen.map((item) => item.baseVersion)).toEqual([1, 2]);
    expect(seen[1].baseTitle).toBe(seen[0].title);
    expect(seen[1].baseRichText).toEqual(seen[0].richText);
    expect(seen[1].baseContentHash).toBe(JSON.stringify(seen[0].richText));
  });

  it('blocks every queued save after a conflict until a rebased draft is committed', async () => {
    const transport: ThinkForgeDocumentSaveTransport = vi.fn()
      .mockResolvedValueOnce({ status: 'conflict', currentVersion: 7, contentHash: 'hash_1' })
      .mockImplementationOnce(async (input: ThinkForgeDocumentSaveRequest) => ({
        status: 'saved',
        version: input.baseVersion + 1,
        contentHash: input.contentHash,
      }));

    const first = enqueueThinkForgeDocumentSave(request('hash_1'), transport);
    const second = enqueueThinkForgeDocumentSave(request('hash_2'), transport);

    await expect(first).resolves.toMatchObject({ status: 'conflict', currentVersion: 7 });
    await expect(second).resolves.toMatchObject({ status: 'conflict', currentVersion: 7 });
    expect(transport).toHaveBeenCalledTimes(1);

    const rebased = {
      ...request('hash_2', 7),
      baseVersion: 7,
    };
    await expect(commitThinkForgeRebasedDocument(
      rebased,
      7,
      transport,
    )).resolves.toMatchObject({ status: 'saved', version: 8 });
    expect(transport).toHaveBeenLastCalledWith(expect.objectContaining({ baseVersion: 7, contentHash: 'hash_2' }));
  });

  it('unblocks only after the exact server version has been loaded', async () => {
    const transport: ThinkForgeDocumentSaveTransport = vi.fn()
      .mockResolvedValueOnce({ status: 'conflict', currentVersion: 7, contentHash: 'hash_1' })
      .mockImplementationOnce(async (input: ThinkForgeDocumentSaveRequest) => ({
        status: 'saved',
        version: input.baseVersion + 1,
        contentHash: input.contentHash,
      }));

    await expect(enqueueThinkForgeDocumentSave(request('hash_1'), transport))
      .resolves.toMatchObject({ status: 'conflict', currentVersion: 7 });
    expect(() => acceptThinkForgeServerDocument(
      { sessionId: 'session_1', scriptId: 'default' },
      6,
      7,
      'server_hash',
      'Server draft',
      { type: 'doc', content: [] },
    )).toThrow('conflict changed');

    acceptThinkForgeServerDocument(
      { sessionId: 'session_1', scriptId: 'default' },
      7,
      9,
      'server_hash',
      'Server draft',
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'server' }] }] },
    );
    await expect(enqueueThinkForgeDocumentSave(request('hash_2', 7), transport))
      .resolves.toMatchObject({ status: 'saved', version: 10 });
    expect(transport).toHaveBeenLastCalledWith(expect.objectContaining({ baseVersion: 9 }));
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('keeps saves for separate documents independent during a document switch', async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const started: string[] = [];
    const transport: ThinkForgeDocumentSaveTransport = vi.fn(async (input) => {
      started.push(`${input.sessionId}:${input.scriptId}`);
      if (input.sessionId === 'session_1') await firstBlocked;
      return { status: 'saved' as const, version: input.baseVersion + 1, contentHash: input.contentHash };
    });

    const original = enqueueThinkForgeDocumentSave(request('hash_original'), transport);
    const next = enqueueThinkForgeDocumentSave({
      ...request('hash_next'),
      sessionId: 'session_2',
      scriptId: 'script_2',
    }, transport);

    await Promise.resolve();
    expect(started).toEqual(['session_1:default', 'session_2:script_2']);
    await expect(next).resolves.toMatchObject({ status: 'saved', version: 2 });
    releaseFirst();
    await expect(original).resolves.toMatchObject({ status: 'saved', version: 2 });
  });

  it('restores a blocked conflict after a client reload without auto-saving', async () => {
    const transport: ThinkForgeDocumentSaveTransport = vi.fn(async (input) => ({
      status: 'saved' as const,
      version: input.baseVersion + 1,
      contentHash: input.contentHash,
    }));
    const draft = request('recovered_hash', 4);

    restoreThinkForgeDocumentConflict(draft, 7);
    await expect(enqueueThinkForgeDocumentSave(draft, transport))
      .resolves.toMatchObject({ status: 'conflict', currentVersion: 7 });
    expect(transport).not.toHaveBeenCalled();

    const rebased = { ...draft, baseVersion: 7 };
    await expect(commitThinkForgeRebasedDocument(rebased, 7, transport))
      .resolves.toMatchObject({ status: 'saved', version: 8 });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: 7 }));
  });

  it('round-trips only an integrity-checked conflict draft for the exact document', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const draft = request('', 4);
    draft.contentHash = JSON.stringify(draft.richText);

    preserveThinkForgeConflictDraft(draft, 7);
    expect(readThinkForgeConflictDraft(draft)).toMatchObject({
      request: draft,
      currentVersion: 7,
    });
    expect(readThinkForgeConflictDraft({ sessionId: 'session_2', scriptId: 'default' })).toBeNull();

    const [key, raw] = [...values.entries()][0];
    const tampered = JSON.parse(raw);
    tampered.request.contentHash = 'forged_hash';
    values.set(key, JSON.stringify(tampered));
    expect(() => readThinkForgeConflictDraft(draft)).toThrow('content integrity');

    clearThinkForgeConflictDraft(draft);
    expect(readThinkForgeConflictDraft(draft)).toBeNull();
  });
});
