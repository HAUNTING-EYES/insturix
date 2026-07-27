import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getAnalysisModel: vi.fn(),
}));

import { MgProviderFailureError } from '@/lib/editron/motion-graphics/codegen/codegen-service';
import {
  createMgVisualJudgeProvider,
  resolveMgVisualJudgeProviderName,
} from '@/lib/editron/motion-graphics/codegen/visual-judge-provider';
import { getAnalysisModel } from '@/lib/editron/utils/gemini-model-factory';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const request = {
  images: [
    { label: 'intro over real footage', image: Buffer.from('phase-png'), mimeType: 'image/png' as const },
    { label: 'contrast-only stress', image: Buffer.from('stress-webp'), mimeType: 'image/webp' as const },
  ],
  prompt: 'Return the MG judge JSON.',
  seed: 42,
  maxOutputTokens: 1_200,
};

describe('MG visual judge provider', () => {
  it('preserves the Gemini structured vision contract when Gemini is explicitly selected', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => '{"faithful":true,"score":8,"issues":[],"reasoning":"ok"}',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { totalTokenCount: 123, thoughtsTokenCount: 17 },
      },
    });
    vi.mocked(getAnalysisModel).mockResolvedValue({ generateContent } as never);

    const provider = await createMgVisualJudgeProvider({
      MG_VISUAL_JUDGE_PROVIDER: 'gemini',
      LLM_ANALYSIS_MODEL: 'gemini-2.5-flash',
    });
    await expect(provider.generate(request)).resolves.toMatchObject({
      text: expect.stringContaining('"score":8'),
      finishReason: 'STOP',
      totalTokens: 123,
      thoughtsTokens: 17,
    });
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: [{
        role: 'user',
        parts: [
          { text: request.prompt },
          { text: 'JUDGE IMAGE 1: intro over real footage' },
          { inlineData: { mimeType: 'image/png', data: request.images[0].image.toString('base64') } },
          { text: 'JUDGE IMAGE 2: contrast-only stress' },
          { inlineData: { mimeType: 'image/webp', data: request.images[1].image.toString('base64') } },
        ],
      }],
      generationConfig: expect.objectContaining({
        responseMimeType: 'application/json',
        responseSchema: expect.any(Object),
        seed: 42,
        maxOutputTokens: 1_200,
      }),
    }));
  });

  it('uses GLM-4.6V as an explicit image-aware JSON judge without silently falling back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { content: '{"faithful":true,"score":8,"issues":[],"reasoning":"ok"}' },
      }],
      usage: { total_tokens: 148, completion_tokens_details: { reasoning_tokens: 0 } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = await createMgVisualJudgeProvider({
      MG_VISUAL_JUDGE_PROVIDER: 'zai',
      ZAI_API_KEY: 'zai-secret',
    });
    await expect(provider.generate(request)).resolves.toMatchObject({
      finishReason: 'stop',
      totalTokens: 148,
      thoughtsTokens: 0,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer zai-secret' });
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      model: 'glm-4.6v',
      stream: false,
      do_sample: false,
      max_tokens: 1_200,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled', clear_thinking: true },
    });
    expect(payload.messages[0].content).toEqual([
      { type: 'text', text: request.prompt },
      { type: 'text', text: 'JUDGE IMAGE 1: intro over real footage' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${request.images[0].image.toString('base64')}` } },
      { type: 'text', text: 'JUDGE IMAGE 2: contrast-only stress' },
      { type: 'image_url', image_url: { url: `data:image/webp;base64,${request.images[1].image.toString('base64')}` } },
    ]);
  });

  it('fails closed before a provider call when visual evidence is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = await createMgVisualJudgeProvider({
      MG_VISUAL_JUDGE_PROVIDER: 'zai',
      ZAI_API_KEY: 'zai-secret',
    });

    await expect(provider.generate({ ...request, images: [] })).rejects.toThrow(/requires at least one image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown judge providers instead of guessing', () => {
    expect(() => resolveMgVisualJudgeProviderName({ MG_VISUAL_JUDGE_PROVIDER: 'auto' }))
      .toThrow(/unsupported provider auto/);
  });

  it('preserves typed retryability for Z.AI throttling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'rate limited' },
    }), { status: 429, headers: { 'content-type': 'application/json' } })));
    const provider = await createMgVisualJudgeProvider({
      MG_VISUAL_JUDGE_PROVIDER: 'zai',
      ZAI_API_KEY: 'zai-secret',
    });

    try {
      await provider.generate(request);
      throw new Error('expected provider.generate to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(MgProviderFailureError);
      expect((error as MgProviderFailureError).failure).toMatchObject({
        provider: 'zai',
        operation: 'visual-judge',
        code: 'rate-limited',
        disposition: 'retryable',
        statusCode: 429,
      });
    }
  });
});
