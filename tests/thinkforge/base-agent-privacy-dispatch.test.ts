import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'gemini' }))),
  createOpenRouter: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'openrouter' }))),
  generateObject: vi.fn(),
  generateText: vi.fn(),
  recordProviderCostEvent: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mocks.generateObject,
  generateText: mocks.generateText,
  streamText: mocks.streamText,
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mocks.createGoogleGenerativeAI,
}));
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: mocks.createOpenRouter,
}));
vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

import {
  BaseAgent,
  StructuredAgent,
  type AgentConfig,
} from '@/lib/thinkforge/agents/base-agent';
import type { AgentInput } from '@/lib/thinkforge/agents/types';
import { clearProviderCache } from '@/lib/thinkforge/agents/model-factory';
import { ProviderPrivacyGateError } from '@/lib/thinkforge/privacy/provider-privacy-gateway';

type ProbeConfig = Partial<Omit<AgentConfig, 'agentType'>>;

type CostEvent = {
  provider: string;
  model: string;
  operation: string;
  units: { requestCount: number };
  metadata: Record<string, unknown>;
};

class StreamingProbeAgent extends BaseAgent {
  constructor(config: ProbeConfig = {}) {
    super({ agentType: 'chat', ...config });
  }

  buildPrompt(input: AgentInput): string {
    return input.userPrompt;
  }

  buildPromptParts(input: AgentInput) {
    return {
      systemInstruction: input.context.systemBrief ?? '',
      prompt: input.userPrompt,
      truncatedFields: [],
    };
  }
}

class StructuredProbeAgent extends StructuredAgent<{ value: string }> {
  protected schema = z.object({ value: z.string() });

  constructor(config: ProbeConfig = {}) {
    super({ agentType: 'ideas', ...config });
  }

  buildPrompt(input: AgentInput): string {
    return input.userPrompt;
  }

  buildPromptParts(input: AgentInput) {
    return {
      systemInstruction: input.context.systemBrief ?? '',
      prompt: input.userPrompt,
      truncatedFields: [],
    };
  }
}

function agentInput(systemInstruction: string, prompt: string): AgentInput {
  return {
    context: { projectSummary: 'Privacy dispatch probe', systemBrief: systemInstruction },
    userPrompt: prompt,
    sessionId: 'session_privacy_probe',
    brandId: 'brand_privacy_probe',
  };
}

async function consume(stream: AsyncGenerator<string, void, unknown>): Promise<void> {
  for await (const _chunk of stream) {
    // Exhaust the provider stream so success telemetry is persisted.
  }
}

function lastCostEvent(): CostEvent {
  return mocks.recordProviderCostEvent.mock.calls.at(-1)?.[0] as CostEvent;
}

describe('BaseAgent provider privacy dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderCache();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    mocks.recordProviderCostEvent.mockResolvedValue({
      ok: true,
      eventId: 'pce_privacy_test',
      inserted: true,
      duplicate: false,
    });
    mocks.streamText.mockReturnValue({
      textStream: (async function* () { yield 'safe output'; })(),
      usage: {},
    });
    mocks.generateObject.mockResolvedValue({ object: { value: 'safe output' }, usage: {} });
    mocks.generateText.mockResolvedValue({ text: '{"value":"safe output"}', usage: {} });
  });

  it('does not let inferred personal or child data weaken a business-confidential declaration', async () => {
    const agent = new StreamingProbeAgent({
      routePurpose: 'creative_authoring',
      privacyClass: 'business_confidential',
      preferredProvider: 'gemini',
    });
    const personal = await agent.run(agentInput(
      'Use the approved private brand context.',
      'Contact Alex Sharma at alex@example.com about the launch.',
    ));
    await consume(personal.stream);

    expect(lastCostEvent().metadata).toMatchObject({
      privacyClass: 'business_confidential',
      privacyRoutePurpose: 'creative_authoring',
    });

    mocks.streamText.mockClear();
    mocks.recordProviderCostEvent.mockClear();
    await expect(agent.run(agentInput(
      'Use the approved private brand context.',
      'Create a campaign from an 11-year-old student record.',
    ))).rejects.toBeInstanceOf(ProviderPrivacyGateError);

    expect(mocks.streamText).not.toHaveBeenCalled();
    const blockedEvent = lastCostEvent();
    expect(blockedEvent.units.requestCount).toBe(0);
    expect(blockedEvent.metadata).toMatchObject({
      privacyClass: 'child_data',
      privacyFieldsSent: [],
      privacyBlockReason: 'child_data_requires_dpdp_review',
      errorClass: 'ProviderPrivacyGateError',
    });
    expect(JSON.stringify(blockedEvent)).not.toContain('11-year-old');
    expect(JSON.stringify(blockedEvent)).not.toContain('student record');
  });

  it('redacts combined fields on a safe route without mistaking duration for child data', async () => {
    const agent = new StreamingProbeAgent({
      routePurpose: 'public_trend',
      privacyClass: 'public',
      preferredProvider: 'openrouter',
    });
    const output = await agent.run(agentInput(
      'Keep the summary under 10 seconds for contact Alex Sharma at alex@example.com.',
      'Send the result to +1 415-555-0101.',
    ));
    await consume(output.stream);

    const call = mocks.streamText.mock.calls.at(-1)?.[0] as { system?: string; prompt: string };
    expect(call.system).toContain('[REDACTED_PERSON]');
    expect(call.system).toContain('[REDACTED_EMAIL]');
    expect(call.prompt).toContain('[REDACTED_PHONE]');
    expect(`${call.system}\n${call.prompt}`).not.toContain('alex@example.com');
    expect(`${call.system}\n${call.prompt}`).not.toContain('415-555-0101');

    const event = lastCostEvent();
    expect(event).toMatchObject({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      operation: 'llm_stream',
      units: { requestCount: 1 },
      metadata: {
        privacyRoutePurpose: 'public_trend',
        privacyClass: 'personal',
        privacyFieldsSent: ['system', 'prompt'],
        privacyRedactionCount: 3,
      },
    });
    expect(event.metadata.privacySourceFingerprint).toMatch(/^fnv1a:/);
    expect(event.metadata.privacySentFingerprint).toMatch(/^fnv1a:/);
    expect(JSON.stringify(event)).not.toContain('Alex Sharma');
    expect(JSON.stringify(event)).not.toContain('alex@example.com');
  });

  it('preserves private-context blocking before OpenRouter model creation', () => {
    expect(() => new StreamingProbeAgent({
      routePurpose: 'private_brand_context',
      privacyClass: 'business_confidential',
      preferredProvider: 'openrouter',
    })).toThrow(ProviderPrivacyGateError);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rechecks and sanitizes both structured generation and its manual JSON fallback', async () => {
    mocks.generateObject.mockRejectedValueOnce(new Error('structured response validation failed'));
    mocks.generateText.mockResolvedValueOnce({ text: '{"value":"fallback output"}', usage: {} });
    const agent = new StructuredProbeAgent({
      routePurpose: 'public_trend',
      privacyClass: 'public',
      preferredProvider: 'openrouter',
    });

    const result = await agent.runStructured(agentInput(
      'Evaluate public coverage for alex@example.com.',
      'Call +1 415-555-0101 after evaluation.',
    ));

    expect(result.result).toEqual({ value: 'fallback output' });
    const structuredCall = mocks.generateObject.mock.calls.at(-1)?.[0] as { system?: string; prompt: string };
    const fallbackCall = mocks.generateText.mock.calls.at(-1)?.[0] as { system?: string; prompt: string };
    for (const call of [structuredCall, fallbackCall]) {
      expect(call.system).toContain('[REDACTED_EMAIL]');
      expect(call.prompt).toContain('[REDACTED_PHONE]');
      expect(`${call.system}\n${call.prompt}`).not.toContain('alex@example.com');
      expect(`${call.system}\n${call.prompt}`).not.toContain('415-555-0101');
    }
    expect(fallbackCall.prompt).toContain('Return ONLY valid JSON');

    const events = mocks.recordProviderCostEvent.mock.calls.map(([event]) => event as CostEvent);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.operation)).toEqual(['llm_structured', 'llm_structured_fallback']);
    expect(events.every((event) => event.metadata.privacyClass === 'personal')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('alex@example.com');
    expect(JSON.stringify(events)).not.toContain('415-555-0101');
  });
});
