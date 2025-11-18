import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import mongoose from 'mongoose';
import { User } from '@/schemas/user';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import { sendEmail } from '@/lib/services/email';
import { customUserMailingTemplate, customIcs25MailingTemplate } from '@/lib/services/email/templates/custom-mailing';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';

const MONGODB_URI = process.env.MONGODB_URI!;
const PROD_DB_NAME = 'insturix_prod'; // Production database for user data

// Cached connection for insturix_prod database
let cachedConnection: typeof mongoose | null = null;

async function connectToProdDatabase() {
  if (cachedConnection) {
    return cachedConnection;
  }

  const opts = {
    bufferCommands: false,
    dbName: PROD_DB_NAME,
  };

  cachedConnection = await mongoose.connect(MONGODB_URI, opts);
  return cachedConnection;
}

/**
 * GET /api/admin/mailing/custom
 * Check cooldown status for custom mailing
 * Query params: recipientType (all-users | ics25-attendees)
 */
export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    const { searchParams } = new URL(req.url);
    const recipientType = searchParams.get('recipientType') || 'all-users';

    await connectToProdDatabase();

    // Check cooldown status (1 day cooldown for custom mailing)
    const cooldownCheck = await (EmailCooldown as any).canSendEmail('custom-mailing', 1);

    // Get recipient count based on type
    let recipientCount = 0;

    if (recipientType === 'ics25-attendees') {
      await getIcs25Db();
      recipientCount = await Attendee.countDocuments();
    } else {
      // all-users
      recipientCount = await User.countDocuments();
    }

    return NextResponse.json({
      ok: true,
      canSend: cooldownCheck.canSend,
      lastSent: cooldownCheck.lastSent || null,
      nextAvailable: cooldownCheck.nextAvailable || null,
      recipientCount,
      cooldownDays: 1,
      recipientType,
    });
  } catch (error: any) {
    console.error('GET /api/admin/mailing/custom error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to check cooldown status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/mailing/custom
 * Send custom mailing emails to all users or ICS25 attendees
 * Request body: { recipientType, subject, message }
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
    const { recipientType = 'all-users', subject, message, testMode = false, testEmail } = body;

    // Validate required fields
    if (!subject || !message) {
      return NextResponse.json(
        { ok: false, message: 'Subject and message are required' },
        { status: 400 }
      );
    }

    if (!subject.trim() || !message.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Subject and message cannot be empty' },
        { status: 400 }
      );
    }

    // Test mode validation
    if (testMode) {
      if (!testEmail) {
        return NextResponse.json(
          { ok: false, message: 'Test email address is required' },
          { status: 400 }
        );
      }
    } else {
      // Production mode validation
      if (recipientType !== 'all-users' && recipientType !== 'ics25-attendees') {
        return NextResponse.json(
          { ok: false, message: 'Invalid recipientType. Must be all-users or ics25-attendees' },
          { status: 400 }
        );
      }
    }

    await connectToProdDatabase();

    // If test mode, send to single email address
    if (testMode) {
      try {
        // Determine which template to use
        const template = recipientType === 'ics25-attendees'
          ? customIcs25MailingTemplate('Test User', message, subject)
          : customUserMailingTemplate('Test User', message, subject);

        const result = await sendEmail({
          to: testEmail,
          subject,
          htmlBody: template.html,
          textBody: template.text,
        });

        if (result.success) {
          return NextResponse.json({
            ok: true,
            message: `Test email sent successfully to ${testEmail}`,
          });
        } else {
          return NextResponse.json(
            { ok: false, message: `Failed to send test email: ${result.error}` },
            { status: 500 }
          );
        }
      } catch (error: any) {
        return NextResponse.json(
          { ok: false, message: `Error sending test email: ${error?.message}` },
          { status: 500 }
        );
      }
    }

    // Production mode - check cooldown
    const cooldownCheck = await (EmailCooldown as any).canSendEmail('custom-mailing', 1);

    if (!cooldownCheck.canSend) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Cooldown period has not passed yet',
          lastSent: cooldownCheck.lastSent,
          nextAvailable: cooldownCheck.nextAvailable,
        },
        { status: 429 } // Too Many Requests
      );
    }

    // Fetch recipients based on type
    let recipients: any[] = [];
    let recipientLabel = '';

    if (recipientType === 'ics25-attendees') {
      await getIcs25Db();
      recipients = await Attendee.find(
        {},
        { email: 1, name: 1, _id: 1 }
      ).lean();
      recipientLabel = 'ICS25 attendees';
    } else {
      // all-users
      recipients = await User.find(
        {},
        { email: 1, username: 1, _id: 1 }
      ).lean();
      recipientLabel = 'registered users';
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { ok: false, message: `No ${recipientLabel} found to send emails to` },
        { status: 404 }
      );
    }

    console.log(`📧 Starting custom mailing send to ${recipients.length} ${recipientLabel}...`);

    // Send emails in batches to respect rate limits
    const batchSize = 50; // AWS SES can handle ~14 emails/second, so batching helps
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(recipients.length / batchSize);

      console.log(`📧 Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} recipients...`);

      // Send emails in parallel within each batch
      const batchPromises = batch.map(async (recipient) => {
        try {
          // Get recipient name
          const recipientName = recipientType === 'ics25-attendees'
            ? recipient.name || 'Attendee'
            : recipient.username || 'User';

          // Use appropriate template
          const template = recipientType === 'ics25-attendees'
            ? customIcs25MailingTemplate(recipientName, message, subject)
            : customUserMailingTemplate(recipientName, message, subject);

          const result = await sendEmail({
            to: recipient.email,
            subject,
            htmlBody: template.html,
            textBody: template.text,
          });

          if (result.success) {
            console.log(`✅ Sent to ${recipient.email}`);
            return { email: recipient.email, success: true };
          } else {
            console.error(`❌ Failed to send to ${recipient.email}:`, result.error);
            return { email: recipient.email, success: false, error: result.error };
          }
        } catch (error: any) {
          console.error(`❌ Error sending to ${recipient.email}:`, error);
          return {
            email: recipient.email,
            success: false,
            error: error?.message || 'Unknown error',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add a small delay between batches to respect rate limits
      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }
    }

    // Calculate statistics
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    // Record the email send in cooldown tracker
    const status =
      failedCount === 0 ? 'success' : successCount === 0 ? 'failed' : 'partial';

    await (EmailCooldown as any).recordEmailSent(
      'custom-mailing',
      userId,
      recipients.length,
      status,
      {
        successCount,
        failedCount,
        recipientType,
        errorMessage:
          failedCount > 0
            ? `${failedCount} emails failed to send`
            : undefined,
      }
    );

    console.log(
      `📧 Custom mailing send complete: ${successCount}/${recipients.length} successful to ${recipientLabel}`
    );

    return NextResponse.json({
      ok: true,
      message: `Custom emails sent to ${successCount}/${recipients.length} ${recipientLabel}`,
      stats: {
        total: recipients.length,
        successful: successCount,
        failed: failedCount,
      },
      failedEmails: results.filter((r) => !r.success),
    });
  } catch (error: any) {
    console.error('POST /api/admin/mailing/custom error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to send custom mailing' },
      { status: 500 }
    );
  }
}
