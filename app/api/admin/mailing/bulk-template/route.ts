import { NextResponse } from 'next/server';

import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import { User } from '@/schemas/user';

const RETIRED_TEMPLATE_MESSAGE =
  'The ICS’25 promotional template has expired and cannot be sent. ' +
  'Create a current, topic-labelled campaign in Custom Mailing instead.';

export async function GET() {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  try {
    await connectToDatabase();
    const [cooldownRecord, totalUsers] = await Promise.all([
      EmailCooldown.findOne({ emailType: 'bulk-template' })
        .select('lastSentAt')
        .sort({ lastSentAt: -1 }),
      User.countDocuments(),
    ]);

    return NextResponse.json({
      ok: true,
      canSend: false,
      lastSent: cooldownRecord?.lastSentAt ?? null,
      totalUsers,
      legacyTemplateEnabled: false,
      disabledReason: RETIRED_TEMPLATE_MESSAGE,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to check bulk template status';
    console.error('GET /api/admin/mailing/bulk-template error:', message);
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}

export async function POST() {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  return NextResponse.json(
    {
      ok: false,
      code: 'legacy_campaign_retired',
      message: RETIRED_TEMPLATE_MESSAGE,
    },
    { status: 410 }
  );
}
