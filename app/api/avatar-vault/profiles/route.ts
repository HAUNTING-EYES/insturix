import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createAvatarProfileDraftFromRequest,
  listAvatarProfiles,
} from '@/lib/avatar/avatar-vault-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const result = await listAvatarProfiles({
    userId,
    orgId: orgId ?? null,
    searchParams: new URL(request.url).searchParams,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
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

  const result = await createAvatarProfileDraftFromRequest({
    userId,
    orgId: orgId ?? null,
    actorId: userId,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
