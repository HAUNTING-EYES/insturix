#!/usr/bin/env npx tsx
/**
 * Agency plan seeder — standalone mirror of POST /api/admin/plans/seed.
 *
 * Creates/updates the Free + agency_* plans in Mongo AND creates the matching Razorpay
 * plans for BOTH billing cycles (monthly + yearly) across ALL configured currencies,
 * using the real per-currency amounts from SERVICE_PRICING_CONFIGS. Idempotent: reuses
 * any existing providerPlanIds.razorpay so re-runs create ZERO duplicate Razorpay plans.
 *
 * SAFETY: set DRY_RUN=1 to print exactly what WOULD happen without calling Razorpay or
 * writing Mongo. Run the dry-run first, eyeball it, THEN run live.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/seed-plans-agency.ts     # preview, no changes
 *   npx tsx scripts/seed-plans-agency.ts               # live: creates real Razorpay plans
 */

import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import path from 'path';
import Plan from '../schemas/plans.ts';
import {
  getPlanLimits,
  SERVICE_PRICING_CONFIGS,
  UNIFIED_SERVICE_LIMITS,
} from '../lib/config/serviceLimits.ts';

// Load env (root .env.production.local holds the live creds in this repo layout).
for (const p of ['.env.production.local', '../.env.production.local', '.env.local', 'production.env']) {
  dotenv.config({ path: path.resolve(process.cwd(), p) });
}

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const MONGODB_URI = process.env.MONGODB_URI;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_SECRET_KEY_ID = process.env.RAZORPAY_SECRET_KEY_ID;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }
if (!RAZORPAY_KEY_ID || !RAZORPAY_SECRET_KEY_ID) { console.error('❌ RAZORPAY creds not set'); process.exit(1); }

const keyMode = RAZORPAY_KEY_ID.startsWith('rzp_live') ? 'LIVE' : RAZORPAY_KEY_ID.startsWith('rzp_test') ? 'TEST' : 'UNKNOWN';
const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_SECRET_KEY_ID });

interface PlanTemplate { name: string; type: string; description: string; isActive: boolean; sortOrder: number; }
const PLANS_CONFIG: PlanTemplate[] = [
  { name: 'Free Plan', type: 'free', description: 'Basic features for getting started', isActive: true, sortOrder: 1 },
  { name: 'Agency Starter Plan', type: 'agency_starter', description: 'Core AI workspace for agencies starting at $100/month', isActive: true, sortOrder: 2 },
  { name: 'Agency Growth Plan', type: 'agency_growth', description: 'Expanded AI workspace for growing agencies at $500/month', isActive: true, sortOrder: 3 },
  { name: 'Agency Scale Plan', type: 'agency_scale', description: 'High-volume AI workspace for scaled agencies at $1000/month', isActive: true, sortOrder: 4 },
];
const SERVICE_LIMIT_PLAN_TYPE: Record<string, 'free' | 'plus' | 'pro' | 'premium'> = {
  free: 'free', plus: 'plus', pro: 'pro', premium: 'premium',
  agency_starter: 'plus', agency_growth: 'pro', agency_scale: 'premium',
};

let created = 0, reused = 0, failed = 0;

async function ensureRazorpayPlan(
  existingId: string | undefined, name: string, amount: number, currency: string,
  period: 'monthly' | 'yearly', type: string,
): Promise<string | null> {
  if (existingId) { reused++; console.log(`   ↺ reuse   ${type} ${currency} ${period} -> ${existingId}`); return existingId; }
  if (DRY_RUN) { created++; console.log(`   ＋ CREATE  ${type} ${currency} ${period} @ ${amount} ${currency}  (dry-run, not sent)`); return `DRY_${type}_${currency}_${period}`; }
  try {
    const p = await razorpay.plans.create({
      period, interval: 1,
      item: { name: `${name} - ${currency} (${period})`, amount: Math.round(amount * 100), currency, description: `${period} subscription for ${name}` },
      notes: { planType: type, billingCycle: period },
    });
    created++; console.log(`   ✅ created ${type} ${currency} ${period} -> ${p.id}`); return p.id;
  } catch (e: any) {
    failed++; const d = e?.error?.description || e?.message || e;
    console.error(`   ⚠️  FAILED  ${type} ${currency} ${period}: ${d}`);
    if (String(d).toLowerCase().includes('currency')) console.error(`      (enable international payments + ${currency} for subscriptions in the Razorpay dashboard)`);
    return null;
  }
}

async function main() {
  console.log(`\n🚀 Agency plan seed — Razorpay key mode: ${keyMode}${DRY_RUN ? '  [DRY RUN — no changes]' : '  [LIVE — will create real plans]'}\n`);
  await mongoose.connect(MONGODB_URI!);
  console.log(`📦 Mongo connected (db: ${process.env.MONGODB_DB_NAME || 'default'})\n`);

  for (const cfg of PLANS_CONFIG) {
    console.log(`📋 ${cfg.name} (${cfg.type})`);
    const allServiceLimits: any = {};
    for (const svc of Object.keys(UNIFIED_SERVICE_LIMITS)) {
      allServiceLimits[svc] = getPlanLimits(svc, SERVICE_LIMIT_PLAN_TYPE[cfg.type], false);
    }

    const pricing: any = {};
    if (cfg.type !== 'free') {
      const cfgPricing = SERVICE_PRICING_CONFIGS[cfg.type as keyof typeof SERVICE_PRICING_CONFIGS];
      for (const cur of Object.keys(cfgPricing)) {
        const cp = cfgPricing[cur];
        pricing[cur] = {
          monthly: { amount: cp.monthly.amount, currency: cur, symbol: cp.monthly.symbol },
          yearly: { amount: cp.yearly.amount, currency: cur, symbol: cp.yearly.symbol },
        };
      }
    } else {
      const tmpl = SERVICE_PRICING_CONFIGS.agency_starter;
      for (const cur of Object.keys(tmpl)) {
        pricing[cur] = {
          monthly: { amount: 0, currency: cur, symbol: tmpl[cur].monthly.symbol },
          yearly: { amount: 0, currency: cur, symbol: tmpl[cur].yearly.symbol },
        };
      }
    }

    const existingPlan: any = await Plan.findOne({ type: cfg.type });
    const readExistingId = (cur: string, cycle: 'monthly' | 'yearly'): string | undefined => {
      const ids = existingPlan?.pricing?.[cur]?.[cycle]?.providerPlanIds;
      if (!ids) return undefined;
      if (ids instanceof Map) return ids.get('razorpay');
      if (typeof ids.get === 'function') return ids.get('razorpay');
      return ids.razorpay;
    };

    if (cfg.type !== 'free') {
      const cfgPricing = SERVICE_PRICING_CONFIGS[cfg.type as keyof typeof SERVICE_PRICING_CONFIGS];
      for (const cur of Object.keys(cfgPricing)) {
        for (const cycle of ['monthly', 'yearly'] as const) {
          const amt = cfgPricing[cur][cycle].amount;
          if (amt <= 0) continue;
          const id = await ensureRazorpayPlan(readExistingId(cur, cycle), cfg.name, amt, cur, cycle, cfg.type);
          if (id) pricing[cur][cycle].providerPlanIds = { razorpay: id };
        }
      }
    }

    if (DRY_RUN) {
      console.log(`   💾 (dry-run) would upsert Mongo plan ${cfg.type} with ${Object.keys(pricing).length} currencies\n`);
    } else {
      await Plan.findOneAndUpdate(
        { type: cfg.type },
        { name: cfg.name, type: cfg.type, description: cfg.description, serviceLimits: allServiceLimits, pricing, isActive: cfg.isActive, sortOrder: cfg.sortOrder },
        { upsert: true, new: true },
      );
      console.log(`   💾 upserted Mongo plan ${cfg.type}\n`);
    }
  }

  // Retire legacy public plans.
  if (DRY_RUN) {
    const legacy = await Plan.countDocuments({ type: { $in: ['plus', 'pro', 'premium'] }, isActive: true });
    console.log(`🧹 (dry-run) would deactivate ${legacy} active legacy plan(s) (plus/pro/premium)`);
  } else {
    const r = await Plan.updateMany({ type: { $in: ['plus', 'pro', 'premium'] }, isActive: true }, { $set: { isActive: false } });
    console.log(`🧹 deactivated ${r.modifiedCount ?? 0} legacy plan(s)`);
  }

  console.log(`\n📊 Razorpay plans — created: ${created}  reused: ${reused}  failed: ${failed}`);
  console.log(DRY_RUN ? '\n✅ DRY RUN complete — nothing was changed.\n' : '\n✅ Seed complete.\n');
  await mongoose.disconnect();
}

main().catch((e) => { console.error('❌ Script failed:', e); process.exit(1); });
