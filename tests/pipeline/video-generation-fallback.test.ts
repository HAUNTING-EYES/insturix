import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAudioRightsContractIssue } from '../../lib/editron/shared/render-request-payload';
import { generateVideoClip } from '../../lib/pipeline/video-generation-service';

const mocks = vi.hoisted(() => ({
  dbCollection: vi.fn(),
  dbUpdateOne: vi.fn(),
  execFile: vi.fn(),
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
  falStorageUpload: vi.fn(),
  getDatabase: vi.fn(),
  uploadMedia: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: mocks.falConfig,
    subscribe: mocks.falSubscribe,
    storage: {
      upload: mocks.falStorageUpload,
    },
  },
}));

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/editron/services/media/ffmpeg-runtime', () => ({
  getFFmpegPath: () => 'C:\\fake\\ffmpeg.exe',
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_ASSETS: 'mediaAssets',
  },
  getDatabase: mocks.getDatabase,
}));

describe('video generation fal fallback policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_AI_API_KEY = 'test-fal-api-key';
    mocks.dbUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
    });
    mocks.dbCollection.mockReturnValue({
      updateOne: mocks.dbUpdateOne,
    });
    mocks.getDatabase.mockResolvedValue({
      collection: mocks.dbCollection,
    });
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout?: string, stderr?: string) => void;
      const noAudioStream = Object.assign(
        new Error("Stream map '0:a:0' matches no streams."),
        { stderr: "Stream map '0:a:0' matches no streams." },
      );
      callback(noAudioStream, '', noAudioStream.stderr);
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
  });

  afterEach(() => {
    delete process.env.FAL_AI_API_KEY;
    vi.unstubAllGlobals();
  });

  it('does not fallback to Kling after a selected model generated a video but upload failed', async () => {
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { video: { url: 'https://video.example/happyhorse.mp4' } },
    });
    mocks.uploadMedia.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A gentle camera push with natural ambient sound.',
      falVideoModel: 'happy-horse-v1.1',
      provider: 'fal-ai',
      durationSeconds: 3,
    }, 'smoke_happyhorse')).rejects.toThrow('Failed to persist generated video (happy-horse-v1.1): storage unavailable');

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      'alibaba/happy-horse/v1.1/image-to-video',
      expect.any(Object),
    );
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('falls back once when the selected fal endpoint rejects as unsupported before generation', async () => {
    const unsupportedModel = Object.assign(new Error('not found'), {
      status: 404,
      body: { detail: 'model not found' },
    });
    mocks.falSubscribe
      .mockRejectedValueOnce(unsupportedModel)
      .mockResolvedValueOnce({
        data: { video: { url: 'https://video.example/kling.mp4' } },
      });
    mocks.uploadMedia.mockResolvedValueOnce({
      signedUrl: 'https://cdn.example/kling.mp4',
      gcsPath: 'gs://bucket/kling.mp4',
      r2Key: 'video_kling',
      assetId: 'video_kling',
    });

    const result = await generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A slow cinematic move.',
      falVideoModel: 'happy-horse-v1.1',
      provider: 'fal-ai',
      durationSeconds: 3,
    }, 'smoke_happyhorse');

    expect(result.videoUrl).toBe('https://cdn.example/kling.mp4');
    expect(mocks.falSubscribe).toHaveBeenCalledTimes(2);
    expect(mocks.falSubscribe.mock.calls[0][0]).toBe('alibaba/happy-horse/v1.1/image-to-video');
    expect(mocks.falSubscribe.mock.calls[1][0]).toBe('fal-ai/kling-video/v2.1/pro/image-to-video');
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('does not fallback on fal auth failures', async () => {
    const authError = Object.assign(new Error('unauthorized'), {
      status: 401,
      body: { detail: 'invalid key' },
    });
    mocks.falSubscribe.mockRejectedValueOnce(authError);

    await expect(generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A slow cinematic move.',
      falVideoModel: 'happy-horse-v1.1',
      provider: 'fal-ai',
      durationSeconds: 3,
    }, 'smoke_happyhorse')).rejects.toThrow('happy-horse-v1.1: invalid key (auth failed');

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
  });

  it('measures native audio from the returned MP4 and persists a durable generated receipt', async () => {
    mocks.execFile.mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout?: string, stderr?: string) => void;
      callback(null, '', '');
    });
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { video: { url: 'https://video.example/seedance-with-audio.mp4' } },
      request_id: 'fal_job_native_audio',
    });
    mocks.uploadMedia.mockImplementationOnce(async (
      _buffer: Buffer,
      _userId: string,
      _filename: string,
      _contentType: string,
      options: { customAssetId: string },
    ) => ({
      signedUrl: `https://cdn.example/${options.customAssetId}.mp4`,
      gcsPath: `gs://bucket/${options.customAssetId}.mp4`,
      r2Key: options.customAssetId,
      assetId: options.customAssetId,
      size: 3,
      contentType: 'video/mp4',
      urlExpiresAt: null,
    }));

    const result = await generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A cafe scene with natural room tone and a cup placed on a table.',
      falVideoModel: 'seedance-1.5',
      provider: 'fal-ai',
      durationSeconds: 5,
    }, 'native_audio_user');

    expect(mocks.execFile).toHaveBeenCalledWith(
      'C:\\fake\\ffmpeg.exe',
      expect.arrayContaining(['-map', '0:a:0', '-frames:a', '1']),
      expect.any(Object),
      expect.any(Function),
    );
    expect(result.hasNativeAudio).toBe(true);
    expect(result.nativeAudioRights).toEqual(expect.objectContaining({
      mediaRole: 'native-video',
      source: 'generated',
      userChoice: 'attested',
      licensed: true,
      evidence: expect.objectContaining({
        kind: 'generated-provider',
        sourceAssetId: result.assetId,
      }),
    }));
    expect(getAudioRightsContractIssue(result.nativeAudioRights)).toBeNull();
    expect(result.generatedVideoReceipt).toEqual(expect.objectContaining({
      version: 'editron-generated-video-receipt-v1',
      provider: 'fal-ai',
      model: 'seedance-1.5',
      assetId: result.assetId,
      providerJobId: 'fal_job_native_audio',
      nativeAudio: expect.objectContaining({
        present: true,
        probe: 'ffmpeg-audio-stream-decode',
      }),
    }));
    expect(mocks.dbCollection).toHaveBeenCalledWith('mediaAssets');
    expect(mocks.dbUpdateOne).toHaveBeenCalledWith(
      { assetId: result.assetId },
      expect.objectContaining({
        $set: expect.objectContaining({
          source: 'generated',
          audioRights: result.nativeAudioRights,
          generatedVideoReceipt: result.generatedVideoReceipt,
        }),
      }),
      { upsert: true },
    );
  });

  it('records no native-audio rights when the returned MP4 has no audio stream', async () => {
    const noAudioStream = Object.assign(
      new Error("Stream map '0:a:0' matches no streams."),
      { stderr: "Stream map '0:a:0' matches no streams." },
    );
    mocks.execFile.mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout?: string, stderr?: string) => void;
      callback(noAudioStream, '', noAudioStream.stderr);
    });
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { video: { url: 'https://video.example/seedance-silent.mp4' } },
    });
    mocks.uploadMedia.mockImplementationOnce(async (
      _buffer: Buffer,
      _userId: string,
      _filename: string,
      _contentType: string,
      options: { customAssetId: string },
    ) => ({
      signedUrl: `https://cdn.example/${options.customAssetId}.mp4`,
      gcsPath: `gs://bucket/${options.customAssetId}.mp4`,
      r2Key: options.customAssetId,
      assetId: options.customAssetId,
      size: 3,
      contentType: 'video/mp4',
      urlExpiresAt: null,
    }));

    const result = await generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A quiet visual with no sound.',
      falVideoModel: 'seedance-1.5',
      provider: 'fal-ai',
      durationSeconds: 5,
    }, 'silent_video_user');

    expect(result.hasNativeAudio).toBe(false);
    expect(result.nativeAudioRights).toBeUndefined();
    expect(result.generatedVideoReceipt?.nativeAudio.present).toBe(false);
    expect(mocks.dbUpdateOne).toHaveBeenCalledWith(
      { assetId: result.assetId },
      expect.objectContaining({
        $set: expect.objectContaining({
          hasNativeAudio: false,
        }),
        $unset: {
          audioRights: '',
        },
      }),
      { upsert: true },
    );
  });

  it('fails after generation without fallback when native-audio probing is unavailable', async () => {
    mocks.execFile.mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout?: string, stderr?: string) => void;
      callback(new Error('ffmpeg executable unavailable'));
    });
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { video: { url: 'https://video.example/unprobeable.mp4' } },
    });

    await expect(generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A generated video.',
      falVideoModel: 'seedance-1.5',
      provider: 'fal-ai',
      durationSeconds: 5,
    }, 'probe_failure_user')).rejects.toThrow(
      'Failed to inspect generated video audio (seedance-1.5): ffmpeg executable unavailable',
    );

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
  });

  it('does not fallback or hide the failure when generated provenance cannot be persisted', async () => {
    mocks.execFile.mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout?: string, stderr?: string) => void;
      callback(null, '', '');
    });
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { video: { url: 'https://video.example/native-audio.mp4' } },
    });
    mocks.uploadMedia.mockResolvedValueOnce({
      signedUrl: 'https://cdn.example/native-audio.mp4',
      gcsPath: 'gs://bucket/native-audio.mp4',
      r2Key: 'video_native_audio',
      assetId: 'video_native_audio',
      size: 3,
      contentType: 'video/mp4',
      urlExpiresAt: null,
    });
    mocks.dbUpdateOne.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A generated video with ambient audio.',
      falVideoModel: 'seedance-1.5',
      provider: 'fal-ai',
      durationSeconds: 5,
    }, 'provenance_failure_user')).rejects.toThrow(
      'Failed to persist generated video provenance (seedance-1.5): database unavailable',
    );

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('carries measured native-audio provenance through storyboard and worker state', () => {
    const schemaSource = readFileSync('lib/pipeline/schemas/storyboard.ts', 'utf8');
    const workerSource = readFileSync('app/api/internal/workers/pipeline/video/route.ts', 'utf8');

    expect(schemaSource).toContain('nativeAudioRights?: AudioRightsContract');
    expect(schemaSource).toContain('generatedVideoReceipt?: GeneratedVideoReceipt');
    expect(workerSource).toContain('nativeAudioRights: result.nativeAudioRights');
    expect(workerSource).toContain('generatedVideoReceipt: result.generatedVideoReceipt');
    expect(workerSource).toContain('audioRights: result.nativeAudioRights || null');
  });
});
