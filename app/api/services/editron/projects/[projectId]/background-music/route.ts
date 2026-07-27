import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import {
  assignBackgroundMusic,
  BackgroundMusicAssignmentError,
  type BackgroundMusicAssignmentInput,
} from '@/lib/editron/services/background-music-assignment';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    const parsed = text.trim() ? JSON.parse(text) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('Request body must be a JSON object');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Request body must be a valid JSON object',
        code: 'INVALID_REQUEST',
      },
      { status: 400 },
    );
  }

  const { projectId } = await params;
  try {
    const result = await assignBackgroundMusic({
      userId,
      projectId,
      assetId: body.assetId as string,
      idempotencyKey: body.idempotencyKey as string,
      usageMode: body.usageMode as BackgroundMusicAssignmentInput['usageMode'],
      rightsAttestation: body.rightsAttestation as BackgroundMusicAssignmentInput['rightsAttestation'],
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof BackgroundMusicAssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    console.error('[BackgroundMusicAssignmentRoute] Unexpected failure', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Background music assignment failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}
