import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  collection: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));

import {
  PROVIDER_COST_EVENTS_COLLECTION,
  normalizeProviderCostEvent,
  recordProviderCostAttempt,
  recordProviderCostEvent,
  sanitizeProviderCostMetadata,
} from '@/lib/financials/provider-cost-events';

describe('provider cost events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collection.mockReturnValue({
      insertOne: mocks.insertOne,
      updateOne: mocks.updateOne,
    });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
    mocks.insertOne.mockResolvedValue({ acknowledged: true });
    mocks.updateOne.mockResolvedValue({ acknowledged: true, upsertedCount: 1, matchedCount: 0 });
  });

  it('sanitizes secrets, prompts, transcripts, and signed URLs from metadata', () => {
    const sanitized = sanitizeProviderCostMetadata({
      status: 200,
      prompt: 'make a customer video',
      mediaUrl: 'https://cdn.example.com/file.mp4?signature=abc',
      nested: {
        accessToken: 'secret',
        safeCode: 'RATE_LIMITED',
      },
      logs: ['ok', 'https://example.com/private'],
    });

    expect(sanitized).toEqual({
      status: 200,
      prompt: '[redacted]',
      mediaUrl: '[redacted]',
      nested: {
        accessToken: '[redacted]',
        safeCode: 'RATE_LIMITED',
      },
      logs: ['ok', '[redacted-url]'],
    });
  });

  it('normalizes revenue, estimated COGS, and missing-pricing state', () => {
    const doc = normalizeProviderCostEvent({
      eventId: 'evt_1',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      service: 'pipeline',
      action: 'video_generation',
      provider: 'fal-ai',
      model: 'happy-horse-v1.1',
      operation: 'video_generation',
      chargedCredits: 45,
      units: { mediaSeconds: 5 },
      metadata: { url: 'https://signed.example.com/a' },
    });

    expect(doc.eventId).toBe('evt_1');
    expect(doc.status).toBe('success');
    expect(doc.revenueUsdEstimate).toBe(1.5);
    expect(doc.estimatedCostUsd).toBe(0.9);
    expect(doc.costBasis).toBe('estimated_table');
    expect(doc.missingPricing).toBe(false);
    expect(doc.metadata).toEqual({ url: '[redacted]' });
  });

  it('records a provider event with insertOne when no idempotency key is supplied', async () => {
    const result = await recordProviderCostEvent({
      eventId: 'evt_insert',
      service: 'pipeline',
      action: 'voiceover_generation',
      provider: 'fal-ai',
      model: 'fal-ai/kokoro/american-english',
      operation: 'voiceover_generation',
      chargedCredits: 3,
      units: { audioCharacters: 1000 },
    });

    expect(result).toEqual({ ok: true, eventId: 'evt_insert', inserted: true, duplicate: false });
    expect(mocks.collection).toHaveBeenCalledWith(PROVIDER_COST_EVENTS_COLLECTION);
    expect(mocks.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_insert',
        estimatedCostUsd: 0.02,
        revenueUsdEstimate: 0.1,
      }),
    );
  });

  it('records idempotent provider events with updateOne and setOnInsert', async () => {
    const result = await recordProviderCostEvent({
      eventId: 'evt_idem',
      idempotencyKey: 'pipeline:job_1:success',
      service: 'pipeline',
      action: 'video_generation',
      provider: 'fal-ai',
      model: 'veo-3.1',
      operation: 'video_generation',
      units: { mediaSeconds: 8 },
    });

    expect(result).toEqual({ ok: true, eventId: 'evt_idem', inserted: true, duplicate: false });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { idempotencyKey: 'pipeline:job_1:success' },
      { $setOnInsert: expect.objectContaining({ eventId: 'evt_idem', estimatedCostUsd: 3.2 }) },
      { upsert: true },
    );
  });

  it('defaults recordProviderCostAttempt to started status', async () => {
    await recordProviderCostAttempt({
      eventId: 'evt_started',
      service: 'clickatron',
      action: 'variation',
      provider: 'fal-ai',
      model: 'fal-ai/nano-banana-pro',
      operation: 'image_generation',
      units: { imageCount: 1 },
    });

    expect(mocks.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_started',
        status: 'started',
        costBasis: 'pricing_to_be_seen',
        missingPricing: true,
      }),
    );
  });

  it('fails open when Mongo write fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.insertOne.mockRejectedValueOnce(new Error('mongo down'));

    const result = await recordProviderCostEvent({
      eventId: 'evt_fail',
      service: 'calos',
      action: 'ai_plan',
      provider: 'apify',
      operation: 'actor_run',
      units: { requestCount: 1 },
    });

    expect(result.ok).toBe(false);
    expect(result.inserted).toBe(false);
    expect(result.error).toBe('mongo down');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('write failed'));

    warnSpy.mockRestore();
  });
});
