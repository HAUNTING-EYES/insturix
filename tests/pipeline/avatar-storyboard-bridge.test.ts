import { describe, expect, it } from 'vitest';
import {
  avatarStoryboardSceneUpdate,
  buildAvatarStoryboardJobRequests,
  getAvatarStoryboardVideo,
} from '@/lib/pipeline/avatar-storyboard-bridge';
import type { Storyboard } from '@/lib/pipeline/schemas/storyboard';
import type { AvatarPipelineJobSnapshot } from '@/lib/avatar/avatar-pipeline-job';

function storyboardWithDirectives(
  avatarDirectives: NonNullable<NonNullable<Storyboard['productionManifest']>['thinkforgeContext']>['avatarDirectives'],
): Storyboard {
  return {
    storyboardId: 'sb_1',
    userId: 'user_1',
    scenes: [{
      sceneIndex: 0,
      descriptor: {
        sceneIndex: 0,
        title: 'Presenter',
        narration: 'Explain the workflow.',
        visualDescription: 'A presenter stands in a bright studio beside a clean product timeline.',
        durationSeconds: 8,
        mood: 'focused',
      },
      imageUrl: 'https://example.com/storyboard.png',
      status: 'generated',
      generationHistory: [],
    }],
    productionManifest: {
      expectedSceneCount: 1,
      expectedStoryboardImages: 1,
      expectedVideoClips: 1,
      coveragePolicy: 'production-require-all-scenes',
      warnings: [],
      thinkforgeContext: {
        version: 1,
        sidecarSourceRefs: ['brief_user'],
        avatarDirectives,
        briefSnapshot: {
          output: { aspectRatio: '16:9' },
        },
      },
    },
    status: 'ready',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('avatar storyboard bridge', () => {
  it('builds one cloned-voice job from multiple lines by the same character', () => {
    const storyboard = storyboardWithDirectives([{
      sceneIndex: 0,
      durationSeconds: 8,
      relipSafe: true,
      speakers: [
        { characterId: 'host', avatarProfileId: 'record_1', voiceMode: 'cloned', lineText: 'First line.' },
        { characterId: 'host', avatarProfileId: 'record_1', voiceMode: 'cloned', lineText: 'Second line.' },
      ],
    }]);

    const result = buildAvatarStoryboardJobRequests(storyboard);

    expect(result.skipped).toEqual([]);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      sceneIndex: 0,
      recordId: 'record_1',
      body: {
        useCase: 'social_presenter',
        script: 'First line.\nSecond line.',
        target: { aspectRatio: '16:9', durationSeconds: 8, resolution: '720p' },
      },
    });
  });

  it('does not silently choose between multiple speakers or preset voice fallback', () => {
    const storyboard = storyboardWithDirectives([
      {
        sceneIndex: 0,
        durationSeconds: 8,
        speakers: [
          { characterId: 'host', avatarProfileId: 'record_1', voiceMode: 'cloned', lineText: 'Host.' },
          { characterId: 'guest', avatarProfileId: 'record_2', voiceMode: 'cloned', lineText: 'Guest.' },
        ],
      },
      {
        sceneIndex: 0,
        durationSeconds: 8,
        speakers: [
          { characterId: 'host', avatarProfileId: 'record_1', voiceMode: 'preset', lineText: 'Preset voice.' },
        ],
      },
    ]);

    const result = buildAvatarStoryboardJobRequests(storyboard);

    expect(result.requests).toEqual([]);
    expect(result.skipped).toEqual([
      { sceneIndex: 0, reason: 'multiple_avatar_speakers' },
      { sceneIndex: 0, reason: 'voice_mode_requires_fallback' },
    ]);
  });

  it('extracts only the completed composition video and updates scene lineage', () => {
    const job = {
      id: 'job_1',
      status: 'succeeded',
      statusReason: 'done',
      stages: [{
        id: 'composition_remotion',
        output: { videoUrl: 'https://example.com/avatar.mp4', durationSeconds: 7.5 },
      }],
    } as unknown as AvatarPipelineJobSnapshot;

    expect(getAvatarStoryboardVideo(job)).toEqual({
      videoUrl: 'https://example.com/avatar.mp4',
      videoDurationMs: 7500,
    });
    expect(avatarStoryboardSceneUpdate(job, getAvatarStoryboardVideo(job))).toMatchObject({
      avatarPipelineStatus: 'succeeded',
      videoUrl: 'https://example.com/avatar.mp4',
      videoProvider: 'avatar-pipeline',
      videoDurationMs: 7500,
      status: 'generated',
    });
  });
});
