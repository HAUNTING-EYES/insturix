import { describe, expect, it } from 'vitest';
import {
  estimateProviderCost,
  estimateRevenueUsdFromCredits,
  type ProviderCostRate,
} from '@/lib/financials/provider-cost-estimates';

describe('provider cost estimates', () => {
  it('estimates repo-backed Fal video seconds when a verified rate exists', () => {
    const estimate = estimateProviderCost({
      provider: 'fal-ai',
      operation: 'video_generation',
      model: 'happy-horse-v1.1',
      units: { mediaSeconds: 10 },
    });

    expect(estimate.costBasis).toBe('estimated_table');
    expect(estimate.estimatedCostUsd).toBe(1.8);
    expect(estimate.quantity).toBe(10);
    expect(estimate.unit).toBe('media_second');
    expect(estimate.missingPricing).toBe(false);
  });

  it('estimates Kokoro voiceover by character count', () => {
    const estimate = estimateProviderCost({
      provider: 'fal.ai',
      operation: 'voiceover_generation',
      model: 'fal-ai/kokoro/american-english',
      units: { audioCharacters: 2500 },
    });

    expect(estimate.estimatedCostUsd).toBe(0.05);
    expect(estimate.unit).toBe('audio_character');
  });

  it('supports image-count rates without pretending all image providers are priced', () => {
    const testRates: ProviderCostRate[] = [
      {
        provider: 'fal-ai',
        operation: 'image_generation',
        model: 'fal-ai/test-image',
        unit: 'image',
        usdPerUnit: 0.04,
        source: 'test fixture',
      },
    ];

    const estimate = estimateProviderCost(
      {
        provider: 'fal-ai',
        operation: 'image_generation',
        model: 'fal-ai/test-image',
        units: { imageCount: 4 },
      },
      { rates: testRates },
    );

    expect(estimate.estimatedCostUsd).toBe(0.16);
    expect(estimate.quantity).toBe(4);
    expect(estimate.unit).toBe('image');
  });

  it('supports token-count rates for LLM providers', () => {
    const testRates: ProviderCostRate[] = [
      {
        provider: 'gemini',
        operation: 'llm_completion',
        model: 'gemini-test',
        unit: 'token',
        usdPerUnit: 0.000001,
        source: 'test fixture',
      },
    ];

    const estimate = estimateProviderCost(
      {
        provider: 'gemini',
        operation: 'llm_completion',
        model: 'gemini-test',
        units: { inputTokens: 1200, outputTokens: 800 },
      },
      { rates: testRates },
    );

    expect(estimate.estimatedCostUsd).toBe(0.002);
    expect(estimate.quantity).toBe(2000);
    expect(estimate.unit).toBe('token');
  });

  it('does not estimate token rates when token usage is absent', () => {
    const testRates: ProviderCostRate[] = [
      {
        provider: 'gemini',
        operation: 'llm_completion',
        model: 'gemini-test',
        unit: 'token',
        usdPerUnit: 0.000001,
        source: 'test fixture',
      },
    ];

    const estimate = estimateProviderCost(
      {
        provider: 'gemini',
        operation: 'llm_completion',
        model: 'gemini-test',
      },
      { rates: testRates },
    );

    expect(estimate.estimatedCostUsd).toBeNull();
    expect(estimate.costBasis).toBe('pricing_to_be_seen');
    expect(estimate.missingPricing).toBe(true);
    expect(estimate.quantity).toBeNull();
    expect(estimate.unit).toBe('token');
  });

  it('marks unknown provider pricing as pricing_to_be_seen', () => {
    const estimate = estimateProviderCost({
      provider: 'apify',
      operation: 'actor_run',
      model: 'unknown-actor',
      units: { requestCount: 1 },
    });

    expect(estimate.estimatedCostUsd).toBeNull();
    expect(estimate.costBasis).toBe('pricing_to_be_seen');
    expect(estimate.missingPricing).toBe(true);
    expect(estimate.quantity).toBe(1);
  });

  it('converts charged credits back to revenue at 30 credits per dollar', () => {
    expect(estimateRevenueUsdFromCredits(45)).toBe(1.5);
    expect(estimateRevenueUsdFromCredits(0)).toBe(0);
    expect(estimateRevenueUsdFromCredits(undefined)).toBeNull();
  });
});
