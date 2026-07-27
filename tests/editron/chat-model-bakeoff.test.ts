import { describe, expect, it, vi } from 'vitest';

import {
  buildChatModelBakeoffInput,
  scoreChatModelRouting,
} from '@/lib/editron/agent/chat-model-bakeoff';
import { createKimiOwnerGenerator } from '@/lib/editron/agent/chat-model-providers';
import { classifyChatRequestOwner } from '@/lib/editron/agent/chat-request-owner';
import { getChatEditBattleScenario } from '@/lib/editron/services/chat-edit-battle-harness';

describe('chat model bakeoff', () => {
  it('drives a Kimi JSON response through the real classifier and licenses explicit BGM', async () => {
    const scenario = getChatEditBattleScenario('bgm-explicit');
    expect(scenario).toBeDefined();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
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
              operationFullySpecified: false,
              targetFullySpecified: true,
              localizedReads: [],
              localizedEdits: [],
              requestedCapabilities: [],
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

    const license = await classifyChatRequestOwner(
      buildChatModelBakeoffInput(scenario!),
      { generate },
    );
    const score = scoreChatModelRouting(scenario!, license);

    expect(score.passed).toBe(true);
    expect(score.licensedTools).toContain('regenerate_bgm');
    expect(score.licensedTools).not.toContain('apply_audio_ducking');
    expect(fetchImpl).toHaveBeenCalledOnce();
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
