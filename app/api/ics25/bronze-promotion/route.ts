import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import BronzePromotionSubmission from '@/schemas/ics25/BronzePromotionSubmission';
import Attendee from '@/schemas/ics25/Attendee';

/**
 * GET /api/ics25/bronze-promotion
 * Get bronze promotion submission status for current user
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    // Check if user has existing submission
    const submission = await BronzePromotionSubmission.findOne({ clerkUserId: userId });
    
    // Also check attendee record for bronzePromotion status
    const attendee = await Attendee.findOne({ clerkUserId: userId });

    // Derive a unified bronzePromotion view: prefer attendee doc if present,
    // otherwise map from submission so clients can still show status without an attendee record
    const bronzePromotion = attendee?.bronzePromotion
      || (submission ? {
            status: submission.status,
            instagramProofUrl: submission.instagramProofUrl,
            linkedinProofUrl: submission.linkedinProofUrl,
            submittedAt: submission.createdAt,
            rejectionReason: submission.rejectionReason,
         } : null);

    return NextResponse.json({ 
      ok: true, 
      submission,
      bronzePromotion
    });
  } catch (e: any) {
    console.error('GET /api/ics25/bronze-promotion error:', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/ics25/bronze-promotion
 * Submit promotion links for bronze pass approval
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

  const body = await req.json();
  const { instagramProofUrl, linkedinProofUrl, name, email, phone } = body;

    // Validate at least one link is provided
    if (!instagramProofUrl && !linkedinProofUrl) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Please provide at least one promotion link (Instagram or LinkedIn)' 
      }, { status: 400 });
    }

    // Validate provided URLs only
    const urlPattern = /^https?:\/\/.+/i;
    if (instagramProofUrl && !urlPattern.test(instagramProofUrl)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Please provide a valid Instagram URL' 
      }, { status: 400 });
    }
    if (linkedinProofUrl && !urlPattern.test(linkedinProofUrl)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Please provide a valid LinkedIn URL' 
      }, { status: 400 });
    }

    // Check if user already has a submission
    let submission = await BronzePromotionSubmission.findOne({ clerkUserId: userId });

    if (submission && submission.status === 'verified') {
      return NextResponse.json({ 
        ok: false, 
        message: 'Your promotion has already been approved' 
      }, { status: 400 });
    }

    if (submission && submission.status === 'submitted') {
      return NextResponse.json({ 
        ok: false, 
        message: 'Your promotion is already under review' 
      }, { status: 400 });
    }

    // Create or update submission
  if (submission) {
      // Update existing submission (e.g., if previously rejected)
      submission.instagramProofUrl = instagramProofUrl || undefined as any;
      submission.linkedinProofUrl = linkedinProofUrl || undefined as any;
      submission.status = 'submitted';
      if (typeof name === 'string') submission.name = name;
      if (typeof email === 'string') submission.email = email;
      if (typeof phone === 'string') submission.phone = phone;
      submission.rejectionReason = undefined;
      await submission.save();
    } else {
      // Create new submission
      submission = await BronzePromotionSubmission.create({
        clerkUserId: userId,
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(instagramProofUrl ? { instagramProofUrl } : {}),
        ...(linkedinProofUrl ? { linkedinProofUrl } : {}),
        status: 'submitted',
      });
    }

    // Update attendee record's bronzePromotion if attendee exists; do NOT
    // create an attendee yet (they'll register after approval like other tiers)
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (attendee) {
      attendee.bronzePromotion = {
        status: 'submitted',
        ...(instagramProofUrl ? { instagramProofUrl } : {}),
        ...(linkedinProofUrl ? { linkedinProofUrl } : {}),
        submittedAt: new Date(),
      } as any;
      await attendee.save();
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Promotion submitted successfully',
      submission 
    });
  } catch (e: any) {
    console.error('POST /api/ics25/bronze-promotion error:', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Internal error' }, { status: 500 });
  }
}
