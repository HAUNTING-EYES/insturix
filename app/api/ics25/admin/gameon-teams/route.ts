import { NextRequest, NextResponse } from 'next/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Ics25Team from '@/schemas/ics25/Team';
import Ics25Player from '@/schemas/ics25/Player';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';

export async function GET(req: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await getIcs25Db();

    const { searchParams } = new URL(req.url);
    const game = searchParams.get('game'); // 'valorant', 'bgmi', or null for all

    // Build query
    const query: any = {};
    if (game && (game === 'valorant' || game === 'bgmi')) {
      query.game = game;
    }

    // Fetch all teams for the specified game (or all games)
    const teams = await Ics25Team.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Get all player details for team members
    const allMemberIds = teams.flatMap(t => [t.leaderId, ...t.members]);
    const uniqueMemberIds = [...new Set(allMemberIds)];
    
    const players = await Ics25Player.find({ clerkUserId: { $in: uniqueMemberIds } })
      .select('clerkUserId name email payment.status')
      .lean();

    // Create a lookup map for players
    const playerMap = new Map(
      players.map(p => [p.clerkUserId, p])
    );

    // Enrich teams with member details and payment info
    const enrichedTeams = teams.map(team => {
      const leader = playerMap.get(team.leaderId);
      const memberDetails = team.members.map((memberId: string) => playerMap.get(memberId)).filter(Boolean);
      const allMembers = [leader, ...memberDetails].filter(Boolean);

      // Calculate team payment status
      const paidMembers = allMembers.filter((m: any) => m.payment?.status === 'paid').length;
      const totalMembers = allMembers.length;

      return {
        _id: team._id,
        teamName: team.teamName,
        code: team.code,
        game: team.game,
        leader: {
          id: team.leaderId,
          name: leader?.name || 'Unknown',
          email: leader?.email || 'Unknown',
          paymentStatus: leader?.payment?.status || 'none',
        },
        members: memberDetails.map((m: any) => ({
          id: m.clerkUserId,
          name: m.name || 'Unknown',
          email: m.email || 'Unknown',
          paymentStatus: m.payment?.status || 'none',
        })),
        totalMembers,
        paidMembers,
        pendingMembers: totalMembers - paidMembers,
        paymentStatus: paidMembers === totalMembers ? 'all-paid' : 
                       paidMembers > 0 ? 'partial' : 'none',
        createdAt: team.createdAt,
        listed: team.listed ?? true,
      };
    });

    // Calculate summary stats
    const summary = {
      totalTeams: enrichedTeams.length,
      byGame: {
        valorant: enrichedTeams.filter(t => t.game === 'valorant').length,
        bgmi: enrichedTeams.filter(t => t.game === 'bgmi').length,
      },
      byPaymentStatus: {
        allPaid: enrichedTeams.filter(t => t.paymentStatus === 'all-paid').length,
        partial: enrichedTeams.filter(t => t.paymentStatus === 'partial').length,
        none: enrichedTeams.filter(t => t.paymentStatus === 'none').length,
      },
    };

    return NextResponse.json({
      ok: true,
      teams: enrichedTeams,
      summary,
    });
  } catch (error: any) {
    console.error('Error fetching GameOn teams:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}
