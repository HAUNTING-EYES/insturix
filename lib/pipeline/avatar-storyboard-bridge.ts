import type {
  EditronProductionManifest,
  Storyboard,
  StoryboardScene,
} from '@/lib/pipeline/schemas/storyboard';
import {
  createAvatarPipelineJobFromRequest,
  refreshAvatarPipelineJobFromRequest,
  type AvatarPipelineJobSnapshot,
  type AvatarPipelineJobStatus,
} from '@/lib/avatar/avatar-pipeline-job';

export interface AvatarStoryboardJobRequest {
  sceneIndex: number;
  recordId: string;
  body: Record<string, unknown>;
}

export interface AvatarStoryboardSkip {
  sceneIndex: number;
  reason:
    | 'storyboard_scene_missing'
    | 'multiple_avatar_speakers'
    | 'avatar_profile_missing'
    | 'voice_mode_requires_fallback'
    | 'invalid_duration';
}

export interface AvatarStoryboardJobSummary {
  sceneIndex: number;
  jobId?: string;
  status: AvatarPipelineJobStatus | 'skipped';
  reason?: string;
  videoUrl?: string;
  videoDurationMs?: number;
}

export function buildAvatarStoryboardJobRequests(storyboard: Storyboard): {
  requests: AvatarStoryboardJobRequest[];
  skipped: AvatarStoryboardSkip[];
} {
  const context = storyboard.productionManifest?.thinkforgeContext;
  const requests: AvatarStoryboardJobRequest[] = [];
  const skipped: AvatarStoryboardSkip[] = [];

  for (const directive of context?.avatarDirectives ?? []) {
    const scene = storyboard.scenes.find((candidate) => candidate.sceneIndex === directive.sceneIndex);
    if (!scene) {
      skipped.push({ sceneIndex: directive.sceneIndex, reason: 'storyboard_scene_missing' });
      continue;
    }

    const characterIds = [...new Set(directive.speakers.map((speaker) => speaker.characterId))];
    if (characterIds.length !== 1) {
      skipped.push({ sceneIndex: directive.sceneIndex, reason: 'multiple_avatar_speakers' });
      continue;
    }

    const speaker = directive.speakers.find((candidate) => candidate.characterId === characterIds[0]);
    if (!speaker?.avatarProfileId) {
      skipped.push({ sceneIndex: directive.sceneIndex, reason: 'avatar_profile_missing' });
      continue;
    }
    if (speaker.voiceMode !== 'cloned') {
      skipped.push({ sceneIndex: directive.sceneIndex, reason: 'voice_mode_requires_fallback' });
      continue;
    }

    const durationSeconds = directive.durationSeconds;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 60) {
      skipped.push({ sceneIndex: directive.sceneIndex, reason: 'invalid_duration' });
      continue;
    }

    const lineText = directive.speakers
      .filter((candidate) => candidate.characterId === speaker.characterId)
      .map((candidate) => candidate.lineText.trim())
      .filter(Boolean)
      .join('\n');
    const visualDescription = scene.descriptor.visualDescription.trim();
    if (!lineText || !visualDescription) {
      skipped.push({ sceneIndex: directive.sceneIndex, reason: 'invalid_duration' });
      continue;
    }

    requests.push({
      sceneIndex: directive.sceneIndex,
      recordId: speaker.avatarProfileId,
      body: {
        useCase: 'social_presenter',
        renderModality: 'talking_head',
        prompt: visualDescription,
        script: lineText,
        audio: {
          mode: 'tts_voiceover',
          voiceoverText: lineText,
        },
        target: {
          aspectRatio: resolveAspectRatio(storyboard.productionManifest),
          durationSeconds,
          resolution: '720p',
        },
      },
    });
  }

  return { requests, skipped };
}

export async function createAvatarStoryboardJob(
  input: {
    userId: string;
    orgId?: string | null;
    request: AvatarStoryboardJobRequest;
  },
): Promise<AvatarPipelineJobSnapshot> {
  const result = await createAvatarPipelineJobFromRequest({
    userId: input.userId,
    orgId: input.orgId ?? null,
    recordId: input.request.recordId,
    body: input.request.body,
  });

  if (!result.body.ok) {
    throw new Error(result.body.error.message);
  }
  return result.body.job;
}

export async function refreshAvatarStoryboardJob(input: {
  userId: string;
  orgId?: string | null;
  jobId: string;
}): Promise<AvatarPipelineJobSnapshot> {
  const result = await refreshAvatarPipelineJobFromRequest({
    userId: input.userId,
    orgId: input.orgId ?? null,
    jobId: input.jobId,
  });

  if (!result.body.ok) {
    throw new Error(result.body.error.message);
  }
  return result.body.job;
}

export function getAvatarStoryboardVideo(job: AvatarPipelineJobSnapshot): {
  videoUrl?: string;
  videoDurationMs?: number;
} {
  const composition = job.stages.find((stage) => stage.id === 'composition_remotion');
  const output = composition?.output;
  const videoUrl = typeof output?.videoUrl === 'string' && output.videoUrl.trim()
    ? output.videoUrl
    : undefined;
  const durationSeconds = typeof output?.durationSeconds === 'number' && Number.isFinite(output.durationSeconds)
    ? output.durationSeconds
    : undefined;

  return {
    ...(videoUrl ? { videoUrl } : {}),
    ...(durationSeconds !== undefined ? { videoDurationMs: Math.round(durationSeconds * 1000) } : {}),
  };
}

function resolveAspectRatio(manifest: EditronProductionManifest | undefined): string {
  const brief = manifest?.thinkforgeContext?.briefSnapshot;
  const output = brief && typeof brief.output === 'object' && brief.output !== null
    ? brief.output as Record<string, unknown>
    : undefined;
  const ratio = output?.aspectRatio;
  return typeof ratio === 'string' && ratio.trim() ? ratio : '9:16';
}

export function avatarStoryboardSceneUpdate(
  job: AvatarPipelineJobSnapshot,
  video: ReturnType<typeof getAvatarStoryboardVideo>,
): Partial<StoryboardScene> {
  return {
    avatarPipelineStatus: job.status,
    ...(job.status === 'failed' ? { avatarPipelineError: job.statusReason } : {}),
    ...(video.videoUrl ? {
      videoUrl: video.videoUrl,
      videoProvider: 'avatar-pipeline',
      ...(video.videoDurationMs !== undefined ? { videoDurationMs: video.videoDurationMs } : {}),
      status: 'generated',
    } : {}),
  };
}
