import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import BronzePromotionSubmission from '@/schemas/ics25/BronzePromotionSubmission';

export async function GET(req: NextRequest) {
  await getIcs25Db();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const attendee = await Attendee.findOne({ clerkUserId: userId }).lean();
  if (!attendee) return NextResponse.json({ ok: true, attendee: null });
  return NextResponse.json({ ok: true, attendee });
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

  // For Bronze tier, check if promotion tasks are approved
  if (attendeePassTier === 'bronze') {
    const existingAttendee = await Attendee.findOne({ clerkUserId: userId });

    let isVerified = existingAttendee?.bronzePromotion?.status === 'verified';
    // If attendee doesn't exist or bronzePromotion not set, fall back to submission record
    if (!isVerified) {
      const submission = await BronzePromotionSubmission.findOne({ clerkUserId: userId, status: 'verified' }).lean();
      isVerified = !!submission;
    }

    if (!isVerified) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Bronze pass requires completion and approval of promotional tasks',
        requiresPromotion: true 
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
    const existing = await Attendee.findOne({ clerkUserId: userId });
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
      const saved = await existing.save();
      console.log('Attendee updated successfully:', saved._id);
      return NextResponse.json({ ok: true, attendee: saved });
    }

    // Create new attendee
    console.log('Creating new attendee');
    const attendee = await Attendee.create({
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
    });
    console.log('Attendee created successfully:', attendee._id);
    return NextResponse.json({ ok: true, attendee });
  } catch (e: any) {
    console.error('Attendee POST error:', e.message || e);
    console.error('Stack:', e.stack);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to save attendee', error: e.toString() }, { status: 500 });
  }
}
