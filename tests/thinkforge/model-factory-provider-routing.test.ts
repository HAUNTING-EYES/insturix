import { describe, expect, it } from 'vitest';
import { ProviderPrivacyGateError } from '@/lib/thinkforge/privacy/provider-privacy-gateway';
import {
  ModelTier,
  resolveThinkForgeProviderRoute,
} from '@/lib/thinkforge/agents/model-factory';

describe('ThinkForge provider route resolution', () => {
  it('keeps business-confidential creative authoring on Gemini by default', () => {
    const route = resolveThinkForgeProviderRoute({
      routePurpose: 'creative_authoring',
      privacyClass: 'business_confidential',
    });

    expect(route.provider).toBe('gemini');
    expect(route.model).toBe('gemini-2.5-flash');
    expect(route.privacyAudit).toMatchObject({
      provider: 'gemini',
      routePurpose: 'creative_authoring',
      privacyClass: 'business_confidential',
      fieldsSent: ['prompt'],
    });
  });

  it('keeps structural work on the lite Gemini model by default', () => {
    const route = resolveThinkForgeProviderRoute({
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
    });

    expect(route.provider).toBe('gemini');
    expect(route.model).toBe('gemini-3.1-flash-lite-preview');
    expect(ModelTier.Structural).toBe('structural');
  });

  it('allows OpenRouter only for public trend routes', () => {
    const route = resolveThinkForgeProviderRoute({
      routePurpose: 'public_trend',
      privacyClass: 'public',
      preferredProvider: 'openrouter',
    });

    expect(route.provider).toBe('openrouter');
    expect(route.model).toBe('deepseek/deepseek-chat');
    expect(route.privacyAudit.blockReason).toBeUndefined();
  });

  it('blocks private brand context on OpenRouter before model creation', () => {
    expect(() =>
      resolveThinkForgeProviderRoute({
        routePurpose: 'private_brand_context',
        privacyClass: 'business_confidential',
        preferredProvider: 'openrouter',
      }),
    ).toThrow(ProviderPrivacyGateError);
  });

  it('blocks route-only personal data on non-approved providers because model factory cannot redact prompts', () => {
    expect(() =>
      resolveThinkForgeProviderRoute({
        routePurpose: 'public_trend',
        privacyClass: 'personal',
        preferredProvider: 'openrouter',
      }),
    ).toThrow(ProviderPrivacyGateError);
  });
});
