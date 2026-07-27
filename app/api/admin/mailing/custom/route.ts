import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { sendEmail } from '@/lib/services/email';
import {
  createAndDispatchEmailCampaign,
  EmailCampaignQueueError,
} from '@/lib/services/email/campaign-service';
import { customUserMailingTemplate } from '@/lib/services/email/templates/custom-mailing';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import { User } from '@/schemas/user';

interface CustomMailingBody {
  subject?: unknown;
  message?: unknown;
  testMode?: unknown;
  testEmail?: unknown;
}

export async function GET() {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  try {
    await connectToDatabase();
    const [cooldownCheck, recipientCount] = await Promise.all([
      (EmailCooldown as any).canSendEmail('custom-mailing', 1),
      User.countDocuments(),
    ]);

    return NextResponse.json({
      ok: true,
      canSend: cooldownCheck.canSend,
      lastSent: cooldownCheck.lastSent || null,
      nextAvailable: cooldownCheck.nextAvailable || null,
      recipientCount,
      cooldownDays: 1,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to check cooldown status';
    console.error('GET /api/admin/mailing/custom error:', message);
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;
  if (!adminCheck.userId) {
    return NextResponse.json(
      { ok: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | CustomMailingBody
      | null;
    if (
      typeof body?.subject !== 'string' ||
      typeof body.message !== 'string' ||
      !body.subject.trim() ||
      !body.message.trim()
    ) {
      return NextResponse.json(
        { ok: false, message: 'Subject and message are required' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // This path also powers direct replies from the admin inbox. It remains
    // a single, admin-authenticated transactional send and is never a fan-out.
    if (body.testMode === true) {
      if (
        typeof body.testEmail !== 'string' ||
        !body.testEmail.trim()
      ) {
        return NextResponse.json(
          { ok: false, message: 'Test email address is required' },
          { status: 400 }
        );
      }
      const template = customUserMailingTemplate(
        'Test User',
        body.message,
        body.subject
      );
      const result = await sendEmail({
        to: body.testEmail.trim(),
        subject: body.subject.trim(),
        htmlBody: template.html,
        textBody: template.text,
        delivery: { stream: 'transactional' },
      });
      if (!result.success) {
        return NextResponse.json(
          {
            ok: false,
            message: `Failed to send test email: ${result.error}`,
          },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: `Test email sent successfully to ${body.testEmail.trim()}`,
      });
    }

    const cooldownCheck = await (EmailCooldown as any).canSendEmail(
      'custom-mailing',
      1
    );
    if (!cooldownCheck.canSend) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Cooldown period has not passed yet',
          lastSent: cooldownCheck.lastSent,
          nextAvailable: cooldownCheck.nextAvailable,
        },
        { status: 429 }
      );
    }

    const campaign = await createAndDispatchEmailCampaign({
      kind: 'custom',
      topic: 'product_updates',
      subject: body.subject,
      message: body.message,
      createdBy: adminCheck.userId,
      sourceRoute: '/api/admin/mailing/custom',
      cooldownType: 'custom-mailing',
    });

    return NextResponse.json(
      {
        ok: true,
        campaignId: campaign.campaignId,
        message: campaign.resumed
          ? `Existing custom campaign resumed for ${campaign.totalRecipients} registered users`
          : `Custom campaign queued for ${campaign.totalRecipients} registered users`,
        stats: {
          total: campaign.totalRecipients,
          queued: campaign.totalRecipients,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to queue custom mailing';
    const status =
      error instanceof EmailCampaignQueueError ? error.status : 500;
    console.error('POST /api/admin/mailing/custom error:', message);
    return NextResponse.json(
      { ok: false, message },
      { status }
    );
  }
}
