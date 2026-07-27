import { NextResponse } from 'next/server';

import { verifyAdminForApi } from '@/lib/auth/adminAuth';

const RETIRED_RESPONSE = {
  ok: false,
  code: 'legacy_campaign_retired',
  message:
    "The bulk ICS'25 ticket campaign is retired. Transactional ticket mail must originate from a current ticketing workflow.",
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
