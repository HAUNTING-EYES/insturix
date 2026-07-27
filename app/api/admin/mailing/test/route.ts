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
        "ICS'25 template previews are retired. Use the product update campaign console to preview current content on the signed-in admin address.",
    },
    { status: 410 }
  );
}
