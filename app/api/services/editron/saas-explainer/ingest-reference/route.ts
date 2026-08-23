import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  assertSupportedSaasReferenceUploadV1,
  ingestSaasExplainerReferenceV1,
  SaasReferenceIngestErrorV1,
  type SaasReferenceIngestInputV1,
} from '@/lib/editron/saas-explainer/reference-ingest-owner-v1';

/**
 * POST /api/services/editron/saas-explainer/ingest-reference
 *
 * Turns a VIDEO reference into registered style-reference images. Two inputs:
 *   - multipart/form-data with field "video": upload -> canonical source -> frames
 *   - JSON { videoUrl }: resolve/import -> canonical source -> frames
 *
 * The adapter delegates identity/persistence to the existing reference source,
 * canonicalization and frame-registration owners. This route is transport only.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 200_000_000; // 200MB — below the sampler's 350MB download cap.

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';

  try {
    let source: SaasReferenceIngestInputV1;
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('video');
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'Expected a "video" file field.' }, { status: 400 });
      }
      if (file.size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ success: false, error: 'Video too large (max 200MB).' }, { status: 413 });
      }
      assertSupportedSaasReferenceUploadV1(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      source = { kind: 'upload', bytes: buffer, filename: file.name };
    } else {
      const body = (await request.json().catch(() => ({}))) as { videoUrl?: unknown };
      if (typeof body.videoUrl !== 'string' || !/^https?:\/\//i.test(body.videoUrl)) {
        return NextResponse.json({ success: false, error: 'Provide a "video" file or a public http(s) videoUrl.' }, { status: 400 });
      }
      source = { kind: 'url', videoUrl: body.videoUrl.trim() };
    }

    const result = await ingestSaasExplainerReferenceV1({ userId, source });
    return NextResponse.json({
      success: true,
      referenceAssetId: result.canonical.referenceAssetId,
      canonicalKind: result.canonical.sourceKind,
      sourceRegistrationReceiptSha256: result.canonical.sourceRegistrationReceiptSha256,
      referenceImageUrls: result.referenceImageUrls,
      frameAssetIds: result.frameAssetIds,
      frameRegistrationReceiptSha256s: result.frameRegistrationReceiptSha256s,
      frames: result.referenceImageUrls.length,
    });
  } catch (error) {
    console.error('[saas-explainer-ingest-reference] failed', error);
    if (error instanceof SaasReferenceIngestErrorV1) {
      return NextResponse.json({
        success: false,
        code: error.code,
        error: error.status < 500 ? error.message : 'Could not process that video reference.',
      }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: 'Could not process that video reference.' }, { status: 500 });
  }
}
