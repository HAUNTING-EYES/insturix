import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getBrandVaultSignalProfile,
  getDefaultBrandVaultRefineryStore,
  reviewBrandVaultSignalProfileDraft,
} from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const result = await getBrandVaultSignalProfile(
    { userId, recordId: id },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await reviewBrandVaultSignalProfileDraft(
    { userId, recordId: id, actorId: userId, body },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}
