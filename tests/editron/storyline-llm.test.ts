import { describe, expect, it, vi } from 'vitest';

import {
  completeStorylineJsonPrompt,
  STORYLINE_MAX_OUTPUT_TOKENS,
} from '@/lib/editron/storyline/storyline-llm';

function response(text: string, finishReason?: string) {
  return {
    response: {
      text: () => text,
      ...(finishReason ? { candidates: [{ finishReason }] } : {}),
    },
  };
}

describe('Storyline LLM provider contract', () => {
  it('requests bounded deterministic JSON and returns a complete response', async () => {
    const generate = vi.fn().mockResolvedValue(response('{"order":[]}', 'STOP'));

    await expect(completeStorylineJsonPrompt('order these clips', generate)).resolves.toBe('{"order":[]}');
    expect(generate).toHaveBeenCalledWith({
      contents: [{ role: 'user', parts: [{ text: 'order these clips' }] }],
      generationConfig: {
        temperature: 0,
        seed: 42,
        responseMimeType: 'application/json',
        maxOutputTokens: STORYLINE_MAX_OUTPUT_TOKENS,
      },
    });
  });

  it('fails closed when Gemini truncates the ordering plan', async () => {
    const generate = vi.fn().mockResolvedValue(response('{"order":[', 'MAX_TOKENS'));

    await expect(completeStorylineJsonPrompt('order', generate)).rejects.toThrow(/truncated/i);
  });

  it('rejects blocked and empty responses before parsing', async () => {
    await expect(completeStorylineJsonPrompt(
      'order',
      vi.fn().mockResolvedValue(response('{}', 'SAFETY')),
    )).rejects.toThrow(/stopped unexpectedly: SAFETY/i);
    await expect(completeStorylineJsonPrompt(
      'order',
      vi.fn().mockResolvedValue(response('   ', 'STOP')),
    )).rejects.toThrow(/empty/i);
  });
});
