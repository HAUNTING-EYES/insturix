import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import {
  reattestUploadedExportAudioRights,
  UploadedExportAudioRightsAttestationError,
} from '@/lib/editron/services/uploaded-export-audio-rights-attestation';

export const runtime = 'nodejs';

const MAX_REQUEST_BODY_BYTES = 8 * 1_024;

interface RouteDependencies {
  authenticate: () => ReturnType<typeof auth>;
  attest: typeof reattestUploadedExportAudioRights;
}

const defaultDependencies: RouteDependencies = {
  authenticate: auth,
  attest: reattestUploadedExportAudioRights,
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
        error: 'Request body must be a valid JSON object within 8 KiB',
        code: 'INVALID_REQUEST',
      },
      { status: 400 },
    );
  }

  const { projectId } = await params;
  try {
    const result = await dependencies.attest({
      userId,
      projectId,
      attestation: body.attestation,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof UploadedExportAudioRightsAttestationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    console.error('[UploadedExportAudioRightsAttestationRoute] Unexpected failure', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Uploaded audio rights confirmation failed',
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
