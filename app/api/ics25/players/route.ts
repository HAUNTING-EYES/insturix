import { NextRequest, NextResponse } from 'next/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';
import Team from '@/schemas/ics25/Team';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: NextRequest) {
  await getIcs25Db();
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get('ids');
  if (ids) {
    const arr = ids.split(',').map((s) => s.trim()).filter(Boolean);
    const players = await Player.find({ clerkUserId: { $in: arr } }).lean();
    return NextResponse.json({ ok: true, players });
  }
  const players = await Player.find().lean();
  return NextResponse.json({ ok: true, players });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  await getIcs25Db();
  const body = await req.json();
  const data = { ...body, clerkUserId: body.clerkUserId || userId };
  const existing = await Player.findOne({ clerkUserId: data.clerkUserId });
  if (existing) {
    Object.assign(existing, data);
    await existing.save();
    return NextResponse.json({ ok: true, player: existing });
  }
  const player = await Player.create(data);
  return NextResponse.json({ ok: true, player });
}
