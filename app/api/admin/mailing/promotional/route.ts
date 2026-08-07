import { NextResponse } from 'next/server';

import { verifyAdminForApi } from '@/lib/auth/adminAuth';

const RETIRED_RESPONSE = {
  ok: false,
  code: 'legacy_campaign_retired',
  message:
    "The ICS'25 promotional campaign is retired. Use the consent-aware product update campaign console.",
};

const retiredResponse = async () => {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
};

export async function GET() {
  return retiredResponse();
}

export async function POST() {
  return retiredResponse();
}
