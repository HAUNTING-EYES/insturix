import { NextResponse } from 'next/server';

import { verifyAdminForApi } from '@/lib/auth/adminAuth';

export async function POST() {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  return NextResponse.json(
    {
      ok: false,
      code: 'legacy_campaign_retired',
      message:
        "Individual ICS'25 promotional sends are retired. Use the product update campaign preview for admin-only testing.",
    },
    { status: 410 }
  );
}
