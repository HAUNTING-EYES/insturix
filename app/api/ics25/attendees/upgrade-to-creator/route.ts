import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import Creator from '@/schemas/ics25/Creator';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    const { instagram, linkedin, youtube } = await req.json();

    // Validate required fields
    if (!instagram?.trim() || !linkedin?.trim()) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Instagram and LinkedIn URLs are required' 
      }, { status: 400 });
    }

    // Validate URL format
    const urlPattern = /^https?:\/\/.+/i;
    if (!urlPattern.test(instagram) || !urlPattern.test(linkedin)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Invalid URL format' 
      }, { status: 400 });
    }

    if (youtube?.trim() && !urlPattern.test(youtube)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Invalid YouTube URL format' 
      }, { status: 400 });
    }

    // Get current attendee
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) {
      return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    }

    // Only require payment if the current tier is a paid tier (silver/gold)
    const paidTiers = ['silver', 'gold'];
    if (paidTiers.includes(attendee.attendeePassTier) && attendee.payment?.status !== 'paid') {
      return NextResponse.json({ 
        ok: false, 
        message: 'Payment required before upgrading' 
      }, { status: 400 });
    }

    const currentTier = attendee.attendeePassTier;

    // Validate upgrade path to creators
    if (!['bronze', 'silver', 'gold'].includes(currentTier)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'Invalid upgrade path' 
      }, { status: 400 });
    }

    // Check if there's already a pending/approved application
    const existingApplication = await Creator.findOne({ clerkUserId: userId });
    
    if (existingApplication) {
      if (existingApplication.status === 'pending') {
        return NextResponse.json({ 
          ok: false, 
          message: 'You already have a pending creator application' 
        }, { status: 400 });
      }
      
      if (existingApplication.status === 'approved') {
        return NextResponse.json({ 
          ok: false, 
          message: 'Your creator application is already approved' 
        }, { status: 400 });
      }

      // If rejected, allow resubmission - update existing application
      existingApplication.status = 'pending';
      existingApplication.instagram = instagram.trim();
      existingApplication.linkedin = linkedin.trim();
      existingApplication.socialLinks = {
        youtube: youtube?.trim() || undefined,
        instagram: instagram.trim(),
        linkedin: linkedin.trim(),
      } as any;
      existingApplication.submittedAt = new Date();
      await existingApplication.save();
    } else {
      // Create new creator application
      await Creator.create({
        clerkUserId: userId,
        name: attendee.name,
        email: attendee.email,
        phone: attendee.phone,
        instagram: instagram.trim(),
        linkedin: linkedin.trim(),
        socialLinks: {
          youtube: youtube?.trim() || undefined,
          instagram: instagram.trim(),
          linkedin: linkedin.trim(),
        },
        organization: attendee.organization,
        profession: attendee.profession,
        ageGroup: attendee.ageGroup,
        city: attendee.city,
        state: attendee.state,
        status: 'pending',
        submittedAt: new Date(),
      });
    }

    return NextResponse.json({
      ok: true,
      message: 'Creator application submitted for review',
    });
  } catch (e: any) {
    console.error('Creator upgrade error:', e);
    return NextResponse.json({
      ok: false,
      message: e.message || 'Submission failed',
    }, { status: 500 });
  }
}
