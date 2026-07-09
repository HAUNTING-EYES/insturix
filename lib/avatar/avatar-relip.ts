/**
 * Kling LipSync relip — the "mouth" step of the avatar speaking lane (lane B).
 *
 * Takes a finished body/scene video (from Seedance via generateAvatarShot) and the
 * cloned-voice audio (from Chatterbox) and re-syncs the mouth to that audio. Kling
 * LipSync hard-caps the INPUT video at 10s, and drifts when audio and video lengths
 * disagree — so we refuse both BEFORE spending, and rely on the audio-first law
 * (video generated to the measured audio duration) to keep them aligned.
 */

import { RELIP_MAX_SHOT_SEC } from './avatar-audio-fit';

export const KLING_LIPSYNC_MODEL_ID = 'fal-ai/kling-video/lipsync/audio-to-video';
export const RELIP_ALIGNMENT_TOLERANCE_SEC = 0.3; // Kling drifts on mismatch; keep audio≈video

export interface RelipInput {
  videoUrl: string;
  audioUrl: string;
  videoDurationSec: number;
  audioDurationSec: number;
}

export interface RelipResult {
  videoUrl: string;
}

export interface RelipDeps {
  submit?: (modelId: string, input: Record<string, unknown>) => Promise<{ requestId: string }>;
  poll?: (modelId: string, requestId: string) => Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }>;
}

/** Refuse un-relippable input before spending: >10s video, or audio/video drift. */
export function assertRelipEligible(input: RelipInput): void {
  if (input.videoDurationSec > RELIP_MAX_SHOT_SEC + 0.1) {
    throw new Error(
      `Kling LipSync input video is ${input.videoDurationSec}s; the hard cap is ${RELIP_MAX_SHOT_SEC}s. ` +
        'Keep the speaking shot to <=10s (split the line into multiple shots).',
    );
  }
  const drift = Math.abs(input.audioDurationSec - input.videoDurationSec);
  if (drift > RELIP_ALIGNMENT_TOLERANCE_SEC) {
    throw new Error(
      `Audio (${input.audioDurationSec}s) and video (${input.videoDurationSec}s) differ by ${drift.toFixed(2)}s; ` +
        'Kling LipSync drifts on mismatch. Generate the body video to the MEASURED audio duration (audio-first).',
    );
  }
}

export async function relipWithKling(input: RelipInput, deps: RelipDeps = {}): Promise<RelipResult> {
  assertRelipEligible(input);

  const submit = deps.submit ?? defaultFalSubmit;
  const poll = deps.poll ?? defaultFalPoll;

  const { requestId } = await submit(KLING_LIPSYNC_MODEL_ID, {
    video_url: input.videoUrl,
    audio_url: input.audioUrl,
  });

  for (let i = 0; i < 180; i++) {
    const status = await poll(KLING_LIPSYNC_MODEL_ID, requestId);
    if (status.failed) throw new Error(`Kling LipSync failed: ${status.error ?? 'unknown error'}`);
    if (status.done) {
      if (!status.videoUrl) throw new Error('Kling LipSync completed without a video URL.');
      return { videoUrl: status.videoUrl };
    }
    await sleep(5000);
  }
  throw new Error('Kling LipSync timed out.');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function defaultFalSubmit(modelId: string, input: Record<string, unknown>): Promise<{ requestId: string }> {
  const { fal } = await import('@fal-ai/client');
  const credentials = process.env.FAL_AI_API_KEY?.trim() || process.env.FAL_KEY?.trim();
  if (!credentials) throw new Error('FAL_AI_API_KEY or FAL_KEY is required for Kling LipSync.');
  fal.config({ credentials });
  const handle = await fal.queue.submit(modelId, { input });
  const requestId = (handle as { request_id?: string; requestId?: string }).request_id
    ?? (handle as { requestId?: string }).requestId;
  if (!requestId) throw new Error(`Kling LipSync queue returned no request id.`);
  return { requestId };
}

async function defaultFalPoll(
  modelId: string,
  requestId: string,
): Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }> {
  const { fal } = await import('@fal-ai/client');
  const status = await fal.queue.status(modelId, { requestId, logs: false });
  const s = String((status as { status?: string }).status ?? '').toUpperCase();
  if (s === 'FAILED' || s === 'ERROR') return { done: false, failed: true, error: JSON.stringify(status).slice(0, 300) };
  if (s !== 'COMPLETED') return { done: false };
  const result = await fal.queue.result(modelId, { requestId });
  const data = result as { data?: { video?: { url?: string }; video_url?: string }; video?: { url?: string } };
  const videoUrl = data?.data?.video?.url ?? data?.data?.video_url ?? data?.video?.url;
  return { done: true, videoUrl };
}
