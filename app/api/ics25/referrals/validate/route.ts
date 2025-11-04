import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';
import Attendee from '@/schemas/ics25/Attendee';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    await getIcs25Db();
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('code') || '';
    const code = raw.trim().toLowerCase();
    if (!code) return NextResponse.json({ ok: false, message: 'Code is required' }, { status: 400 });

    let owner: any = await Player.findOne({ 'cashbacks.referral.code': code }).lean();
    let ownerType: 'player' | 'attendee' | null = null;

    if (owner) {
      ownerType = 'player';
    } else {
      owner = await Attendee.findOne({ 'cashback.referral.code': code }).lean();
      if (owner) {
        ownerType = 'attendee';
      }
    }

    if (!owner || !ownerType) {
      return NextResponse.json({ ok: true, valid: false });
    }

    const isSelf = !!(userId && owner.clerkUserId === userId);
    return NextResponse.json({
      ok: true,
      valid: true,
      self: isSelf,
      owner: {
        name: owner.name || (ownerType === 'player' ? 'Player' : 'Attendee'),
        clerkUserId: owner.clerkUserId,
        avatarUrl: ownerType === 'player' ? owner.avatarUrl || null : null,
        type: ownerType,
        tier: ownerType === 'attendee' ? owner.attendeePassTier || null : owner.game || null,
      },
    });
  } catch (e: any) {
    console.error('Referral validate error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to validate code' }, { status: 500 });
  }
}
