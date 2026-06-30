import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getAvatarProfile,
  reviewAvatarProfileDraft,
} from '@/lib/avatar/avatar-vault-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const result = await getAvatarProfile({
    userId,
    orgId: orgId ?? null,
    recordId: id,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await reviewAvatarProfileDraft({
    userId,
    orgId: orgId ?? null,
    actorId: userId,
    recordId: id,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
