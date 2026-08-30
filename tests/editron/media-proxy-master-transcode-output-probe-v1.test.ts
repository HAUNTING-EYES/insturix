import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterTranscodeOutputProbeV1,
  createMediaProxyMasterTranscodeOutputProbeV1,
} from '@/lib/editron/services/media-proxy-master-transcode-output-probe-v1';

describe('MediaProxyMasterTranscodeOutputProbeV1', () => {
  it('creates an immutable canonical multi-stream output observation', () => {
    const probe = outputProbe();

    expect(probe.formatNames).toEqual(['m4a', 'mov', 'mp4']);
    expect(probe.audio.map((stream) => stream.streamIndex)).toEqual([1, 2]);
    expect(probe.probeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(assertMediaProxyMasterTranscodeOutputProbeV1(probe)).toEqual(probe);
    expect(Object.isFrozen(probe.audio[0])).toBe(true);
  });

  it('rejects a non-MP4 format set and duplicate format names', () => {
    expect(() => outputProbe({ formatNames: ['mov', 'm4a'] }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FORMATS_INVALID');
    expect(() => outputProbe({ formatNames: ['mp4', 'mp4'] }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FORMATS_INVALID');
  });

  it('rejects an altered video codec, pixel format, stream index, or odd dimension', () => {
    const video = videoInput();
    expect(() => outputProbe({ video: { ...video, codec: 'hevc' as 'h264' } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_CODEC_INVALID');
    expect(() => outputProbe({ video: { ...video, pixelFormat: 'nv12' as 'yuv420p' } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_PIXEL_FORMAT_INVALID');
    expect(() => outputProbe({ video: { ...video, streamIndex: 1 as 0 } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_STREAM_INVALID');
    expect(() => outputProbe({ video: { ...video, codedWidth: 1_919 } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_WIDTH_INVALID');
  });

  it('rejects invalid video timing and frame evidence', () => {
    const video = videoInput();
    expect(() => outputProbe({
      video: {
        ...video,
        sourceTimebase: { numerator: '0', denominator: '90000' },
      },
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_TIMEBASE_INVALID');
    expect(() => outputProbe({ video: { ...video, sourceStartPts: '1.5' } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_START_INVALID');
    expect(() => outputProbe({ video: { ...video, sourceDurationTicks: '0' } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_DURATION_INVALID');
    expect(() => outputProbe({ video: { ...video, frameCount: '0' } }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_FRAMES_INVALID');
  });

  it('rejects non-sequential or incomplete audio stream evidence', () => {
    const audio = audioInput();
    expect(() => outputProbe({
      audio: [{ ...audio[0]!, streamIndex: 2 }, audio[1]!],
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_STREAM_INVALID');
    expect(() => outputProbe({
      audio: [{ ...audio[0]!, codec: 'opus' as 'aac' }, audio[1]!],
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_CODEC_INVALID');
    expect(() => outputProbe({
      audio: [{ ...audio[0]!, channelLayout: '' }, audio[1]!],
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_LAYOUT_INVALID');
    expect(() => outputProbe({
      audio: [{ ...audio[0]!, sampleRate: '0' }, audio[1]!],
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_RATE_INVALID');
  });

  it('rejects canonical, nested, and outer-hash tampering on reload', () => {
    const probe = outputProbe();
    expect(() => assertMediaProxyMasterTranscodeOutputProbeV1({
      ...probe,
      video: { ...probe.video, frameCount: '301' },
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_HASH_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeOutputProbeV1({
      ...probe,
      probeSha256: 'f'.repeat(64),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_HASH_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeOutputProbeV1({
      ...probe,
      rawProbe: 'not allowed',
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FIELDS_INVALID');
  });
});

type ProbeInput = Parameters<typeof createMediaProxyMasterTranscodeOutputProbeV1>[0];

function outputProbe(overrides: Partial<ProbeInput> = {}) {
  return createMediaProxyMasterTranscodeOutputProbeV1({
    commandSha256: hash('command'),
    ffprobeVersion: 'ffprobe version 8.1',
    proxyContentSha256: hash('proxy-content'),
    proxyByteLength: 40_000,
    container: 'mp4',
    formatNames: ['mov', 'mp4', 'm4a'],
    video: videoInput(),
    audio: audioInput(),
    probedAt: '2026-08-30T00:00:59.000Z',
    ...overrides,
  });
}

function videoInput(): ProbeInput['video'] {
  return {
    streamIndex: 0,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    codedWidth: 1_920,
    codedHeight: 1_080,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    sourceStartPts: '-9000',
    sourceDurationTicks: '900000',
    frameCount: '300',
  };
}

function audioInput(): ProbeInput['audio'] {
  return [
    {
      streamIndex: 1,
      codec: 'aac',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    },
    {
      streamIndex: 2,
      codec: 'aac',
      sampleRate: '48000',
      channelCount: 6,
      channelLayout: '5.1(side)',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    },
  ];
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
