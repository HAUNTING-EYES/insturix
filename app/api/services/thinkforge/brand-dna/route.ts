import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserBrandDNA, updateUserBrandDNA } from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BrandDNA API — read/update the user's Identity layer
 *
 * GET  /api/services/thinkforge/brand-dna
 * PATCH /api/services/thinkforge/brand-dna  { voiceLock?, nicheMap?, killList?, ... }
 */

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const dna = await getUserBrandDNA(userId);
  return NextResponse.json({ brandDNA: dna ?? {} });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { voiceLock, nicheMap, killList, hookArchetypes, structuralHabits, recurringAssets } = body;

  const updated = await updateUserBrandDNA(userId, {
    ...(voiceLock !== undefined && { voiceLock }),
    ...(nicheMap !== undefined && { nicheMap }),
    ...(killList !== undefined && { killList }),
    ...(hookArchetypes !== undefined && { hookArchetypes }),
    ...(structuralHabits !== undefined && { structuralHabits }),
    ...(recurringAssets !== undefined && { recurringAssets }),
  });

  return NextResponse.json({ brandDNA: updated });
}
