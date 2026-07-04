import { describe, expect, it } from 'vitest';
import {
  createDefaultChatterboxClient,
  type ChatterboxSynthesizeInput,
} from '../../lib/avatar/avatar-chatterbox-client';

const SAMPLE_URL = 'https://drive.example/uc?export=download&id=abc';

function synthInput(overrides: Partial<ChatterboxSynthesizeInput> = {}): ChatterboxSynthesizeInput {
  return {
    model: 'chatterbox_turbo',
    text: 'Hey, this is a quick avatar pipeline test.',
    language: 'en',
    voiceReference: { sourceType: 'uploaded_voice_sample', url: SAMPLE_URL },
    output: { format: 'wav' },
    userId: 'user_123',
    ...overrides,
  };
}

describe('Chatterbox client (real API shape)', () => {
  it('downloads the sample, multipart-POSTs to /v1/audio/speech, and uploads the returned WAV', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let uploadedBytes: Buffer | undefined;

    const client = createDefaultChatterboxClient(
      { CHATTERBOX_TTS_ENDPOINT: 'https://cb.example' },
      {
        fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
          const u = String(url);
          calls.push({ url: u, init });
          if (u === SAMPLE_URL) {
            return new Response(Buffer.from('SAMPLE_AUDIO'), { status: 200, headers: { 'content-type': 'audio/wav' } });
          }
          return new Response(Buffer.from('WAV_BYTES'), { status: 200, headers: { 'content-type': 'audio/wav' } });
        }) as unknown as typeof fetch,
        uploadAudio: async (wav, userId, filename) => {
          uploadedBytes = wav;
          expect(userId).toBe('user_123');
          expect(filename).toBe('avatar-voice.wav');
          return { audioUrl: 'https://cdn.example/generated-voice.wav', audioAssetId: 'a_generated' };
        },
      },
    );

    const result = await client.synthesize(synthInput());

    expect(result.audioUrl).toBe('https://cdn.example/generated-voice.wav');
    expect(result.audioAssetId).toBe('a_generated');
    // sample fetched first, then the speech endpoint
    expect(calls[0].url).toBe(SAMPLE_URL);
    expect(calls[1].url).toBe('https://cb.example/v1/audio/speech');
    // multipart body carries the script text + the sample file
    const body = calls[1].init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('input')).toBe('Hey, this is a quick avatar pipeline test.');
    expect(body.get('voice_file')).toBeInstanceOf(Blob);
    // the WAV bytes returned by Chatterbox are what we persist
    expect(uploadedBytes?.toString()).toBe('WAV_BYTES');
  });

  it('does not double-append the speech path when the endpoint already includes it', async () => {
    const calls: string[] = [];
    const client = createDefaultChatterboxClient(
      { CHATTERBOX_TTS_ENDPOINT: 'https://cb.example/v1/audio/speech/' },
      {
        fetchImpl: (async (url: RequestInfo | URL) => {
          calls.push(String(url));
          return new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'audio/wav' } });
        }) as unknown as typeof fetch,
        uploadAudio: async () => ({ audioUrl: 'https://cdn.example/v.wav' }),
      },
    );

    await client.synthesize(synthInput());
    expect(calls[1]).toBe('https://cb.example/v1/audio/speech');
  });

  it('supports JSON wrapper deployments that return an audio URL', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = createDefaultChatterboxClient(
      {
        CHATTERBOX_TTS_ENDPOINT: 'https://wrapper.example/synthesize',
        CHATTERBOX_TTS_API_KEY: 'secret',
      },
      {
        fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
          requestBody = JSON.parse(String(init?.body));
          expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
          return Response.json({
            audioUrl: 'https://cdn.example/wrapper-voice.wav',
            audioAssetId: 'asset_wrapper_voice',
            providerRequestId: 'wrapper_request_1',
          });
        }) as unknown as typeof fetch,
        uploadAudio: async () => {
          throw new Error('wrapper response should not upload binary bytes');
        },
      },
    );

    const result = await client.synthesize(synthInput());

    expect(requestBody).toEqual(
      expect.objectContaining({
        text: 'Hey, this is a quick avatar pipeline test.',
        userId: 'user_123',
        voiceReference: { sourceType: 'uploaded_voice_sample', url: SAMPLE_URL },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        audioUrl: 'https://cdn.example/wrapper-voice.wav',
        audioAssetId: 'asset_wrapper_voice',
        providerRequestId: 'wrapper_request_1',
      }),
    );
  });
  it('fails loud when no fetchable voice sample URL is supplied', async () => {
    const client = createDefaultChatterboxClient(
      { CHATTERBOX_TTS_ENDPOINT: 'https://cb.example' },
      { fetchImpl: (async () => new Response('')) as unknown as typeof fetch, uploadAudio: async () => ({ audioUrl: 'x' }) },
    );

    await expect(
      client.synthesize(synthInput({ voiceReference: { sourceType: 'uploaded_voice_sample', assetId: 'a_1' } })),
    ).rejects.toThrow(/voice sample URL/i);
  });

  it('surfaces a non-2xx Chatterbox response instead of swallowing it', async () => {
    const client = createDefaultChatterboxClient(
      { CHATTERBOX_TTS_ENDPOINT: 'https://cb.example' },
      {
        fetchImpl: (async (url: RequestInfo | URL) => {
          if (String(url) === SAMPLE_URL) {
            return new Response(Buffer.from('SAMPLE'), { status: 200, headers: { 'content-type': 'audio/wav' } });
          }
          return new Response('GPU busy', { status: 503 });
        }) as unknown as typeof fetch,
        uploadAudio: async () => ({ audioUrl: 'x' }),
      },
    );

    await expect(client.synthesize(synthInput())).rejects.toThrow(/HTTP 503/);
  });

  it('fails loud when a JSON wrapper omits audioUrl', async () => {
    const client = createDefaultChatterboxClient(
      { CHATTERBOX_TTS_ENDPOINT: 'https://wrapper.example/synthesize' },
      {
        fetchImpl: (async () => Response.json({ ok: true })) as unknown as typeof fetch,
        uploadAudio: async () => ({ audioUrl: 'x' }),
      },
    );

    await expect(client.synthesize(synthInput())).rejects.toThrow(/did not return an audioUrl/i);
  });

  it('rejects a Google-Drive-style HTML interstitial instead of treating it as audio', async () => {
    const client = createDefaultChatterboxClient(
      { CHATTERBOX_TTS_ENDPOINT: 'https://cb.example' },
      {
        fetchImpl: (async (url: RequestInfo | URL) => {
          if (String(url) === SAMPLE_URL) {
            return new Response('<!DOCTYPE html><html><body>Can’t scan for viruses</body></html>', {
              status: 200,
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          }
          return new Response(Buffer.from('WAV'), { status: 200, headers: { 'content-type': 'audio/wav' } });
        }) as unknown as typeof fetch,
        uploadAudio: async () => ({ audioUrl: 'x' }),
      },
    );

    await expect(client.synthesize(synthInput())).rejects.toThrow(/web page, not audio/i);
  });
});
