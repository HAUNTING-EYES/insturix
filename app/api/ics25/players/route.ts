import { NextRequest, NextResponse } from 'next/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';
import Team from '@/schemas/ics25/Team';
import { auth } from '@clerk/nextjs/server';
import PromoReelSubmission from '@/schemas/ics25/PromoReelSubmission';
import LinkedInSubmission from '@/schemas/ics25/LinkedInSubmission';
import crypto from 'crypto';

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
  const action = body?.action as string | undefined;

  // Action: submit cashback tasks or generate referral code
  if (action === 'cashback.submit') {
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const { task, proofUrl } = body as any;
    const player = await Player.findOne({ clerkUserId: userId });
    if (!player) return NextResponse.json({ ok: false, message: 'Player not found' }, { status: 404 });
    if (!player.cashbacks) player.cashbacks = {} as any;
    if (task === 'promoReel') {
      player.cashbacks.promoReel = { ...(player.cashbacks.promoReel as any), status: 'submitted', proofUrl, amount: 75 } as any;
      await PromoReelSubmission.create({ playerId: player._id.toString(), clerkUserId: player.clerkUserId, name: player.name, instagram: player.instagram, proofUrl, amount: 75, status: 'submitted' });
    } else if (task === 'linkedinPost') {
      player.cashbacks.linkedinPost = { ...(player.cashbacks.linkedinPost as any), status: 'submitted', proofUrl, amount: 75 } as any;
      await LinkedInSubmission.create({ playerId: player._id.toString(), clerkUserId: player.clerkUserId, name: player.name, instagram: player.instagram, proofUrl, amount: 75, status: 'submitted' });
    } else {
      return NextResponse.json({ ok: false, message: 'Unknown task' }, { status: 400 });
    }
    await player.save();
    return NextResponse.json({ ok: true, player });
  }

  if (action === 'cashback.referral.ensure') {
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const player = await Player.findOne({ clerkUserId: userId });
    if (!player) return NextResponse.json({ ok: false, message: 'Player not found' }, { status: 404 });
    if (!player.cashbacks) player.cashbacks = {} as any;
    if (!player.cashbacks.referral?.code) {
      const code = crypto.randomBytes(3).toString('hex'); // 6-char hex
      player.cashbacks.referral = { ...(player.cashbacks.referral as any), code, amount: 100 } as any;
      await player.save();
    }
    return NextResponse.json({ ok: true, code: player.cashbacks.referral?.code, player });
  }

  // Default: upsert player profile
  const data = { ...body, clerkUserId: body.clerkUserId || userId };
  const existing = await Player.findOne({ clerkUserId: data.clerkUserId });
  if (existing) {
    // Prevent changes to locked fields: email and game cannot be changed once set
    const { email: _email, game: _game, clerkUserId: _clerkUserId, ...rest } = data as any;
    // Merge updatable fields only
    Object.assign(existing, rest);
    // Update nested gameDetails only for the currently selected game
    if (rest.gameDetails) {
      if (existing.game === 'valorant' && rest.gameDetails.valorant) {
        existing.gameDetails = { ...existing.gameDetails, valorant: { ...(existing.gameDetails as any)?.valorant, ...rest.gameDetails.valorant } } as any;
      }
      if (existing.game === 'bgmi' && rest.gameDetails.bgmi) {
        existing.gameDetails = { ...existing.gameDetails, bgmi: { ...(existing.gameDetails as any)?.bgmi, ...rest.gameDetails.bgmi } } as any;
      }
    }
    await existing.save();
    return NextResponse.json({ ok: true, player: existing });
  }
  // On create: persist email and game from first registration; both will be locked afterwards
  const player = await Player.create(data);
  // Referral attachment: store on player.referredBy; confirmation happens at payment verification
  try {
    const referralCode = (body?.referralCode || body?.referral)?.toString().trim().toLowerCase();
    if (referralCode) {
      const referrer = await Player.findOne({ 'cashbacks.referral.code': referralCode });
      if (referrer && referrer.clerkUserId !== player.clerkUserId) {
        player.referredBy = { code: referralCode, referrerUserId: referrer.clerkUserId, confirmed: false } as any;
        await player.save();
      }
    }
  } catch { /* ignore referral errors */ }
  return NextResponse.json({ ok: true, player });
}
