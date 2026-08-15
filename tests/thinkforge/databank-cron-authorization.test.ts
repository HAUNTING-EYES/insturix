import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cron/process-thinkforge-databank/route';

const mocks = vi.hoisted(() => ({
  backfillDataBankProvenanceAndQueueEmbeddings: vi.fn(),
  processPendingEmbeddings: vi.fn(),
  processPendingVectorDeletions: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  backfillDataBankProvenanceAndQueueEmbeddings: mocks.backfillDataBankProvenanceAndQueueEmbeddings,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  processPendingEmbeddings: mocks.processPendingEmbeddings,
  processPendingVectorDeletions: mocks.processPendingVectorDeletions,
}));

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function request(headers: HeadersInit = {}): Request {
  return new Request('http://localhost/api/cron/process-thinkforge-databank', { headers });
}

describe('ThinkForge DataBank cron authorization', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'databank-cron-test-secret';
    mocks.backfillDataBankProvenanceAndQueueEmbeddings.mockReset();
    mocks.processPendingEmbeddings.mockReset();
    mocks.processPendingVectorDeletions.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it('fails closed when the cron secret is unavailable', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request({ authorization: 'Bearer any-value' }) as never);

    expect(response.status).toBe(503);
    expect(mocks.backfillDataBankProvenanceAndQueueEmbeddings).not.toHaveBeenCalled();
    expect(mocks.processPendingEmbeddings).not.toHaveBeenCalled();
    expect(mocks.processPendingVectorDeletions).not.toHaveBeenCalled();
  });

  it('rejects a forged Vercel cron user-agent without the configured bearer secret', async () => {
    const response = await GET(request({ 'user-agent': 'vercel-cron' }) as never);

    expect(response.status).toBe(401);
    expect(mocks.backfillDataBankProvenanceAndQueueEmbeddings).not.toHaveBeenCalled();
    expect(mocks.processPendingEmbeddings).not.toHaveBeenCalled();
    expect(mocks.processPendingVectorDeletions).not.toHaveBeenCalled();
  });

  it('runs only for the configured bearer secret', async () => {
    mocks.backfillDataBankProvenanceAndQueueEmbeddings.mockResolvedValue({ processed: 2 });
    mocks.processPendingEmbeddings.mockResolvedValue({ processed: 3 });
    mocks.processPendingVectorDeletions.mockResolvedValue({ processed: 1, deleted: 1 });

    const response = await GET(request({ authorization: 'Bearer databank-cron-test-secret' }) as never);

    expect(response.status).toBe(200);
    expect(mocks.processPendingVectorDeletions).toHaveBeenCalledWith(50);
    expect(mocks.backfillDataBankProvenanceAndQueueEmbeddings).toHaveBeenCalledWith(50);
    expect(mocks.processPendingEmbeddings).toHaveBeenCalledWith(50);
    expect(mocks.processPendingVectorDeletions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.processPendingEmbeddings.mock.invocationCallOrder[0],
    );
  });
});
