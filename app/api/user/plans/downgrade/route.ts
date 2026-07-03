/**
 * POST   /api/user/plans/downgrade  { toPlanType }  — schedule a downgrade at cycle end.
 * DELETE /api/user/plans/downgrade                  — cancel a scheduled downgrade.
 *
 * HOW IT WORKS
 *  - We call Razorpay `subscriptions.update(subId, { plan_id, schedule_change_at: 'cycle_end' })`.
 *    Razorpay keeps the current plan + amount until the cycle ends, then switches the
 *    subscription's plan_id to the lower plan, charges the lower amount, and fires
 *    `subscription.charged` WITH THE NEW plan_id.
 *  - The existing webhook resolves the plan from `subscription.plan_id`, so the downgrade
 *    applies itself at renewal (grants the lower allocation, updates currentPlan). We only
 *    record `pendingPlanChange` here for the UI, and clear it when the charge lands.
 *
 * Schedule-only: this NEVER charges immediately and never touches credits.
 */

import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { normalizePlanKey } from "@/lib/config/plan-limits";

let _rzp: Razorpay | null = null;
function getRazorpay() {
  if (!_rzp) _rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_SECRET_KEY_ID! });
  return _rzp;
}

const TIER_RANK: Record<string, number> = { free: 0, agency_starter: 1, agency_growth: 2, agency_scale: 3 };

function inferCycle(start?: Date | null, end?: Date | null): 'monthly' | 'yearly' {
  if (!start || !end) return 'monthly';
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
  return days > 60 ? 'yearly' : 'monthly';
}

function readRzpPlanId(providerPlanIds: any): string | null {
  if (!providerPlanIds) return null;
  if (typeof providerPlanIds.get === 'function') return providerPlanIds.get('razorpay') ?? null;
  return providerPlanIds.razorpay ?? null;
}

function getSubId(cp: any): string | null {
  const s = cp?.subscriptionId;
  if (!s) return null;
  if (typeof s.get === 'function') return s.get('razorpay') ?? null;
  return s.razorpay ?? null;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { toPlanType } = await req.json().catch(() => ({}));
    if (!toPlanType) return NextResponse.json({ error: 'toPlanType is required' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findOne({ clerkUserId: userId });
    const cp: any = user?.currentPlan;
    const subId = getSubId(cp);
    if (!user || !cp || cp.status !== 'active' || !subId) {
      return NextResponse.json({ error: 'No active subscription to change' }, { status: 400 });
    }

    const currentKey = normalizePlanKey(cp.name);
    const targetKey = normalizePlanKey(toPlanType);
    if (!(targetKey in TIER_RANK) || !(currentKey in TIER_RANK)) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
    }
    if (TIER_RANK[targetKey] >= TIER_RANK[currentKey]) {
      return NextResponse.json({ error: 'Target is not a downgrade' }, { status: 400 });
    }
    if (targetKey === 'free') {
      // Free has no paid Razorpay plan — moving to free = cancel the subscription instead.
      return NextResponse.json({ error: 'Use plan cancellation to move to the free plan' }, { status: 400 });
    }

    const dbPlan = await Plan.findOne({ type: targetKey });
    if (!dbPlan) return NextResponse.json({ error: 'Target plan not found' }, { status: 404 });
    const currency = cp.currency || 'USD';
    const cycle = inferCycle(cp.startDate, cp.endDate);
    const pricing = (dbPlan.toObject() as any).pricing?.[currency]?.[cycle];
    const targetPlanId = readRzpPlanId(pricing?.providerPlanIds);
    if (!targetPlanId) {
      return NextResponse.json({ error: `Target plan not seeded for ${currency} ${cycle}` }, { status: 400 });
    }

    // Schedule the plan change at cycle end. schedule_change_at is a valid API param
    // (razorpay@2.9.6) even if the SDK's TS type omits it, so cast the body.
    await getRazorpay().subscriptions.update(subId, {
      plan_id: targetPlanId,
      schedule_change_at: 'cycle_end',
      customer_notify: 1,
    } as any);

    user.pendingPlanChange = {
      toPlanType: targetKey,
      toPlanId: targetPlanId,
      effectiveAt: cp.endDate ?? null,
      scheduledAt: new Date(),
      direction: 'downgrade',
    } as any;
    await user.save();

    return NextResponse.json({ scheduled: true, toPlanType: targetKey, effectiveAt: cp.endDate ?? null });
  } catch (error: any) {
    console.error('[plans/downgrade POST]', error);
    return NextResponse.json({ error: 'Failed to schedule downgrade', details: error?.message }, { status: 500 });
  }
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await connectToDatabase();
    const user = await User.findOne({ clerkUserId: userId });
    const subId = getSubId(user?.currentPlan);
    if (!user || !subId) return NextResponse.json({ error: 'No subscription' }, { status: 400 });

    await getRazorpay().subscriptions.cancelScheduledChanges(subId);
    user.pendingPlanChange = null;
    await user.save();

    return NextResponse.json({ canceled: true });
  } catch (error: any) {
    console.error('[plans/downgrade DELETE]', error);
    return NextResponse.json({ error: 'Failed to cancel scheduled change', details: error?.message }, { status: 500 });
  }
}
