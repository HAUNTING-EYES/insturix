import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import mongoose from 'mongoose';
import { User } from '@/schemas/user';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';
import { ticketConfirmationEmailTemplate } from '@/lib/services/email/templates/ticket-confirmation';
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
 * GET /api/admin/mailing/bulk-template
 * Check cooldown status for bulk template emails
 */
export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await connectToProdDatabase();

    // Get last sent time for display only (no enforcement)
    const cooldownRecord = await EmailCooldown.findOne({ emailType: 'bulk-template' });
    const lastSent = cooldownRecord?.lastSent || null;

    // Get total user count based on template type
    let totalUsers = 0;
    const { searchParams } = new URL(req.url);
    const templatePreview = searchParams.get('template');
    
    // If template is ticket confirmation, count ICS'25 attendees, otherwise count all users
    if (templatePreview && (templatePreview === 'ticket-confirmation-initial' || 
        templatePreview.startsWith('ticket-confirmation-reminder'))) {
      await getIcs25Db();
      totalUsers = await Attendee.countDocuments({ 
        'payment.status': { $nin: ['rejected', 'failed'] } 
      });
    } else {
      totalUsers = await User.countDocuments();
    }

    return NextResponse.json({
      ok: true,
      lastSent: lastSent,
      totalUsers,
    });
  } catch (error: any) {
    console.error('GET /api/admin/mailing/bulk-template error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to check cooldown status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/mailing/bulk-template
 * Send bulk emails using selected template to all registered users
 * Request body: { template, eventDetails? }
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
    const { template, eventDetails } = body;

    if (!template) {
      return NextResponse.json(
        { ok: false, message: 'Template is required' },
        { status: 400 }
      );
    }

    await connectToProdDatabase();

    // Determine if we're sending to attendees or all users
    const isTicketConfirmation = template === 'ticket-confirmation-initial' || 
                                  template?.startsWith('ticket-confirmation-reminder');
    
    let recipients: any[] = [];
    
    if (isTicketConfirmation) {
      // Fetch ICS'25 attendees with approved payment status
      await getIcs25Db();
      recipients = await Attendee.find(
        { 'payment.status': { $nin: ['rejected', 'failed'] } },
        { email: 1, name: 1, clerkUserId: 1, _id: 1 }
      ).lean();
      
      if (recipients.length === 0) {
        return NextResponse.json(
          { ok: false, message: 'No ICS\'25 attendees found to send emails to' },
          { status: 404 }
        );
      }
      
      console.log(`📧 Starting bulk ticket confirmation email send to ${recipients.length} ICS'25 attendees...`);
    } else {
      // Fetch all users from insturix_prod database
      recipients = await User.find(
        {},
        { email: 1, username: 1, clerkUserId: 1, _id: 1 }
      ).lean();

      if (recipients.length === 0) {
        return NextResponse.json(
          { ok: false, message: 'No users found to send emails to' },
          { status: 404 }
        );
      }
      
      console.log(`📧 Starting bulk email send (${template}) to ${recipients.length} users...`);
    }

    // Send emails in batches to respect rate limits
    const batchSize = 50; // AWS SES can handle ~14 emails/second, so batching helps
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      // Send emails in parallel within each batch
      const batchPromises = batch.map(async (recipient) => {
        try {
          const userName = recipient.username || recipient.name || recipient.email?.split('@')[0] || 'Valued User';
          let emailContent: { html: string; text: string; subject?: string };
          let subject: string;
          
          // Determine time until event for reminder emails
          let timeUntilEvent: string | undefined;
          if (template?.startsWith('ticket-confirmation-reminder')) {
            if (template === 'ticket-confirmation-reminder-7days') {
              timeUntilEvent = '7 days';
            } else if (template === 'ticket-confirmation-reminder-1day') {
              timeUntilEvent = '1 day';
            } else if (template === 'ticket-confirmation-reminder-30min') {
              timeUntilEvent = '30 minutes';
            }
          }

          // Generate email content based on template
          switch (template) {
            case 'promotional':
              const promoData = promotionalEmailTemplate(userName);
              emailContent = promoData;
              subject = "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀";
              break;

            case 'ticket-confirmation-initial':
            case 'ticket-confirmation-reminder-7days':
            case 'ticket-confirmation-reminder-1day':
            case 'ticket-confirmation-reminder-30min':
              if (!eventDetails) {
                throw new Error('Event details are required for ticket confirmation');
              }
              const ticketData = ticketConfirmationEmailTemplate(
                userName,
                `TICKET-${recipient._id}`,
                eventDetails,
                timeUntilEvent
              );
              emailContent = ticketData;
              subject = ticketData.subject || `Your Ticket for ${eventDetails} 🎫`;
              break;

            default:
              throw new Error(`Unknown template: ${template}`);
          }

          const result = await sendEmail({
            to: recipient.email,
            subject,
            htmlBody: emailContent.html,
            textBody: emailContent.text,
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
      'bulk-template',
      userId,
      recipients.length,
      status,
      {
        successCount,
        failedCount,
        template,
        recipientType: isTicketConfirmation ? 'ics25-attendees' : 'all-users',
        errorMessage:
          failedCount > 0
            ? `${failedCount} emails failed to send`
            : undefined,
      }
    );

    console.log(
      `📧 Bulk email send (${template}) complete: ${successCount}/${recipients.length} successful`
    );

    return NextResponse.json({
      ok: true,
      message: `Bulk emails sent to ${successCount}/${recipients.length} ${isTicketConfirmation ? 'ICS\'25 attendees' : 'users'} using ${template} template`,
      stats: {
        total: recipients.length,
        successful: successCount,
        failed: failedCount,
      },
      failedEmails:
        failedCount > 0
          ? results.filter((r) => !r.success).slice(0, 10) // Return first 10 failed emails
          : [],
    });
  } catch (error: any) {
    console.error('POST /api/admin/mailing/bulk-template error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to send bulk emails' },
      { status: 500 }
    );
  }
}
