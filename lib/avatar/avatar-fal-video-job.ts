/**
 * Non-blocking fal video-job client for the lane-B pipeline stages (Kling 2.6 i2v body
 * + Kling LipSync relip). Unlike the blocking submit-then-poll loops in
 * generate-avatar-shot.ts / avatar-relip.ts (fine for a worker, minutes per call), the
 * pipeline manages polling itself: submit once at dispatch, then one status check per
 * refresh. Mirrors the TalkingHeadFalClient (submit + refresh) contract so the body/relip
 * stages advance exactly like the talking-head stage.
 *
 * Also holds the audio/video IO the align step needs (fetch bytes, upload the padded
 * WAV, measure the body clip's real length) — all injectable, defaults call the real
 * services. These are the live-unverified surface: exercised via mocks in tests.
 */

export interface FalVideoJobSubmitResult {
  requestId: string;
  modelId: string;
  input: Record<string, unknown>;
}

export interface FalVideoJobRefreshResult {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  requestId: string;
  videoUrl?: string;
  durationSeconds?: number;
  providerStatus?: string;
  errorMessage?: string;
}

export interface FalVideoJobClient {
  submit(input: Record<string, unknown>): Promise<FalVideoJobSubmitResult>;
  refresh(requestId: string): Promise<FalVideoJobRefreshResult>;
}

/** A fal queue client for any video model — submit once, poll status externally. */
export function createFalVideoJobClient(
  modelId: string,
  env: Record<string, string | undefined> = process.env,
): FalVideoJobClient {
  const credentials = () => {
    const key = env.FAL_AI_API_KEY?.trim() || env.FAL_KEY?.trim();
    if (!key) throw new Error(`FAL_AI_API_KEY or FAL_KEY is required for ${modelId}.`);
    return key;
  };

  return {
    async submit(input) {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: credentials() });
      const handle = await fal.queue.submit(modelId, { input });
      const requestId = (handle as { request_id?: string; requestId?: string }).request_id
        ?? (handle as { requestId?: string }).requestId;
      if (!requestId) throw new Error(`${modelId} queue returned no request id.`);
      return { requestId, modelId, input };
    },
    async refresh(requestId) {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: credentials() });
      const status = await fal.queue.status(modelId, { requestId, logs: false });
      const s = String((status as { status?: string }).status ?? '').toUpperCase();
      if (s === 'FAILED' || s === 'ERROR') {
        return { status: 'failed', requestId, providerStatus: s, errorMessage: JSON.stringify(status).slice(0, 300) };
      }
      if (s === 'IN_QUEUE') return { status: 'queued', requestId, providerStatus: s };
      if (s !== 'COMPLETED') return { status: 'running', requestId, providerStatus: s };
      const result = await fal.queue.result(modelId, { requestId });
      return { status: 'succeeded', requestId, providerStatus: s, videoUrl: extractFalVideoUrl(result) };
    },
  };
}

/** fal video-result shapes vary by model — check the known locations. */
export function extractFalVideoUrl(result: unknown): string | undefined {
  const data = result as {
    data?: { video?: { url?: string }; video_url?: string; videos?: Array<{ url?: string }> };
    video?: { url?: string };
    video_url?: string;
  };
  return (
    data?.data?.video?.url
    ?? data?.data?.video_url
    ?? data?.data?.videos?.[0]?.url
    ?? data?.video?.url
    ?? data?.video_url
  );
}

// ─── Audio/video IO defaults for the align step (all injectable) ────────────────

export async function defaultFetchAudioBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch audio (HTTP ${response.status}) from ${url}.`);
  return Buffer.from(await response.arrayBuffer());
}

export async function defaultUploadAudio(wav: Buffer, userId: string): Promise<{ audioUrl: string }> {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  const result = await uploadMedia(wav, userId, 'avatar-body-motion-voice.wav', 'audio/wav');
  return { audioUrl: result.signedUrl };
}

export async function defaultMeasureVideoDurationSec(url: string): Promise<number | null> {
  const { extractMP4Duration } = await import('@/lib/editron/services/mp4-duration-service');
  return extractMP4Duration(url);
}
