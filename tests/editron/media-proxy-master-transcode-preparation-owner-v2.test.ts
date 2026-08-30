import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-attempt-v2';
import {
  createMediaProxyMasterTranscodePreparationOwnerV2,
  MediaProxyMasterTranscodePreparationOwnerErrorV2,
} from '@/lib/editron/services/media-proxy-master-transcode-preparation-owner-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodePreparationOwnerV2', () => {
  it('binds the exact V2 runtime and delegates to the trusted preparer', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const prepared = Object.freeze({
      disposition: 'UNVERIFIABLE' as const,
      diagnostic:
        'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID' as const,
    });
    const prepare = vi.fn(async () => prepared);
    const createExecutor = vi.fn(() => Object.freeze({ prepare }));
    const ffmpegPath = path.resolve('fixture-bin', 'ffmpeg');
    const ffprobePath = path.resolve('fixture-bin', 'ffprobe');
    const now = () => new Date('2026-08-31T00:00:00.000Z');

    const owner = createMediaProxyMasterTranscodePreparationOwnerV2({
      jobInput: fixture.contract.payload,
      ffmpegPath,
      ffprobePath,
      now,
      createExecutor,
    });

    expect(owner).toMatchObject({
      ownerId: MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
      ownerVersion: fixture.contract.payload.command.policy.policyVersion,
      runtimePolicyBindingSha256:
        fixture.contract.payload.runtimePolicy.bindingSha256,
    });
    expect(createExecutor).toHaveBeenCalledWith({
      ffmpegPath,
      ffprobePath,
      runtime: {
        workerImageDigest: fixture.contract.payload.runtimePolicy
          .executionProfile.workerImageDigest,
        platform:
          fixture.contract.payload.runtimePolicy.executionProfile.platform,
        ffmpegVersion: fixture.contract.payload.runtimePolicy
          .executionProfile.ffmpegVersion,
        ffprobeVersion: fixture.contract.payload.runtimePolicy
          .executionProfile.ffprobeVersion,
      },
      now,
    });
    const executionInput = {
      command: fixture.contract.payload.command,
      masterAsset: {} as never,
    };
    await expect(owner.prepare(executionInput)).resolves.toBe(prepared);
    expect(prepare).toHaveBeenCalledWith(executionInput);
  });

  it('fails closed for invalid job, executable, and executor bindings', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const base = {
      jobInput: fixture.contract.payload,
      ffmpegPath: path.resolve('fixture-bin', 'ffmpeg'),
      ffprobePath: path.resolve('fixture-bin', 'ffprobe'),
    };
    expect(() => createMediaProxyMasterTranscodePreparationOwnerV2({
      ...base,
      jobInput: {
        ...fixture.contract.payload,
        commandSha256: '0'.repeat(64),
      },
    })).toThrow(MediaProxyMasterTranscodePreparationOwnerErrorV2);
    expect(() => createMediaProxyMasterTranscodePreparationOwnerV2({
      ...base,
      ffmpegPath: 'ffmpeg',
    })).toThrow('PREPARATION_OWNER_V2_FFMPEG_PATH_INVALID');
    expect(() => createMediaProxyMasterTranscodePreparationOwnerV2({
      ...base,
      createExecutor: () => ({}) as never,
    })).toThrow('PREPARATION_OWNER_V2_EXECUTOR_INVALID');
  });

  it('does not hide a delegated preparation failure', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const failure = new Error('fixture preparation failure');
    const owner = createMediaProxyMasterTranscodePreparationOwnerV2({
      jobInput: fixture.contract.payload,
      ffmpegPath: path.resolve('fixture-bin', 'ffmpeg'),
      ffprobePath: path.resolve('fixture-bin', 'ffprobe'),
      createExecutor: () => ({
        async prepare() {
          throw failure;
        },
      }),
    });

    await expect(owner.prepare({
      command: fixture.contract.payload.command,
      masterAsset: {} as never,
    })).rejects.toBe(failure);
  });
});
