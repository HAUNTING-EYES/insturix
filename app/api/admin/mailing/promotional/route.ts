import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import mongoose from 'mongoose';
import { User } from '@/schemas/user';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';

const MONGODB_URI = process.env.MONGODB_URI!;
const PROD_DB_NAME = 'insturix'; // Production database for user data

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
 * GET /api/admin/mailing/promotional
 * Check cooldown status for promotional emails
 */
export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await connectToProdDatabase();

    // Check cooldown status
    const cooldownCheck = await (EmailCooldown as any).canSendEmail('promotional', 3);

    // Get user count from insturix_prod database
    const userCount = await User.countDocuments();

    return NextResponse.json({
      ok: true,
      canSend: cooldownCheck.canSend,
      lastSent: cooldownCheck.lastSent || null,
      nextAvailable: cooldownCheck.nextAvailable || null,
      totalUsers: userCount,
      cooldownDays: 3,
    });
  } catch (error: any) {
    console.error('GET /api/admin/mailing/promotional error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to check cooldown status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/mailing/promotional
 * Send promotional emails to all registered users
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

    await connectToProdDatabase();

    // Check cooldown status
    const cooldownCheck = await (EmailCooldown as any).canSendEmail('promotional', 3);

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

    console.log(`📧 Starting promotional email send to ${users.length} users...`);

    // Send emails in batches to respect rate limits
    const batchSize = 50; // AWS SES can handle ~14 emails/second, so batching helps
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      // Send emails in parallel within each batch
      const batchPromises = batch.map(async (user) => {
        try {
          const userName = user.username || 'Valued User';
          const { html, text } = promotionalEmailTemplate(userName);

          const result = await sendEmail({
            to: user.email,
            subject: "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀",
            htmlBody: html,
            textBody: text,
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
      'promotional',
      userId,
      users.length,
      status,
      {
        successCount,
        failedCount,
        errorMessage:
          failedCount > 0
            ? `${failedCount} emails failed to send`
            : undefined,
      }
    );

    console.log(
      `📧 Promotional email send complete: ${successCount}/${users.length} successful`
    );

    return NextResponse.json({
      ok: true,
      message: `Promotional emails sent to ${successCount}/${users.length} users`,
      stats: {
        total: users.length,
        successful: successCount,
        failed: failedCount,
      },
      failedEmails:
        failedCount > 0
          ? results.filter((r) => !r.success).map((r) => ({
              email: r.email,
              error: r.error,
            }))
          : [],
    });
  } catch (error: any) {
    console.error('POST /api/admin/mailing/promotional error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to send promotional emails' },
      { status: 500 }
    );
  }
}
