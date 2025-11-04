import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee, { Ics25AttendeeDocument } from '@/schemas/ics25/Attendee';
import BronzePromotionSubmission from '@/schemas/ics25/BronzePromotionSubmission';
import { applyAttendeeReferralCredit, syncAttendeeTierWithReferralProgress } from '@/lib/ics25/referrals';

export async function GET(req: NextRequest) {
  await getIcs25Db();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const attendeeDoc = await Attendee.findOne({ clerkUserId: userId });
  if (!attendeeDoc) return NextResponse.json({ ok: true, attendee: null });

  await syncAttendeeTierWithReferralProgress(attendeeDoc);
  return NextResponse.json({ ok: true, attendee: attendeeDoc.toObject() });
}

export async function POST(req: NextRequest) {
  console.log('=== Attendees POST called ===');
  const { userId } = await auth();
  console.log('userId:', userId);
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  await getIcs25Db();
  console.log('Database connected');
  
  let body;
  try {
    body = await req.json();
    console.log('Request body:', body);
  } catch (e: any) {
    console.error('JSON parse error:', e);
    return NextResponse.json({ ok: false, message: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { attendeePassTier } = body;
  const referralCodeSource = (body?.referralCode ?? body?.referral) as string | undefined;
  const normalizedReferralCode = typeof referralCodeSource === 'string' ? referralCodeSource.trim().toLowerCase() : '';

  const existing = await Attendee.findOne({ clerkUserId: userId });

  // For Bronze tier, check if promotion tasks are approved
  if (attendeePassTier === 'bronze') {
    let isVerified = existing?.bronzePromotion?.status === 'verified';
    if (!isVerified) {
      const submission = await BronzePromotionSubmission.findOne({ clerkUserId: userId, status: 'verified' }).lean();
      isVerified = !!submission;
    }

    if (!isVerified) {
      return NextResponse.json({
        ok: false,
        message: 'Bronze pass requires completion and approval of promotional tasks',
        requiresPromotion: true,
      }, { status: 400 });
    }
  }

  // Validate required fields for all attendee registrations
  const { name, email, phone, instagram, linkedin, profession, ageGroup, city, state } = body;
  
  const missingFields = [];
  if (!name?.trim()) missingFields.push('name');
  if (!email?.trim()) missingFields.push('email');
  if (!phone?.trim()) missingFields.push('phone');
  if (!instagram?.trim()) missingFields.push('instagram');
  if (!linkedin?.trim()) missingFields.push('linkedin');
  if (!profession?.trim()) missingFields.push('profession');
  if (!ageGroup) missingFields.push('ageGroup');
  if (!city?.trim()) missingFields.push('city');
  if (!state?.trim()) missingFields.push('state');
  if (!attendeePassTier) missingFields.push('attendeePassTier');

  if (missingFields.length > 0) {
    console.error('Missing fields:', missingFields);
    return NextResponse.json({ ok: false, message: `Missing required fields: ${missingFields.join(', ')}` }, { status: 400 });
  }

  try {
    console.log('Looking for existing attendee for userId:', userId);
    console.log('Existing attendee found:', !!existing);

    if (existing) {
      // Update existing attendee
      console.log('Updating existing attendee');
      Object.assign(existing, {
        name: name?.trim() || existing.name,
        email: email?.trim() || existing.email,
        phone: phone?.trim() || existing.phone,
        instagram: instagram?.trim() || existing.instagram,
        linkedin: linkedin?.trim() || existing.linkedin,
        profession: profession?.trim() || existing.profession,
        ageGroup: ageGroup || existing.ageGroup,
        city: city?.trim() || existing.city,
        state: state?.trim() || existing.state,
        attendeePassTier: attendeePassTier || existing.attendeePassTier,
        organization: body.organization?.trim() || existing.organization || '',
      });
      let referralReferrer: Ics25AttendeeDocument | null = null;
      let applyReferralImmediately = false;

      if (normalizedReferralCode) {
        if (!existing.referredBy?.code) {
          const referrer = await Attendee.findOne({ 'cashback.referral.code': normalizedReferralCode });
          if (referrer && referrer.clerkUserId !== existing.clerkUserId) {
            const autoConfirm = (existing.attendeePassTier === 'bronze');
            existing.referredBy = {
              code: normalizedReferralCode,
              referrerUserId: referrer.clerkUserId,
              confirmed: autoConfirm,
              creditedAt: autoConfirm ? new Date() : undefined,
            } as any;
            if (autoConfirm) {
              referralReferrer = referrer;
              applyReferralImmediately = true;
            }
          }
        } else if (
          existing.referredBy?.code === normalizedReferralCode &&
          existing.attendeePassTier === 'bronze' &&
          existing.referredBy.confirmed !== true
        ) {
          const referrer = await Attendee.findOne({ clerkUserId: existing.referredBy.referrerUserId || '' });
          if (referrer && referrer.clerkUserId !== existing.clerkUserId) {
            existing.referredBy.confirmed = true;
            existing.referredBy.creditedAt = new Date();
            existing.markModified('referredBy');
            referralReferrer = referrer;
            applyReferralImmediately = true;
          }
        }
      }

      const saved = await existing.save();
      if (applyReferralImmediately && referralReferrer) {
        await applyAttendeeReferralCredit(referralReferrer, saved.clerkUserId);
      }
      console.log('Attendee updated successfully:', saved._id);
      return NextResponse.json({ ok: true, attendee: saved });
    }

    // Create new attendee
    console.log('Creating new attendee');
  const attendeeData: any = {
      clerkUserId: userId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      instagram: instagram.trim(),
      linkedin: linkedin.trim(),
      profession: profession.trim(),
      ageGroup,
      city: city.trim(),
      state: state.trim(),
      attendeePassTier,
      organization: body.organization?.trim() || '',
    };

    let creationReferrer: Ics25AttendeeDocument | null = null;
    let confirmImmediately = false;

    if (normalizedReferralCode) {
      const referrer = await Attendee.findOne({ 'cashback.referral.code': normalizedReferralCode });
      if (referrer && referrer.clerkUserId !== userId) {
        confirmImmediately = attendeePassTier === 'bronze';
        (attendeeData as any).referredBy = {
          code: normalizedReferralCode,
          referrerUserId: referrer.clerkUserId,
          confirmed: confirmImmediately,
          creditedAt: confirmImmediately ? new Date() : undefined,
        };
        if (confirmImmediately) {
          creationReferrer = referrer;
        }
      }
    }

    const attendee = await Attendee.create(attendeeData);
    if (confirmImmediately && creationReferrer) {
      await applyAttendeeReferralCredit(creationReferrer, attendee.clerkUserId);
    }
    console.log('Attendee created successfully:', attendee._id);
    return NextResponse.json({ ok: true, attendee });
  } catch (e: any) {
    console.error('Attendee POST error:', e.message || e);
    console.error('Stack:', e.stack);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to save attendee', error: e.toString() }, { status: 500 });
  }
}
