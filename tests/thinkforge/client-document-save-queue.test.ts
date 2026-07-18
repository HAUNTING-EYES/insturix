import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearThinkForgeDocumentSaveQueuesForTests,
  enqueueThinkForgeDocumentSave,
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

  it('uses a conflict version for the next queued save without dropping it', async () => {
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
    await expect(second).resolves.toMatchObject({ status: 'saved', version: 8 });
    expect(transport).toHaveBeenLastCalledWith(expect.objectContaining({ baseVersion: 7, contentHash: 'hash_2' }));
  });
});
