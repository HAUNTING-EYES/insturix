/**
 * Monthly storage-overage billing.
 *
 * For each owner who opted into "extra storage", charge their main credit wallet
 * for the GB used over the plan cap (storage.overage = 3 credits/GB·month).
 * Idempotent per calendar month via `lastOverageBilledMonth` (stamped only on a
 * successful charge). Insufficient credits are logged, not force-charged.
 *
 * Schedule: run once per month (Vercel cron). Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listOverageOwners,
  markOverageBilled,
  getStorageLimitBytes,
} from '@/lib/services/storage-quota-service';
import { CreditsService } from '@/lib/services/creditsService';
import { getCreditCost } from '@/lib/config/creditCosts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const GB = 1024 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const owners = await listOverageOwners();
  const results = { month, considered: owners.length, charged: 0, skipped: 0, insufficient: 0, creditsCharged: 0 };

  for (const o of owners) {
    try {
      // Idempotency: already billed this month.
      if (o.lastOverageBilledMonth === month) { results.skipped++; continue; }

      // Who pays: the user who enabled it (their plan also defines the org cap).
      const billingUserId = o.overageBillingUserId ?? (o.ownerType === 'user' ? o.ownerId : undefined);
      if (!billingUserId) {
        results.skipped++;
        console.warn(`[StorageOverage] no billing user for owner ${o.ownerId} — cannot charge`);
        continue;
      }

      const limitBytes = await getStorageLimitBytes(billingUserId);
      const overageBytes = Math.max(0, (o.usedBytes || 0) - limitBytes);
      if (overageBytes <= 0) { results.skipped++; continue; }

      const overageGb = Math.ceil(overageBytes / GB);
      const cost = getCreditCost('storage', 'overage', { quantity: overageGb });

      const deduct = await CreditsService.deductCredits(billingUserId, 'storage', 'overage', {
        quantity: overageGb,
      });

      if (deduct.success) {
        await markOverageBilled(o.ownerId, month); // stamp only on success
        results.charged++;
        results.creditsCharged += cost;
      } else {
        // Not billed — leave unstamped so it can retry. Do NOT force-charge (R32).
        results.insufficient++;
        console.warn(
          `[StorageOverage] insufficient credits for ${billingUserId} (owner ${o.ownerId}): needed ${cost} for ${overageGb}GB`,
        );
      }
    } catch (err: any) {
      console.error(`[StorageOverage] error billing owner ${o.ownerId}: ${err?.message ?? err}`);
    }
  }

  console.log(`[StorageOverage] ${JSON.stringify(results)}`);
  return NextResponse.json({ success: true, ...results });
}
