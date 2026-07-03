/**
 * GET  /api/user/storage  — the owner's storage status (used/limit/overage + toggle).
 * PATCH /api/user/storage  — set the "extra storage" (paid overage) opt-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  resolveStorageOwner,
  getStorageUsedBytes,
  getStorageLimitBytes,
  getExtraStorageEnabled,
  setExtraStorageEnabled,
  formatStorageBytes,
} from '@/lib/services/storage-quota-service';
import { getCreditCost } from '@/lib/config/creditCosts';

const GB = 1024 * 1024 * 1024;

async function buildStatus(userId: string, orgId: string | null | undefined) {
  const owner = resolveStorageOwner(userId, orgId);
  const [usedBytes, limitBytes, extraStorageEnabled] = await Promise.all([
    getStorageUsedBytes(owner),
    getStorageLimitBytes(userId),
    getExtraStorageEnabled(owner),
  ]);
  const overageBytes = Math.max(0, usedBytes - limitBytes);
  const overageGb = Math.ceil(overageBytes / GB);
  const estMonthlyCredits = overageGb > 0 ? getCreditCost('storage', 'overage', { quantity: overageGb }) : 0;
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    percentUsed: limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0,
    extraStorageEnabled,
    overageBytes,
    estMonthlyCredits, // charged monthly while over cap with the toggle on
    usedFormatted: formatStorageBytes(usedBytes),
    limitFormatted: formatStorageBytes(limitBytes),
    remainingFormatted: formatStorageBytes(Math.max(0, limitBytes - usedBytes)),
    overageFormatted: formatStorageBytes(overageBytes),
    ownerType: owner.type,
  };
}

export async function GET() {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ success: true, storage: await buildStatus(userId, orgId) });
  } catch (error) {
    console.error('[GET /api/user/storage]', error);
    return NextResponse.json({ error: 'Failed to load storage status' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (typeof body?.extraStorageEnabled !== 'boolean') {
      return NextResponse.json({ error: 'extraStorageEnabled (boolean) is required' }, { status: 400 });
    }

    const owner = resolveStorageOwner(userId, orgId);
    // The toggler is the billing user (their main wallet pays the monthly overage).
    await setExtraStorageEnabled(owner, body.extraStorageEnabled, userId);

    return NextResponse.json({ success: true, storage: await buildStatus(userId, orgId) });
  } catch (error) {
    console.error('[PATCH /api/user/storage]', error);
    return NextResponse.json({ error: 'Failed to update storage setting' }, { status: 500 });
  }
}
