import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptThinkForgeServerDocument,
  clearThinkForgeDocumentSaveQueuesForTests,
  enqueueThinkForgeDocumentSave,
  overwriteThinkForgeDocumentAfterConflict,
  type ThinkForgeDocumentSaveRequest,
  type ThinkForgeDocumentSaveTransport,
} from '../../lib/thinkforge/client-document-save-queue';

function request(contentHash: string, baseVersion = 1): ThinkForgeDocumentSaveRequest {
  return {
    sessionId: 'session_1',
    scriptId: 'default',
    baseVersion,
    title: 'Draft',
    content: '',
    richText: { type: 'doc', content: [{ type: 'paragraph', text: contentHash }] },
    contentHash,
  };
}

describe('ThinkForge document save queue', () => {
  beforeEach(() => clearThinkForgeDocumentSaveQueuesForTests());

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
  });

  it('blocks every queued save after a conflict until the user explicitly overwrites', async () => {
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

    await expect(overwriteThinkForgeDocumentAfterConflict(
      request('hash_2'),
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
    )).toThrow('conflict changed');

    acceptThinkForgeServerDocument(
      { sessionId: 'session_1', scriptId: 'default' },
      7,
      9,
      'server_hash',
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
});
