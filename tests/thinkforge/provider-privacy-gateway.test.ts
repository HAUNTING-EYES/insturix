import { describe, expect, it } from 'vitest';
import {
  ProviderPrivacyGateError,
  assertProviderPromptAllowed,
  inspectDataForStorage,
  prepareProviderPromptForRoute,
} from '@/lib/thinkforge/privacy/provider-privacy-gateway';

const fixedNow = '2026-06-14T00:00:00.000Z';

describe('provider privacy gateway', () => {
  it('classifies storage data without exposing personal identifiers', () => {
    const inspection = inspectDataForStorage({
      text: 'Contact Alex Sharma at alex@example.com for the launch.',
      now: fixedNow,
    });

    expect(inspection).toMatchObject({
      privacyClass: 'personal',
      containsPersonalData: true,
      redactions: ['email', 'contact_name'],
      redactionCount: 2,
    });
    expect(inspection.sanitizedText).toContain('[REDACTED_PERSON]');
    expect(inspection.sanitizedText).toContain('[REDACTED_EMAIL]');
    expect(JSON.stringify(inspection)).not.toContain('alex@example.com');
  });

  it('identifies child data at the storage boundary even without a direct identifier', () => {
    const inspection = inspectDataForStorage({
      text: 'Build a profile from an 11-year-old student record.',
      now: fixedNow,
    });

    expect(inspection.privacyClass).toBe('child_data');
  });

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
    expect(decision.audit.redactionCount).toBe(3);
    expect(decision.audit.redactionCounts).toEqual({ email: 1, phone: 1, contact_name: 1 });
    expect(JSON.stringify(decision.audit)).not.toContain('alex@example.com');
  });

  it('redacts labeled names, street addresses, DOB, and repeated identifiers with counted audit evidence', () => {
    const rawPrompt = [
      'Full name: Priya Nair;',
      'email priya@example.com and backup priya.n@example.org;',
      'phone +91 98765 43210;',
      'DOB: 14/03/1990;',
      'shipping address: 42 MG Road, Bengaluru 560001',
    ].join(' ');
    const decision = prepareProviderPromptForRoute({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      routePurpose: 'eval',
      prompt: rawPrompt,
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.audit.privacyClass).toBe('personal');
    expect(decision.prompt).toContain('Full name: [REDACTED_PERSON]');
    expect(decision.prompt).toContain('[REDACTED_EMAIL]');
    expect(decision.prompt).toContain('[REDACTED_PHONE]');
    expect(decision.prompt).toContain('DOB: [REDACTED_DOB]');
    expect(decision.prompt).toContain('shipping address: [REDACTED_ADDRESS]');
    expect(decision.audit.redactions).toEqual([
      'email',
      'phone',
      'person_name',
      'date_of_birth',
      'street_address',
    ]);
    expect(decision.audit.redactionCount).toBe(6);
    expect(decision.audit.redactionCounts).toEqual({
      email: 2,
      phone: 1,
      person_name: 1,
      date_of_birth: 1,
      street_address: 1,
    });
    expect(JSON.stringify(decision.audit)).not.toContain('Priya');
    expect(JSON.stringify(decision.audit)).not.toContain('Bengaluru');
  });

  it.each([
    'DOB: 1990-03-14',
    'date of birth is March 14, 1990',
    'born on 14 March 1990',
    'birth date: 03/14/90',
  ])('redacts a common DOB form: %s', (prompt) => {
    const decision = prepareProviderPromptForRoute({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      routePurpose: 'public_trend',
      prompt,
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.audit.privacyClass).toBe('personal');
    expect(decision.prompt).toMatch(/\[REDACTED_DOB\]/);
    expect(decision.audit.redactionCounts).toEqual({ date_of_birth: 1 });
  });

  it('redacts an inline delivery address but preserves the surrounding instruction', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      routePurpose: 'eval',
      prompt: 'Send the package to 221B Baker Street, London NW1 6XE for the product review.',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.prompt).toContain('Send the package to [REDACTED_ADDRESS]');
    expect(decision.prompt).toContain('for the product review.');
    expect(decision.prompt).not.toContain('Baker Street');
    expect(decision.audit.redactionCounts).toEqual({ street_address: 1 });
  });

  it('redacts a labeled unit-style address without relying on US address structure', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      routePurpose: 'eval',
      prompt: 'shipping address: Flat 12B, Tower 4, Prestige Lakeside, Varthur Road, Bengaluru 560087',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.prompt).toBe('shipping address: [REDACTED_ADDRESS]');
    expect(decision.audit.redactionCounts).toEqual({ street_address: 1 });
  });

  it('does not classify ordinary business prose, street names, or campaign dates as personal data', () => {
    const prompt = 'Address the retention issue for Main Street retailers, call out the roadmap, and launch on 03/14/2026.';
    const decision = prepareProviderPromptForRoute({
      provider: 'deepseek',
      model: 'deepseek-chat',
      routePurpose: 'eval',
      prompt,
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.audit.privacyClass).toBe('public');
    expect(decision.prompt).toBe(prompt);
    expect(decision.audit.redactionCount).toBe(0);
  });

  it('filters unsafe audit field labels instead of storing caller-provided sensitive values', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      routePurpose: 'public_trend',
      prompt: 'Find public coverage related to alex@example.com.',
      fieldsSent: ['prompt', 'alex@example.com', ' Brand Vault value ', 'research.query', 'prompt'],
      now: fixedNow,
    });

    expect(decision.audit.fieldsSent).toEqual(['prompt', 'research.query']);
    expect(JSON.stringify(decision.audit)).not.toContain('alex@example.com');
    expect(JSON.stringify(decision.audit)).not.toContain('Brand Vault value');
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

  it('infers and blocks child data from an explicitly labeled DOB', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      routePurpose: 'eval',
      prompt: 'Participant DOB: 2012-05-12',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.prompt).toBe('');
    expect(decision.audit.privacyClass).toBe('child_data');
    expect(decision.audit.blockReason).toBe('child_data_requires_dpdp_review');
    expect(decision.audit.redactions).toEqual([]);
  });

  it('uses the exact reference date instead of treating every 18-year-old as child data', () => {
    const decision = prepareProviderPromptForRoute({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      routePurpose: 'public_trend',
      prompt: 'Participant DOB: 2008-06-14',
      now: fixedNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.audit.privacyClass).toBe('personal');
    expect(decision.prompt).toBe('Participant DOB: [REDACTED_DOB]');
  });
});
