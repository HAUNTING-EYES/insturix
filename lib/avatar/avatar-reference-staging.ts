/**
 * Reference staging — turn a user's raw photos into a top-tier, scene- and
 * wardrobe-staged, identity-locked reference image BEFORE the avatar is animated.
 *
 * Why: the reference image is the quality ceiling. A clean, high-res, scene-matched
 * still gives the body model (Kling i2v) a far stronger identity anchor — less drift
 * on camera moves, cleaner mouth for relip. Live-verified 2026-07-10: Nano Banana Pro
 * Edit accepts real faces, holds identity across up to 10 refs, and stages a
 * photoreal studio portrait in any scene/wardrobe from casual snapshots.
 *
 * This is also how "wardrobe" becomes real: the wardrobe/scene text already carried on
 * the render recipe is simply the staging prompt.
 *
 * Nano Banana Pro Edit is Google's Gemini-based image editor (real faces OK), unlike
 * the ByteDance Seedance video model that rejects real likenesses.
 */

export const NANO_BANANA_EDIT_MODEL_ID = 'fal-ai/nano-banana-pro/edit';
const MAX_SOURCE_IMAGES = 10; // nano-banana-pro/edit maxImages (clickatron-models.ts)

export interface ReferenceStagingInput {
  /** The user's raw photos (up to 10 used; more references = stronger identity). */
  sourceImageUrls: string[];
  /** Scene + wardrobe description — e.g. "in a modern office, wearing a black blazer". */
  scenePrompt: string;
}

export interface ReferenceStagingResult {
  imageUrl: string;
}

export interface ReferenceStagingDeps {
  submit?: (modelId: string, input: Record<string, unknown>) => Promise<{ requestId: string }>;
  poll?: (modelId: string, requestId: string) => Promise<{ done: boolean; imageUrl?: string; failed?: boolean; error?: string }>;
}

/** Wrap the scene/wardrobe prompt with quality + identity-lock guidance. */
export function buildStagingPrompt(scenePrompt: string): string {
  const scene = scenePrompt.trim();
  return (
    'A top-tier professional photorealistic portrait of this exact person. ' +
    (scene ? `${scene}. ` : '') +
    'Full body in frame with hands visible, natural relaxed pose, sharp focus, high resolution, ' +
    'soft cinematic lighting. Keep his exact facial identity, age, and ethnicity identical to the ' +
    'reference photos — do not alter the face.'
  );
}

export async function stageAvatarReference(
  input: ReferenceStagingInput,
  deps: ReferenceStagingDeps = {},
): Promise<ReferenceStagingResult> {
  if (!input.sourceImageUrls.length) {
    throw new Error('Reference staging needs at least one source photo.');
  }
  const image_urls = input.sourceImageUrls.slice(0, MAX_SOURCE_IMAGES);
  const prompt = buildStagingPrompt(input.scenePrompt);
  const submit = deps.submit ?? defaultFalSubmit;
  const poll = deps.poll ?? defaultFalPoll;

  const { requestId } = await submit(NANO_BANANA_EDIT_MODEL_ID, {
    prompt,
    image_urls,
    num_images: 1,
    enable_safety_checker: false,
  });

  for (let i = 0; i < 120; i++) {
    const status = await poll(NANO_BANANA_EDIT_MODEL_ID, requestId);
    if (status.failed) throw new Error(`Reference staging failed: ${status.error ?? 'unknown error'}`);
    if (status.done) {
      if (!status.imageUrl) throw new Error('Reference staging completed without an image URL.');
      return { imageUrl: status.imageUrl };
    }
    await sleep(4000);
  }
  throw new Error('Reference staging timed out.');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function defaultFalSubmit(modelId: string, input: Record<string, unknown>): Promise<{ requestId: string }> {
  const { fal } = await import('@fal-ai/client');
  const credentials = process.env.FAL_AI_API_KEY?.trim() || process.env.FAL_KEY?.trim();
  if (!credentials) throw new Error('FAL_AI_API_KEY or FAL_KEY is required for reference staging.');
  fal.config({ credentials });
  const handle = await fal.queue.submit(modelId, { input });
  const requestId = (handle as { request_id?: string; requestId?: string }).request_id
    ?? (handle as { requestId?: string }).requestId;
  if (!requestId) throw new Error('Nano Banana queue returned no request id.');
  return { requestId };
}

async function defaultFalPoll(
  modelId: string,
  requestId: string,
): Promise<{ done: boolean; imageUrl?: string; failed?: boolean; error?: string }> {
  const { fal } = await import('@fal-ai/client');
  const status = await fal.queue.status(modelId, { requestId, logs: false });
  const s = String((status as { status?: string }).status ?? '').toUpperCase();
  if (s === 'FAILED' || s === 'ERROR') return { done: false, failed: true, error: JSON.stringify(status).slice(0, 300) };
  if (s !== 'COMPLETED') return { done: false };
  const result = await fal.queue.result(modelId, { requestId });
  const data = result as { data?: { images?: Array<{ url?: string }> }; images?: Array<{ url?: string }> };
  const imageUrl = data?.data?.images?.[0]?.url ?? data?.images?.[0]?.url;
  return { done: true, imageUrl };
}
