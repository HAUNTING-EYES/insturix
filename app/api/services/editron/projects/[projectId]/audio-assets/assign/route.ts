import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import {
  assignUploadedAudio,
  UploadedAudioAssignmentError,
  type UploadedAudioAssignmentInput,
} from '@/lib/editron/services/uploaded-audio-assignment';

export const runtime = 'nodejs';

const MAX_REQUEST_BODY_BYTES = 16 * 1_024;

interface RouteDependencies {
  authenticate: () => ReturnType<typeof auth>;
  assign: typeof assignUploadedAudio;
}

const defaultDependencies: RouteDependencies = {
  authenticate: auth,
  assign: assignUploadedAudio,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  dependencies: RouteDependencies = defaultDependencies,
) {
  const { userId } = await dependencies.authenticate();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Request body must be a valid JSON object within 16 KiB',
        code: 'INVALID_REQUEST',
      },
      { status: 400 },
    );
  }

  const { projectId } = await params;
  try {
    const result = await dependencies.assign({
      userId,
      projectId,
      sourceAssetId: body.sourceAssetId as string,
      mediaRole: body.mediaRole as UploadedAudioAssignmentInput['mediaRole'],
      idempotencyKey: body.idempotencyKey as string,
      rightsAttestation:
        body.rightsAttestation as UploadedAudioAssignmentInput['rightsAttestation'],
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof UploadedAudioAssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    console.error('[UploadedAudioAssignmentRoute] Unexpected failure', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Uploaded audio assignment failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}

async function readBoundedJsonObject(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw new SyntaxError('Request body is too large');
  }

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new SyntaxError('Request body is too large');
  }
  const parsed = text.trim() ? JSON.parse(text) : null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}
