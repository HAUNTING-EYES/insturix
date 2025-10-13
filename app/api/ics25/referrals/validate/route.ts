import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    await getIcs25Db();
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('code') || '';
    const code = raw.trim().toLowerCase();
    if (!code) return NextResponse.json({ ok: false, message: 'Code is required' }, { status: 400 });

  const owner = (await Player.findOne({ 'cashbacks.referral.code': code }).lean()) as any;
    if (!owner) return NextResponse.json({ ok: true, valid: false });

    const isSelf = !!(userId && owner.clerkUserId === userId);
    return NextResponse.json({
      ok: true,
      valid: true,
      self: isSelf,
      owner: { name: owner.name || 'Player', clerkUserId: owner.clerkUserId, avatarUrl: (owner as any).avatarUrl || null },
    });
  } catch (e: any) {
    console.error('Referral validate error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to validate code' }, { status: 500 });
  }
}
