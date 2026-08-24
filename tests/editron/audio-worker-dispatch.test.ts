import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  fetch: vi.fn(),
  publishJSON: vi.fn(),
}));

vi.mock('@upstash/qstash', () => ({
  Client: mocks.client,
}));

import { dispatchAudioJob } from '../../lib/editron/services/audio-worker-dispatch';

describe('audio worker dispatch', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.client.mockReset();
    mocks.fetch.mockReset();
    mocks.publishJSON.mockReset();
    mocks.client.mockImplementation(() => ({ publishJSON: mocks.publishJSON }));
    mocks.fetch.mockResolvedValue(new Response(null, { status: 202 }));
    mocks.publishJSON.mockResolvedValue({ messageId: 'qstash-audio-1' });
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://editron.test');
    vi.stubEnv('QSTASH_TOKEN', '');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not claim an unsigned production fallback was dispatched', async () => {
    await expect(dispatchAudioJob({ type: 'bgm' }, 'BGM')).resolves.toMatchObject({
      dispatched: false,
      method: 'none',
      error: 'QSTASH_TOKEN is required to dispatch audio workers outside development',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('rejects a production enqueue when the worker signing-key pair is incomplete', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');

    await expect(dispatchAudioJob({ type: 'sfx' }, 'SFX')).resolves.toMatchObject({
      dispatched: false,
      method: 'none',
      error: 'QStash signing keys are required to dispatch audio workers outside development',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('publishes only when the production worker can authenticate its delivery', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');

    await expect(dispatchAudioJob({ type: 'bgm' }, 'BGM')).resolves.toMatchObject({
      dispatched: true,
      method: 'qstash',
      messageId: 'qstash-audio-1',
    });
    expect(mocks.client).toHaveBeenCalledWith({
      token: 'qstash-token',
      baseUrl: undefined,
    });
    expect(mocks.publishJSON).toHaveBeenCalledWith({
      url: 'https://editron.test/api/internal/workers/pipeline/audio',
      body: { type: 'bgm' },
      retries: 2,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps the direct fallback local to development', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('NODE_ENV', 'development');

    await expect(dispatchAudioJob({ type: 'sfx' }, 'SFX')).resolves.toMatchObject({
      dispatched: true,
      method: 'fetch',
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://editron.test/api/internal/workers/pipeline/audio',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
