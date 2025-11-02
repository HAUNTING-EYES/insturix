import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Creator from '@/schemas/ics25/Creator';

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
      
      if (action === 'reject' && rejectionReason?.trim()) {
        creator.rejectionReason = rejectionReason.trim();
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
