import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createBrandVaultRefineryJobFromWebsite,
  getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
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

  const result = await createBrandVaultRefineryJobFromWebsite(
    { userId, actorId: userId, body },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  const result = await getBrandVaultRefineryJob(
    { userId, jobId },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}
