import { describe, expect, it } from 'vitest';
import {
  ProviderPrivacyGateError,
  assertProviderPromptAllowed,
  prepareProviderPromptForRoute,
} from '@/lib/thinkforge/privacy/provider-privacy-gateway';

const fixedNow = '2026-06-14T00:00:00.000Z';

describe('provider privacy gateway', () => {
  it('allows public eval prompts for DeepSeek', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      routePurpose: 'eval',
      prompt: 'Write a generic LinkedIn post about reducing approval-cycle friction.',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.prompt).toContain('approval-cycle friction');
    expect(decision.audit).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      routePurpose: 'eval',
      privacyClass: 'public',
      fieldsSent: ['prompt'],
      timestamp: fixedNow,
    });
    expect(decision.audit.sentPromptFingerprint).toBeDefined();
  });

  it('blocks business confidential Brand Vault context for non-approved providers', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      routePurpose: 'eval',
      prompt: 'Use Brand Vault voiceFingerprint, voiceExemplars, and private campaign strategy for this client brief.',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.prompt).toBe('');
    expect(decision.audit.privacyClass).toBe('business_confidential');
    expect(decision.audit.fieldsSent).toEqual([]);
    expect(decision.audit.blockReason).toBe('business_confidential_context_blocked_for_non_approved_provider');
    expect(JSON.stringify(decision.audit)).not.toContain('voiceFingerprint');
  });

  it('redacts personal identifiers before non-approved provider calls', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      routePurpose: 'eval',
      prompt: 'Contact Alex Sharma at alex@example.com or +1 415-555-0101 for feedback.',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.audit.privacyClass).toBe('personal');
    expect(decision.prompt).toContain('[REDACTED_PERSON]');
    expect(decision.prompt).toContain('[REDACTED_EMAIL]');
    expect(decision.prompt).toContain('[REDACTED_PHONE]');
    expect(decision.prompt).not.toContain('alex@example.com');
    expect(decision.prompt).not.toContain('415-555-0101');
    expect(decision.audit.redactions).toEqual(['email', 'phone', 'contact_name']);
    expect(JSON.stringify(decision.audit)).not.toContain('alex@example.com');
  });

  it('redacts personal identifiers from public search even on an approved provider', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      routePurpose: 'public_trend',
      declaredPrivacyClass: 'public',
      prompt: 'Find public coverage related to alex@example.com.',
      fieldsSent: ['researchQuery'],
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.prompt).toContain('[REDACTED_EMAIL]');
    expect(decision.prompt).not.toContain('alex@example.com');
    expect(decision.audit.fieldsSent).toEqual(['researchQuery']);
  });

  it('honors an explicit confidential classification even when the text looks public', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'deepseek',
      model: 'deepseek-chat',
      routePurpose: 'eval',
      declaredPrivacyClass: 'business_confidential',
      prompt: 'Draft a launch announcement.',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.audit.privacyClass).toBe('business_confidential');
  });

  it('blocks child data before any provider call', () => {
    expect(() =>
      assertProviderPromptAllowed({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        routePurpose: 'eval',
        prompt: 'Create a campaign using the school profile of an 11-year-old student.',
        now: fixedNow,
      }),
    ).toThrow(ProviderPrivacyGateError);
  });
});
