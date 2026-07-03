import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import {
  importYoutubeReferenceVideo,
  type YoutubeReferenceInfo,
} from '../../lib/editron/reference-video/youtube-reference-importer';

describe('YouTube reference importer hardening', () => {
  it('fails closed when a short YouTube download hangs past the timeout', async () => {
    const hangingStream = new Readable({ read() {} });

    await expect(importYoutubeReferenceVideo(
      {
        userId: 'user_123',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc12345678',
        sourceFingerprint: 'youtube|abc12345678',
        downloadTimeoutMs: 1,
      },
      {
        findExistingAsset: async () => null,
        getInfo: async () => youtubeInfo('72'),
        downloadFromInfo: async () => hangingStream,
        uploadMedia: async () => {
          throw new Error('Timed-out downloads must not upload media.');
        },
      },
    )).rejects.toMatchObject({
      reason: 'youtube_reference_download_timeout',
    });

    expect(hangingStream.destroyed).toBe(true);
  });

  it('fails closed when a long YouTube clip hangs past the timeout', async () => {
    const hangingStream = new Readable({ read() {} });
    let observedClipTimeoutMs: number | undefined;

    await expect(importYoutubeReferenceVideo(
      {
        userId: 'user_123',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc12345678',
        sourceFingerprint: 'youtube|abc12345678',
        maxDurationSec: 120,
        clipTimeoutMs: 1,
      },
      {
        findExistingAsset: async () => null,
        getInfo: async () => youtubeInfo('240'),
        downloadFromInfo: async () => hangingStream,
        clipStreamToMp4Buffer: async (_stream, _maxDurationSec, _maxBytes, options) => {
          observedClipTimeoutMs = options.timeoutMs;
          return new Promise<Buffer>(() => undefined);
        },
        uploadMedia: async () => {
          throw new Error('Timed-out clips must not upload media.');
        },
      },
    )).rejects.toMatchObject({
      reason: 'youtube_reference_clip_timeout',
    });

    expect(observedClipTimeoutMs).toBe(1);
    expect(hangingStream.destroyed).toBe(true);
  });
});

function youtubeInfo(lengthSeconds: string): YoutubeReferenceInfo {
  return {
    videoDetails: {
      videoId: 'abc12345678',
      title: 'Production SaaS Reference',
      lengthSeconds,
    },
    formats: [
      {
        itag: 22,
        url: 'https://video.example/720.mp4',
        mimeType: 'video/mp4',
        hasVideo: true,
        hasAudio: true,
        height: 720,
        audioBitrate: 128,
      },
    ],
  };
}
