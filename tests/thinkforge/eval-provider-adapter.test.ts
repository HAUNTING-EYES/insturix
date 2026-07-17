import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEvalPrompt, type EvalProviderConfig } from '../../scripts/prompt-optimization/thinkforge-eval-provider-adapter';

const baseConfig: EvalProviderConfig = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: 'test-key',
  temperature: 0.2,
  maxOutputTokens: 128,
};

describe('thinkforge eval provider adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS;
    delete process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS;
    delete process.env.THINKFORGE_EVAL_REQUEST_TIMEOUT_MS;
  });

  it('retries transient provider errors before scoring the eval run as failed', async () => {
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS = '0';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'temporarily overloaded' } }), {
        status: 503,
        statusText: 'Service Unavailable',
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'Public eval output' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }), { status: 200 }));

    const result = await runEvalPrompt(baseConfig, 'Public trend prompt with only synthetic brand facts.');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.output).toBe('Public eval output');
    expect(result.usage?.totalTokens).toBe(15);
  });

  it('does not retry non-transient provider contract errors', async () => {
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS = '0';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid request body' } }), {
        status: 400,
        statusText: 'Bad Request',
      }));

    await expect(runEvalPrompt(baseConfig, 'Public synthetic eval prompt.')).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails a stalled provider request within the configured deadline', async () => {
    process.env.THINKFORGE_EVAL_REQUEST_TIMEOUT_MS = '10';
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS = '1';
    let requestSignal: AbortSignal | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      });
    });

    await expect(runEvalPrompt(baseConfig, 'Public synthetic eval prompt.'))
      .rejects.toThrow('timed out after 10ms');
    expect(requestSignal).not.toBeNull();
    expect(requestSignal!.aborted).toBe(true);
  });
});
