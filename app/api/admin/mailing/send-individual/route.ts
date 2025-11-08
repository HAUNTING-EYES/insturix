import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';
import { ticketConfirmationEmailTemplate } from '@/lib/services/email/templates/ticket-confirmation';
import { getSimulatedTimeUntilEvent } from '@/lib/utils/event-time';

/**
 * POST /api/admin/mailing/send-individual
 * Send individual production emails to registered users
 */
export async function POST(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { emailType, recipientEmail, eventDetails, name, ticketId } = body;

    if (!emailType) {
      return NextResponse.json(
        { ok: false, message: 'Email type is required' },
        { status: 400 }
      );
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { ok: false, message: 'Recipient email is required' },
        { status: 400 }
      );
    }

    // Connect to databases
    await connectToDatabase();
    await getIcs25Db();

    // Verify recipient is a registered user
    const user = await User.findOne({ email: recipientEmail }).lean();
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Recipient email is not registered. Only registered users can receive emails.' },
        { status: 400 }
      );
    }

    const userName = name || user.username || user.email?.split('@')[0] || 'Valued User';
    let emailContent: { html: string; text: string; subject: string };
    let subject: string;
    let timeUntilEvent: string | undefined;

    // Generate email content based on type
    switch (emailType) {
      case 'promotional':
        emailContent = promotionalEmailTemplate(userName);
        // Set subject explicitly without any TEST prefix
        subject = "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀";
        // Ensure no TEST text
        subject = subject.replace(/\[TEST\]/gi, '').trim();
        break;

      case 'ticket-confirmation-initial':
        // Generate ticketId from user._id or attendee._id if found
        let finalTicketId = ticketId;
        if (!finalTicketId) {
          const attendee = await Attendee.findOne({ clerkUserId: user.clerkUserId }).lean();
          if (attendee?._id) {
            finalTicketId = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
          } else if (user._id) {
            finalTicketId = `TICKET-${(user._id as any).toString().slice(-8).toUpperCase()}`;
          } else {
            // Generate a random ticketId if no ID found
            finalTicketId = `TICKET-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
          }
        }
        
        emailContent = ticketConfirmationEmailTemplate(
          userName,
          finalTicketId,
          eventDetails || "Insturix Creator's Summit 2025"
        );
        subject = emailContent.subject;
        // Ensure no TEST text
        subject = subject.replace(/\[TEST\]/gi, '').trim();
        break;

      case 'ticket-confirmation-reminder-7days':
        timeUntilEvent = getSimulatedTimeUntilEvent('reminder7Days');
        // Generate ticketId from attendee if found
        let ticketId7Days = ticketId;
        if (!ticketId7Days) {
          const attendee = await Attendee.findOne({ clerkUserId: user.clerkUserId }).lean();
          if (attendee?._id) {
            ticketId7Days = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
          } else if (user._id) {
            ticketId7Days = `TICKET-${(user._id as any).toString().slice(-8).toUpperCase()}`;
          } else {
            ticketId7Days = `TICKET-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
          }
        }
        
        emailContent = ticketConfirmationEmailTemplate(
          userName,
          ticketId7Days,
          eventDetails || "Insturix Creator's Summit 2025",
          timeUntilEvent
        );
        subject = emailContent.subject;
        // Ensure no TEST text
        subject = subject.replace(/\[TEST\]/gi, '').trim();
        break;

      case 'ticket-confirmation-reminder-1day':
        timeUntilEvent = getSimulatedTimeUntilEvent('reminder1Day');
        // Generate ticketId from attendee if found
        let ticketId1Day = ticketId;
        if (!ticketId1Day) {
          const attendee = await Attendee.findOne({ clerkUserId: user.clerkUserId }).lean();
          if (attendee?._id) {
            ticketId1Day = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
          } else if (user._id) {
            ticketId1Day = `TICKET-${(user._id as any).toString().slice(-8).toUpperCase()}`;
          } else {
            ticketId1Day = `TICKET-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
          }
        }
        
        emailContent = ticketConfirmationEmailTemplate(
          userName,
          ticketId1Day,
          eventDetails || "Insturix Creator's Summit 2025",
          timeUntilEvent
        );
        subject = emailContent.subject;
        // Ensure no TEST text
        subject = subject.replace(/\[TEST\]/gi, '').trim();
        break;

      case 'ticket-confirmation-reminder-30min':
        timeUntilEvent = getSimulatedTimeUntilEvent('reminder30Min');
        // Generate ticketId from attendee if found
        let ticketId30Min = ticketId;
        if (!ticketId30Min) {
          const attendee = await Attendee.findOne({ clerkUserId: user.clerkUserId }).lean();
          if (attendee?._id) {
            ticketId30Min = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
          } else if (user._id) {
            ticketId30Min = `TICKET-${(user._id as any).toString().slice(-8).toUpperCase()}`;
          } else {
            ticketId30Min = `TICKET-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
          }
        }
        
        emailContent = ticketConfirmationEmailTemplate(
          userName,
          ticketId30Min,
          eventDetails || "Insturix Creator's Summit 2025",
          timeUntilEvent
        );
        subject = emailContent.subject;
        // Ensure no TEST text
        subject = subject.replace(/\[TEST\]/gi, '').trim();
        break;

      default:
        return NextResponse.json(
          { ok: false, message: `Unknown email type: ${emailType}` },
          { status: 400 }
        );
    }

    // Send the production email (NO TEST prefix)
    // Ensure subject doesn't contain TEST prefix anywhere
    let finalSubject = subject;
    // Remove [TEST] prefix if present
    finalSubject = finalSubject.replace(/^\s*\[TEST\]\s*/i, '').trim();
    // Remove any other TEST text patterns
    finalSubject = finalSubject.replace(/\s*\[TEST\]\s*/gi, '').trim();
    
    console.log(`📧 Sending production ${emailType} email to ${recipientEmail}...`);
    console.log(`📧 Subject: ${finalSubject}`);

    const result = await sendEmail({
      to: recipientEmail,
      subject: finalSubject,
      htmlBody: emailContent.html,
      textBody: emailContent.text,
    });

    if (result.success) {
      console.log(`✅ Production email sent successfully to ${recipientEmail}`);
      return NextResponse.json({
        ok: true,
        message: `Production ${emailType} email sent successfully to ${recipientEmail}`,
        messageId: result.messageId,
      });
    } else {
      console.error(`❌ Failed to send production email:`, result.error);
      return NextResponse.json(
        {
          ok: false,
          message: `Failed to send email: ${result.error}`,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('POST /api/admin/mailing/send-individual error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}

