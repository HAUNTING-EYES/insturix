import crypto from 'crypto';
import Attendee, { Ics25AttendeeDocument } from '@/schemas/ics25/Attendee';
import Player from '@/schemas/ics25/Player';

export type AttendeeReferralUpgrade = 'gold' | 'platinum';

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'creators';

const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'creators'];
const REFERRAL_THRESHOLDS: Record<AttendeeReferralUpgrade, number> = {
  gold: 25,
  platinum: 55,
};

function tierRank(tier: Tier) {
  return TIER_ORDER.indexOf(tier);
}

function ensureReferralContainer(attendee: Ics25AttendeeDocument) {
  const cashback = attendee.cashback ?? (attendee.cashback = { referral: {} } as any);
  let touched = false;

  if (!cashback.referral) {
    cashback.referral = {} as any;
    touched = true;
  }

  const referral = cashback.referral as any;

  if (!Array.isArray(referral.referredUserIds)) {
    referral.referredUserIds = Array.isArray(referral.referredUserIds) ? referral.referredUserIds : [];
    touched = true;
  }

  if (typeof referral.referredCount !== 'number') {
    referral.referredCount = referral.referredUserIds.length;
    touched = true;
  }

  if (!Array.isArray(referral.upgrades)) {
    referral.upgrades = [];
    touched = true;
  }

  if (typeof referral.amount !== 'number') {
    referral.amount = referral.amount ?? 0;
  }

  if (typeof referral.qualified !== 'boolean') {
    referral.qualified = referral.referredCount >= REFERRAL_THRESHOLDS.gold;
    touched = true;
  }

  return { cashback, referral, touched };
}

function applyReferralMilestones(attendee: Ics25AttendeeDocument, referral: any) {
  const upgradesSet = new Set<string>(Array.isArray(referral.upgrades) ? referral.upgrades : []);
  const triggered: AttendeeReferralUpgrade[] = [];
  let touched = false;

  if (referral.referredCount >= REFERRAL_THRESHOLDS.gold && !upgradesSet.has('gold')) {
    upgradesSet.add('gold');
    triggered.push('gold');
    touched = true;
  }

  if (referral.referredCount >= REFERRAL_THRESHOLDS.platinum && !upgradesSet.has('platinum')) {
    upgradesSet.add('platinum');
    triggered.push('platinum');
    touched = true;
  }

  referral.upgrades = Array.from(upgradesSet);

  if (triggered.length > 0) {
    referral.lastUpgradedAt = new Date();
  }

  let tierChanged = false;
  const currentTier = (attendee.attendeePassTier || 'bronze') as Tier;

  if (currentTier !== 'creators') {
    let targetTier: Tier | null = null;
    if (referral.referredCount >= REFERRAL_THRESHOLDS.platinum) {
      targetTier = 'platinum';
    } else if (referral.referredCount >= REFERRAL_THRESHOLDS.gold) {
      targetTier = 'gold';
    }

    if (targetTier) {
      const currentRank = tierRank(currentTier);
      const targetRank = tierRank(targetTier);
      if (targetRank > currentRank) {
        attendee.attendeePassTier = targetTier;
        tierChanged = true;
        touched = true;
        if (!triggered.includes(targetTier as AttendeeReferralUpgrade)) {
          triggered.push(targetTier as AttendeeReferralUpgrade);
        }
        referral.lastUpgradedAt = new Date();
      }
    }
  }

  return { triggered, touched, tierChanged };
}

export async function ensureReferrerCreditForAttendee(attendee: Ics25AttendeeDocument | null) {
  if (!attendee?.referredBy?.referrerUserId || attendee.referredBy.confirmed !== true) {
    return { credited: false, upgrades: [] as AttendeeReferralUpgrade[], attendeeDirty: false };
  }

  if (attendee.referredBy.referrerUserId === attendee.clerkUserId) {
    if (!attendee.referredBy.creditedAt) {
      attendee.referredBy.creditedAt = new Date();
      attendee.markModified('referredBy');
      return { credited: false, upgrades: [], attendeeDirty: true };
    }
    return { credited: false, upgrades: [], attendeeDirty: false };
  }

  if (attendee.referredBy.creditedAt) {
    return { credited: false, upgrades: [], attendeeDirty: false };
  }

  const referrer = await Attendee.findOne({ clerkUserId: attendee.referredBy.referrerUserId });
  if (!referrer) {
    return { credited: false, upgrades: [], attendeeDirty: false };
  }

  const hasCredited = Array.isArray(referrer.cashback?.referral?.referredUserIds)
    && referrer.cashback.referral.referredUserIds.includes(attendee.clerkUserId);

  if (hasCredited) {
    attendee.referredBy.creditedAt = new Date();
    attendee.markModified('referredBy');
    return { credited: false, upgrades: [], attendeeDirty: true };
  }

  const result = await applyAttendeeReferralCredit(referrer, attendee.clerkUserId);
  if (result.updated) {
    attendee.referredBy.creditedAt = new Date();
    attendee.markModified('referredBy');
    return { credited: true, upgrades: result.upgrades, attendeeDirty: true };
  }

  return { credited: false, upgrades: [], attendeeDirty: false };
}

export async function syncAttendeeTierWithReferralProgress(attendee: Ics25AttendeeDocument | null) {
  if (!attendee) {
    return { updated: false, upgrades: [] as AttendeeReferralUpgrade[] };
  }

  const creditResult = await ensureReferrerCreditForAttendee(attendee);
  const container = ensureReferralContainer(attendee);
  const referral = container.referral;
  let structureTouched = container.touched;

  if (Array.isArray(referral.referredUserIds)) {
    const uniqueIds = Array.from(new Set(referral.referredUserIds.filter(Boolean)));
    if (uniqueIds.length !== referral.referredUserIds.length) {
      referral.referredUserIds = uniqueIds;
      structureTouched = true;
    }
  } else {
    referral.referredUserIds = [];
    structureTouched = true;
  }

  referral.referredCount = typeof referral.referredCount === 'number'
    ? referral.referredCount
    : referral.referredUserIds.length;
  referral.qualified = referral.referredCount >= REFERRAL_THRESHOLDS.gold;

  const { triggered, touched } = applyReferralMilestones(attendee, referral);
  const updated = structureTouched || touched || creditResult.attendeeDirty;

  if (updated) {
    attendee.markModified('cashback');
    if (creditResult.attendeeDirty) {
      attendee.markModified('referredBy');
    }
    await attendee.save();
  }

  return { updated, upgrades: triggered };
}

async function isCodeUnique(code: string): Promise<boolean> {
  const [attendeeMatch, playerMatch] = await Promise.all([
    Attendee.findOne({ 'cashback.referral.code': code }).lean(),
    Player.findOne({ 'cashbacks.referral.code': code }).lean(),
  ]);
  return !attendeeMatch && !playerMatch;
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = crypto.randomBytes(3).toString('hex');
    if (await isCodeUnique(code)) {
      return code;
    }
  }
  throw new Error('Could not generate a unique referral code');
}

export async function ensureAttendeeReferralCode(attendee: Ics25AttendeeDocument): Promise<string> {
  const cashback = attendee.cashback ?? (attendee.cashback = { referral: {} } as any);
  const referral = cashback.referral ?? (cashback.referral = {} as any);

  if (!referral.code) {
    const code = await generateUniqueReferralCode();
    referral.code = code;
    if (typeof referral.amount !== 'number') {
      referral.amount = 0;
    }
    referral.referredCount = referral.referredCount || 0;
    referral.referredUserIds = referral.referredUserIds || [];
    referral.upgrades = referral.upgrades || [];
    referral.lastUpdatedAt = referral.lastUpdatedAt || new Date();
    attendee.markModified('cashback');
    await attendee.save();
  }

  return referral.code as string;
}

export async function applyAttendeeReferralCredit(referrer: Ics25AttendeeDocument | null, referredUserId: string) {
  if (!referrer) return { updated: false, upgrades: [] as AttendeeReferralUpgrade[] };

  const uid = (referredUserId || '').trim();
  if (!uid) return { updated: false, upgrades: [] as AttendeeReferralUpgrade[] };

  const { referral } = ensureReferralContainer(referrer);
  referral.referredUserIds = Array.isArray(referral.referredUserIds) ? referral.referredUserIds : [];
  const ids = new Set<string>(referral.referredUserIds);
  const beforeCount = ids.size;
  ids.add(uid);
  if (ids.size === beforeCount) {
    return { updated: false, upgrades: [] as AttendeeReferralUpgrade[] };
  }

  referral.referredUserIds = Array.from(ids);
  referral.referredCount = ids.size;
  referral.lastUpdatedAt = new Date();
  referral.qualified = referral.referredCount >= REFERRAL_THRESHOLDS.gold;
  const { triggered } = applyReferralMilestones(referrer, referral);
  referrer.markModified('cashback');
  await referrer.save();
  return { updated: true, upgrades: triggered };
}
