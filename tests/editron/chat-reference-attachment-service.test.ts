import { describe, expect, it } from 'vitest';

import {
  CHAT_REFERENCE_MAX_FILE_BYTES,
  getChatReferenceAttachment,
  ingestChatDocumentReference,
  ingestChatUrlReference,
  type ChatReferenceAttachmentRecord,
  type ChatReferenceRepository,
} from '../../lib/editron/services/chat-reference-attachment-service';

describe('durable Editron chat references', () => {
  it('extracts a document once and reuses its project-scoped durable record', async () => {
    const repository = memoryRepository();
    const input = {
      userId: 'user-1',
      projectId: 'project-1',
      fileName: 'brief.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Launch brief\nKeep the customer proof scene.'),
    };

    const first = await ingestChatDocumentReference(input, { repository });
    const second = await ingestChatDocumentReference(input, { repository });

    expect(first.status).toBe('ready');
    expect(first.extractedText).toContain('customer proof scene');
    expect(second.referenceId).toBe(first.referenceId);
    expect(repository.stats.readyWrites).toBe(1);
  });

  it('rejects unsupported or oversized uploads before parsing', async () => {
    const repository = memoryRepository();
    await expect(ingestChatDocumentReference({
      userId: 'user-1', projectId: 'project-1', fileName: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('zip'),
    }, { repository })).rejects.toMatchObject({ code: 'reference_type_unsupported', status: 415 });

    await expect(ingestChatDocumentReference({
      userId: 'user-1', projectId: 'project-1', fileName: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.alloc(CHAT_REFERENCE_MAX_FILE_BYTES + 1),
    }, { repository })).rejects.toMatchObject({ code: 'reference_too_large', status: 413 });
  });

  it('revalidates every redirect destination before reading a public URL', async () => {
    const repository = memoryRepository();
    const checked: string[] = [];
    const responses = [
      new Response(null, { status: 302, headers: { location: 'https://docs.example/final' } }),
      new Response('<html><head><title>Editorial guide</title></head><body><main>Use the product close-up as proof.</main></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ];

    const record = await ingestChatUrlReference({
      userId: 'user-1', projectId: 'project-1', url: 'https://example.com/start',
    }, {
      repository,
      assertSafeUrl: async (url) => { checked.push(url); },
      fetchFn: async () => responses.shift()!,
    });

    expect(checked).toEqual(['https://example.com/start', 'https://docs.example/final']);
    expect(record.sourceUrl).toBe('https://docs.example/final');
    expect(record.extractedText).toContain('product close-up');
  });

  it('fails closed when URL safety rejects a redirect target and persists terminal failure', async () => {
    const repository = memoryRepository();
    await expect(ingestChatUrlReference({
      userId: 'user-1', projectId: 'project-1', url: 'https://example.com/start',
    }, {
      repository,
      assertSafeUrl: async (url) => {
        if (url.includes('169.254.169.254')) throw new Error('private address');
      },
      fetchFn: async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
    })).rejects.toMatchObject({ code: 'reference_fetch_failed' });

    expect([...repository.records.values()][0]?.status).toBe('failed');
  });

  it('cannot resolve a reference through a different project id', async () => {
    const repository = memoryRepository();
    const record = await ingestChatDocumentReference({
      userId: 'user-1', projectId: 'project-a', fileName: 'script.txt', mimeType: 'text/plain', buffer: Buffer.from('Opening line'),
    }, { repository });

    await expect(getChatReferenceAttachment(record.referenceId, 'project-b', repository)).resolves.toBeNull();
  });
});

function memoryRepository(): ChatReferenceRepository & {
  records: Map<string, ChatReferenceAttachmentRecord>;
  stats: { readyWrites: number };
} {
  const records = new Map<string, ChatReferenceAttachmentRecord>();
  const stats = { readyWrites: 0 };
  const key = (referenceId: string, projectId: string) => `${projectId}:${referenceId}`;
  return {
    records,
    stats,
    async find(referenceId, projectId) {
      return records.get(key(referenceId, projectId)) ?? null;
    },
    async begin(record) {
      records.set(key(record.referenceId, record.projectId), structuredClone(record));
      return record;
    },
    async ready(referenceId, projectId, update) {
      const current = records.get(key(referenceId, projectId));
      if (!current) throw new Error('missing test reference');
      const next = { ...current, ...update, status: 'ready' as const, leaseExpiresAt: undefined, updatedAt: new Date() };
      records.set(key(referenceId, projectId), next);
      stats.readyWrites += 1;
      return next;
    },
    async failed(referenceId, projectId, code, message) {
      const current = records.get(key(referenceId, projectId));
      if (current) records.set(key(referenceId, projectId), { ...current, status: 'failed', error: { code, message }, leaseExpiresAt: undefined });
    },
  };
}
