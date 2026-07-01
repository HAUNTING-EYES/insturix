import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';


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

    // Connect to database
    await connectToDatabase();

    // Verify recipient is a registered user
    const user = await User.findOne({ email: recipientEmail }).lean<{ username?: string; email?: string }>();
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Recipient email is not registered. Only registered users can receive emails.' },
        { status: 400 }
      );
    }

    const userName = name || user.username || user.email?.split('@')[0] || 'Valued User';

    // Only support promotional emails now
    if (emailType !== 'promotional') {
      return NextResponse.json(
        { ok: false, message: 'Only promotional emails are supported' },
        { status: 400 }
      );
    }

    const emailContent = promotionalEmailTemplate(userName);
    const subject = "You're Invited - Join Insturix! 🚀";
    
    console.log(`📧 Sending production ${emailType} email to ${recipientEmail}...`);
    console.log(`📧 Subject: ${subject}`);

    const result = await sendEmail({
      to: recipientEmail,
      subject: subject,
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

