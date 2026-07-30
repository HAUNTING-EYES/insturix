import { describe, expect, it, vi } from 'vitest';

import {
  buildChatModelBakeoffInput,
  scoreChatModelRouting,
} from '@/lib/editron/agent/chat-model-bakeoff';
import {
  createGeminiOwnerGenerator,
  createKimiOwnerGenerator,
} from '@/lib/editron/agent/chat-model-providers';
import {
  classifyChatRequestOwner,
  GEMINI_OWNER_RESPONSE_SCHEMA,
} from '@/lib/editron/agent/chat-request-owner';
import { getChatEditBattleScenario } from '@/lib/editron/services/chat-edit-battle-harness';

describe('chat model bakeoff', () => {
  it('uses the exact production response schema for Gemini owner classification', async () => {
    const generateContent = vi.fn(async (_request: {
      generationConfig?: {
        temperature?: number;
        maxOutputTokens?: number;
        responseMimeType?: string;
        responseSchema?: unknown;
      };
    }) => ({
      response: {
        text: () => JSON.stringify({
          facts: {
            requestsMutation: false,
            requestsAnalysis: true,
            requiresContentLocalization: false,
            requiresEditorialJudgment: false,
            requestsReferenceStyle: false,
            requestsBroadEditorialOutcome: false,
            durableOperation: 'none',
            operationFullySpecified: true,
            targetFullySpecified: true,
            localizedReads: [],
            localizedEdits: [],
            requestedCapabilities: [],
            familyDirectives: [],
          },
          confidence: 0.99,
          reason: 'The request asks only for analysis.',
        }),
        usageMetadata: undefined,
      },
    }));
    const getGenerativeModel = vi.fn(() => ({ generateContent }));
    const generate = createGeminiOwnerGenerator({
      model: 'gemini-test',
      getGenAIImpl: async () => ({
        getGenerativeModel,
      }) as Awaited<ReturnType<NonNullable<
        Parameters<typeof createGeminiOwnerGenerator>[0]['getGenAIImpl']
      >>>,
    });

    await generate('Analyze this edit.', 1);

    expect(getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-test' });
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent.mock.calls[0]?.[0]?.generationConfig).toMatchObject({
      temperature: 0,
      maxOutputTokens: 1_200,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_OWNER_RESPONSE_SCHEMA,
    });
  });

  it('drives a Kimi JSON response through the real classifier and licenses explicit BGM', async () => {
    const scenario = getChatEditBattleScenario('bgm-explicit');
    expect(scenario).toBeDefined();
    const fetchImpl = vi.fn(async (
      _input: string | URL | Request,
      _init?: RequestInit,
    ) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            facts: {
              requestsMutation: true,
              requestsAnalysis: false,
              requiresContentLocalization: false,
              requiresEditorialJudgment: true,
              requestsReferenceStyle: false,
              requestsBroadEditorialOutcome: false,
              durableOperation: 'none',
              operationFullySpecified: true,
              targetFullySpecified: true,
              localizedReads: [],
              localizedEdits: [],
              requestedCapabilities: ['background-music'],
              capabilityEvidence: [{
                capability: 'background-music',
                sourceSpan: 'background music',
              }],
              familyDirectives: [{ family: 'music', mode: 'prefer' }],
            },
            confidence: 0.96,
            reason: 'The request asks for background music and specifies its character.',
          }),
        },
      }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
      },
    }), { status: 200 }));
    const generate = createKimiOwnerGenerator({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const addUsage = vi.fn();

    const license = await classifyChatRequestOwner(
      buildChatModelBakeoffInput(scenario!),
      { generate, addUsage },
    );
    const score = scoreChatModelRouting(scenario!, license);

    expect(score.passed).toBe(true);
    expect(score.licensedTools).toContain('regenerate_bgm');
    expect(score.licensedTools).not.toContain('apply_audio_ducking');
    expect(score.routingFacts?.familyDirectives).toEqual([
      { family: 'music', mode: 'prefer' },
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.body)) as {
      model?: string;
      temperature?: number;
    };
    expect(body.model).toBe('kimi-k3');
    expect(body.temperature).toBe(1);
    expect(addUsage).toHaveBeenCalledWith({
      promptTokenCount: 120,
      candidatesTokenCount: 80,
      totalTokenCount: 200,
    });
  });

  it('fails closed before a request when no Kimi credential is available', async () => {
    const previousKimi = process.env.KIMI_API_KEY;
    const previousMoonshot = process.env.MOONSHOT_API_KEY;
    try {
      delete process.env.KIMI_API_KEY;
      delete process.env.MOONSHOT_API_KEY;
      const fetchImpl = vi.fn();
      const generate = createKimiOwnerGenerator({
        fetchImpl: fetchImpl as typeof fetch,
      });

      await expect(generate('prompt', 1)).rejects.toThrow(
        'KIMI_API_KEY or MOONSHOT_API_KEY',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (previousKimi) process.env.KIMI_API_KEY = previousKimi;
      if (previousMoonshot) process.env.MOONSHOT_API_KEY = previousMoonshot;
    }
  });

  it('surfaces a bounded provider error without returning fallback facts', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: {
        message: 'temporary capacity failure',
        type: 'provider_error',
        code: 'capacity',
      },
    }), { status: 503 }));
    const generate = createKimiOwnerGenerator({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(generate('prompt', 1)).rejects.toThrow(
      'Kimi owner classification failed (503): temporary capacity failure',
    );
  });

  it('rejects a malformed provider response before classifier validation', async () => {
    const fetchImpl = vi.fn(async () => new Response('not-json', { status: 200 }));
    const generate = createKimiOwnerGenerator({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(generate('prompt', 1)).rejects.toThrow(
      'Kimi owner classification returned invalid JSON (200)',
    );
  });
});
