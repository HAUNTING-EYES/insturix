/**
 * POST /api/services/pipeline/prewarm
 *
 * Pre-warm a fal.ai video model worker by submitting a minimal throwaway request.
 * Called when the Export-to-Editron dialog opens so the worker is hot by the time
 * the user finishes reviewing references/storyboard and triggers real video generation.
 *
 * Cost: negligible (<$0.01) — 2-second clip from a 64x64 black image.
 * The response returns immediately; the fal job is fire-and-forget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import {
  FAL_VIDEO_MODELS,
  type FalVideoModel,
} from '@/lib/pipeline/video-generation-service';

export const runtime = 'nodejs';

// Tiny 64x64 black PNG encoded as a data URI.
// We upload this to fal storage so models get a valid image URL.
const BLACK_PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAADklEQVR42mNk+M9QTwIABJgBASiVlKQAAAAASUVORK5CYII=';

let _falConfigured = false;
function ensureFalConfig() {
  if (!_falConfigured && process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
    _falConfigured = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const modelKey = (body.model || 'kling-2.1') as FalVideoModel;

    const falModelId = FAL_VIDEO_MODELS[modelKey];
    if (!falModelId) {
      return NextResponse.json(
        { success: false, error: `Unknown model: ${modelKey}` },
        { status: 400 },
      );
    }

    if (!process.env.FAL_AI_API_KEY) {
      // No key configured — nothing to pre-warm, but don't error
      return NextResponse.json({ success: true, skipped: true });
    }

    ensureFalConfig();

    // Upload a tiny black image to fal storage for a valid image URL
    const imageBuffer = Buffer.from(BLACK_PIXEL_BASE64, 'base64');
    const file = new File([imageBuffer], 'prewarm.png', { type: 'image/png' });
    const imageUrl = await fal.storage.upload(file);

    // Fire-and-forget: submit via fal.queue so we don't wait for completion.
    // This spins up the worker; the actual result is discarded.
    fal.queue
      .submit(falModelId, {
        input: {
          prompt: 'static black screen',
          image_url: imageUrl,
          duration: '2',
          aspect_ratio: '16:9',
        },
      })
      .then((handle) => {
        console.log(
          `[Prewarm] Submitted warm-up job for ${modelKey} (${falModelId}), request_id=${handle.request_id}`,
        );
      })
      .catch((err) => {
        // Silent failure — pre-warm is best-effort
        console.warn(`[Prewarm] Failed to submit warm-up for ${modelKey}: ${err.message}`);
      });

    // Return immediately — don't wait for the queue submission or processing
    return NextResponse.json({ success: true, model: modelKey });
  } catch (err: any) {
    // Silent failure — pre-warm should never block the user
    console.warn(`[Prewarm] Error: ${err.message}`);
    return NextResponse.json({ success: true, skipped: true });
  }
}
