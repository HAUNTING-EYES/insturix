import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getIcs25Db } from '@/lib/ics25-mongo';
import BronzePromotionSubmission from '@/schemas/ics25/BronzePromotionSubmission';
import Attendee from '@/schemas/ics25/Attendee';
import { clerkClient } from '@clerk/nextjs/server';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import { sendTicketConfirmationEmail } from '@/lib/services/email';
import { hasEmailBeenSent, markEmailSent } from '@/lib/services/email/ticket-email-tracking';

const BRONZE_STATUSES = ['submitted', 'verified', 'rejected'] as const;
type BronzeStatus = (typeof BRONZE_STATUSES)[number];

type NormalizedSubmission = {
  _id: string;
  clerkUserId: string;
  name?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  instagramHandle?: string;
  linkedinHandle?: string;
  instagramProofUrl?: string;
  linkedinProofUrl?: string;
  status: BronzeStatus;
  rejectionReason?: string;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  source: 'submission' | 'submission+attendee' | 'attendee';
};

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  try {
    const date = new Date(value as any);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  } catch {
    return undefined;
  }
};

const normalizeSubmission = (
  submission: any,
  attendee?: any,
  sourceOverride?: NormalizedSubmission['source'],
  displayName?: string
): NormalizedSubmission => {
  const source: NormalizedSubmission['source'] = sourceOverride ?? (attendee ? 'submission+attendee' : 'submission');
  return {
    _id: submission._id?.toString?.() ?? String(submission._id),
    clerkUserId: submission.clerkUserId,
    name: submission.name || attendee?.name || undefined,
    displayName,
    email: submission.email || attendee?.email || undefined,
    phone: submission.phone || attendee?.phone || undefined,
    instagramHandle: attendee?.instagram || undefined,
    linkedinHandle: attendee?.linkedin || undefined,
    instagramProofUrl: submission.instagramProofUrl || attendee?.bronzePromotion?.instagramProofUrl || undefined,
    linkedinProofUrl: submission.linkedinProofUrl || attendee?.bronzePromotion?.linkedinProofUrl || undefined,
    status: submission.status as BronzeStatus,
    rejectionReason: submission.rejectionReason || attendee?.bronzePromotion?.rejectionReason || undefined,
    createdAt: toIsoString(
      submission.createdAt || attendee?.bronzePromotion?.submittedAt || attendee?.createdAt
    ),
    reviewedAt: toIsoString(
      submission.reviewedAt || attendee?.bronzePromotion?.reviewedAt || attendee?.updatedAt
    ),
    reviewedBy: submission.reviewedBy || attendee?.bronzePromotion?.reviewedBy || undefined,
    source,
  };
};

const normalizeAttendeeOnly = (attendee: any): NormalizedSubmission | null => {
  const status = attendee?.bronzePromotion?.status;
  if (!status || !BRONZE_STATUSES.includes(status)) {
    return null;
  }

  return {
    _id: `attendee-${attendee._id?.toString?.() ?? attendee._id}`,
    clerkUserId: attendee.clerkUserId,
    name: attendee.name || undefined,
    displayName: attendee.name || undefined,
    email: attendee.email || undefined,
    phone: attendee.phone || undefined,
    instagramHandle: attendee.instagram || undefined,
    linkedinHandle: attendee.linkedin || undefined,
    instagramProofUrl: attendee.bronzePromotion?.instagramProofUrl || undefined,
    linkedinProofUrl: attendee.bronzePromotion?.linkedinProofUrl || undefined,
    status: attendee.bronzePromotion.status as BronzeStatus,
    rejectionReason: attendee.bronzePromotion?.rejectionReason || undefined,
    createdAt: toIsoString(attendee.bronzePromotion?.submittedAt || attendee.createdAt),
    reviewedAt: toIsoString(attendee.bronzePromotion?.reviewedAt || attendee.updatedAt),
    reviewedBy: attendee.bronzePromotion?.reviewedBy || undefined,
    source: 'attendee',
  };
};

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
    const statusParam = searchParams.get('status');

    const statusFilter: BronzeStatus[] = statusParam && BRONZE_STATUSES.includes(statusParam as BronzeStatus)
      ? [statusParam as BronzeStatus]
      : [...BRONZE_STATUSES];

    const submissionQuery = statusFilter.length === BRONZE_STATUSES.length
      ? {}
      : { status: statusFilter[0] };

    const [submissionDocs, attendeeDocs] = await Promise.all([
      BronzePromotionSubmission.find(submissionQuery)
        .sort({ createdAt: -1 })
        .lean(),
      Attendee.find({ 'bronzePromotion.status': { $in: statusFilter } })
        .select('clerkUserId name email phone instagram linkedin bronzePromotion createdAt updatedAt')
        .lean(),
    ]);

    const attendeeByUserId = new Map<string, any>(
      attendeeDocs.map((att: any) => [att.clerkUserId, att])
    );

    const submissionUserIds = new Set<string>(submissionDocs.map((doc: any) => doc.clerkUserId));

    const pendingNames = new Set<string>();

    for (const doc of submissionDocs as Array<any>) {
      const userId = doc?.clerkUserId;
      if (typeof userId !== 'string') continue;
      const submissionName = typeof doc.name === 'string' ? doc.name.trim() : '';
      const attendeeName = attendeeByUserId.get(userId)?.name;

      if (!submissionName && typeof attendeeName !== 'string') {
        pendingNames.add(userId);
      }
    }

    const clerkNameMap = new Map<string, string>();
    if (pendingNames.size > 0) {
      try {
        const client = await clerkClient();
        const clerkResponse = await client.users.getUserList({
          userId: Array.from(pendingNames),
          limit: pendingNames.size,
        });

        const clerkUsers = Array.isArray((clerkResponse as any)?.data)
          ? (clerkResponse as any).data
          : clerkResponse;

        for (const user of clerkUsers as Array<{ id: string; fullName?: string | null; firstName?: string | null; lastName?: string | null }>) {
          const derived = [user.fullName, `${user.firstName ?? ''} ${user.lastName ?? ''}`]
            .map((value) => (value ?? '').trim())
            .find((value) => value.length > 0);
          if (derived && user.id) {
            clerkNameMap.set(user.id, derived);
          }
        }
      } catch (clerkError) {
        console.error('Failed to fetch Clerk names for bronze promotions:', clerkError);
      }
    }

    const normalizedSubmissions = submissionDocs.map((doc: any) => {
      const attendeeMatch = attendeeByUserId.get(doc.clerkUserId);
      const displayName = [doc.name, attendeeMatch?.name, clerkNameMap.get(doc.clerkUserId)]
        .map((value) => (value ?? '').trim())
        .find((value) => (value ?? '').length > 0);
      return normalizeSubmission(doc, attendeeMatch, undefined, displayName);
    });

    const attendeeOnlyEntries = attendeeDocs
      .filter((att: any) => !submissionUserIds.has(att.clerkUserId))
      .map((att: any) => normalizeAttendeeOnly(att))
      .filter((entry): entry is NormalizedSubmission => Boolean(entry))
      .map((entry) => {
        const displayName = [entry.name, clerkNameMap.get(entry.clerkUserId)]
          .map((value) => (value ?? '').trim())
          .find((value) => (value ?? '').length > 0);
        return {
          ...entry,
          displayName: displayName ?? entry.displayName,
        };
      });

    const combined = [...normalizedSubmissions, ...attendeeOnlyEntries]
      .filter((entry) => statusFilter.includes(entry.status))
      .sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bTime - aTime;
      });

    return NextResponse.json({ ok: true, submissions: combined, count: combined.length });
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
    const trimmedReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : undefined;

    if (!submissionId || !action) {
      return NextResponse.json({ 
        ok: false, 
        message: 'submissionId and action are required' 
      }, { status: 400 });
    }

    if (!['approve', 'reject', 'revert'].includes(action)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'action must be either "approve", "reject", or "revert"' 
      }, { status: 400 });
    }

    if (action === 'reject' && !trimmedReason) {
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
    const reviewerId = adminCheck.email || adminCheck.userId!;
    const reviewTimestamp = new Date();

    let responseMessage = '';

    if (action === 'revert') {
      submission.status = 'submitted';
      submission.reviewedAt = undefined;
      submission.reviewedBy = undefined;
      submission.rejectionReason = undefined;

      await submission.save();

      const attendee = await Attendee.findOne({ clerkUserId: submission.clerkUserId });
      let attendeeObj: any;
      if (attendee) {
        attendee.payment = attendee.payment || ({} as any);
        if (attendee.payment.status !== 'paid') {
          attendee.payment.status = 'pending';
          if (typeof attendee.markModified === 'function') {
            attendee.markModified('payment');
          }
          await attendee.save();
        }
        attendeeObj = typeof attendee.toObject === 'function' ? attendee.toObject() : attendee;
      }

      responseMessage = 'Submission reverted to pending';

      return NextResponse.json({
        ok: true,
        message: responseMessage,
        submission: normalizeSubmission(submission.toObject(), attendeeObj),
      });
    }

    submission.status = action === 'approve' ? 'verified' : 'rejected';
    submission.reviewedAt = reviewTimestamp;
    submission.reviewedBy = reviewerId;
    submission.rejectionReason = action === 'approve' ? undefined : trimmedReason;

    await submission.save();

    // Update attendee record
    const attendee = await Attendee.findOne({ clerkUserId: submission.clerkUserId });
    if (attendee) {
      attendee.payment = attendee.payment || ({} as any);
      if (action === 'approve') {
        // If Bronze tier, upgrade to Silver on approval
        if (attendee.attendeePassTier === 'bronze') {
          attendee.attendeePassTier = 'silver';
        }
        if (attendee.payment.status !== 'paid') {
          attendee.payment.status = 'none';
        }
      } else {
        // Set payment status to 'rejected' when admin rejects the promotion
        if (attendee.payment.status !== 'paid') {
          attendee.payment.status = 'rejected';
        }
      }
      if (typeof attendee.markModified === 'function') {
        attendee.markModified('payment');
        if (action === 'approve' && attendee.attendeePassTier === 'silver') {
          attendee.markModified('attendeePassTier');
        }
      }
      await attendee.save();

      // Send ticket confirmation email when approving (only if not already sent)
      if (action === 'approve') {
        try {
          if (!hasEmailBeenSent(attendee, 'confirmation')) {
            // Connect to production database to get user details
            await connectToDatabase();
            
            // Get user details for email
            const user = await User.findOne({ clerkUserId: submission.clerkUserId }).lean();
            const userName = user?.username || attendee.name || 'Valued User';
            const userEmail = user?.email || attendee.email;
            
            if (userEmail) {
              const ticketId = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
              const eventDetails = "Insturix Creator's Summit 2025";
              
              const emailResult = await sendTicketConfirmationEmail(
                userEmail,
                userName,
                ticketId,
                eventDetails
              );
              
              if (emailResult.success) {
                await markEmailSent(attendee, 'confirmation');
                console.log(`✅ Ticket confirmation email sent to ${userEmail} after bronze promotion approval`);
              } else {
                console.error(`❌ Failed to send ticket confirmation email to ${userEmail}:`, emailResult.error);
              }
            }
          }
        } catch (emailError: any) {
          // Don't fail the approval if email fails
          console.error('Error sending ticket confirmation email after bronze promotion approval:', emailError);
        }
      }
    }

    const attendeeObj = attendee ? (typeof attendee.toObject === 'function' ? attendee.toObject() : attendee) : undefined;
    responseMessage = action === 'approve' ? 'Submission approved' : 'Submission rejected';

    return NextResponse.json({ 
      ok: true, 
      message: responseMessage,
      submission: normalizeSubmission(submission.toObject(), attendeeObj)
    });
  } catch (e: any) {
    console.error('POST /api/ics25/admin/bronze-promotions error:', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Internal error' }, { status: 500 });
  }
}
