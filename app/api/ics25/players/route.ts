import { NextRequest, NextResponse } from 'next/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';
import Team from '@/schemas/ics25/Team';
import { auth, clerkClient } from '@clerk/nextjs/server';
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
    try {
      const client = await clerkClient();
      const enriched = await Promise.all(players.map(async (p: any) => {
        try {
          const u = await client.users.getUser(p.clerkUserId);
          return { ...p, imageUrl: u?.imageUrl };
        } catch {
          return p;
        }
      }));
      return NextResponse.json({ ok: true, players: enriched });
    } catch {
      return NextResponse.json({ ok: true, players });
    }
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
      player.cashbacks.promoReel = { ...(player.cashbacks.promoReel as any), status: 'submitted', proofUrl, amount: 100 } as any;
      await PromoReelSubmission.create({ playerId: player._id.toString(), clerkUserId: player.clerkUserId, name: player.name, instagram: player.instagram, proofUrl, amount: 100, status: 'submitted' });
    } else if (task === 'linkedinPost') {
      player.cashbacks.linkedinPost = { ...(player.cashbacks.linkedinPost as any), status: 'submitted', proofUrl, amount: 100 } as any;
      await LinkedInSubmission.create({ playerId: player._id.toString(), clerkUserId: player.clerkUserId, name: player.name, instagram: player.instagram, proofUrl, amount: 100, status: 'submitted' });
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
      player.cashbacks.referral = { ...(player.cashbacks.referral as any), code, amount: 150 } as any;
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
    // Validate required fields after merge
    const phone = (existing.phone || '').toString().trim();
    const instagram = (existing.instagram || '').toString().trim();
    if (!phone || !instagram) {
      return NextResponse.json({ ok: false, message: 'Phone and Instagram are required' }, { status: 400 });
    }
    // Game-specific validations
    // Only validate game-specific fields if the request is attempting to update them
    if (existing.game === 'valorant' && (rest.gameDetails?.valorant)) {
      const gd = rest.gameDetails?.valorant || {};
      if (!gd.riotId || !gd.rank || !gd.preferredAgents) {
        return NextResponse.json({ ok: false, message: 'Valorant: Riot ID, Rank and Preferred Agent(s) are required' }, { status: 400 });
      }
      const riotId = gd.riotId.toString().trim();
      if (!/^[^#\s]{3,16}#[A-Za-z0-9]{3,5}$/.test(riotId)) {
        return NextResponse.json({ ok: false, message: 'Invalid Riot ID format. Use Name#TAG (name 3–16 chars, tag 3–5 alphanumeric).' }, { status: 400 });
      }
    }
    if (existing.game === 'bgmi' && (rest.gameDetails?.bgmi)) {
      const gd = rest.gameDetails?.bgmi || {};
      if (!gd.ign || !gd.uid || !gd.rank) {
        return NextResponse.json({ ok: false, message: 'BGMI: IGN, UID and Tier/Rank are required' }, { status: 400 });
      }
    }
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
  // Validate required fields on create
  const phone = (data.phone || '').toString().trim();
  const instagram = (data.instagram || '').toString().trim();
  if (!phone || !instagram) {
    return NextResponse.json({ ok: false, message: 'Phone and Instagram are required' }, { status: 400 });
  }
  // Game-specific validations on create
  if (data.game === 'valorant') {
    const gd = (data.gameDetails as any)?.valorant || {};
    if (!gd.riotId || !gd.rank || !gd.preferredAgents) {
      return NextResponse.json({ ok: false, message: 'Valorant: Riot ID, Rank and Preferred Agent(s) are required' }, { status: 400 });
    }
    const riotId = gd.riotId.toString().trim();
    if (!/^[^#\s]{3,16}#[A-Za-z0-9]{3,5}$/.test(riotId)) {
      return NextResponse.json({ ok: false, message: 'Invalid Riot ID format. Use Name#TAG (name 3–16 chars, tag 3–5 alphanumeric).' }, { status: 400 });
    }
  }
  if (data.game === 'bgmi') {
    const gd = (data.gameDetails as any)?.bgmi || {};
    if (!gd.ign || !gd.uid || !gd.rank) {
      return NextResponse.json({ ok: false, message: 'BGMI: IGN, UID and Tier/Rank are required' }, { status: 400 });
    }
  }
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
