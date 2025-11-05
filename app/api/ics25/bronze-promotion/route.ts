import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import BronzePromotionSubmission from '@/schemas/ics25/BronzePromotionSubmission';
import Attendee from '@/schemas/ics25/Attendee';
import { applyAttendeeReferralCredit } from '@/lib/ics25/referrals';

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

    // Prefer submission data for bronze promotion status so attendee docs remain untouched
    const bronzePromotion = submission
      ? {
          status: submission.status,
          instagramProofUrl: submission.instagramProofUrl,
          linkedinProofUrl: submission.linkedinProofUrl,
          submittedAt: submission.createdAt,
          rejectionReason: submission.rejectionReason,
        }
      : attendee?.bronzePromotion ?? null;

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
    const {
      instagramProofUrl,
      linkedinProofUrl,
      name,
      email,
      phone,
      instagram,
      linkedin,
      profession,
      ageGroup,
      city,
      state,
      organization,
      referralCode,
    } = body || {};

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

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedInstagram = typeof instagram === 'string' ? instagram.trim() : '';
    const trimmedLinkedin = typeof linkedin === 'string' ? linkedin.trim() : '';
    const trimmedProfession = typeof profession === 'string' ? profession.trim() : '';
    const trimmedCity = typeof city === 'string' ? city.trim() : '';
    const trimmedState = typeof state === 'string' ? state.trim() : '';
    const trimmedOrganization = typeof organization === 'string' ? organization.trim() : '';
    const normalizedReferralCode = typeof referralCode === 'string' ? referralCode.trim().toLowerCase() : '';

    const missingFields: string[] = [];
    if (!trimmedName) missingFields.push('name');
    if (!trimmedEmail) missingFields.push('email');
    if (!trimmedPhone) missingFields.push('phone');
    if (!trimmedInstagram) missingFields.push('instagram');
    if (!trimmedLinkedin) missingFields.push('linkedin');
    if (!trimmedProfession) missingFields.push('profession');
    if (!ageGroup) missingFields.push('ageGroup');
    if (!trimmedCity) missingFields.push('city');
    if (!trimmedState) missingFields.push('state');

    if (missingFields.length > 0) {
      return NextResponse.json({
        ok: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
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

    const now = new Date();

    // Upsert attendee with provided details and mark payment as pending
    let attendee = await Attendee.findOne({ clerkUserId: userId });

    if (attendee && attendee.attendeePassTier && attendee.attendeePassTier !== 'bronze') {
      return NextResponse.json({
        ok: false,
        message: 'You are already registered for a different pass tier.',
      }, { status: 400 });
    }

    if (attendee) {
      attendee.name = trimmedName;
      attendee.email = trimmedEmail;
      attendee.phone = trimmedPhone;
      attendee.instagram = trimmedInstagram;
      attendee.linkedin = trimmedLinkedin;
      attendee.profession = trimmedProfession;
      attendee.ageGroup = ageGroup;
      attendee.city = trimmedCity;
      attendee.state = trimmedState;
      attendee.organization = trimmedOrganization;
      attendee.attendeePassTier = 'bronze';
      attendee.payment = attendee.payment || ({} as any);
      if (attendee.payment.status !== 'paid') {
        attendee.payment.status = 'pending';
        if (typeof attendee.markModified === 'function') {
          attendee.markModified('payment');
        }
      }
    } else {
      attendee = new Attendee({
        clerkUserId: userId,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        instagram: trimmedInstagram,
        linkedin: trimmedLinkedin,
        profession: trimmedProfession,
        ageGroup,
        city: trimmedCity,
        state: trimmedState,
        organization: trimmedOrganization,
        attendeePassTier: 'bronze',
        payment: { status: 'pending' },
      } as any);
    }

    let referralReferrer: any = null;
    let applyReferralImmediately = false;

    if (normalizedReferralCode) {
      if (!attendee.referredBy?.code) {
        const referrer = await Attendee.findOne({ 'cashback.referral.code': normalizedReferralCode });
        if (referrer && referrer.clerkUserId !== attendee.clerkUserId) {
          attendee.referredBy = {
            code: normalizedReferralCode,
            referrerUserId: referrer.clerkUserId,
            confirmed: true,
            creditedAt: now,
          } as any;
          referralReferrer = referrer;
          applyReferralImmediately = true;
        }
      } else if (
        attendee.referredBy?.code === normalizedReferralCode &&
        attendee.referredBy.confirmed !== true
      ) {
        const referrer = await Attendee.findOne({ clerkUserId: attendee.referredBy?.referrerUserId || '' });
        if (referrer && referrer.clerkUserId !== attendee.clerkUserId) {
          attendee.referredBy.confirmed = true;
          attendee.referredBy.creditedAt = now;
          attendee.markModified('referredBy');
          referralReferrer = referrer;
          applyReferralImmediately = true;
        }
      }
    }

    await attendee.save();

    if (applyReferralImmediately && referralReferrer) {
      await applyAttendeeReferralCredit(referralReferrer, attendee.clerkUserId);
    }

    if (submission) {
      submission.instagramProofUrl = instagramProofUrl || undefined as any;
      submission.linkedinProofUrl = linkedinProofUrl || undefined as any;
      submission.status = 'submitted';
      submission.name = trimmedName;
      submission.email = trimmedEmail;
      submission.phone = trimmedPhone;
      submission.rejectionReason = undefined;
      submission.reviewedAt = undefined;
      submission.reviewedBy = undefined;
      await submission.save();
    } else {
      submission = await BronzePromotionSubmission.create({
        clerkUserId: userId,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        ...(instagramProofUrl ? { instagramProofUrl } : {}),
        ...(linkedinProofUrl ? { linkedinProofUrl } : {}),
        status: 'submitted',
      });
    }

    const submissionPayload = typeof submission.toObject === 'function' ? submission.toObject() : submission;
    const attendeePayload = typeof attendee.toObject === 'function' ? attendee.toObject() : attendee;

    return NextResponse.json({ 
      ok: true, 
      message: 'Promotion submitted successfully',
      submission: submissionPayload,
      attendee: attendeePayload,
    });
  } catch (e: any) {
    console.error('POST /api/ics25/bronze-promotion error:', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Internal error' }, { status: 500 });
  }
}
