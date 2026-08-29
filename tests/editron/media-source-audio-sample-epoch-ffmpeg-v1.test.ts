import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { materializeMediaSourceAudioSampleEpochMapFfmpegV1 } from '@/lib/editron/services/media-source-audio-sample-epoch-ffmpeg-v1';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 } from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { parseMediaSourceProbeResponseV1 } from '@/lib/editron/services/media-source-probe-v1';
import {
  claimMediaSourceQualificationV1,
  completeMediaSourceQualificationV1,
  createMediaSourceQualificationV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import type { NativeMediaTimestampPreviewSourceLeasePortV1 } from '@/lib/editron/services/native-media-timestamp-ffmpeg-preview-decoder-v1';

describe('media source audio sample epoch FFmpeg adapter V1', () => {
  let fixtureDirectory: string;
  let fixtureBytes: Buffer;
  let fixtureUrl: string;
  let server: Server;

  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'editron-audio-epoch-test-'));
    const fixturePath = path.join(fixtureDirectory, 'fixture.wav');
    await run(getFFmpegPath(), [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.1',
      '-ac', '2', '-c:a', 'pcm_s16le', '-y', fixturePath,
    ]);
    fixtureBytes = await readFile(fixturePath);
    server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-length': String(fixtureBytes.byteLength),
        'content-type': 'audio/wav',
      });
      response.end(fixtureBytes);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
    fixtureUrl = `http://127.0.0.1:${address.port}/fixture.wav`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
    await removeOwnedFixtureDirectory(fixtureDirectory);
  });

  it('materializes a real exact PTS scan and decoded PCM receipt without resampling', async () => {
    const fixture = sourceFixture(fixtureBytes);
    const revalidate = vi.fn(async () => true);
    const result = await materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: sourceLease(fixture.sourceVersion, fixtureUrl, revalidate),
      resourcePolicy: policy(),
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    });

    expect(result.map.binding).toMatchObject({
      assetId: 'audio-epoch-real-fixture',
      mediaKind: 'audio',
      streamId: 'audio-0',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
    });
    expect(result.map.frameScan.decodedSampleFrameCount).toBe('4800');
    expect(result.map.epochs).toHaveLength(1);
    expect(result.map.epochs[0]).toMatchObject({
      boundaryKind: 'INITIAL',
      decodedStartSampleFrame: '0',
      decodedEndExclusiveSampleFrame: '4800',
      sourceStartSamplePosition: { numerator: '0', denominator: '1' },
      sourceEndExclusiveSamplePosition: { numerator: '4800', denominator: '1' },
    });
    expect(result.map.pcm).toMatchObject({
      codec: 'PCM_S32LE',
      sampleRate: '48000',
      channelCount: 2,
      decodedSampleFrameCount: '4800',
      decodedByteLength: 38_400,
    });
    expect(result.map.pcm.decodedPcmSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.map.toolchain.ffmpegVersion).toMatch(/^ffmpeg version /);
    expect(result.map.toolchain.ffprobeVersion).toMatch(/^ffprobe version /);
    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(revalidate).toHaveBeenCalledTimes(2);
  }, 30_000);

  it('rejects altered source bytes and a lease that becomes stale during measurement', async () => {
    const fixture = sourceFixture(fixtureBytes);
    const wrongIdentity = createMediaSourceVersionV1({
      owner: fixture.sourceVersion.owner,
      assetId: fixture.sourceVersion.assetId,
      mediaKind: fixture.sourceVersion.mediaKind,
      byteLength: fixture.sourceVersion.byteLength,
      contentSha256: 'f'.repeat(64),
      storageVersion: fixture.sourceVersion.storageVersion,
    });
    await expect(materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: wrongIdentity,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: sourceLease(wrongIdentity, fixtureUrl, vi.fn(async () => true)),
      resourcePolicy: policy(),
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_CONTENT_MISMATCH');

    const revalidate = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: sourceLease(fixture.sourceVersion, fixtureUrl, revalidate),
      resourcePolicy: policy(),
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_VERSION_STALE');
    expect(revalidate).toHaveBeenCalledTimes(2);
  }, 30_000);

  it('enforces source, decoded-frame, and PCM resource ceilings', async () => {
    const fixture = sourceFixture(fixtureBytes);
    const invalidPolicyOpen = vi.fn(async () => {
      throw new Error('TEST_LEASE_MUST_NOT_OPEN');
    });
    await expect(materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: { open: invalidPolicyOpen },
      resourcePolicy: { ...policy(), timeoutMs: 0 },
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_TIMEOUT_INVALID');
    expect(invalidPolicyOpen).not.toHaveBeenCalled();

    const makeLease = () => sourceLease(
      fixture.sourceVersion,
      fixtureUrl,
      vi.fn(async () => true),
    );
    await expect(materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: makeLease(),
      resourcePolicy: { ...policy(), maxSourceBytes: fixtureBytes.byteLength - 1 },
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_BYTE_LIMIT_EXCEEDED');

    await expect(materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: makeLease(),
      resourcePolicy: { ...policy(), maxDecodedFrameEntries: 1 },
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_LIMIT_EXCEEDED');

    await expect(materializeMediaSourceAudioSampleEpochMapFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: makeLease(),
      resourcePolicy: { ...policy(), maxDecodedPcmBytes: 100 },
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_BYTE_LIMIT_EXCEEDED');
  }, 30_000);
});

function sourceFixture(bytes: Buffer) {
  const observation = parseMediaSourceProbeResponseV1({
    ok: true,
    probe_version: 'ffprobe version 8.1',
    format: { format_name: 'wav', duration: '0.1', start_time: '0' },
    streams: [{
      index: 0,
      codec_type: 'audio',
      codec_name: 'pcm_s16le',
      sample_rate: '48000',
      channels: 2,
      channel_layout: 'stereo',
      time_base: '1/48000',
      start_pts: '0',
      duration_ts: '4800',
    }],
  });
  if (!observation) throw new Error('TEST_OBSERVATION_INVALID');
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'tests/audio-epoch-real-fixture.wav' },
    byteLength: bytes.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'audio-real-fixture-etag' },
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: 'audio-epoch-real-fixture',
      source: 'user-upload',
      r2Key: storageVersion.locator.objectKey,
    },
    now: new Date('2026-08-29T00:00:00.000Z'),
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_QUALIFICATION_CREATE_FAILED');
  const claimed = claimMediaSourceQualificationV1({
    record: created.record,
    sourceBindingSha256: created.record.sourceBindingSha256,
    now: new Date('2026-08-29T00:00:01.000Z'),
  });
  if (claimed.disposition !== 'CLAIMED') throw new Error('TEST_QUALIFICATION_CLAIM_FAILED');
  const completed = completeMediaSourceQualificationV1({
    record: claimed.record,
    sourceBindingSha256: claimed.record.sourceBindingSha256,
    result: { disposition: 'MEASURED', observation, diagnostics: [] },
    storageVersion,
    now: new Date('2026-08-29T00:00:02.000Z'),
  });
  if (completed.disposition !== 'COMPLETED') throw new Error('TEST_QUALIFICATION_COMPLETE_FAILED');
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'audio-epoch-owner' },
    assetId: completed.record.assetId,
    mediaKind: 'audio',
    byteLength: bytes.byteLength,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    storageVersion,
  });
  return { qualification: completed.record, sourceVersion };
}

function sourceLease(
  sourceVersion: ReturnType<typeof createMediaSourceVersionV1>,
  sourceUrl: string,
  revalidate: () => Promise<boolean>,
): NativeMediaTimestampPreviewSourceLeasePortV1 {
  return {
    async open(expected) {
      if (expected.sourceVersionSha256 !== sourceVersion.sourceVersionSha256) {
        throw new Error('TEST_SOURCE_VERSION_MISMATCH');
      }
      return {
        sourceUrl,
        storageVersion: sourceVersion.storageVersion,
        revalidate,
      };
    },
  };
}

function policy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-sample-epoch-ffmpeg-test-v1',
    maxSourceBytes: 1024 * 1024,
    maxCanonicalJsonBytes: 1024 * 1024,
    maxDecodedFrameEntries: 100,
    maxEpochEntries: 100,
    maxDecodedSampleFrames: 100_000,
    maxDecodedPcmBytes: 1024 * 1024,
    timeoutMs: 20_000,
  };
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => (
      code === 0 ? resolve() : reject(new Error(`TEST_FFMPEG_FAILED_${code}`))
    ));
  });
}

async function removeOwnedFixtureDirectory(directory: string): Promise<void> {
  const root = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(root)
    || !path.basename(resolved).startsWith('editron-audio-epoch-test-')) {
    throw new Error('TEST_FIXTURE_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}
