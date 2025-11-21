import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import mongoose from 'mongoose';
import { User } from '@/schemas/user';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';
import { ticketConfirmationEmailTemplate } from '@/lib/services/email/templates/ticket-confirmation';
import { renderTemplate } from '@/lib/services/email/templates/index';

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

    // Check cooldown status (using 'bulk-template' as the email type)
    const cooldownCheck = await (EmailCooldown as any).canSendEmail('bulk-template', 1);

    // Get total user count
    const totalUsers = await User.countDocuments();

    return NextResponse.json({
      ok: true,
      canSend: cooldownCheck.canSend,
      lastSent: cooldownCheck.lastSent || null,
      nextAvailable: cooldownCheck.nextAvailable || null,
      totalUsers,
      cooldownDays: 1,
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

    // Check cooldown status
    const cooldownCheck = await (EmailCooldown as any).canSendEmail('bulk-template', 1);

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

    // Fetch all users from insturix_prod database
    const users = await User.find(
      {},
      { email: 1, username: 1, clerkUserId: 1, _id: 1 }
    ).lean();

    if (users.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'No users found to send emails to' },
        { status: 404 }
      );
    }

    console.log(`📧 Starting bulk email send (${template}) to ${users.length} users...`);

    // Send emails in batches to respect rate limits
    const batchSize = 50; // AWS SES can handle ~14 emails/second, so batching helps
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      // Send emails in parallel within each batch
      const batchPromises = batch.map(async (user) => {
        try {
          const userName = user.username || user.email?.split('@')[0] || 'Valued User';
          let emailContent: { html: string; text: string; subject?: string };
          let subject: string;

          // Generate email content based on template
          switch (template) {
            case 'promotional':
              const promoData = promotionalEmailTemplate(userName);
              emailContent = promoData;
              subject = "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀";
              break;

            case 'ticket-confirmation':
              if (!eventDetails) {
                throw new Error('Event details are required for ticket confirmation');
              }
              const ticketData = ticketConfirmationEmailTemplate(
                userName,
                user.email,
                eventDetails,
                `TICKET-${user._id}`
              );
              emailContent = ticketData;
              subject = `Your Ticket for ${eventDetails} 🎫`;
              break;

            case 'welcome':
              const welcomeData = renderTemplate('welcome', {
                name: userName,
                dashboardUrl: 'https://www.insturix.com/dashboard',
              });
              emailContent = {
                html: welcomeData.html,
                text: welcomeData.text || '',
              };
              subject = welcomeData.subject || 'Welcome to Insturix';
              break;

            case 'notification':
              const notificationData = renderTemplate('notification', {
                name: userName,
                title: 'Important Update',
                message: 'Thank you for being part of the Insturix community.',
                actionUrl: 'https://www.insturix.com',
                actionText: 'Visit Insturix',
              });
              emailContent = {
                html: notificationData.html,
                text: notificationData.text || '',
              };
              subject = notificationData.subject || 'Notification from Insturix';
              break;

            default:
              throw new Error(`Unknown template: ${template}`);
          }

          const result = await sendEmail({
            to: user.email,
            subject,
            htmlBody: emailContent.html,
            textBody: emailContent.text,
          });

          if (result.success) {
            console.log(`✅ Sent to ${user.email}`);
            return { email: user.email, success: true };
          } else {
            console.error(`❌ Failed to send to ${user.email}:`, result.error);
            return { email: user.email, success: false, error: result.error };
          }
        } catch (error: any) {
          console.error(`❌ Error sending to ${user.email}:`, error);
          return {
            email: user.email,
            success: false,
            error: error?.message || 'Unknown error',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add a small delay between batches to respect rate limits
      if (i + batchSize < users.length) {
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
      users.length,
      status,
      {
        successCount,
        failedCount,
        template,
        errorMessage:
          failedCount > 0
            ? `${failedCount} emails failed to send`
            : undefined,
      }
    );

    console.log(
      `📧 Bulk email send (${template}) complete: ${successCount}/${users.length} successful`
    );

    return NextResponse.json({
      ok: true,
      message: `Bulk emails sent to ${successCount}/${users.length} users using ${template} template`,
      stats: {
        total: users.length,
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
