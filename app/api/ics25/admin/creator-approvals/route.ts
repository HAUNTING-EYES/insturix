import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Creator from '@/schemas/ics25/Creator';

// Admin-only endpoint to approve/reject Creator Pass applications
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  // Check if user is admin (you can customize this check based on your admin setup)
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.publicMetadata?.role === 'admin' || user.privateMetadata?.role === 'admin';
  
  if (!isAdmin) {
    return NextResponse.json({ ok: false, message: 'Forbidden: Admin access required' }, { status: 403 });
  }

  await getIcs25Db();
  
  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { creatorId, action, rejectionReason } = body;
  
  if (!creatorId || !action) {
    return NextResponse.json({ 
      ok: false, 
      message: 'Missing required fields: creatorId and action' 
    }, { status: 400 });
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ 
      ok: false, 
      message: 'Invalid action. Must be "approve" or "reject"' 
    }, { status: 400 });
  }

  if (action === 'reject' && !rejectionReason?.trim()) {
    return NextResponse.json({ 
      ok: false, 
      message: 'Rejection reason is required when rejecting an application' 
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
    creator.status = action === 'approve' ? 'approved' : 'rejected';
    creator.reviewedAt = new Date();
    creator.reviewedBy = user.emailAddresses[0]?.emailAddress || userId;
    
    if (action === 'reject') {
      creator.rejectionReason = rejectionReason.trim();
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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  // Check if user is admin
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.publicMetadata?.role === 'admin' || user.privateMetadata?.role === 'admin';
  
  if (!isAdmin) {
    return NextResponse.json({ ok: false, message: 'Forbidden: Admin access required' }, { status: 403 });
  }

  await getIcs25Db();

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';

    const creators = await Creator.find({ status })
    .sort({ submittedAt: -1 })
    .lean();

    return NextResponse.json({ 
      ok: true, 
      creators,
      count: creators.length
    });
  } catch (e: any) {
    console.error('Admin get applications error:', e);
    return NextResponse.json({ 
      ok: false, 
      message: e.message || 'Failed to fetch applications' 
    }, { status: 500 });
  }
}
