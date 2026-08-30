import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterTranscodeCommandV1,
  assertMediaProxyMasterTranscodePolicyV1,
  assertMediaProxyMasterTrustedTranscodeReceiptV1,
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  expectedMediaProxyMasterTranscodeR2ObjectKeyV1,
  materializeMediaProxyMasterTranscodeArgumentsV1,
  mediaProxyMasterMappingLineageFromTranscodeReceiptV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaProxyMasterTranscodeOutputProbeV1 } from '@/lib/editron/services/media-proxy-master-transcode-output-probe-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaProxyMasterTrustedTranscodeV1', () => {
  it('creates deterministic immutable policy and command records', () => {
    const { policy, command } = commandFixture();

    expect(assertMediaProxyMasterTranscodePolicyV1(policy)).toEqual(policy);
    expect(assertMediaProxyMasterTranscodeCommandV1(command)).toEqual(command);
    expect(command.policy.policySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(command.commandSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(command.argumentTemplate)).toBe(true);
  });

  it('preserves demuxed timestamps without forcing a frame rate or shortest-stream trim', () => {
    const { command } = commandFixture();
    const arguments_ = command.argumentTemplate;

    expect(arguments_).toContain('-copyts');
    expect(arguments_).toContain('-start_at_zero');
    expect(optionValue(arguments_, '-fps_mode:v')).toBe('passthrough');
    expect(optionValue(arguments_, '-enc_time_base:v')).toBe('demux');
    expect(arguments_).not.toContain('-r');
    expect(arguments_).not.toContain('-vsync');
    expect(arguments_).not.toContain('-shortest');
    expect(arguments_.indexOf('-copyts')).toBeLessThan(arguments_.indexOf('-i'));
    expect(arguments_.at(-1)).toBe('$EDITRON_PROXY_OUTPUT_V1');
  });

  it('maps only selected streams and explicitly disables audio when none was selected', () => {
    const withAudio = commandFixture([2, 4]).command.argumentTemplate;
    expect(mapValues(withAudio)).toEqual(['0:0', '0:2', '0:4']);
    expect(optionValue(withAudio, '-c:a')).toBe('aac');

    const withoutAudio = commandFixture([]).command.argumentTemplate;
    expect(mapValues(withoutAudio)).toEqual(['0:0']);
    expect(withoutAudio).toContain('-an');
    expect(withoutAudio).not.toContain('-c:a');
  });

  it('materializes only absolute path placeholders and rejects an input/output collision', () => {
    const { command } = commandFixture();
    const masterPath = path.resolve('tmp', 'master source.mp4');
    const proxyPath = path.resolve('tmp', 'proxy output.mp4');
    const arguments_ = materializeMediaProxyMasterTranscodeArgumentsV1({
      command,
      masterInputPath: masterPath,
      proxyOutputPath: proxyPath,
    });

    expect(arguments_).toContain(masterPath);
    expect(arguments_).toContain(proxyPath);
    expect(arguments_).not.toContain('$EDITRON_MASTER_INPUT_V1');
    expect(arguments_).not.toContain('$EDITRON_PROXY_OUTPUT_V1');
    expect(() => materializeMediaProxyMasterTranscodeArgumentsV1({
      command,
      masterInputPath: masterPath,
      proxyOutputPath: masterPath,
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PATH_COLLISION');
  });

  it('rejects source, storage, stream, and duplicate-audio scope mismatches', () => {
    const fixture = commandFixture();
    expect(() => createMediaProxyMasterTranscodeCommandV1({
      ...commandInput(fixture),
      masterTimeMap: {
        ...fixture.masterTimeMap,
        sourceVersionSha256: hash('wrong-source'),
      },
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_MASTER_TIME_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterTranscodeCommandV1({
      ...commandInput(fixture),
      masterTimeMap: {
        ...fixture.masterTimeMap,
        storageVersionSha256: hash('wrong-storage'),
      },
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_MASTER_TIME_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterTranscodeCommandV1({
      ...commandInput(fixture),
      masterTimeMap: {
        ...fixture.masterTimeMap,
        streamId: 'video-3',
        videoStreamIndex: 3,
      },
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_MASTER_TIME_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterTranscodeCommandV1({
      ...commandInput(fixture),
      masterAudioStreamIndexes: [1, 1],
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_STREAM_DUPLICATE');
    expect(() => createMediaProxyMasterTranscodeCommandV1({
      ...commandInput(fixture),
      masterAudioStreamIndexes: [0],
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_STREAM_DUPLICATE');
  });

  it('rejects altered command arguments, hashes, and undeclared fields', () => {
    const { command } = commandFixture();
    const alteredArguments = structuredClone(command) as unknown as {
      argumentTemplate: string[];
    };
    alteredArguments.argumentTemplate[0] = '-r';
    expect(() => assertMediaProxyMasterTranscodeCommandV1(alteredArguments))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_HASH_MISMATCH');

    const alteredHash = { ...command, commandSha256: 'f'.repeat(64) };
    expect(() => assertMediaProxyMasterTranscodeCommandV1(alteredHash))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_HASH_MISMATCH');

    const extraField = { ...command, shell: true };
    expect(() => assertMediaProxyMasterTranscodeCommandV1(extraField))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_FIELDS_INVALID');
  });

  it('creates a self-bound completion receipt and exact mapping lineage input', () => {
    const { receipt } = receiptFixture();

    expect(assertMediaProxyMasterTrustedTranscodeReceiptV1(receipt)).toEqual(receipt);
    expect(receipt.process.commandSha256).toBe(receipt.command.commandSha256);
    expect(receipt.process.runtimeReceiptSha256).toBe(receipt.runtime.runtimeReceiptSha256);
    expect(mediaProxyMasterMappingLineageFromTranscodeReceiptV1(receipt)).toEqual({
      kind: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1',
      transcodeJobId: receipt.command.transcodeJobId,
      transcodePolicyVersion: receipt.command.policy.policyVersion,
      ffmpegVersion: receipt.runtime.ffmpegVersion,
      commandSha256: receipt.command.commandSha256,
      masterDecodeReceiptSha256: receipt.masterDecode.masterDecodeReceiptSha256,
      proxyEncodeReceiptSha256: receipt.proxyEncode.proxyEncodeReceiptSha256,
    });
  });

  it('rejects proxy storage keys, providers, owners, and assets outside the command scope', () => {
    const fixture = receiptFixture();
    const wrongKey = proxySource(fixture.command, { objectKey: 'proxy/wrong.mp4' });
    expect(() => createReceipt(fixture, { proxySourceVersion: wrongKey }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PROXY_SCOPE_MISMATCH');

    const expectedKey = expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
      command: fixture.command,
      proxyContentSha256: PROXY_CONTENT_SHA256,
    });
    const wrongProvider = proxySource(fixture.command, {
      provider: 'GCS',
      objectKey: expectedKey,
    });
    expect(() => createReceipt(fixture, { proxySourceVersion: wrongProvider }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PROXY_SCOPE_MISMATCH');

    const wrongOwner = proxySource(fixture.command, {
      owner: { kind: 'USER', userId: 'another-user' },
    });
    expect(() => createReceipt(fixture, { proxySourceVersion: wrongOwner }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PROXY_SCOPE_MISMATCH');

    const wrongAsset = proxySource(fixture.command, { assetId: 'another-asset' });
    expect(() => createReceipt(fixture, { proxySourceVersion: wrongAsset }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_PROXY_SCOPE_MISMATCH');
  });

  it('rejects mismatched local evidence and non-sequential output streams', () => {
    const fixture = receiptFixture();
    expect(() => createReceipt(fixture, {
      masterLocalFileEvidence: {
        ...fixture.masterLocalFileEvidence,
        contentSha256: hash('different-master-bytes'),
      },
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_EVIDENCE_MISMATCH');
    expect(() => createReceipt(fixture, { outputVideoStreamIndex: 1 }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_VIDEO_STREAM_INVALID');
    expect(() => createReceipt(fixture, { outputAudioStreamIndexes: [2, 1] }))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_AUDIO_STREAM_INVALID');
  });

  it('rejects output probe command, runtime, byte, stream, and time mismatches', () => {
    const fixture = receiptFixture();
    expect(() => createReceipt(fixture, {
      outputProbe: outputProbe(fixture.command, fixture.proxy, {
        commandSha256: hash('another-command'),
      }),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_SCOPE_MISMATCH');
    expect(() => createReceipt(fixture, {
      outputProbe: outputProbe(fixture.command, fixture.proxy, {
        ffprobeVersion: 'ffprobe version 9.0',
      }),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_SCOPE_MISMATCH');
    expect(() => createReceipt(fixture, {
      outputProbe: outputProbe(fixture.command, fixture.proxy, {
        proxyContentSha256: hash('other-proxy-bytes'),
      }),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_SCOPE_MISMATCH');
    expect(() => createReceipt(fixture, {
      outputProbe: outputProbe(fixture.command, fixture.proxy, { audio: [] }),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_SCOPE_MISMATCH');
    expect(() => createReceipt(fixture, {
      outputProbe: outputProbe(fixture.command, fixture.proxy, {
        probedAt: '2026-08-30T00:00:59.000Z',
      }),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_SCOPE_MISMATCH');
  });

  it('rejects nested process/runtime tampering and a forged outer receipt hash', () => {
    const { receipt } = receiptFixture();
    const processTamper = {
      ...receipt,
      process: { ...receipt.process, commandSha256: 'f'.repeat(64) },
    };
    expect(() => assertMediaProxyMasterTrustedTranscodeReceiptV1(processTamper))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_HASH_MISMATCH');

    const runtimeTamper = {
      ...receipt,
      runtime: { ...receipt.runtime, ffmpegVersion: 'ffmpeg forged' },
    };
    expect(() => assertMediaProxyMasterTrustedTranscodeReceiptV1(runtimeTamper))
      .toThrow('MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_HASH_MISMATCH');

    expect(() => assertMediaProxyMasterTrustedTranscodeReceiptV1({
      ...receipt,
      receiptSha256: 'f'.repeat(64),
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_HASH_MISMATCH');
  });
});

const PROXY_CONTENT_SHA256 = hash('proxy-content');

function policy() {
  return createMediaProxyMasterTranscodePolicyV1({
    presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
    timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
    container: 'mp4',
    videoCodec: 'libx264',
    pixelFormat: 'yuv420p',
    scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
    maximumWidth: 1_920,
    maximumHeight: 1_080,
    videoCrf: 23,
    videoPreset: 'fast',
    keyframeIntervalSeconds: 2,
    audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
    audioCodec: 'aac',
    audioBitrateBitsPerSecond: 192_000,
    maxSourceBytes: 5_000_000,
    maxOutputBytes: 2_000_000,
    timeoutMs: 120_000,
  });
}

function commandFixture(masterAudioStreamIndexes: readonly number[] = [1, 2]) {
  const master = source({ role: 'master', byteLength: 100_000 });
  const masterTimeMap = timeMap(master);
  const transcodePolicy = policy();
  const command = createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: 'transcode-job-1',
    policy: transcodePolicy,
    masterSourceVersion: master,
    masterTimeMap,
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes,
  });
  return { policy: transcodePolicy, command, master, masterTimeMap };
}

function commandInput(fixture: ReturnType<typeof commandFixture>) {
  return {
    transcodeJobId: fixture.command.transcodeJobId,
    policy: fixture.policy,
    masterSourceVersion: fixture.master,
    masterTimeMap: fixture.masterTimeMap,
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [1, 2],
  } as const;
}

function receiptFixture() {
  const fixture = commandFixture();
  const masterLocalFileEvidence = {
    sourceVersionSha256: fixture.master.sourceVersionSha256,
    storageVersionSha256: fixture.master.storageVersion.storageVersionSha256,
    byteLength: fixture.master.byteLength,
    contentSha256: fixture.master.contentSha256,
  };
  const proxy = proxySource(fixture.command);
  const receipt = createReceipt({ ...fixture, masterLocalFileEvidence, proxy });
  return { ...fixture, masterLocalFileEvidence, proxy, receipt };
}

type ReceiptInput = Parameters<
  typeof createMediaProxyMasterTrustedTranscodeReceiptV1
>[0];
type ReceiptFixture = ReturnType<typeof commandFixture> & Readonly<{
  masterLocalFileEvidence: ReceiptInput['masterLocalFileEvidence'];
  proxy: ReceiptInput['proxySourceVersion'];
}>;
type ReceiptOverrides = Partial<ReceiptInput>;

function createReceipt(fixture: ReceiptFixture, overrides: ReceiptOverrides = {}) {
  return createMediaProxyMasterTrustedTranscodeReceiptV1({
    command: fixture.command,
    runtime: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
    },
    process: {
      startedAt: '2026-08-30T00:00:00.000Z',
      completedAt: '2026-08-30T00:01:00.000Z',
      exitCode: 0,
      stderrByteLength: 0,
      stderrSha256: hash('empty-stderr'),
    },
    masterLocalFileEvidence: fixture.masterLocalFileEvidence,
    proxySourceVersion: fixture.proxy,
    outputProbe: outputProbe(fixture.command, fixture.proxy),
    outputVideoStreamIndex: 0,
    outputAudioStreamIndexes: [1, 2],
    completedAt: '2026-08-30T00:01:02.000Z',
    ...overrides,
  });
}

type OutputProbeInput = Parameters<
  typeof createMediaProxyMasterTranscodeOutputProbeV1
>[0];

function outputProbe(
  command: ReturnType<typeof commandFixture>['command'],
  proxy: ReturnType<typeof source>,
  overrides: Partial<OutputProbeInput> = {},
) {
  return createMediaProxyMasterTranscodeOutputProbeV1({
    commandSha256: command.commandSha256,
    ffprobeVersion: 'ffprobe version 8.1',
    proxyContentSha256: proxy.contentSha256,
    proxyByteLength: proxy.byteLength,
    container: 'mp4',
    formatNames: ['mov', 'mp4', 'm4a'],
    video: {
      streamIndex: 0,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      codedWidth: 1_280,
      codedHeight: 720,
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      frameCount: '300',
    },
    audio: [
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
    ],
    probedAt: '2026-08-30T00:01:01.000Z',
    ...overrides,
  });
}

function proxySource(
  command: ReturnType<typeof commandFixture>['command'],
  overrides: Partial<Parameters<typeof source>[0]> = {},
) {
  return source({
    role: 'proxy',
    byteLength: 40_000,
    contentSha256: PROXY_CONTENT_SHA256,
    objectKey: expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
      command,
      proxyContentSha256: PROXY_CONTENT_SHA256,
    }),
    ...overrides,
  });
}

function source(input: Readonly<{
  role: string;
  byteLength: number;
  contentSha256?: string;
  objectKey?: string;
  provider?: 'R2' | 'GCS';
  owner?: { kind: 'USER'; userId: string };
  assetId?: string;
}>) {
  const provider = input.provider ?? 'R2';
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: {
      provider,
      objectKey: input.objectKey ?? `media/${input.role}.mp4`,
    },
    byteLength: input.byteLength,
    providerVersion: provider === 'R2'
      ? { kind: 'R2_ETAG', value: `etag-${input.role}` }
      : { kind: 'GCS_GENERATION', value: `generation-${input.role}` },
  });
  return createMediaSourceVersionV1({
    owner: input.owner ?? { kind: 'USER', userId: 'user-a' },
    assetId: input.assetId ?? 'asset-a',
    mediaKind: 'video',
    byteLength: input.byteLength,
    contentSha256: input.contentSha256 ?? hash(`content-${input.role}`),
    storageVersion,
  });
}

function timeMap(sourceVersion: ReturnType<typeof source>) {
  return {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: hash('source-binding'),
    technicalObservationSha256: hash('observation'),
    sourcePtsCadenceMapStateSha256V3: hash('state-v3'),
    mapBindingSha256: hash('map-binding'),
    terminalReceiptSha256: hash('terminal'),
    verificationSha256: hash('verification'),
    epochIndexContentSha256: hash('epoch-index'),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: '300',
  };
}

function optionValue(arguments_: readonly string[], option: string): string | undefined {
  const index = arguments_.indexOf(option);
  return index < 0 ? undefined : arguments_[index + 1];
}

function mapValues(arguments_: readonly string[]): string[] {
  return arguments_.flatMap((argument, index) => (
    argument === '-map' ? [arguments_[index + 1]!] : []
  ));
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
