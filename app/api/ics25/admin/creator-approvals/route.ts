import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Creator from '@/schemas/ics25/Creator';
import Attendee from '@/schemas/ics25/Attendee';
import { clerkClient } from '@clerk/nextjs/server';

// Admin-only endpoint to approve/reject Creator Pass applications
export async function POST(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  await getIcs25Db();
  
  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { creatorId, action, rejectionReason } = body;
  const trimmedReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : undefined;
  
  if (!creatorId || !action) {
    return NextResponse.json({ 
      ok: false, 
      message: 'Missing required fields: creatorId and action' 
    }, { status: 400 });
  }

  if (action !== 'approve' && action !== 'reject' && action !== 'revert') {
    return NextResponse.json({ 
      ok: false, 
      message: 'Invalid action. Must be "approve", "reject", or "revert"' 
    }, { status: 400 });
  }

  if (action === 'reject' && !trimmedReason) {
    return NextResponse.json({ 
      ok: false, 
      message: 'rejectionReason is required when rejecting' 
    }, { status: 400 });
  }

  try {
    const creator = await Creator.findById(creatorId);
    
    if (!creator) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Creator application not found' 
      }, { status: 404 });
    }

    // Update approval status
    creator.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
    
    if (action === 'revert') {
      creator.reviewedAt = undefined;
      creator.reviewedBy = undefined;
      creator.rejectionReason = undefined;
    } else {
      creator.reviewedAt = new Date();
      creator.reviewedBy = adminCheck.email || adminCheck.userId!;
      if (action === 'approve') {
        creator.rejectionReason = undefined;
      }
      if (action === 'reject' && trimmedReason) {
        creator.rejectionReason = trimmedReason;
      }
    }

    await creator.save();

    return NextResponse.json({ 
      ok: true, 
      message: `Application ${action}d successfully`,
      creator 
    });
  } catch (e: any) {
    console.error('Admin approval action error:', e);
    return NextResponse.json({ 
      ok: false, 
      message: e.message || 'Failed to process approval action' 
    }, { status: 500 });
  }
}

// Get all pending Creator Pass applications (admin only)
export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  await getIcs25Db();

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';

    const creators = await Creator.find({ status })
      .sort({ submittedAt: -1 })
      .lean();

    if (creators.length === 0) {
      return NextResponse.json({ ok: true, creators: [], count: 0 });
    }

    const userIds = creators
      .map((creator) => creator.clerkUserId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

    const attendees = await Attendee.find({ clerkUserId: { $in: userIds } })
      .select('clerkUserId name email phone')
      .lean();

    const attendeeMap = new Map(attendees.map((attendee) => [attendee.clerkUserId, attendee]));

    const displayNameMap = new Map<string, string>();
    const missingFromDb: string[] = [];

    for (const id of userIds) {
      const existingCreator = creators.find((creator) => creator.clerkUserId === id);
      const candidateName = [existingCreator?.name, attendeeMap.get(id)?.name]
        .find((value) => typeof value === 'string' && value.trim().length > 0);

      if (candidateName) {
        displayNameMap.set(id, candidateName.trim());
      } else {
        missingFromDb.push(id);
      }
    }

    if (missingFromDb.length > 0) {
      try {
        const client = await clerkClient();
        const clerkUsersResponse = await client.users.getUserList({
          userId: missingFromDb,
          limit: missingFromDb.length,
        });

        const clerkUsers = Array.isArray((clerkUsersResponse as any)?.data)
          ? (clerkUsersResponse as any).data
          : clerkUsersResponse;

        for (const user of clerkUsers as Array<{ id: string; fullName?: string | null; firstName?: string | null; lastName?: string | null }>) {
          const nameFromClerk = [user.fullName, `${user.firstName ?? ''} ${user.lastName ?? ''}`]
            .map((value) => (value ?? '').trim())
            .find((value) => value.length > 0);

          if (nameFromClerk && user.id) {
            displayNameMap.set(user.id, nameFromClerk);
          }
        }
      } catch (clerkError) {
        console.error('Failed to fetch clerk user names for creator approvals:', clerkError);
      }
    }

    const enrichedCreators = creators.map((creator) => {
      const attendee = attendeeMap.get(creator.clerkUserId ?? '');
      const displayName = displayNameMap.get(creator.clerkUserId ?? '') ?? creator.name ?? '';
      return {
        ...creator,
        displayName: displayName.trim() || undefined,
        attendeeName: attendee?.name,
        attendeeEmail: attendee?.email,
        attendeePhone: attendee?.phone,
      };
    });

    return NextResponse.json({
      ok: true,
      creators: enrichedCreators,
      count: enrichedCreators.length,
    });
  } catch (e: any) {
    console.error('Admin get applications error:', e);
    return NextResponse.json({ 
      ok: false, 
      message: e.message || 'Failed to fetch applications' 
    }, { status: 500 });
  }
}
