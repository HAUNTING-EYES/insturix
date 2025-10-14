import { NextRequest, NextResponse } from 'next/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';
import Team from '@/schemas/ics25/Team';
import { auth } from '@clerk/nextjs/server';

function maxTeamSize(game: 'valorant'|'bgmi') { return game === 'bgmi' ? 4 : 5; }
function genCode(len = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  await getIcs25Db();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const game = searchParams.get('game') as 'valorant'|'bgmi' | null;
  const incompleteOnly = searchParams.get('status') === 'incomplete';
  const pageParam = searchParams.get('page');
  const limitParam = searchParams.get('limit');
  const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
  const limit = limitParam ? Math.max(1, parseInt(limitParam)) : undefined;
  const filter: any = {};
  if (code) filter.code = code;
  if (game) filter.game = game;
  // If not fetching a specific team code, only show publicly listed teams in browse
  const teams = await Team.find(filter).lean();
  if (code) return NextResponse.json({ ok: true, team: teams[0] || null });
  // Apply public listing filter when browsing. Treat missing `listed` as public for backward compatibility.
  const visible = teams.filter((t: any) => t.listed !== false);
  const withCapacity = incompleteOnly ? visible.filter(t => t.members.length < maxTeamSize(t.game)) : visible;
  const total = withCapacity.length;
  if (!limit) {
    return NextResponse.json({ ok: true, teams: withCapacity, total, page: 1, pages: 1 });
  }
  const start = (page - 1) * limit;
  const end = start + limit;
  const paged = withCapacity.slice(start, end);
  const pages = Math.max(1, Math.ceil(total / limit));
  return NextResponse.json({ ok: true, teams: paged, total, page, pages });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  await getIcs25Db();
  const body = await req.json();
  let { teamName, game, code } = body as { teamName: string; game: 'valorant'|'bgmi'; code?: string } as any;
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!teamName || !game) return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 });
  // Generate a unique code if not provided
  if (!code) {
    // Try a few times to avoid rare collisions
    for (let i = 0; i < 5; i++) {
      const candidate = genCode(6);
      const exists = await Team.findOne({ code: candidate });
      if (!exists) { code = candidate; break; }
    }
    if (!code) return NextResponse.json({ ok: false, message: 'Failed to generate code' }, { status: 500 });
  } else {
    const exists = await Team.findOne({ code });
    if (exists) return NextResponse.json({ ok: false, message: 'Code already exists' }, { status: 409 });
  }
  const team = await Team.create({ teamName, game, code, leaderId: userId, members: [userId], pendingRequests: [], link: `https://insturix.com/ics25/${game === 'valorant' ? 'v' : 'b'}/${code}`, listed: true });
  await Player.updateOne({ clerkUserId: userId }, { $set: { teamCode: code, teamRequests: [] } }, { upsert: true });
  return NextResponse.json({ ok: true, team });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  await getIcs25Db();
  const body = await req.json();
  const { action } = body as { action: string };

  if (action === 'requestJoin') {
    const { code } = body as { code: string };
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    if (team.members.includes(userId)) return NextResponse.json({ ok: true, message: 'Already in team' });
    if (!team.pendingRequests.includes(userId)) team.pendingRequests.push(userId);
    await team.save();
    await Player.updateOne({ clerkUserId: userId }, { $addToSet: { teamRequests: code } }, { upsert: true });
    return NextResponse.json({ ok: true });
  }

  if (action === 'accept') {
    const { code, playerId } = body as { code: string; playerId: string };
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (team.leaderId !== userId) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
    if (team.members.length >= maxTeamSize(team.game)) {
      // team full; revoke all pending
      team.pendingRequests = [];
      await team.save();
      await Player.updateMany({ teamRequests: code }, { $pull: { teamRequests: code } });
      return NextResponse.json({ ok: false, message: 'Team is full' }, { status: 400 });
    }
  team.pendingRequests = team.pendingRequests.filter((u: string) => u !== playerId);
    if (!team.members.includes(playerId)) team.members.push(playerId);
    await team.save();
    // revoke player's other team requests
    const player = await Player.findOne({ clerkUserId: playerId });
    if (player) {
  const otherCodes = player.teamRequests.filter((c: string) => c !== code);
      if (otherCodes.length) {
        await Team.updateMany({ code: { $in: otherCodes } }, { $pull: { pendingRequests: playerId } });
      }
      player.teamCode = code;
      player.teamRequests = [];
      await player.save();
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'deny') {
    const { code, playerId } = body as { code: string; playerId: string };
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (team.leaderId !== userId) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  team.pendingRequests = team.pendingRequests.filter((u: string) => u !== playerId);
    await team.save();
    await Player.updateOne({ clerkUserId: playerId }, { $pull: { teamRequests: code } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'removeMember') {
    const { code, playerId } = body as { code: string; playerId: string };
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (team.leaderId !== userId) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  team.members = team.members.filter((u: string) => u !== playerId);
    await team.save();
    await Player.updateOne({ clerkUserId: playerId }, { $set: { teamCode: 'awaiting' } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'cancelRequest') {
    const { code } = body as { code: string };
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    team.pendingRequests = team.pendingRequests.filter((u: string) => u !== userId);
    await team.save();
    await Player.updateOne({ clerkUserId: userId }, { $pull: { teamRequests: code } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'leaveTeam') {
    const { code } = body as { code: string };
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (team.leaderId === userId) return NextResponse.json({ ok: false, message: 'Leader cannot leave team; delete team instead' }, { status: 400 });
    team.members = team.members.filter((u: string) => u !== userId);
    await team.save();
    await Player.updateOne({ clerkUserId: userId }, { $set: { teamCode: 'awaiting' } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'setListed') {
    const { code, listed } = body as { code: string; listed: boolean };
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (team.leaderId !== userId) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
    // Use updateOne with strict: false so it persists even if a stale compiled schema is cached in dev
    await Team.updateOne({ _id: team._id }, { $set: { listed: !!listed } }, { strict: false });
    const updated = await Team.findById(team._id).lean();
    return NextResponse.json({ ok: true, team: updated });
  }

  if (action === 'rename') {
    const { code, teamName } = body as { code: string; teamName: string };
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    if (!teamName || !teamName.trim()) return NextResponse.json({ ok: false, message: 'Team name required' }, { status: 400 });
    const team = await Team.findOne({ code });
    if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
    if (team.leaderId !== userId) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
    await Team.updateOne({ _id: team._id }, { $set: { teamName: teamName.trim() } });
    const updated = await Team.findById(team._id).lean();
    return NextResponse.json({ ok: true, team: updated });
  }

  return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  await getIcs25Db();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ ok: false, message: 'Missing code' }, { status: 400 });
  const team = await Team.findOne({ code });
  if (!team) return NextResponse.json({ ok: false, message: 'Team not found' }, { status: 404 });
  if (team.leaderId !== userId) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  // On delete: set members' teamCode to 'awaiting' and clear their requests
  await Player.updateMany({ clerkUserId: { $in: team.members } }, { $set: { teamCode: 'awaiting' }, $setOnInsert: {} });
  await Team.deleteOne({ _id: team._id });
  return NextResponse.json({ ok: true });
}
