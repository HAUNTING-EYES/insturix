import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';

export async function GET() {
  await getIcs25Db();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const player = await Player.findOne({ clerkUserId: userId }).lean();
  return NextResponse.json({ ok: true, player });
}
