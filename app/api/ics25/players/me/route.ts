import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';

export async function GET() {
  await getIcs25Db();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const player = await Player.findOne({ clerkUserId: userId }).lean();
  if (!player) return NextResponse.json({ ok: true, player: null });
  // Try to enrich with Clerk profile image
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    return NextResponse.json({ ok: true, player: { ...player, imageUrl: clerkUser?.imageUrl } });
  } catch {
    return NextResponse.json({ ok: true, player });
  }
}
