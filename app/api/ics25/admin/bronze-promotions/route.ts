import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getIcs25Db } from '@/lib/ics25-mongo';
import BronzePromotionSubmission from '@/schemas/ics25/BronzePromotionSubmission';
import Attendee from '@/schemas/ics25/Attendee';

/**
 * GET /api/ics25/admin/bronze-promotions
 * List all bronze promotion submissions (filtered by status if provided)
 */
export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await getIcs25Db();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query: any = {};
    if (status && ['submitted', 'verified', 'rejected'].includes(status)) {
      query.status = status;
    }

    const submissions = await BronzePromotionSubmission.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ ok: true, submissions });
  } catch (e: any) {
    console.error('GET /api/ics25/admin/bronze-promotions error:', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/ics25/admin/bronze-promotions
 * Approve or reject a bronze promotion submission
 */
export async function POST(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await getIcs25Db();

    const body = await req.json();
    const { submissionId, action, rejectionReason } = body;

    if (!submissionId || !action) {
      return NextResponse.json({ 
        ok: false, 
        message: 'submissionId and action are required' 
      }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'action must be either "approve" or "reject"' 
      }, { status: 400 });
    }

    if (action === 'reject' && !rejectionReason) {
      return NextResponse.json({ 
        ok: false, 
        message: 'rejectionReason is required when rejecting' 
      }, { status: 400 });
    }

    const submission = await BronzePromotionSubmission.findById(submissionId);
    if (!submission) {
      return NextResponse.json({ ok: false, message: 'Submission not found' }, { status: 404 });
    }

    // Update submission
    submission.status = action === 'approve' ? 'verified' : 'rejected';
    submission.reviewedAt = new Date();
    submission.reviewedBy = adminCheck.email || adminCheck.userId!;
    
    if (action === 'reject') {
      submission.rejectionReason = rejectionReason;
    }
    
    await submission.save();

    // Update attendee record
    const attendee = await Attendee.findOne({ clerkUserId: submission.clerkUserId });
    if (attendee && attendee.bronzePromotion) {
      attendee.bronzePromotion.status = action === 'approve' ? 'verified' : 'rejected';
      
      if (action === 'reject') {
        attendee.bronzePromotion.rejectionReason = rejectionReason;
      }
      
      await attendee.save();
    }

    return NextResponse.json({ 
      ok: true, 
      message: action === 'approve' ? 'Submission approved' : 'Submission rejected',
      submission 
    });
  } catch (e: any) {
    console.error('POST /api/ics25/admin/bronze-promotions error:', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Internal error' }, { status: 500 });
  }
}
