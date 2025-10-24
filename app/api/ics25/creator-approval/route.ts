import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Creator from '@/schemas/ics25/Creator';

// Submit Creator Pass application for approval
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  await getIcs25Db();
  
  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { youtube, instagram, linkedin, name, email, phone, organization, profession, ageGroup, city, state } = body;
  
  // Validate at least one social link is provided
  if (!youtube?.trim() && !instagram?.trim() && !linkedin?.trim()) {
    return NextResponse.json({ 
      ok: false, 
      message: 'Please provide at least one social media link (YouTube, Instagram, or LinkedIn)' 
    }, { status: 400 });
  }

  // Validate all registration fields are provided
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

  if (missingFields.length > 0) {
    return NextResponse.json({ 
      ok: false, 
      message: `Missing required fields: ${missingFields.join(', ')}` 
    }, { status: 400 });
  }

  try {
    const creatorApplication = await Creator.findOneAndUpdate(
      { clerkUserId: userId },
      {
        $set: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          instagram: instagram.trim(),
          linkedin: linkedin.trim(),
          profession: profession.trim(),
          ageGroup,
          city: city.trim(),
          state: state.trim(),
          organization: organization?.trim() || '',
          'socialLinks.youtube': youtube?.trim() || '',
          'socialLinks.instagram': instagram?.trim() || '',
          'socialLinks.linkedin': linkedin?.trim() || '',
          status: 'pending',
          submittedAt: new Date(),
          hasCompletedPayment: false,
        },
        $unset: {
          reviewedAt: '',
          reviewedBy: '',
          rejectionReason: '',
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return NextResponse.json({
      ok: true,
      message: 'Application submitted successfully',
      creator: creatorApplication,
    });
  } catch (e: any) {
    console.error('Creator approval submission error:', e);
    return NextResponse.json({ 
      ok: false, 
      message: e.message || 'Failed to submit application' 
    }, { status: 500 });
  }
}

// Get Creator Pass approval status
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  await getIcs25Db();

  try {
    const creator = await Creator.findOne({ clerkUserId: userId }).lean();

    if (!creator) {
      return NextResponse.json({ ok: true, status: 'not_submitted', creator: null });
    }

    return NextResponse.json({ 
      ok: true, 
      status: (creator as any).status || 'not_submitted',
      creator 
    });
  } catch (e: any) {
    console.error('Creator approval status error:', e);
    return NextResponse.json({ 
      ok: false, 
      message: e.message || 'Failed to fetch approval status' 
    }, { status: 500 });
  }
}
