import { getDatabase } from '@/lib/editron/db/mongodb';
import { PROVIDER_COST_EVENTS_COLLECTION } from '@/lib/financials/provider-cost-events';

export type ProviderCostMarginGroupBy = 'service' | 'provider' | 'org' | 'user' | 'day';

export interface ProviderCostMarginReportParams {
  from?: Date;
  to?: Date;
  groupBy?: ProviderCostMarginGroupBy;
  limit?: number;
}

export interface ProviderCostMarginReportGroup {
  key: string;
  service?: string;
  action?: string;
  provider?: string;
  model?: string;
  orgId?: string;
  userId?: string;
  day?: string;
  eventCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  chargedCredits: number;
  revenueUsdEstimate: number;
  providerCostUsd: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  grossMarginUsd: number;
  grossMarginPct: number | null;
  missingPricingEvents: number;
  failedProviderCostUsd: number;
  retryCount: number;
}

export interface ProviderCostMarginReport {
  from: string;
  to: string;
  groupBy: ProviderCostMarginGroupBy;
  totals: Omit<ProviderCostMarginReportGroup, 'key'>;
  groups: ProviderCostMarginReportGroup[];
  unknownPricing: ProviderCostMarginReportGroup[];
  negativeMargin: ProviderCostMarginReportGroup[];
}

type ProviderCostMarginRawRow = Omit<ProviderCostMarginReportGroup, 'key' | 'grossMarginUsd' | 'grossMarginPct'> & {
  _id: {
    service?: string;
    action?: string;
    provider?: string;
    model?: string;
    orgId?: string;
    userId?: string;
    day?: string;
  } | null;
};

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function normalizeProviderCostMarginParams(
  params: ProviderCostMarginReportParams = {},
  now = new Date(),
): Required<ProviderCostMarginReportParams> {
  const to = validDate(params.to) ?? now;
  const requestedFrom = validDate(params.from);
  const defaultFrom = new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const oldestAllowedFrom = new Date(to.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const from = requestedFrom && requestedFrom > oldestAllowedFrom ? requestedFrom : defaultFrom;

  return {
    from,
    to,
    groupBy: isProviderCostMarginGroupBy(params.groupBy) ? params.groupBy : 'service',
    limit: clampInteger(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
  };
}

export async function getProviderCostMarginReport(
  params: ProviderCostMarginReportParams = {},
): Promise<ProviderCostMarginReport> {
  const normalized = normalizeProviderCostMarginParams(params);
  const db = await getDatabase();
  const collection = db.collection(PROVIDER_COST_EVENTS_COLLECTION);
  const pipeline = buildProviderCostMarginPipeline(normalized);
  const rows = await collection.aggregate<ProviderCostMarginRawRow>(pipeline).toArray();
  return buildProviderCostMarginReport(rows, normalized);
}

export function buildProviderCostMarginPipeline(
  params: Required<ProviderCostMarginReportParams>,
): Record<string, unknown>[] {
  const groupId = groupIdFor(params.groupBy);
  const providerCostExpression = {
    $ifNull: ['$actualCostUsd', { $ifNull: ['$estimatedCostUsd', 0] }],
  };

  return [
    {
      $match: {
        createdAt: { $gte: params.from, $lte: params.to },
      },
    },
    {
      $group: {
        _id: groupId,
        service: { $first: '$service' },
        action: { $first: '$action' },
        provider: { $first: '$provider' },
        model: { $first: '$model' },
        orgId: { $first: '$orgId' },
        userId: { $first: '$userId' },
        day: { $first: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
        eventCount: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        skippedCount: { $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] } },
        chargedCredits: { $sum: { $ifNull: ['$chargedCredits', 0] } },
        revenueUsdEstimate: { $sum: { $ifNull: ['$revenueUsdEstimate', 0] } },
        providerCostUsd: { $sum: providerCostExpression },
        estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
        actualCostUsd: { $sum: { $ifNull: ['$actualCostUsd', 0] } },
        missingPricingEvents: { $sum: { $cond: [{ $eq: ['$missingPricing', true] }, 1, 0] } },
        failedProviderCostUsd: {
          $sum: {
            $cond: [{ $eq: ['$status', 'failed'] }, providerCostExpression, 0],
          },
        },
        retryCount: { $sum: { $ifNull: ['$units.retryCount', 0] } },
      },
    },
    { $sort: { providerCostUsd: -1, revenueUsdEstimate: -1, eventCount: -1 } },
    { $limit: params.limit },
  ];
}

export function buildProviderCostMarginReport(
  rows: ProviderCostMarginRawRow[],
  params: Required<ProviderCostMarginReportParams>,
): ProviderCostMarginReport {
  const groups = rows.map(normalizeProviderCostMarginRow);
  const totals = sumMarginGroups(groups);

  return {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    groupBy: params.groupBy,
    totals,
    groups,
    unknownPricing: groups
      .filter((group) => group.missingPricingEvents > 0)
      .sort((a, b) => b.missingPricingEvents - a.missingPricingEvents),
    negativeMargin: groups
      .filter((group) => group.grossMarginUsd < 0)
      .sort((a, b) => a.grossMarginUsd - b.grossMarginUsd),
  };
}

function normalizeProviderCostMarginRow(row: ProviderCostMarginRawRow): ProviderCostMarginReportGroup {
  const identity = row._id ?? {};
  const providerCostUsd = roundMoney(row.providerCostUsd);
  const revenueUsdEstimate = roundMoney(row.revenueUsdEstimate);
  const grossMarginUsd = roundMoney(revenueUsdEstimate - providerCostUsd);

  return {
    key: keyFor(identity),
    service: identity.service ?? row.service,
    action: identity.action ?? row.action,
    provider: identity.provider ?? row.provider,
    model: identity.model ?? row.model,
    orgId: identity.orgId ?? row.orgId,
    userId: identity.userId ?? row.userId,
    day: identity.day ?? row.day,
    eventCount: cleanCount(row.eventCount),
    successCount: cleanCount(row.successCount),
    failedCount: cleanCount(row.failedCount),
    skippedCount: cleanCount(row.skippedCount),
    chargedCredits: cleanCount(row.chargedCredits),
    revenueUsdEstimate,
    providerCostUsd,
    estimatedCostUsd: roundMoney(row.estimatedCostUsd),
    actualCostUsd: roundMoney(row.actualCostUsd),
    grossMarginUsd,
    grossMarginPct: revenueUsdEstimate > 0 ? roundMoney(grossMarginUsd / revenueUsdEstimate) : null,
    missingPricingEvents: cleanCount(row.missingPricingEvents),
    failedProviderCostUsd: roundMoney(row.failedProviderCostUsd),
    retryCount: cleanCount(row.retryCount),
  };
}

function sumMarginGroups(groups: ProviderCostMarginReportGroup[]): Omit<ProviderCostMarginReportGroup, 'key'> {
  const totals = groups.reduce(
    (acc, group) => ({
      eventCount: acc.eventCount + group.eventCount,
      successCount: acc.successCount + group.successCount,
      failedCount: acc.failedCount + group.failedCount,
      skippedCount: acc.skippedCount + group.skippedCount,
      chargedCredits: acc.chargedCredits + group.chargedCredits,
      revenueUsdEstimate: acc.revenueUsdEstimate + group.revenueUsdEstimate,
      providerCostUsd: acc.providerCostUsd + group.providerCostUsd,
      estimatedCostUsd: acc.estimatedCostUsd + group.estimatedCostUsd,
      actualCostUsd: acc.actualCostUsd + group.actualCostUsd,
      missingPricingEvents: acc.missingPricingEvents + group.missingPricingEvents,
      failedProviderCostUsd: acc.failedProviderCostUsd + group.failedProviderCostUsd,
      retryCount: acc.retryCount + group.retryCount,
    }),
    {
      eventCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      chargedCredits: 0,
      revenueUsdEstimate: 0,
      providerCostUsd: 0,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      missingPricingEvents: 0,
      failedProviderCostUsd: 0,
      retryCount: 0,
    },
  );
  const revenueUsdEstimate = roundMoney(totals.revenueUsdEstimate);
  const providerCostUsd = roundMoney(totals.providerCostUsd);
  const grossMarginUsd = roundMoney(revenueUsdEstimate - providerCostUsd);

  return {
    eventCount: totals.eventCount,
    successCount: totals.successCount,
    failedCount: totals.failedCount,
    skippedCount: totals.skippedCount,
    chargedCredits: roundMoney(totals.chargedCredits),
    revenueUsdEstimate,
    providerCostUsd,
    estimatedCostUsd: roundMoney(totals.estimatedCostUsd),
    actualCostUsd: roundMoney(totals.actualCostUsd),
    grossMarginUsd,
    grossMarginPct: revenueUsdEstimate > 0 ? roundMoney(grossMarginUsd / revenueUsdEstimate) : null,
    missingPricingEvents: totals.missingPricingEvents,
    failedProviderCostUsd: roundMoney(totals.failedProviderCostUsd),
    retryCount: totals.retryCount,
  };
}

function groupIdFor(groupBy: ProviderCostMarginGroupBy): Record<string, unknown> {
  switch (groupBy) {
    case 'provider':
      return { provider: '$provider', model: '$model', service: '$service', action: '$action' };
    case 'org':
      return { orgId: '$orgId', service: '$service', action: '$action' };
    case 'user':
      return { userId: '$userId', service: '$service', action: '$action' };
    case 'day':
      return {
        day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        service: '$service',
        action: '$action',
      };
    case 'service':
    default:
      return { service: '$service', action: '$action', provider: '$provider', model: '$model' };
  }
}

function keyFor(identity: ProviderCostMarginRawRow['_id']): string {
  if (!identity) return 'all';
  return Object.entries(identity)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|') || 'unknown';
}

function validDate(value?: Date): Date | undefined {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : undefined;
}

export function isProviderCostMarginGroupBy(value: unknown): value is ProviderCostMarginGroupBy {
  return value === 'service' || value === 'provider' || value === 'org' || value === 'user' || value === 'day';
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function cleanCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 1_000_000) / 1_000_000
    : 0;
}
