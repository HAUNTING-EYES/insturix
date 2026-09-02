import { describe, expect, it, vi } from 'vitest';
import { recordChatSfxProviderCost } from '@/lib/editron/agent/chat-sfx-provider-cost';
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

  it('uses current official Fal rates for both generated SFX providers', () => {
    const mirelo = estimateProviderCost({
      provider: 'fal-ai',
      operation: 'sfx_generation',
      model: 'mirelo-ai/sfx-v1.5/video-to-audio',
      units: { mediaSeconds: 8, requestCount: 1 },
    });
    const cassette = estimateProviderCost({
      provider: 'fal-ai',
      operation: 'sfx_generation',
      model: 'cassetteai/sound-effects-generator',
      units: { mediaSeconds: 30, requestCount: 1 },
    });

    expect(mirelo).toMatchObject({
      estimatedCostUsd: 0.08,
      unit: 'media_second',
      pricingVersion: '2026-07-28.fal-audio',
      missingPricing: false,
    });
    expect(cassette).toMatchObject({
      estimatedCostUsd: 0.01,
      unit: 'request',
      pricingVersion: '2026-07-28.fal-audio',
      missingPricing: false,
    });
  });

  it('records pre-output Fal failures at zero while retaining post-output estimated cost', async () => {
    const recorder = vi.fn().mockResolvedValue({
      ok: true,
      eventId: 'pce_test',
      inserted: true,
      duplicate: false,
    });

    await recordChatSfxProviderCost({
      status: 'failed',
      userId: 'user-cost',
      projectId: 'project-cost',
      assetId: 'asset-cost',
      providerBranch: 'cassetteai_fallback',
      model: 'cassetteai/sound-effects-generator',
      requestedDurationSec: 12,
      generatedMediaSeconds: 0,
      outputCount: 0,
      providerOutputProduced: false,
      error: new Error('provider unavailable'),
    }, { recordProviderCostEvent: recorder });
    await recordChatSfxProviderCost({
      status: 'failed',
      userId: 'user-cost',
      projectId: 'project-cost',
      assetId: 'asset-cost',
      providerBranch: 'mirelo_video_to_audio',
      model: 'mirelo-ai/sfx-v1.5/video-to-audio',
      requestedDurationSec: 4,
      generatedMediaSeconds: 8,
      outputCount: 2,
      providerOutputProduced: true,
      error: new Error('storage unavailable'),
    }, { recordProviderCostEvent: recorder });

    expect(recorder.mock.calls[0]?.[0]).toMatchObject({
      status: 'failed',
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      units: { mediaSeconds: 0, requestCount: 1 },
      metadata: {
        providerOutputProduced: false,
        outputCount: 0,
        errorClass: 'Error',
      },
    });
    expect(recorder.mock.calls[1]?.[0]).not.toHaveProperty('estimatedCostUsd');
    expect(recorder.mock.calls[1]?.[0]).toMatchObject({
      status: 'failed',
      units: { mediaSeconds: 8, requestCount: 1 },
      metadata: {
        providerOutputProduced: true,
        outputCount: 2,
        errorClass: 'Error',
      },
    });
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

  it('prices Gemini 2.5 Flash input and output token rates separately', () => {
    const estimate = estimateProviderCost({
      provider: 'google-gemini',
      operation: 'video_analysis',
      model: 'gemini-2.5-flash',
      units: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });

    expect(estimate.provider).toBe('gemini');
    expect(estimate.costBasis).toBe('estimated_table');
    expect(estimate.estimatedCostUsd).toBe(2.8);
    expect(estimate.quantity).toBe(2_000_000);
    expect(estimate.unit).toBe('token');
    expect(estimate.usdPerUnit).toBeNull();
    expect(estimate.missingPricing).toBe(false);
  });

  it('prices Gemini 3.6 Flash using the current date-bounded introductory rates', () => {
    const estimate = estimateProviderCost({
      provider: 'google-gemini',
      operation: 'llm_completion_inline_context',
      model: 'gemini-3.6-flash',
      units: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });

    expect(estimate.costBasis).toBe('estimated_table');
    expect(estimate.estimatedCostUsd).toBe(4.5);
    expect(estimate.missingPricing).toBe(false);
    expect(estimate.source).toContain('through 2026-12-31');
  });

  it('does not fake Gemini video-analysis cost when token usage is absent', () => {
    const estimate = estimateProviderCost({
      provider: 'google-gemini',
      operation: 'video_analysis',
      model: 'gemini-2.5-flash',
      units: { mediaSeconds: 12, requestCount: 1 },
    });

    expect(estimate.provider).toBe('gemini');
    expect(estimate.estimatedCostUsd).toBeNull();
    expect(estimate.costBasis).toBe('pricing_to_be_seen');
    expect(estimate.missingPricing).toBe(true);
    expect(estimate.quantity).toBeNull();
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
