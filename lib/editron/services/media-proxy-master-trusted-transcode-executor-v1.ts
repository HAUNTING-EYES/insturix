import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { canonicalizeEditronJsonV1, hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaProxyMasterTranscodeOutputProbeV1,
  type MediaProxyMasterTranscodeOutputProbeV1,
} from './media-proxy-master-transcode-output-probe-v1';
import type { MediaProxyMasterTimeMapReferenceV1 } from './media-proxy-master-time-mapping-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  expectedMediaProxyMasterTranscodeR2ObjectKeyV1,
  materializeMediaProxyMasterTranscodeArgumentsV1,
  type MediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTrustedTranscodeReceiptV1,
} from './media-proxy-master-trusted-transcode-v1';
import {
  MEDIA_SOURCE_PROBE_VERSION_V1,
  type MediaSourceAudioStreamObservationV1,
  type MediaSourceTechnicalObservationV1,
  type MediaSourceVideoStreamObservationV1,
} from './media-source-probe-v1';
import { MEDIA_SOURCE_QUALIFICATION_VERSION_V1 } from './media-source-qualification-v1';
import { sameMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  createQualifiedAssetMediaSourceLeasePortV1,
  materializeVerifiedMediaSourceLocalFileV1,
  type VerifiedMediaSourceLocalFileEvidenceV1,
  type VerifiedMediaSourceLeasePortV1,
} from './verified-media-source-local-file-v1';

const TEMP_PREFIX_V1 = 'editron-proxy-master-transcode-v1-';
const TOOL_IDENTITY_LIMIT_BYTES_V1 = 8 * 1024;
const FFMPEG_STDOUT_LIMIT_BYTES_V1 = 8 * 1024;
const FFMPEG_STDERR_LIMIT_BYTES_V1 = 64 * 1024 * 1024;
const FFPROBE_STDOUT_LIMIT_BYTES_V1 = 4 * 1024 * 1024;
const FFPROBE_STDERR_LIMIT_BYTES_V1 = 64 * 1024;
const MAX_EXECUTABLE_TEXT_V1 = 4_096;

const PROCESS_ABORTED = 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_ABORTED';
const PROCESS_TIMEOUT = 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_TIMEOUT';
const PROCESS_UNAVAILABLE = 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_UNAVAILABLE';
const PROCESS_STDOUT_LIMIT = 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_STDOUT_LIMIT';
const PROCESS_STDERR_LIMIT = 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_STDERR_LIMIT';

export type MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1 =
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TIMEOUT'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_COMMAND_INVALID'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_EVIDENCE_INVALID'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_TIME_MAP_STALE'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_VERSION_MISMATCH'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_FAILED'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_RESOURCE_LIMIT'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_POLICY_MISMATCH'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_FAILED'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_SUBSTITUTION'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TEMP_CLEANUP_FAILED'
  | 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_INTERNAL_FAILURE';

export type MediaProxyMasterTrustedTranscodeExecutionResultV1 =
  | Readonly<{
      disposition: 'COMPLETED';
      receipt: MediaProxyMasterTrustedTranscodeReceiptV1;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      diagnostic: MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1;
    }>;

export type MediaProxyMasterTranscodeProcessResultV1 = Readonly<{
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
  startedAt: string;
  completedAt: string;
}>;

export interface MediaProxyMasterTranscodeProcessPortV1 {
  run(input: Readonly<{
    executable: string;
    arguments: readonly string[];
    timeoutMs: number;
    stdoutLimitBytes: number;
    stderrLimitBytes: number;
    abortSignal?: AbortSignal;
  }>): Promise<MediaProxyMasterTranscodeProcessResultV1>;
}

export interface MediaProxyMasterTranscodePublisherPortV1 {
  publish(input: Readonly<{
    localPath: string;
    objectKey: string;
    contentType: 'video/mp4';
    contentSha256: string;
    byteLength: number;
    owner: MediaSourceOwnerV1;
    assetId: string;
    commandSha256: string;
    outputProbeSha256: string;
    abortSignal?: AbortSignal;
  }>): Promise<Readonly<MediaSourceVersionV1>>;
}

/** Reads the current verified V3 timing identity from the existing MediaAsset owner. */
export interface MediaProxyMasterCurrentTimeMapPortV1 {
  read(
    asset: MediaSourcePtsCadenceMapAssetStateInputV3,
  ): Promise<MediaProxyMasterTimeMapReferenceV1 | null>;
}

export type MediaProxyMasterTranscodeExecutionInputV1 = Readonly<{
  command: MediaProxyMasterTranscodeCommandV1;
  masterAsset: MediaSourcePtsCadenceMapAssetStateInputV3;
  abortSignal?: AbortSignal;
}>;

export type MediaProxyMasterTrustedTranscodeExecutorV1 = Readonly<{
  execute(
    input: MediaProxyMasterTranscodeExecutionInputV1,
  ): Promise<MediaProxyMasterTrustedTranscodeExecutionResultV1>;
}>;

export type MediaProxyMasterTrustedTranscodeExecutorConfigV1 = Readonly<{
  ffmpegPath: string;
  ffprobePath: string;
  runtime: Readonly<{
    workerImageDigest: string;
    platform: string;
    ffmpegVersion: string;
    ffprobeVersion: string;
  }>;
  publisher: MediaProxyMasterTranscodePublisherPortV1;
  processPort?: MediaProxyMasterTranscodeProcessPortV1;
  currentTimeMapPort?: MediaProxyMasterCurrentTimeMapPortV1;
  sourceLeasePortFactory?: (
    asset: MediaSourcePtsCadenceMapAssetStateInputV3,
  ) => VerifiedMediaSourceLeasePortV1;
  fetcher?: typeof fetch;
  now?: () => Date;
}>;

export type MediaProxyMasterPreparedTranscodeExecutorConfigV1 = Omit<
  MediaProxyMasterTrustedTranscodeExecutorConfigV1,
  'publisher'
>;

export type MediaProxyMasterPreparedTranscodeEvidenceV1 = Readonly<{
  runtime: Readonly<{
    workerImageDigest: string;
    platform: string;
    ffmpegVersion: string;
    ffprobeVersion: string;
  }>;
  process: Readonly<{
    startedAt: string;
    completedAt: string;
    exitCode: 0;
    stderrByteLength: number;
    stderrSha256: string;
  }>;
  masterLocalFileEvidence: VerifiedMediaSourceLocalFileEvidenceV1;
  outputProbe: MediaProxyMasterTranscodeOutputProbeV1;
  outputVideoStreamIndex: 0;
  outputAudioStreamIndexes: readonly number[];
}>;

export interface MediaProxyMasterPreparedTranscodeLeaseV1 {
  readonly evidence: MediaProxyMasterPreparedTranscodeEvidenceV1;
  readonly abortSignal: AbortSignal;
  readonly timeoutSignal: AbortSignal;
  readonly callerSignal?: AbortSignal;
  useLocalArtifact<T>(consumer: (localPath: string) => Promise<T>): Promise<T>;
  revalidateSource(): Promise<void>;
  release(): Promise<void>;
}

export type MediaProxyMasterPreparedTranscodeExecutionResultV1 =
  | Readonly<{
      disposition: 'PREPARED';
      lease: Readonly<MediaProxyMasterPreparedTranscodeLeaseV1>;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      diagnostic: MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1;
    }>;

export type MediaProxyMasterPreparedTranscodeExecutorV1 = Readonly<{
  prepare(
    input: MediaProxyMasterTranscodeExecutionInputV1,
  ): Promise<MediaProxyMasterPreparedTranscodeExecutionResultV1>;
}>;

type SelectedMasterEvidenceV1 = Readonly<{
  video: MediaSourceVideoStreamObservationV1;
  audio: readonly MediaSourceAudioStreamObservationV1[];
}>;

type FfprobeStreamV1 = Readonly<{
  index?: unknown;
  codec_type?: unknown;
  codec_name?: unknown;
  pix_fmt?: unknown;
  width?: unknown;
  height?: unknown;
  time_base?: unknown;
  start_pts?: unknown;
  duration_ts?: unknown;
  nb_read_frames?: unknown;
  sample_rate?: unknown;
  channels?: unknown;
  channel_layout?: unknown;
}>;

type FailureDiagnosticV1 = MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1;

class TranscodeExecutionFailureV1 extends Error {
  readonly diagnostic: FailureDiagnosticV1;

  constructor(diagnostic: FailureDiagnosticV1) {
    super(diagnostic);
    this.name = 'TranscodeExecutionFailureV1';
    this.diagnostic = diagnostic;
  }
}

export function createMediaProxyMasterCurrentTimeMapPortV1():
MediaProxyMasterCurrentTimeMapPortV1 {
  return Object.freeze({
    async read(asset: MediaSourcePtsCadenceMapAssetStateInputV3) {
      const state = readMediaSourcePtsCadenceMapAssetStateV3(asset);
      const record = state?.sourcePtsCadenceMapV3;
      const terminal = record?.terminalReceipt;
      const verification = record?.verificationReceipt;
      if (!state || !record || record.status !== 'COMPLETE'
        || terminal?.disposition !== 'PUBLISHED'
        || terminal.verificationSha256 === null
        || verification === null) return null;
      return Object.freeze({
        sourceVersionSha256: record.source.sourceVersionSha256,
        storageVersionSha256: record.source.storageVersionSha256,
        sourceBindingSha256: record.source.sourceBindingSha256,
        technicalObservationSha256: record.source.technicalObservationSha256,
        sourcePtsCadenceMapStateSha256V3: state.sourcePtsCadenceMapStateSha256V3,
        mapBindingSha256: record.source.mapBindingSha256,
        terminalReceiptSha256: terminal.terminalReceiptSha256,
        verificationSha256: terminal.verificationSha256,
        epochIndexContentSha256: record.epochIndexSidecar.contentSha256,
        streamId: `video-${String(record.source.videoStreamIndex)}`,
        videoStreamIndex: record.source.videoStreamIndex,
        totalFrameCount: record.epochIndexSidecar.endExclusiveFrameOrdinal,
      });
    },
  });
}

/**
 * Executes one child process with no shell and bounded captured output.
 * A killed, timed-out, overflowing, or unavailable process never returns a
 * successful result to the transcode executor.
 */
export function createMediaProxyMasterTranscodeNodeProcessPortV1(
  now: () => Date = () => new Date(),
): MediaProxyMasterTranscodeProcessPortV1 {
  return Object.freeze({
    async run(input: Parameters<MediaProxyMasterTranscodeProcessPortV1['run']>[0]) {
      const executable = executableText(input.executable);
      const timeoutMs = positiveSafeInteger(input.timeoutMs, 24 * 60 * 60 * 1_000);
      const stdoutLimitBytes = nonNegativeSafeInteger(
        input.stdoutLimitBytes,
        64 * 1024 * 1024,
      );
      const stderrLimitBytes = nonNegativeSafeInteger(
        input.stderrLimitBytes,
        64 * 1024 * 1024,
      );
      if (!Array.isArray(input.arguments)
        || input.arguments.some((argument: string) => typeof argument !== 'string'
          || argument.length > 65_536 || argument.includes('\u0000'))) {
        throw new Error(PROCESS_UNAVAILABLE);
      }
      if (input.abortSignal?.aborted) throw new Error(PROCESS_ABORTED);
      return runChildProcessV1({
        executable,
        arguments: input.arguments,
        timeoutMs,
        stdoutLimitBytes,
        stderrLimitBytes,
        abortSignal: input.abortSignal,
        now,
      });
    },
  });
}

export function createMediaProxyMasterTrustedTranscodeExecutorV1(
  config: MediaProxyMasterTrustedTranscodeExecutorConfigV1,
): MediaProxyMasterTrustedTranscodeExecutorV1 {
  const preparer = createMediaProxyMasterPreparedTranscodeExecutorV1(config);
  const now = config.now ?? (() => new Date());

  return Object.freeze({
    async execute(input) {
      const prepared = await preparer.prepare(input);
      if (prepared.disposition === 'UNVERIFIABLE') return prepared;
      const lease = prepared.lease;
      const evidence = lease.evidence;
      let result: MediaProxyMasterTrustedTranscodeExecutionResultV1;
      try {
        const command = assertMediaProxyMasterTranscodeCommandV1(input.command);
        const objectKey = expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
          command,
          proxyContentSha256: evidence.outputProbe.proxyContentSha256,
        });
        const proxySourceVersion = await lease.useLocalArtifact(
          async (localPath) => publishProxyV1(config.publisher, {
            localPath,
            objectKey,
            contentType: 'video/mp4',
            contentSha256: evidence.outputProbe.proxyContentSha256,
            byteLength: evidence.outputProbe.proxyByteLength,
            owner: command.masterSourceVersion.owner,
            assetId: command.masterSourceVersion.assetId,
            commandSha256: command.commandSha256,
            outputProbeSha256: evidence.outputProbe.probeSha256,
            abortSignal: lease.abortSignal,
          }),
        );
        assertPublishedProxyV1(command, {
          byteLength: evidence.outputProbe.proxyByteLength,
          contentSha256: evidence.outputProbe.proxyContentSha256,
        }, objectKey, proxySourceVersion);
        await lease.revalidateSource();
        const completedAt = isoAtOrAfter(now(), evidence.outputProbe.probedAt);
        const receipt = createMediaProxyMasterTrustedTranscodeReceiptV1({
          command,
          runtime: evidence.runtime,
          process: evidence.process,
          masterLocalFileEvidence: evidence.masterLocalFileEvidence,
          proxySourceVersion,
          outputProbe: evidence.outputProbe,
          outputVideoStreamIndex: evidence.outputVideoStreamIndex,
          outputAudioStreamIndexes: evidence.outputAudioStreamIndexes,
          completedAt,
        });
        result = Object.freeze({ disposition: 'COMPLETED', receipt });
      } catch (error) {
        result = unavailable(diagnosticFromFailure(
          error,
          lease.abortSignal,
          lease.timeoutSignal,
          lease.callerSignal,
        ));
      }

      try {
        await lease.release();
      } catch {
        if (result.disposition === 'COMPLETED') {
          result = unavailable(
            'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TEMP_CLEANUP_FAILED',
          );
        }
      }
      return result;
    },
  });
}

export function createMediaProxyMasterPreparedTranscodeExecutorV1(
  config: MediaProxyMasterPreparedTranscodeExecutorConfigV1,
): MediaProxyMasterPreparedTranscodeExecutorV1 {
  const processPort = config.processPort ?? createMediaProxyMasterTranscodeNodeProcessPortV1();
  const currentTimeMapPort = config.currentTimeMapPort
    ?? createMediaProxyMasterCurrentTimeMapPortV1();
  const sourceLeasePortFactory = config.sourceLeasePortFactory
    ?? ((asset) => createQualifiedAssetMediaSourceLeasePortV1(asset, {
      bindingStale: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE',
      versionStale: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE',
      sourceUnavailable: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE',
    }));
  const now = config.now ?? (() => new Date());

  return Object.freeze({
    async prepare(input) {
      if (input.abortSignal?.aborted) {
        return unavailable('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED');
      }
      let command: MediaProxyMasterTranscodeCommandV1;
      try {
        command = assertMediaProxyMasterTranscodeCommandV1(input.command);
      } catch {
        return unavailable('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_COMMAND_INVALID');
      }

      const timeoutSignal = AbortSignal.timeout(command.policy.timeoutMs);
      const abortSignal = input.abortSignal
        ? AbortSignal.any([input.abortSignal, timeoutSignal])
        : timeoutSignal;
      const deadlineMs = Date.now() + command.policy.timeoutMs;
      let temporaryDirectory: string | null = null;
      let result: MediaProxyMasterPreparedTranscodeExecutionResultV1;

      try {
        const runtime = assertRuntime(config);
        const masterEvidence = assertSelectedMasterEvidence(command, input.masterAsset);
        let currentTimeMap: MediaProxyMasterTimeMapReferenceV1 | null;
        try {
          currentTimeMap = await currentTimeMapPort.read(input.masterAsset);
        } catch {
          fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_EVIDENCE_INVALID');
        }
        assertNotAborted(abortSignal);
        if (!currentTimeMap || canonicalizeEditronJsonV1(currentTimeMap)
          !== canonicalizeEditronJsonV1(command.masterTimeMap)) {
          fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_TIME_MAP_STALE');
        }
        await assertToolIdentity({
          processPort,
          executable: runtime.ffmpegPath,
          role: 'ffmpeg',
          expected: runtime.ffmpegVersion,
          timeoutMs: remainingTimeoutMs(deadlineMs),
          abortSignal,
        });
        await assertToolIdentity({
          processPort,
          executable: runtime.ffprobePath,
          role: 'ffprobe',
          expected: runtime.ffprobeVersion,
          timeoutMs: remainingTimeoutMs(deadlineMs),
          abortSignal,
        });

        const leasePort = sourceLeasePortFactory(input.masterAsset);
        const lease = await openSourceLease(leasePort, command, abortSignal, timeoutSignal, input.abortSignal);
        temporaryDirectory = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX_V1));
        const masterInputPath = path.join(temporaryDirectory, 'master-input.bin');
        const proxyOutputPath = path.join(temporaryDirectory, 'proxy-output.mp4');
        const masterLocalFileEvidence = await materializeVerifiedMediaSourceLocalFileV1({
          sourceUrl: lease.sourceUrl,
          outputPath: masterInputPath,
          sourceVersion: command.masterSourceVersion,
          maximumBytes: command.policy.maxSourceBytes,
          timeoutMs: remainingTimeoutMs(deadlineMs),
          errorCodes: {
            sourceByteLimitExceeded: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID',
            sourceUrlInvalid: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE',
            sourceReadFailed: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE',
            sourceByteLengthMismatch: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID',
            sourceContentMismatch: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID',
            outputWriteFailed: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE',
          },
          abortSignal,
          fetcher: config.fetcher,
        });
        await assertSourceCurrent(lease.revalidate, abortSignal);

        const ffmpegArguments = materializeMediaProxyMasterTranscodeArgumentsV1({
          command,
          masterInputPath,
          proxyOutputPath,
        });
        const processResult = await runProcess({
          processPort,
          executable: runtime.ffmpegPath,
          arguments: ffmpegArguments,
          timeoutMs: remainingTimeoutMs(deadlineMs),
          stdoutLimitBytes: FFMPEG_STDOUT_LIMIT_BYTES_V1,
          stderrLimitBytes: FFMPEG_STDERR_LIMIT_BYTES_V1,
          abortSignal,
          timeoutSignal,
          callerSignal: input.abortSignal,
        });
        if (processResult.exitCode !== 0) {
          fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_FAILED');
        }

        const outputIdentity = await hashRegularFileV1(
          proxyOutputPath,
          command.policy.maxOutputBytes,
          abortSignal,
        );
        const ffprobeResult = await runProcess({
          processPort,
          executable: runtime.ffprobePath,
          arguments: ffprobeArgumentsV1(proxyOutputPath),
          timeoutMs: remainingTimeoutMs(deadlineMs),
          stdoutLimitBytes: FFPROBE_STDOUT_LIMIT_BYTES_V1,
          stderrLimitBytes: FFPROBE_STDERR_LIMIT_BYTES_V1,
          abortSignal,
          timeoutSignal,
          callerSignal: input.abortSignal,
        });
        if (ffprobeResult.exitCode !== 0) {
          fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
        }
        const outputProbe = parseOutputProbeV1({
          command,
          ffprobeVersion: runtime.ffprobeVersion,
          stdout: ffprobeResult.stdout,
          outputIdentity,
          probedAt: ffprobeResult.completedAt,
        });
        assertOutputPolicyV1(command, masterEvidence, outputProbe);
        await assertSourceCurrent(lease.revalidate, abortSignal);
        const preparedLease = createPreparedTranscodeLeaseV1({
          temporaryDirectory,
          proxyOutputPath,
          revalidateSource: lease.revalidate,
          abortSignal,
          timeoutSignal,
          callerSignal: input.abortSignal,
          evidence: {
            runtime: {
              workerImageDigest: runtime.workerImageDigest,
              platform: runtime.platform,
              ffmpegVersion: runtime.ffmpegVersion,
              ffprobeVersion: runtime.ffprobeVersion,
            },
            process: {
              startedAt: processResult.startedAt,
              completedAt: processResult.completedAt,
              exitCode: 0,
              stderrByteLength: processResult.stderr.byteLength,
              stderrSha256:
                createHash('sha256').update(processResult.stderr).digest('hex'),
            },
            masterLocalFileEvidence,
            outputProbe,
            outputVideoStreamIndex: 0,
            outputAudioStreamIndexes:
              outputProbe.audio.map(({ streamIndex }) => streamIndex),
          },
        });
        temporaryDirectory = null;
        result = Object.freeze({
          disposition: 'PREPARED',
          lease: preparedLease,
        });
      } catch (error) {
        result = unavailable(diagnosticFromFailure(
          error,
          abortSignal,
          timeoutSignal,
          input.abortSignal,
        ));
      }

      if (temporaryDirectory !== null) {
        try {
          await removeOwnedTemporaryDirectoryV1(temporaryDirectory);
        } catch { /* Preserve the primary failed-preparation diagnostic. */ }
      }
      return result;
    },
  });
}

function createPreparedTranscodeLeaseV1(input: Readonly<{
  temporaryDirectory: string;
  proxyOutputPath: string;
  revalidateSource: () => Promise<boolean>;
  abortSignal: AbortSignal;
  timeoutSignal: AbortSignal;
  callerSignal?: AbortSignal;
  evidence: MediaProxyMasterPreparedTranscodeEvidenceV1;
}>): Readonly<MediaProxyMasterPreparedTranscodeLeaseV1> {
  let released = false;
  let releaseStarted = false;
  let activeUses = 0;
  let releasePromise: Promise<void> | null = null;
  const assertActive = () => {
    if (released || releaseStarted) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_INTERNAL_FAILURE');
    }
  };
  return Object.freeze({
    evidence: Object.freeze({
      ...input.evidence,
      runtime: Object.freeze({ ...input.evidence.runtime }),
      process: Object.freeze({ ...input.evidence.process }),
      outputAudioStreamIndexes:
        Object.freeze([...input.evidence.outputAudioStreamIndexes]),
    }),
    abortSignal: input.abortSignal,
    timeoutSignal: input.timeoutSignal,
    ...(input.callerSignal ? { callerSignal: input.callerSignal } : {}),
    async useLocalArtifact<T>(
      consumer: (localPath: string) => Promise<T>,
    ): Promise<T> {
      assertActive();
      assertNotAborted(input.abortSignal);
      activeUses += 1;
      try {
        return await consumer(input.proxyOutputPath);
      } finally {
        activeUses -= 1;
      }
    },
    async revalidateSource(): Promise<void> {
      assertActive();
      await assertSourceCurrent(input.revalidateSource, input.abortSignal);
    },
    async release(): Promise<void> {
      if (released) return;
      if (activeUses !== 0) {
        fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_INTERNAL_FAILURE');
      }
      releaseStarted = true;
      releasePromise ??=
        removeOwnedTemporaryDirectoryV1(input.temporaryDirectory);
      await releasePromise;
      released = true;
    },
  });
}

async function runChildProcessV1(input: Readonly<{
  executable: string;
  arguments: readonly string[];
  timeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  abortSignal?: AbortSignal;
  now: () => Date;
}>): Promise<MediaProxyMasterTranscodeProcessResultV1> {
  const startedAt = isoInstant(input.now(), PROCESS_UNAVAILABLE);
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.executable, [...input.arguments], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(new Error(PROCESS_UNAVAILABLE));
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminationError: Error | null = null;
    let settled = false;
    const stop = (error: Error) => {
      terminationError ??= error;
      child.kill('SIGKILL');
    };
    const onAbort = () => stop(new Error(PROCESS_ABORTED));
    input.abortSignal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => stop(new Error(PROCESS_TIMEOUT)), input.timeoutMs);
    const finish = (error: Error | null, exitCode?: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.abortSignal?.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
        return;
      }
      let completedAt: string;
      try {
        completedAt = isoInstant(input.now(), PROCESS_UNAVAILABLE);
      } catch (clockError) {
        reject(clockError);
        return;
      }
      resolve(Object.freeze({
        exitCode: exitCode ?? -1,
        stdout: Buffer.concat(stdout, stdoutBytes),
        stderr: Buffer.concat(stderr, stderrBytes),
        startedAt,
        completedAt,
      }));
    };
    child.stdout?.on('data', (chunk: Buffer | Uint8Array) => {
      const bytes = Buffer.from(chunk);
      stdoutBytes += bytes.byteLength;
      if (stdoutBytes > input.stdoutLimitBytes) {
        stop(new Error(PROCESS_STDOUT_LIMIT));
      } else {
        stdout.push(bytes);
      }
    });
    child.stderr?.on('data', (chunk: Buffer | Uint8Array) => {
      const bytes = Buffer.from(chunk);
      stderrBytes += bytes.byteLength;
      if (stderrBytes > input.stderrLimitBytes) {
        stop(new Error(PROCESS_STDERR_LIMIT));
      } else {
        stderr.push(bytes);
      }
    });
    child.once('error', () => finish(terminationError ?? new Error(PROCESS_UNAVAILABLE)));
    child.once('close', (code) => finish(terminationError, code));
    if (input.abortSignal?.aborted) onAbort();
  });
}

function assertRuntime(config: MediaProxyMasterPreparedTranscodeExecutorConfigV1) {
  try {
    const ffmpegPath = executableText(config.ffmpegPath);
    const ffprobePath = executableText(config.ffprobePath);
    const workerImageDigest = sha256Text(config.runtime?.workerImageDigest);
    const platform = boundedText(config.runtime?.platform, 240);
    const ffmpegVersion = boundedText(config.runtime?.ffmpegVersion, 256);
    const ffprobeVersion = boundedText(config.runtime?.ffprobeVersion, 256);
    if (platform !== `${process.platform}-${process.arch}`
      || !ffmpegVersion.startsWith('ffmpeg version ')
      || !ffprobeVersion.startsWith('ffprobe version ')) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID');
    }
    return Object.freeze({
      ffmpegPath,
      ffprobePath,
      workerImageDigest,
      platform,
      ffmpegVersion,
      ffprobeVersion,
    });
  } catch (error) {
    if (error instanceof TranscodeExecutionFailureV1) throw error;
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID');
  }
}

function assertSelectedMasterEvidence(
  command: MediaProxyMasterTranscodeCommandV1,
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): SelectedMasterEvidenceV1 {
  try {
    const source = assertMediaSourceVersionV1(asset.sourceVersionV1);
    const qualification = record(asset.sourceQualificationV1);
    const storageVersion = qualification.storageVersion as ReturnType<
      typeof assertMediaSourceVersionV1
    >['storageVersion'];
    const observation = record(qualification.observation) as MediaSourceTechnicalObservationV1;
    if (asset.assetId !== source.assetId || asset.type !== 'video'
      || source.sourceVersionSha256 !== command.masterSourceVersion.sourceVersionSha256
      || qualification.schemaVersion !== 1
      || qualification.kind !== MEDIA_SOURCE_QUALIFICATION_VERSION_V1
      || qualification.status !== 'MEASURED_TECHNICAL'
      || qualification.assetId !== source.assetId
      || qualification.sourceBindingSha256 !== command.masterTimeMap.sourceBindingSha256
      || !sameMediaSourceStorageVersionV1(storageVersion, source.storageVersion)
      || observation.schemaVersion !== 1
      || observation.kind !== MEDIA_SOURCE_PROBE_VERSION_V1
      || observation.observationSha256 !== command.masterTimeMap.technicalObservationSha256) {
      throw new Error('MASTER_SCOPE_INVALID');
    }
    const { observationSha256, ...observationMaterial } = observation;
    if (observationSha256 !== hashEditronCanonicalJsonV1(observationMaterial)
      || !Array.isArray(observation.videoStreams)
      || !Array.isArray(observation.audioStreams)) {
      throw new Error('MASTER_OBSERVATION_INVALID');
    }
    const videoMatches = observation.videoStreams.filter(
      ({ streamIndex }) => streamIndex === command.masterVideoStreamIndex,
    );
    if (videoMatches.length !== 1) throw new Error('MASTER_VIDEO_INVALID');
    const video = videoMatches[0]!;
    assertSourceVideoObservationV1(video);
    const audio = command.masterAudioStreamIndexes.map((streamIndex) => {
      const matches = observation.audioStreams.filter(
        (candidate) => candidate.streamIndex === streamIndex,
      );
      if (matches.length !== 1) throw new Error('MASTER_AUDIO_INVALID');
      assertSourceAudioObservationV1(matches[0]!);
      return matches[0]!;
    });
    return Object.freeze({ video, audio: Object.freeze(audio) });
  } catch {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_EVIDENCE_INVALID');
  }
}

function assertSourceVideoObservationV1(value: MediaSourceVideoStreamObservationV1): void {
  positiveSafeInteger(value.codedWidth, 65_536);
  positiveSafeInteger(value.codedHeight, 65_536);
  assertRationalV1(value.sourceTimebase);
}

function assertSourceAudioObservationV1(value: MediaSourceAudioStreamObservationV1): void {
  positiveIntegerText(value.sampleRate);
  positiveSafeInteger(value.channelCount, 1_024);
  boundedText(value.channelLayout, 256);
  assertRationalV1(value.sourceTimebase);
}

async function assertToolIdentity(input: Readonly<{
  processPort: MediaProxyMasterTranscodeProcessPortV1;
  executable: string;
  role: 'ffmpeg' | 'ffprobe';
  expected: string;
  timeoutMs: number;
  abortSignal: AbortSignal;
}>): Promise<void> {
  let output: MediaProxyMasterTranscodeProcessResultV1;
  try {
    output = await input.processPort.run({
      executable: input.executable,
      arguments: ['-version'],
      timeoutMs: input.timeoutMs,
      stdoutLimitBytes: TOOL_IDENTITY_LIMIT_BYTES_V1,
      stderrLimitBytes: TOOL_IDENTITY_LIMIT_BYTES_V1,
      abortSignal: input.abortSignal,
    });
  } catch {
    if (input.abortSignal.aborted) throw new Error(PROCESS_ABORTED);
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE');
  }
  if (output.exitCode !== 0) fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE');
  let firstLine: string;
  try {
    firstLine = decodeUtf8(output.stdout).split(/\r?\n/, 1)[0]?.trim() ?? '';
  } catch {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE');
  }
  if (firstLine !== input.expected || !firstLine.startsWith(`${input.role} version `)) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_VERSION_MISMATCH');
  }
}

async function openSourceLease(
  leasePort: VerifiedMediaSourceLeasePortV1,
  command: MediaProxyMasterTranscodeCommandV1,
  abortSignal: AbortSignal,
  timeoutSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
) {
  try {
    assertNotAborted(abortSignal);
    const lease = await leasePort.open(command.masterSourceVersion);
    if (!sameMediaSourceStorageVersionV1(
      lease.storageVersion,
      command.masterSourceVersion.storageVersion,
    )) fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE');
    return lease;
  } catch (error) {
    if (abortSignal.aborted) {
      fail(abortDiagnostic(timeoutSignal, callerSignal));
    }
    if (error instanceof TranscodeExecutionFailureV1) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message === 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE') {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE');
    }
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE');
  }
}

async function runProcess(input: Readonly<{
  processPort: MediaProxyMasterTranscodeProcessPortV1;
  executable: string;
  arguments: readonly string[];
  timeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  abortSignal: AbortSignal;
  timeoutSignal: AbortSignal;
  callerSignal?: AbortSignal;
}>): Promise<MediaProxyMasterTranscodeProcessResultV1> {
  try {
    return await input.processPort.run(input);
  } catch (error) {
    if (input.abortSignal.aborted) {
      fail(abortDiagnostic(input.timeoutSignal, input.callerSignal));
    }
    const message = error instanceof Error ? error.message : '';
    if (message === PROCESS_STDOUT_LIMIT || message === PROCESS_STDERR_LIMIT) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_RESOURCE_LIMIT');
    }
    if (message === PROCESS_TIMEOUT) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TIMEOUT');
    }
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_FAILED');
  }
}

function parseOutputProbeV1(input: Readonly<{
  command: MediaProxyMasterTranscodeCommandV1;
  ffprobeVersion: string;
  stdout: Buffer;
  outputIdentity: Readonly<{ byteLength: number; contentSha256: string }>;
  probedAt: string;
}>): MediaProxyMasterTranscodeOutputProbeV1 {
  try {
    const parsed = JSON.parse(decodeUtf8(input.stdout)) as unknown;
    const root = record(parsed);
    if (!Array.isArray(root.streams)) throw new Error('STREAMS_INVALID');
    const streams = root.streams.map((entry) => record(entry) as FfprobeStreamV1);
    const video = streams.filter(({ codec_type: type }) => type === 'video');
    const audio = streams.filter(({ codec_type: type }) => type === 'audio');
    if (video.length !== 1 || streams.length !== video.length + audio.length) {
      throw new Error('STREAM_SET_INVALID');
    }
    const format = record(root.format);
    const formatName = boundedText(format.format_name, 512);
    const formatNames = formatName.split(',').map((name) => name.trim()).filter(Boolean);
    const videoStream = video[0]!;
    return createMediaProxyMasterTranscodeOutputProbeV1({
      commandSha256: input.command.commandSha256,
      ffprobeVersion: input.ffprobeVersion,
      proxyContentSha256: input.outputIdentity.contentSha256,
      proxyByteLength: input.outputIdentity.byteLength,
      container: 'mp4',
      formatNames,
      video: {
        streamIndex: outputVideoStreamIndexV1(videoStream.index),
        codec: boundedText(videoStream.codec_name, 64) as 'h264',
        pixelFormat: boundedText(videoStream.pix_fmt, 64) as 'yuv420p',
        codedWidth: positiveSafeInteger(videoStream.width, 65_536),
        codedHeight: positiveSafeInteger(videoStream.height, 65_536),
        sourceTimebase: parseRationalTextV1(videoStream.time_base),
        sourceStartPts: signedIntegerText(videoStream.start_pts),
        sourceDurationTicks: positiveIntegerText(videoStream.duration_ts),
        frameCount: positiveIntegerText(videoStream.nb_read_frames),
      },
      audio: audio.map((stream) => ({
        streamIndex: nonNegativeSafeInteger(stream.index, 64),
        codec: boundedText(stream.codec_name, 64) as 'aac',
        sampleRate: positiveIntegerText(stream.sample_rate),
        channelCount: positiveSafeInteger(stream.channels, 1_024),
        channelLayout: boundedText(stream.channel_layout, 256),
        sourceTimebase: parseRationalTextV1(stream.time_base),
        sourceStartPts: signedIntegerText(stream.start_pts),
        sourceDurationTicks: positiveIntegerText(stream.duration_ts),
      })),
      probedAt: isoInstant(new Date(input.probedAt), 'OUTPUT_PROBE_TIME_INVALID'),
    });
  } catch {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
  }
}

function assertOutputPolicyV1(
  command: MediaProxyMasterTranscodeCommandV1,
  master: SelectedMasterEvidenceV1,
  output: MediaProxyMasterTranscodeOutputProbeV1,
): void {
  const sourceWidth = master.video.codedWidth!;
  const sourceHeight = master.video.codedHeight!;
  if (output.video.frameCount !== command.masterTimeMap.totalFrameCount
    || output.video.codedWidth > sourceWidth
    || output.video.codedHeight > sourceHeight
    || output.video.codedWidth > command.policy.maximumWidth
    || output.video.codedHeight > command.policy.maximumHeight
    || !sameRationalV1(output.video.sourceTimebase, master.video.sourceTimebase!)
    || !aspectRatioWithinEvenPixelRoundingV1(
      sourceWidth,
      sourceHeight,
      output.video.codedWidth,
      output.video.codedHeight,
    )
    || output.audio.length !== master.audio.length) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_POLICY_MISMATCH');
  }
  master.audio.forEach((source, sequence) => {
    const candidate = output.audio[sequence];
    if (!candidate || candidate.streamIndex !== sequence + 1
      || candidate.sampleRate !== source.sampleRate
      || candidate.channelCount !== source.channelCount
      || candidate.channelLayout !== source.channelLayout
      || !sameRationalV1(candidate.sourceTimebase, {
        numerator: '1', denominator: source.sampleRate!,
      })) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_POLICY_MISMATCH');
    }
  });
}

async function publishProxyV1(
  publisher: MediaProxyMasterTranscodePublisherPortV1,
  input: Parameters<MediaProxyMasterTranscodePublisherPortV1['publish']>[0],
): Promise<Readonly<MediaSourceVersionV1>> {
  try {
    return assertMediaSourceVersionV1(await publisher.publish(input));
  } catch {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_FAILED');
  }
}

function assertPublishedProxyV1(
  command: MediaProxyMasterTranscodeCommandV1,
  output: Readonly<{ byteLength: number; contentSha256: string }>,
  objectKey: string,
  proxy: Readonly<MediaSourceVersionV1>,
): void {
  if (proxy.assetId !== command.masterSourceVersion.assetId
    || proxy.mediaKind !== 'video'
    || !sameOwner(proxy.owner, command.masterSourceVersion.owner)
    || proxy.byteLength !== output.byteLength
    || proxy.contentSha256 !== output.contentSha256
    || proxy.storageVersion.locator.provider !== 'R2'
    || proxy.storageVersion.locator.objectKey !== objectKey) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_SUBSTITUTION');
  }
}

async function assertSourceCurrent(
  revalidate: () => Promise<boolean>,
  abortSignal: AbortSignal,
): Promise<void> {
  assertNotAborted(abortSignal);
  let current = false;
  try {
    current = await revalidate();
  } catch {
    current = false;
  }
  if (!current) fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE');
}

async function hashRegularFileV1(
  filePath: string,
  maximumBytes: number,
  abortSignal: AbortSignal,
): Promise<Readonly<{ byteLength: number; contentSha256: string }>> {
  try {
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()
      || metadata.size < 1 || metadata.size > maximumBytes) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
    }
    const digest = createHash('sha256');
    let byteLength = 0;
    for await (const chunk of createReadStream(filePath)) {
      assertNotAborted(abortSignal);
      const bytes = Buffer.from(chunk as Uint8Array);
      byteLength += bytes.byteLength;
      if (byteLength > maximumBytes || byteLength > metadata.size) {
        fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
      }
      digest.update(bytes);
    }
    if (byteLength !== metadata.size) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
    }
    return Object.freeze({ byteLength, contentSha256: digest.digest('hex') });
  } catch (error) {
    if (error instanceof TranscodeExecutionFailureV1) throw error;
    fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
  }
}

function ffprobeArgumentsV1(outputPath: string): readonly string[] {
  return Object.freeze([
    '-v', 'error',
    '-count_frames',
    '-show_entries',
    'stream=index,codec_type,codec_name,pix_fmt,width,height,time_base,start_pts,duration_ts,nb_read_frames,sample_rate,channels,channel_layout:format=format_name',
    '-of', 'json',
    outputPath,
  ]);
}

function remainingTimeoutMs(deadlineMs: number): number {
  const remaining = Math.floor(deadlineMs - Date.now());
  if (remaining < 1) fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TIMEOUT');
  return remaining;
}

function diagnosticFromFailure(
  error: unknown,
  abortSignal: AbortSignal,
  timeoutSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
): FailureDiagnosticV1 {
  if (abortSignal.aborted) return abortDiagnostic(timeoutSignal, callerSignal);
  if (error instanceof TranscodeExecutionFailureV1) return error.diagnostic;
  const message = error instanceof Error ? error.message : '';
  if (message === PROCESS_ABORTED) return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED';
  if (message === PROCESS_TIMEOUT) return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TIMEOUT';
  if (message === PROCESS_STDOUT_LIMIT || message === PROCESS_STDERR_LIMIT) {
    return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_RESOURCE_LIMIT';
  }
  if (message === 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE') {
    return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE';
  }
  if (message === 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE') {
    return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE';
  }
  if (message === 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID') {
    return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID';
  }
  return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_INTERNAL_FAILURE';
}

function abortDiagnostic(
  timeoutSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
): FailureDiagnosticV1 {
  if (callerSignal?.aborted) return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED';
  if (timeoutSignal.aborted) return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TIMEOUT';
  return 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED';
}

function unavailable(
  diagnostic: FailureDiagnosticV1,
) {
  return Object.freeze({ disposition: 'UNVERIFIABLE', diagnostic });
}

function aspectRatioWithinEvenPixelRoundingV1(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
): boolean {
  const crossProductDelta = Math.abs(
    (outputWidth * sourceHeight) - (outputHeight * sourceWidth),
  );
  return crossProductDelta <= 2 * Math.max(sourceWidth, sourceHeight);
}

function parseRationalTextV1(value: unknown): Readonly<{
  numerator: string;
  denominator: string;
}> {
  if (typeof value !== 'string') throw new Error('RATIONAL_INVALID');
  const match = /^([1-9][0-9]{0,127})\/([1-9][0-9]{0,127})$/.exec(value);
  if (!match) throw new Error('RATIONAL_INVALID');
  return { numerator: match[1]!, denominator: match[2]! };
}

function assertRationalV1(value: unknown): asserts value is Readonly<{
  numerator: string;
  denominator: string;
}> {
  const candidate = record(value);
  positiveIntegerText(candidate.numerator);
  positiveIntegerText(candidate.denominator);
}

function sameRationalV1(
  left: Readonly<{ numerator: string; denominator: string }>,
  right: Readonly<{ numerator: string; denominator: string }>,
): boolean {
  return BigInt(left.numerator) * BigInt(right.denominator)
    === BigInt(right.numerator) * BigInt(left.denominator);
}

function positiveIntegerText(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('INTEGER_INVALID');
    return String(value);
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) {
    throw new Error('INTEGER_INVALID');
  }
  return value;
}

function signedIntegerText(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('INTEGER_INVALID');
    return String(value);
  }
  if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]{0,127})$/.test(value)) {
    throw new Error('INTEGER_INVALID');
  }
  return value;
}

function positiveSafeInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error('INTEGER_INVALID');
  }
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error('INTEGER_INVALID');
  }
  return Number(value);
}

function outputVideoStreamIndexV1(value: unknown): 0 {
  if (value !== 0) throw new Error('OUTPUT_VIDEO_STREAM_INVALID');
  return 0;
}

function executableText(value: unknown): string {
  return boundedText(value, MAX_EXECUTABLE_TEXT_V1);
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1
    || value.length > maximum || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('TEXT_INVALID');
  }
  return value;
}

function sha256Text(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('SHA256_INVALID');
  }
  return value;
}

function decodeUtf8(value: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('RECORD_INVALID');
  }
  return value as Record<string, unknown>;
}

function isoInstant(value: Date, error: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(error);
  return value.toISOString();
}

function isoAtOrAfter(value: Date, lowerBound: string): string {
  const candidate = isoInstant(value, 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID');
  const lower = Date.parse(lowerBound);
  if (Number.isNaN(lower)) fail('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID');
  return Date.parse(candidate) < lower ? new Date(lower).toISOString() : candidate;
}

function sameOwner(left: MediaSourceOwnerV1, right: MediaSourceOwnerV1): boolean {
  return left.kind === right.kind && (left.kind === 'USER'
    ? left.userId === (right as Extract<MediaSourceOwnerV1, { kind: 'USER' }>).userId
    : left.orgId === (right as Extract<MediaSourceOwnerV1, { kind: 'ORG' }>).orgId);
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(PROCESS_ABORTED);
}

async function removeOwnedTemporaryDirectoryV1(directory: string): Promise<void> {
  const temporaryRoot = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(temporaryRoot)
    || !path.basename(resolved).startsWith(TEMP_PREFIX_V1)) {
    throw new Error('TEMP_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}

function fail(diagnostic: FailureDiagnosticV1): never {
  throw new TranscodeExecutionFailureV1(diagnostic);
}
