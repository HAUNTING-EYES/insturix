import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { inferAvatarAttributesFromRequest } from '@/lib/avatar/infer-avatar-attributes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Infer appearance attributes from a person's uploaded reference photos so the forge can
// pre-fill fields instead of interrogating the user. Fail-soft: the caller degrades to
// manual entry when inference is unavailable.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_json', message: 'Invalid JSON body.' } }, { status: 400 });
  }

  const result = await inferAvatarAttributesFromRequest({ userId, body });
  return NextResponse.json(result.body, { status: result.status });
}
