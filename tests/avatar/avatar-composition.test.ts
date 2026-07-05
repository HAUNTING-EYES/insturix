import { describe, expect, it } from 'vitest';
import { buildAvatarCompositionProps, compositionDimensions } from '../../lib/avatar/avatar-composition';
import {
  refreshAvatarPipelineJobFromRequest,
  createInMemoryAvatarPipelineJobStore,
  type AvatarPipelineJobSnapshot,
  type AvatarPipelineStageId,
  type AvatarPipelineStageSnapshot,
  type AvatarPipelineStageStatus,
} from '../../lib/avatar/avatar-pipeline-job';
import type { AvatarRenderRecipe } from '../../lib/avatar/avatar-render-recipe';

const NOW = '2026-07-05T00:00:00.000Z';
const FACE_URL = 'https://cdn.example/face.mp4';

describe('avatar composition props', () => {
  it('builds a full-frame face overlay with native audio at portrait 720p', () => {
    const props = buildAvatarCompositionProps({
      faceVideoUrl: FACE_URL,
      durationSeconds: 8,
      aspectRatio: '9:16',
      resolution: '720p',
      displayName: 'Rishi',
    });

    expect(props.inputProps.width).toBe(720);
    expect(props.inputProps.height).toBe(1280);
    expect(props.inputProps.durationInFrames).toBe(240);
    expect(props.inputProps.overlays).toHaveLength(1);

    const overlay = props.inputProps.overlays[0];
    expect(overlay.type).toBe('video');
    expect(overlay.src).toBe(FACE_URL);
    expect(overlay.hasNativeAudio).toBe(true);
    expect(overlay.width).toBe(720);
    expect(overlay.height).toBe(1280);
    expect(overlay.from).toBe(0);
  });

  it('computes even landscape dimensions for 16:9 1080p', () => {
    expect(compositionDimensions('1080p', '16:9')).toEqual({ width: 1920, height: 1080 });
  });
});

describe('avatar composition pipeline stage', () => {
  it('dispatches composition after OmniHuman succeeds, then completes on poll', async () => {
    const store = createInMemoryAvatarPipelineJobStore([jobAwaitingComposition()]);
    let renderedProps: unknown;

    // First refresh → dispatch the composition render.
    const dispatched = await refreshAvatarPipelineJobFromRequest(
      { userId: 'user_1', jobId: 'job_1' },
      {
        pipelineJobStore: store,
        now: () => NOW,
        compositionDeps: {
          render: async (props) => {
            renderedProps = props;
            return { renderId: 'r_1', bucketName: 'b_1', region: 'us-east-1' };
          },
        },
      },
    );

    expect((renderedProps as { inputProps: { overlays: unknown[] } }).inputProps.overlays).toHaveLength(1);
    if (!dispatched.body.ok) throw new Error('expected ok');
    const running = dispatched.body.job.stages.find((s) => s.id === 'composition_remotion');
    expect(running?.status).toBe('running');
    expect(running?.dispatchCode).toBe('remotion_composition_queued');
    expect(running?.output?.renderId).toBe('r_1');
    expect(running?.output?.bucketName).toBe('b_1');

    // Second refresh → poll reports done with the final URL.
    const done = await refreshAvatarPipelineJobFromRequest(
      { userId: 'user_1', jobId: 'job_1' },
      {
        pipelineJobStore: store,
        now: () => NOW,
        compositionDeps: {
          getProgress: async () => ({ done: true, progress: 1, outputUrl: 'https://cdn.example/final.mp4' }),
        },
      },
    );

    if (!done.body.ok) throw new Error('expected ok');
    expect(done.body.job.status).toBe('succeeded');
    const finalStage = done.body.job.stages.find((s) => s.id === 'composition_remotion');
    expect(finalStage?.status).toBe('succeeded');
    expect(finalStage?.output?.videoUrl).toBe('https://cdn.example/final.mp4');
  });

  it('fails the job loudly when the composition render dispatch throws', async () => {
    const store = createInMemoryAvatarPipelineJobStore([jobAwaitingComposition()]);
    const result = await refreshAvatarPipelineJobFromRequest(
      { userId: 'user_1', jobId: 'job_1' },
      {
        pipelineJobStore: store,
        now: () => NOW,
        compositionDeps: {
          render: async () => {
            throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');
          },
        },
      },
    );

    if (!result.body.ok) throw new Error('expected ok');
    expect(result.body.job.status).toBe('failed');
    const failed = result.body.job.stages.find((s) => s.id === 'composition_remotion');
    expect(failed?.status).toBe('failed');
    expect(failed?.statusReason).toContain('REMOTION_LAMBDA_FUNCTION_NAME');
  });
});

function jobAwaitingComposition(): AvatarPipelineJobSnapshot {
  const recipe = {
    target: { aspectRatio: '9:16', durationSeconds: 8, resolution: '720p' },
    visual: { displayName: 'Rishi' },
  } as unknown as AvatarRenderRecipe;

  return {
    id: 'job_1',
    recordId: 'rec_1',
    avatarId: 'avatar_1',
    userId: 'user_1',
    orgId: null,
    brandId: null,
    status: 'running',
    dispatchCode: 'omnihuman_succeeded',
    statusReason: 'OmniHuman returned the raw face video.',
    recipe,
    stages: [
      stage('voice_chatterbox', 'succeeded'),
      {
        ...stage('face_omnihuman_fal', 'succeeded'),
        providerRequestId: 'fal_1',
        output: { videoUrl: FACE_URL },
      },
      {
        ...stage('composition_remotion', 'waiting'),
        input: { faceVideo: { videoUrl: FACE_URL, durationSeconds: 8 }, aspectRatio: '9:16', durationSeconds: 8, resolution: '720p' },
      },
    ],
    requestBody: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function stage(id: AvatarPipelineStageId, status: AvatarPipelineStageStatus): AvatarPipelineStageSnapshot {
  return {
    id,
    label: id,
    providerId: 'remotion',
    providerDisplayName: id,
    status,
    dispatchCode: 'stage_ready',
    statusReason: '',
    requiredEnvKeys: [],
    input: {},
  };
}
