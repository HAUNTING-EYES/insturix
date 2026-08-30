import path from 'node:path';

import {
  MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
  type MediaProxyMasterPreparationOwnerV2,
} from './media-proxy-master-transcode-durable-attempt-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  createMediaProxyMasterPreparedTranscodeExecutorV1,
  type MediaProxyMasterPreparedTranscodeExecutorConfigV1,
} from './media-proxy-master-trusted-transcode-executor-v1';

export class MediaProxyMasterTranscodePreparationOwnerErrorV2 extends Error {}

export type MediaProxyMasterTranscodePreparationOwnerConfigV2 = Readonly<{
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  ffmpegPath: string;
  ffprobePath: string;
  processPort?: MediaProxyMasterPreparedTranscodeExecutorConfigV1['processPort'];
  currentTimeMapPort?:
    MediaProxyMasterPreparedTranscodeExecutorConfigV1['currentTimeMapPort'];
  sourceLeasePortFactory?:
    MediaProxyMasterPreparedTranscodeExecutorConfigV1['sourceLeasePortFactory'];
  fetcher?: MediaProxyMasterPreparedTranscodeExecutorConfigV1['fetcher'];
  now?: MediaProxyMasterPreparedTranscodeExecutorConfigV1['now'];
  createExecutor?: typeof createMediaProxyMasterPreparedTranscodeExecutorV1;
}>;

/**
 * Binds the existing trusted preparation executor to one persisted V2 runtime
 * and transcode-policy identity. The executor remains the sole owner of source
 * leasing, FFmpeg form, output validation, and temporary-artifact cleanup.
 */
export function createMediaProxyMasterTranscodePreparationOwnerV2(
  input: MediaProxyMasterTranscodePreparationOwnerConfigV2,
): Readonly<MediaProxyMasterPreparationOwnerV2> {
  let jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  try {
    jobInput = assertMediaProxyMasterTranscodeDurableJobInputV2(
      input.jobInput,
    );
  } catch {
    fail('JOB_INPUT_INVALID');
  }
  const ffmpegPath = absoluteExecutable(input.ffmpegPath, 'FFMPEG');
  const ffprobePath = absoluteExecutable(input.ffprobePath, 'FFPROBE');
  const profile = jobInput.runtimePolicy.executionProfile;
  const createExecutor = input.createExecutor
    ?? createMediaProxyMasterPreparedTranscodeExecutorV1;
  const executorConfig = {
    ffmpegPath,
    ffprobePath,
    runtime: {
      workerImageDigest: profile.workerImageDigest,
      platform: profile.platform,
      ffmpegVersion: profile.ffmpegVersion,
      ffprobeVersion: profile.ffprobeVersion,
    },
    ...(input.processPort ? { processPort: input.processPort } : {}),
    ...(input.currentTimeMapPort
      ? { currentTimeMapPort: input.currentTimeMapPort } : {}),
    ...(input.sourceLeasePortFactory
      ? { sourceLeasePortFactory: input.sourceLeasePortFactory } : {}),
    ...(input.fetcher ? { fetcher: input.fetcher } : {}),
    ...(input.now ? { now: input.now } : {}),
  } satisfies MediaProxyMasterPreparedTranscodeExecutorConfigV1;
  let executor: ReturnType<
    typeof createMediaProxyMasterPreparedTranscodeExecutorV1
  >;
  try {
    executor = createExecutor(executorConfig);
  } catch {
    fail('EXECUTOR_CONSTRUCTION_FAILED');
  }
  if (!executor || typeof executor.prepare !== 'function') {
    fail('EXECUTOR_INVALID');
  }

  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
    ownerVersion: jobInput.command.policy.policyVersion,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    prepare(
      value: Parameters<MediaProxyMasterPreparationOwnerV2['prepare']>[0],
    ) {
      return executor.prepare(value);
    },
  });
}

function absoluteExecutable(
  value: unknown,
  label: 'FFMPEG' | 'FFPROBE',
): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || /[\u0000-\u001F\u007F]/.test(normalized)
    || !path.isAbsolute(normalized)) {
    fail(`${label}_PATH_INVALID`);
  }
  return normalized;
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodePreparationOwnerErrorV2(
    `MEDIA_PROXY_MASTER_TRANSCODE_PREPARATION_OWNER_V2_${code}`,
  );
}
