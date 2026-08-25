import { describe, expect, it, vi } from 'vitest';

import {
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
  isMediaSourceProbeConfiguredV1,
  parseMediaSourceProbeResponseV1,
  probeMediaSourceV1,
} from '@/lib/editron/services/media-source-probe-v1';
import {
  isModalProxyEndpointV1,
  modalProxyAuthHeadersV1,
  readModalProxyAuthV1,
} from '@/lib/editron/services/modal-proxy-auth-v1';

const configuredEnvironment = {
  EDITRON_MEDIA_SOURCE_PROBE_ENDPOINT: 'https://probe.modal.run',
  [EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1]: 'proxy-id',
  [EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1]: 'proxy-secret',
};

describe('MediaSourceProbeV1', () => {
  it('sends proxy credentials only to an HTTPS Modal endpoint', () => {
    expect(isModalProxyEndpointV1('https://probe.modal.run')).toBe(true);
    expect(isModalProxyEndpointV1('https://modal.run')).toBe(true);
    expect(isModalProxyEndpointV1('http://probe.modal.run')).toBe(false);
    expect(isModalProxyEndpointV1('https://probe.example.test')).toBe(false);
    expect(isModalProxyEndpointV1('not a URL')).toBe(false);
  });

  it('reads only complete dedicated Modal proxy credentials', () => {
    expect(readModalProxyAuthV1(configuredEnvironment)).toEqual({
      tokenId: 'proxy-id',
      tokenSecret: 'proxy-secret',
    });
    expect(readModalProxyAuthV1({
      EDITRON_MODAL_PROXY_AUTH_TOKEN_ID: 'proxy-id',
      EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET: ' ',
      MODAL_TOKEN_ID: 'generic-id-must-not-fill-the-gap',
      MODAL_TOKEN_SECRET: 'generic-secret-must-not-fill-the-gap',
    })).toBeNull();
    expect(modalProxyAuthHeadersV1({ tokenId: 'proxy-id', tokenSecret: 'proxy-secret' })).toEqual({
      'Modal-Key': 'proxy-id',
      'Modal-Secret': 'proxy-secret',
    });
  });

  it('requires the deployed endpoint and dedicated Modal proxy credentials', () => {
    expect(isMediaSourceProbeConfiguredV1(configuredEnvironment)).toBe(true);
    expect(isMediaSourceProbeConfiguredV1({
      ...configuredEnvironment,
      [EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1]: ' ',
    })).toBe(false);
    expect(isMediaSourceProbeConfiguredV1({
      EDITRON_MEDIA_SOURCE_PROBE_ENDPOINT: 'https://probe.modal.run',
      MODAL_TOKEN_ID: 'api-token-is-not-proxy-auth',
      MODAL_TOKEN_SECRET: 'api-secret-is-not-proxy-auth',
    })).toBe(false);
    expect(isMediaSourceProbeConfiguredV1({
      ...configuredEnvironment,
      EDITRON_MEDIA_SOURCE_PROBE_ENDPOINT: 'https://probe.example.test',
    })).toBe(false);
  });

  it('normalizes measured stream facts without returning the presigned source URL', async () => {
    const fetchImpl = mockFetch(new Response(JSON.stringify(validResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await probeMediaSourceV1('https://storage.example.test/presigned-secret', {
      environment: configuredEnvironment,
      fetchImpl,
    });

    expect(result).toMatchObject({
      disposition: 'MEASURED',
      observation: {
        probeVersion: 'ffprobe-7.1',
        durationMilliseconds: 12_345,
        videoStreams: [{
          streamIndex: 0,
          codec: 'h264',
          sourceTimebase: { numerator: '1', denominator: '90000' },
          averageFrameRate: { numerator: '30000', denominator: '1001' },
          timecode: '01:00:00;00',
          reelId: 'A001',
        }],
        audioStreams: [{ streamIndex: 1, sampleRate: '48000', channelCount: 2 }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('presigned-secret');
    expect(fetchImpl).toHaveBeenCalledWith('https://probe.modal.run', expect.objectContaining({
      headers: expect.objectContaining({
        'Modal-Key': 'proxy-id',
        'Modal-Secret': 'proxy-secret',
      }),
      body: JSON.stringify({ source_url: 'https://storage.example.test/presigned-secret' }),
    }));
  });

  it('does not turn a missing endpoint, failed request, bad response, or empty stream list into media evidence', async () => {
    await expect(probeMediaSourceV1('https://source.test/video.mp4', {
      environment: {},
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', observation: null,
      diagnostics: ['MEDIA_SOURCE_PROBE_NOT_CONFIGURED'],
    });

    const foreignHostFetch = mockFetch(new Response(JSON.stringify(validResponse()), { status: 200 }));
    await expect(probeMediaSourceV1('https://source.test/video.mp4', {
      environment: {
        ...configuredEnvironment,
        EDITRON_MEDIA_SOURCE_PROBE_ENDPOINT: 'https://attacker.example.test',
      },
      fetchImpl: foreignHostFetch,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', observation: null,
      diagnostics: ['MEDIA_SOURCE_PROBE_NOT_CONFIGURED'],
    });
    expect(foreignHostFetch).not.toHaveBeenCalled();

    await expect(probeMediaSourceV1('https://source.test/video.mp4', {
      environment: configuredEnvironment,
      fetchImpl: mockFetch(Promise.reject(new Error('network'))),
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', observation: null,
      diagnostics: ['MEDIA_SOURCE_PROBE_REQUEST_FAILED'],
    });

    await expect(probeMediaSourceV1('https://source.test/video.mp4', {
      environment: configuredEnvironment,
      fetchImpl: mockFetch(new Response(JSON.stringify({ ok: true, probe_version: 'v1', format: {}, streams: [] }))),
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', observation: null,
      diagnostics: ['MEDIA_SOURCE_PROBE_NO_USABLE_STREAMS'],
    });
  });

  it('rejects an opaque or forged response instead of inventing technical identity', () => {
    expect(parseMediaSourceProbeResponseV1({ ok: true, probe_version: 'v1', format: {}, streams: 'not-an-array' })).toBeNull();
    expect(parseMediaSourceProbeResponseV1({ ...validResponse(), ok: false })).toBeNull();
  });
});

function validResponse() {
  return {
    ok: true,
    probe_version: 'ffprobe-7.1',
    format: {
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: '12.345',
      start_time: '0.000000',
    },
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        pix_fmt: 'yuv420p',
        time_base: '1/90000',
        avg_frame_rate: '30000/1001',
        r_frame_rate: '30000/1001',
        nb_frames: '370',
        color_space: 'bt709',
        color_transfer: 'bt709',
        color_primaries: 'bt709',
        color_range: 'tv',
        tags: { timecode: '01:00:00;00', reel_name: 'A001' },
      },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'aac',
        sample_rate: '48000',
        channels: 2,
        channel_layout: 'stereo',
        time_base: '1/48000',
      },
    ],
  };
}

function mockFetch(result: Response | Promise<Response>): typeof fetch {
  return vi.fn(async () => result) as unknown as typeof fetch;
}
