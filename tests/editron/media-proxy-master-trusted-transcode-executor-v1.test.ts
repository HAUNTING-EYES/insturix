import { createHash } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 } from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaProxyMasterPreparedTranscodeExecutorV1,
  createMediaProxyMasterTranscodeNodeProcessPortV1,
  createMediaProxyMasterTrustedTranscodeExecutorV1,
  type MediaProxyMasterTranscodeProcessPortV1,
  type MediaProxyMasterTranscodePublisherPortV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-executor-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaProxyMasterTrustedTranscodeExecutorV1', () => {
  it('materializes, executes, probes, publishes, revalidates, receipts, and cleans up', async () => {
    const fixture = executorFixture();
    const result = await fixture.executor.execute({
      command: fixture.command,
      masterAsset: fixture.asset,
    });

    expect(result.disposition).toBe('COMPLETED');
    if (result.disposition !== 'COMPLETED') throw new Error('TEST_TRANSCODE_NOT_COMPLETED');
    expect(result.receipt.command.commandSha256).toBe(fixture.command.commandSha256);
    expect(result.receipt.masterDecode.contentSha256).toBe(fixture.master.contentSha256);
    expect(result.receipt.proxyEncode.outputProbe.video).toMatchObject({
      streamIndex: 0,
      frameCount: '300',
      codedWidth: 1_280,
      codedHeight: 720,
    });
    expect(result.receipt.proxyEncode.outputProbe.audio.map((stream) => ({
      index: stream.streamIndex,
      sampleRate: stream.sampleRate,
      layout: stream.channelLayout,
    }))).toEqual([
      { index: 1, sampleRate: '48000', layout: 'stereo' },
      { index: 2, sampleRate: '48000', layout: '5.1(side)' },
    ]);
    expect(fixture.revalidate).toHaveBeenCalledTimes(3);
    expect(fixture.publisher.publish).toHaveBeenCalledTimes(1);

    const ffmpegCall = fixture.processPort.run.mock.calls
      .map(([input]) => input)
      .find(({ executable, arguments: arguments_ }) => (
        executable === 'fixture-ffmpeg' && arguments_[0] !== '-version'
      ));
    expect(ffmpegCall).toBeDefined();
    expect(ffmpegCall?.arguments).toContain('-copyts');
    expect(ffmpegCall?.arguments).toContain('-start_at_zero');
    expect(ffmpegCall?.arguments).not.toContain('-r');
    expect(ffmpegCall?.arguments).not.toContain('-vsync');
    expect(ffmpegCall?.arguments).not.toContain('-shortest');
    expect(ffmpegCall?.arguments).not.toContain('$EDITRON_MASTER_INPUT_V1');
    expect(ffmpegCall?.arguments).not.toContain('$EDITRON_PROXY_OUTPUT_V1');

    expect(fixture.publishedLocalPath).not.toBeNull();
    await expect(pathExists(fixture.publishedLocalPath!)).resolves.toBe(false);
  });

  it('blocks stale timing and invalid measured source evidence before tool execution', async () => {
    const stale = executorFixture();
    stale.currentTimeMapPort.read.mockResolvedValue({
      ...stale.command.masterTimeMap,
      verificationSha256: sha256('different-verification'),
    });
    await expect(stale.executor.execute({
      command: stale.command,
      masterAsset: stale.asset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_TIME_MAP_STALE',
    });
    expect(stale.processPort.run).not.toHaveBeenCalled();
    expect(stale.leasePort.open).not.toHaveBeenCalled();
    expect(stale.publisher.publish).not.toHaveBeenCalled();

    const unreadable = executorFixture();
    unreadable.currentTimeMapPort.read.mockRejectedValue(new Error('PERSISTED_STATE_INVALID'));
    await expect(unreadable.executor.execute({
      command: unreadable.command,
      masterAsset: unreadable.asset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_EVIDENCE_INVALID',
    });
    expect(unreadable.processPort.run).not.toHaveBeenCalled();

    const invalid = executorFixture();
    const qualification = invalid.asset.sourceQualificationV1 as Record<string, unknown>;
    const observation = qualification.observation as Record<string, unknown>;
    const invalidAsset = {
      ...invalid.asset,
      sourceQualificationV1: {
        ...qualification,
        observation: { ...observation, audioStreams: [] },
      },
    };
    await expect(invalid.executor.execute({
      command: invalid.command,
      masterAsset: invalidAsset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_EVIDENCE_INVALID',
    });
    expect(invalid.currentTimeMapPort.read).not.toHaveBeenCalled();
    expect(invalid.processPort.run).not.toHaveBeenCalled();
  });

  it('blocks a source version that becomes stale after verified materialization', async () => {
    const fixture = executorFixture();
    fixture.revalidate.mockResolvedValueOnce(false);

    await expect(fixture.executor.execute({
      command: fixture.command,
      masterAsset: fixture.asset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE',
    });
    expect(fixture.processPort.run).toHaveBeenCalledTimes(2);
    expect(fixture.publisher.publish).not.toHaveBeenCalled();
  });

  it('blocks nonzero FFmpeg termination and output frame-count drift', async () => {
    const failedProcess = executorFixture({ ffmpegExitCode: 9 });
    await expect(failedProcess.executor.execute({
      command: failedProcess.command,
      masterAsset: failedProcess.asset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_FAILED',
    });
    expect(failedProcess.publisher.publish).not.toHaveBeenCalled();

    const driftedOutput = executorFixture({ outputFrameCount: '299' });
    await expect(driftedOutput.executor.execute({
      command: driftedOutput.command,
      masterAsset: driftedOutput.asset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_POLICY_MISMATCH',
    });
    expect(driftedOutput.publisher.publish).not.toHaveBeenCalled();
  });

  it('blocks a publisher that substitutes a different immutable source identity', async () => {
    const fixture = executorFixture({ substitutePublishedAsset: true });

    await expect(fixture.executor.execute({
      command: fixture.command,
      masterAsset: fixture.asset,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_SUBSTITUTION',
    });
    expect(fixture.publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('stops an already-aborted request before any external port is called', async () => {
    const fixture = executorFixture();
    const controller = new AbortController();
    controller.abort();

    await expect(fixture.executor.execute({
      command: fixture.command,
      masterAsset: fixture.asset,
      abortSignal: controller.signal,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED',
    });
    expect(fixture.currentTimeMapPort.read).not.toHaveBeenCalled();
    expect(fixture.processPort.run).not.toHaveBeenCalled();
    expect(fixture.publisher.publish).not.toHaveBeenCalled();
  });

  it('leases verified prepared bytes without claiming final publication', async () => {
    const fixture = executorFixture();
    const result = await fixture.preparer.prepare({
      command: fixture.command,
      masterAsset: fixture.asset,
    });

    expect(result.disposition).toBe('PREPARED');
    if (result.disposition !== 'PREPARED') {
      throw new Error('TEST_TRANSCODE_NOT_PREPARED');
    }
    expect(fixture.publisher.publish).not.toHaveBeenCalled();
    expect(result.lease.evidence.outputProbe).toMatchObject({
      proxyByteLength: Buffer.byteLength('exact-encoded-proxy-bytes'),
      video: { frameCount: '300' },
    });
    expect(fixture.revalidate).toHaveBeenCalledTimes(2);

    let preparedLocalPath = '';
    await result.lease.useLocalArtifact(async (localPath) => {
      preparedLocalPath = localPath;
      await expect(pathExists(localPath)).resolves.toBe(true);
    });
    await result.lease.revalidateSource();
    expect(fixture.revalidate).toHaveBeenCalledTimes(3);
    await result.lease.release();
    await expect(pathExists(preparedLocalPath)).resolves.toBe(false);
    await result.lease.release();
    await expect(result.lease.useLocalArtifact(async () => undefined))
      .rejects.toThrow('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_INTERNAL_FAILURE');
  });
});

describe('MediaProxyMasterTranscodeNodeProcessPortV1', () => {
  it('captures bounded bytes without a shell and rejects overflow, abort, and timeout', async () => {
    const port = createMediaProxyMasterTranscodeNodeProcessPortV1();
    const captured = await port.run({
      executable: process.execPath,
      arguments: ['-e', 'process.stdout.write("ok"); process.stderr.write("warn")'],
      timeoutMs: 5_000,
      stdoutLimitBytes: 16,
      stderrLimitBytes: 16,
    });
    expect(captured.exitCode).toBe(0);
    expect(captured.stdout.toString('utf8')).toBe('ok');
    expect(captured.stderr.toString('utf8')).toBe('warn');

    await expect(port.run({
      executable: process.execPath,
      arguments: ['-e', 'process.stdout.write("overflow")'],
      timeoutMs: 5_000,
      stdoutLimitBytes: 2,
      stderrLimitBytes: 16,
    })).rejects.toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_STDOUT_LIMIT');

    const controller = new AbortController();
    const pendingAbort = port.run({
      executable: process.execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 5_000,
      stdoutLimitBytes: 16,
      stderrLimitBytes: 16,
      abortSignal: controller.signal,
    });
    setTimeout(() => controller.abort(), 25);
    await expect(pendingAbort).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_ABORTED',
    );

    await expect(port.run({
      executable: process.execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 25,
      stdoutLimitBytes: 16,
      stderrLimitBytes: 16,
    })).rejects.toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_TIMEOUT');
  });
});

type ExecutorFixtureOptions = Readonly<{
  ffmpegExitCode?: number;
  outputFrameCount?: string;
  substitutePublishedAsset?: boolean;
}>;

function executorFixture(options: ExecutorFixtureOptions = {}) {
  const masterBytes = Buffer.from('exact-master-source-bytes-for-transcode');
  const masterStorage = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/master-source.mov' },
    byteLength: masterBytes.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'master-etag-v1' },
  });
  const master = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: masterBytes.byteLength,
    contentSha256: sha256Bytes(masterBytes),
    storageVersion: masterStorage,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe version 8.1',
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'prores',
      codedWidth: 1_920,
      codedHeight: 1_080,
      pixelFormat: 'yuv422p10le',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30', denominator: '1' },
      realFrameRate: { numerator: '30', denominator: '1' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [
      {
        streamIndex: 1,
        codec: 'pcm_s24le',
        sampleRate: '48000',
        channelCount: 2,
        channelLayout: 'stereo',
        sourceTimebase: { numerator: '1', denominator: '48000' },
        sourceStartPts: '0',
        sourceDurationTicks: '480000',
      },
      {
        streamIndex: 2,
        codec: 'pcm_s24le',
        sampleRate: '48000',
        channelCount: 6,
        channelLayout: '5.1(side)',
        sourceTimebase: { numerator: '1', denominator: '48000' },
        sourceStartPts: '0',
        sourceDurationTicks: '480000',
      },
    ],
  };
  const observation = {
    ...observationMaterial,
    observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
  };
  const masterTimeMap = {
    sourceVersionSha256: master.sourceVersionSha256,
    storageVersionSha256: master.storageVersion.storageVersionSha256,
    sourceBindingSha256: sha256('source-binding'),
    technicalObservationSha256: observation.observationSha256,
    sourcePtsCadenceMapStateSha256V3: sha256('state-v3'),
    mapBindingSha256: sha256('map-binding'),
    terminalReceiptSha256: sha256('terminal-receipt'),
    verificationSha256: sha256('verification-receipt'),
    epochIndexContentSha256: sha256('epoch-index'),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: '300',
  };
  const policy = createMediaProxyMasterTranscodePolicyV1({
    presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
    timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
    container: 'mp4',
    videoCodec: 'libx264',
    pixelFormat: 'yuv420p',
    scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
    maximumWidth: 1_280,
    maximumHeight: 720,
    videoCrf: 23,
    videoPreset: 'fast',
    keyframeIntervalSeconds: 2,
    audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
    audioCodec: 'aac',
    audioBitrateBitsPerSecond: 192_000,
    maxSourceBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    timeoutMs: 30_000,
  });
  const command = createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: 'transcode-job-executor-1',
    policy,
    masterSourceVersion: master,
    masterTimeMap,
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [1, 2],
  });
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: master.assetId,
    locator: master.storageVersion.locator,
    sourceBindingSha256: masterTimeMap.sourceBindingSha256,
    requestId: 'qualification-executor-fixture',
    attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion: master.storageVersion,
    observation,
    diagnostic: null,
  };
  const asset: MediaSourcePtsCadenceMapAssetStateInputV3 = {
    assetId: master.assetId,
    type: 'video',
    sourceVersionV1: master,
    sourceQualificationV1: qualification,
  };
  const revalidate = vi.fn(async () => true);
  const leasePort = {
    open: vi.fn(async () => ({
      sourceUrl: 'https://fixture.test/master-source.mov',
      storageVersion: master.storageVersion,
      revalidate,
    })),
  };
  const currentTimeMapPort = {
    read: vi.fn(async () => command.masterTimeMap),
  };
  const proxyBytes = Buffer.from('exact-encoded-proxy-bytes');
  const processPort = {
    run: vi.fn(async (input: Parameters<MediaProxyMasterTranscodeProcessPortV1['run']>[0]) => {
      if (input.arguments[0] === '-version') {
        const version = input.executable === 'fixture-ffmpeg'
          ? 'ffmpeg version 8.1\n'
          : 'ffprobe version 8.1\n';
        return processResult(Buffer.from(version), Buffer.alloc(0));
      }
      if (input.executable === 'fixture-ffmpeg') {
        if ((options.ffmpegExitCode ?? 0) === 0) {
          await writeFile(input.arguments.at(-1)!, proxyBytes);
        }
        return processResult(
          Buffer.alloc(0),
          Buffer.from('fixture-ffmpeg-diagnostic'),
          options.ffmpegExitCode ?? 0,
        );
      }
      return processResult(Buffer.from(JSON.stringify(ffprobeDocument(
        options.outputFrameCount ?? '300',
      ))), Buffer.alloc(0), 0, {
        startedAt: '2026-08-30T00:01:02.000Z',
        completedAt: '2026-08-30T00:01:03.000Z',
      });
    }),
  };
  let publishedLocalPath: string | null = null;
  const publisher = {
    publish: vi.fn(async (
      input: Parameters<MediaProxyMasterTranscodePublisherPortV1['publish']>[0],
    ) => {
      publishedLocalPath = input.localPath;
      if (!await pathExists(input.localPath)) throw new Error('OUTPUT_NOT_PRESENT');
      const storageVersion = createMediaSourceStorageVersionV1({
        locator: { provider: 'R2', objectKey: input.objectKey },
        byteLength: input.byteLength,
        providerVersion: { kind: 'R2_ETAG', value: 'proxy-etag-v1' },
      });
      return createMediaSourceVersionV1({
        owner: input.owner,
        assetId: options.substitutePublishedAsset ? 'asset-substituted' : input.assetId,
        mediaKind: 'video',
        byteLength: input.byteLength,
        contentSha256: input.contentSha256,
        storageVersion,
      });
    }),
  };
  const preparedConfig = {
    ffmpegPath: 'fixture-ffmpeg',
    ffprobePath: 'fixture-ffprobe',
    runtime: {
      workerImageDigest: sha256('worker-image'),
      platform: `${process.platform}-${process.arch}`,
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
    },
    processPort,
    currentTimeMapPort,
    sourceLeasePortFactory: () => leasePort,
    fetcher: vi.fn(async () => new Response(masterBytes)) as unknown as typeof fetch,
    now: () => new Date('2026-08-30T00:01:04.000Z'),
  };
  const preparer = createMediaProxyMasterPreparedTranscodeExecutorV1(
    preparedConfig,
  );
  const executor = createMediaProxyMasterTrustedTranscodeExecutorV1({
    ...preparedConfig,
    publisher,
  });
  return {
    executor,
    preparer,
    command,
    master,
    asset,
    revalidate,
    leasePort,
    currentTimeMapPort,
    processPort,
    publisher,
    get publishedLocalPath() { return publishedLocalPath; },
  };
}

function ffprobeDocument(frameCount: string) {
  return {
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
        width: 1_280,
        height: 720,
        time_base: '1/90000',
        start_pts: 0,
        duration_ts: '900000',
        nb_read_frames: frameCount,
      },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'aac',
        sample_rate: '48000',
        channels: 2,
        channel_layout: 'stereo',
        time_base: '1/48000',
        start_pts: 0,
        duration_ts: '480000',
      },
      {
        index: 2,
        codec_type: 'audio',
        codec_name: 'aac',
        sample_rate: '48000',
        channels: 6,
        channel_layout: '5.1(side)',
        time_base: '1/48000',
        start_pts: 0,
        duration_ts: '480000',
      },
    ],
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  };
}

function processResult(
  stdout: Buffer,
  stderr: Buffer,
  exitCode = 0,
  times: Readonly<{ startedAt: string; completedAt: string }> = {
    startedAt: '2026-08-30T00:01:00.000Z',
    completedAt: '2026-08-30T00:01:01.000Z',
  },
) {
  return Object.freeze({ exitCode, stdout, stderr, ...times });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
