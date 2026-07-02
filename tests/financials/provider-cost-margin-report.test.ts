import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(),
}));

import {
  buildProviderCostMarginPipeline,
  buildProviderCostMarginReport,
  normalizeProviderCostMarginParams,
} from '@/lib/financials/provider-cost-margin-report';

describe('provider cost margin report', () => {
  it('builds a bounded aggregation pipeline for service margin groups', () => {
    const params = normalizeProviderCostMarginParams(
      {
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-02T00:00:00.000Z'),
        groupBy: 'service',
        limit: 25,
      },
      new Date('2026-07-03T00:00:00.000Z'),
    );

    const pipeline = buildProviderCostMarginPipeline(params);

    expect(pipeline[0]).toEqual({
      $match: {
        createdAt: {
          $gte: new Date('2026-07-01T00:00:00.000Z'),
          $lte: new Date('2026-07-02T00:00:00.000Z'),
        },
      },
    });
    expect(pipeline.at(-1)).toEqual({ $limit: 25 });
    expect(JSON.stringify(pipeline)).toContain('"service":"$service"');
    expect(JSON.stringify(pipeline)).toContain('missingPricingEvents');
    expect(JSON.stringify(pipeline)).toContain('failedProviderCostUsd');
  });

  it('summarizes revenue, COGS, unknown pricing, and negative margin rows', () => {
    const params = normalizeProviderCostMarginParams(
      {
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-02T00:00:00.000Z'),
      },
      new Date('2026-07-03T00:00:00.000Z'),
    );

    const report = buildProviderCostMarginReport(
      [
        {
          _id: {
            service: 'thinkforge',
            action: 'chat_message',
            provider: 'gemini',
            model: 'gemini-2.5-flash',
          },
          service: 'thinkforge',
          action: 'chat_message',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          eventCount: 4,
          successCount: 3,
          failedCount: 1,
          skippedCount: 0,
          chargedCredits: 9,
          revenueUsdEstimate: 0.3,
          providerCostUsd: 0.08,
          estimatedCostUsd: 0.08,
          actualCostUsd: 0,
          missingPricingEvents: 0,
          failedProviderCostUsd: 0.01,
          retryCount: 1,
        },
        {
          _id: {
            service: 'uploaderx',
            action: 'platform_publish',
            provider: 'x-api',
          },
          service: 'uploaderx',
          action: 'platform_publish',
          provider: 'x-api',
          eventCount: 2,
          successCount: 1,
          failedCount: 1,
          skippedCount: 0,
          chargedCredits: 0,
          revenueUsdEstimate: 0,
          providerCostUsd: 0.04,
          estimatedCostUsd: 0.04,
          actualCostUsd: 0,
          missingPricingEvents: 2,
          failedProviderCostUsd: 0.02,
          retryCount: 0,
        },
      ],
      params,
    );

    expect(report.totals.eventCount).toBe(6);
    expect(report.totals.revenueUsdEstimate).toBe(0.3);
    expect(report.totals.providerCostUsd).toBe(0.12);
    expect(report.totals.grossMarginUsd).toBe(0.18);
    expect(report.totals.failedProviderCostUsd).toBe(0.03);
    expect(report.unknownPricing).toHaveLength(1);
    expect(report.unknownPricing[0].key).toContain('uploaderx');
    expect(report.negativeMargin).toHaveLength(1);
    expect(report.negativeMargin[0].grossMarginUsd).toBe(-0.04);
  });

  it('clamps unsafe request params', () => {
    const params = normalizeProviderCostMarginParams(
      {
        from: new Date('2020-01-01T00:00:00.000Z'),
        to: new Date('2026-07-03T00:00:00.000Z'),
        groupBy: 'provider',
        limit: 999,
      },
      new Date('2026-07-03T00:00:00.000Z'),
    );

    expect(params.groupBy).toBe('provider');
    expect(params.limit).toBe(200);
    expect(params.from.toISOString()).toBe('2026-06-03T00:00:00.000Z');
  });
});
