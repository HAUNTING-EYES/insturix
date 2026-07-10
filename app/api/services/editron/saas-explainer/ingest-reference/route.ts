import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import { sampleReferenceVideoFrames } from '@/lib/editron/reference-video/reference-frame-sampler';
import { uploadMedia } from '@/lib/editron/services/upload-service';

/**
 * POST /api/services/editron/saas-explainer/ingest-reference
 *
 * Turns a VIDEO reference into style-reference IMAGES the Claude craft agent designs to match — "make it look
 * like this". Two inputs:
 *   - multipart/form-data with field "video": an uploaded mp4/mov/webm  → stored (R2) → frames sampled
 *   - JSON { videoUrl }: a public direct video URL                       → frames sampled
 *
 * Reuses the existing reference-frame-sampler (ffmpeg, no GLM): downloads the video, extracts frames, uploads
 * them, returns their URLs. The studio passes these as `referenceImageUrls` to /finalize → the worker downloads
 * them → the craft agent SEES them (Phase 1). Links are handled separately (Brand Vault screenshot path).
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 200_000_000; // 200MB — below the sampler's 350MB download cap.
const ACCEPT_VIDEO = new Set(['mp4', 'mov', 'webm', 'm4v']);

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  let videoUrl = '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('video');
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'Expected a "video" file field.' }, { status: 400 });
      }
      if (file.size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ success: false, error: 'Video too large (max 200MB).' }, { status: 413 });
      }
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPT_VIDEO.has(ext)) {
        return NextResponse.json({ success: false, error: `Unsupported video type ".${ext}". Use mp4, mov, or webm.` }, { status: 415 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadMedia(buffer, userId, `reference-${nanoid(8)}.${ext}`, file.type || 'video/mp4');
      videoUrl = uploaded.signedUrl;
    } else {
      const body = (await request.json().catch(() => ({}))) as { videoUrl?: unknown };
      if (typeof body.videoUrl !== 'string' || !/^https?:\/\//i.test(body.videoUrl)) {
        return NextResponse.json({ success: false, error: 'Provide a "video" file or a public http(s) videoUrl.' }, { status: 400 });
      }
      videoUrl = body.videoUrl.trim();
    }

    const frames = await sampleReferenceVideoFrames({
      videoUrl,
      userId,
      referenceAssetId: `saasref_${nanoid(10)}`,
    });
    const referenceImageUrls = frames.map((f) => f.url).filter((u) => typeof u === 'string' && u.length > 0);
    if (referenceImageUrls.length === 0) {
      return NextResponse.json({ success: false, error: 'Could not extract frames from that video.' }, { status: 422 });
    }
    return NextResponse.json({ success: true, referenceImageUrls, frames: referenceImageUrls.length });
  } catch (error) {
    console.error('[saas-explainer-ingest-reference] failed', error);
    return NextResponse.json({ success: false, error: 'Could not process that video reference.' }, { status: 500 });
  }
}
