import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import { ensureAttendeeReferralCode, syncAttendeeTierWithReferralProgress } from '@/lib/ics25/referrals';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) {
      return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    }

  await syncAttendeeTierWithReferralProgress(attendee);
  const code = await ensureAttendeeReferralCode(attendee);
    const referral = attendee.cashback?.referral || {} as any;

    return NextResponse.json({
      ok: true,
      code,
      referredCount: referral.referredCount || 0,
      upgrades: referral.upgrades || [],
      tier: attendee.attendeePassTier,
    });
  } catch (e: any) {
    console.error('Attendee referral ensure error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to generate referral code' }, { status: 500 });
  }
}
