import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';
import { ticketConfirmationEmailTemplate } from '@/lib/services/email/templates/ticket-confirmation';
import { getSimulatedTimeUntilEvent } from '@/lib/utils/event-time';

/**
 * POST /api/admin/mailing/test
 * Send test emails to the admin for preview/testing
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
    const { emailType, recipientEmail, testData } = body;

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

    let emailContent: { html: string; text: string; subject?: string };
    let subject: string;
    let timeUntilEvent: string | undefined;

    // Generate email content based on type
    switch (emailType) {
      case 'promotional':
        emailContent = promotionalEmailTemplate(
          testData?.name || 'Test User',
          testData?.registrationLink
        );
        subject = "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀";
        break;

      case 'ticket-confirmation-initial':
        emailContent = ticketConfirmationEmailTemplate(
          testData?.name || 'Test User',
          testData?.ticketId || 'TEST-12345',
          testData?.eventDetails || "Insturix Creator's Summit 2025"
        );
        subject = emailContent.subject ?? "Your Ticket is Confirmed! - Insturix Creator's Summit 2025";
        break;

      case 'ticket-confirmation-reminder-7days':
        timeUntilEvent = getSimulatedTimeUntilEvent('reminder7Days');
        emailContent = ticketConfirmationEmailTemplate(
          testData?.name || 'Test User',
          testData?.ticketId || 'TEST-12345',
          testData?.eventDetails || "Insturix Creator's Summit 2025",
          timeUntilEvent
        );
        subject = emailContent.subject ?? "Your Ticket is Confirmed! - Insturix Creator's Summit 2025";
        break;

      case 'ticket-confirmation-reminder-1day':
        timeUntilEvent = getSimulatedTimeUntilEvent('reminder1Day');
        emailContent = ticketConfirmationEmailTemplate(
          testData?.name || 'Test User',
          testData?.ticketId || 'TEST-12345',
          testData?.eventDetails || "Insturix Creator's Summit 2025",
          timeUntilEvent
        );
        subject = emailContent.subject ?? "Your Ticket is Confirmed! - Insturix Creator's Summit 2025";
        break;

      case 'ticket-confirmation-reminder-30min':
        timeUntilEvent = getSimulatedTimeUntilEvent('reminder30Min');
        emailContent = ticketConfirmationEmailTemplate(
          testData?.name || 'Test User',
          testData?.ticketId || 'TEST-12345',
          testData?.eventDetails || "Insturix Creator's Summit 2025",
          timeUntilEvent
        );
        subject = emailContent.subject ?? "Your Ticket is Confirmed! - Insturix Creator's Summit 2025";
        break;

      // Legacy support for 'ticket-confirmation'
      case 'ticket-confirmation':
        emailContent = ticketConfirmationEmailTemplate(
          testData?.name || 'Test User',
          testData?.ticketId || 'TEST-12345',
          testData?.eventDetails || "Insturix Creator's Summit 2025"
        );
        subject = emailContent.subject ?? "Your Ticket is Confirmed! - Insturix Creator's Summit 2025";
        break;

      default:
        return NextResponse.json(
          { ok: false, message: `Unknown email type: ${emailType}` },
          { status: 400 }
        );
    }

    // Send the test email
    console.log(`📧 Sending test ${emailType} email to ${recipientEmail}...`);

    const result = await sendEmail({
      to: recipientEmail,
      subject: `[TEST] ${subject}`,
      htmlBody: emailContent.html,
      textBody: emailContent.text,
    });

    if (result.success) {
      console.log(`✅ Test email sent successfully to ${recipientEmail}`);
      return NextResponse.json({
        ok: true,
        message: `Test ${emailType} email sent successfully to ${recipientEmail}`,
        messageId: result.messageId,
      });
    } else {
      console.error(`❌ Failed to send test email:`, result.error);
      return NextResponse.json(
        {
          ok: false,
          message: `Failed to send test email: ${result.error}`,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('POST /api/admin/mailing/test error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to send test email' },
      { status: 500 }
    );
  }
}
