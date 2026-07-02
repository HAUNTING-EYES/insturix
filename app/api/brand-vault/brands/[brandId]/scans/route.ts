import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryJobSnapshot,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type Params = { params: Promise<{ brandId: string }> };

export interface BrandVaultBrandScanSummary {
  jobId: string;
  brandId: string | null;
  orgId: string | null;
  userId: string;
  recordId: string | null;
  status: BrandVaultRefineryJobSnapshot['job']['status'];
  websiteUrl: string | null;
  companyName: string | null;
  normalizedUrl: string | null;
  candidateCount: number;
  warningCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/brand-vault/brands/[brandId]/scans
 *
 * Brand-scoped scan history for the Brand Vault manager/rescan UI. This returns bounded summaries only:
 * no raw candidates, no review payload dumps, and no cross-brand/global latest fallback.
 */
export async function GET(request: Request, { params }: Params) {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const { brandId: rawBrandId } = await params;
  const brandId = rawBrandId.trim();
  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_brand', message: 'Missing brand id.' } },
      { status: 400 },
    );
  }

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.listJobSnapshots) {
    return NextResponse.json(
      { ok: false, error: { code: 'unsupported_store', message: 'Brand Vault store cannot list scan history.' } },
      { status: 500 },
    );
  }

  const isOrgAdmin = Boolean(orgId && has({ role: 'org:admin' }));
  const access = await canReadBrandScanHistory(store, { orgId: orgId ?? null, userId, brandId, isOrgAdmin });
  if (!access) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'You do not have access to this brand.' } },
      { status: 403 },
    );
  }

  const limit = parseLimit(new URL(request.url).searchParams.get('limit'));
  const snapshots = await listScopedBrandScans(store, { brandId, userId, orgId: orgId ?? null, limit });

  return NextResponse.json({
    ok: true,
    brandId,
    scans: snapshots.map(toScanSummary),
  });
}

async function canReadBrandScanHistory(
  store: BrandVaultRefineryStore,
  args: { orgId: string | null; userId: string; brandId: string; isOrgAdmin: boolean },
): Promise<boolean> {
  if (!args.orgId || args.isOrgAdmin || !store.getBrandAccessGrants) return true;
  const grants = await store.getBrandAccessGrants(args.orgId);
  const restrictedUserIds = grants.get(args.brandId);
  return !restrictedUserIds?.length || restrictedUserIds.includes(args.userId);
}

async function listScopedBrandScans(
  store: BrandVaultRefineryStore,
  args: { brandId: string; userId: string; orgId: string | null; limit: number },
): Promise<BrandVaultRefineryJobSnapshot[]> {
  const scoped = args.orgId
    ? await store.listJobSnapshots?.({
        brandId: args.brandId,
        orgId: args.orgId,
        limit: args.limit,
        sort: 'updatedAtDesc',
      })
    : [];
  const legacy = await store.listJobSnapshots?.({
    brandId: args.brandId,
    userId: args.userId,
    orgId: null,
    limit: args.limit,
    sort: 'updatedAtDesc',
  });

  return dedupeSnapshots([...(scoped ?? []), ...(legacy ?? [])])
    .sort((left, right) => Date.parse(right.job.updatedAt) - Date.parse(left.job.updatedAt))
    .slice(0, args.limit);
}

function dedupeSnapshots(snapshots: BrandVaultRefineryJobSnapshot[]): BrandVaultRefineryJobSnapshot[] {
  const seen = new Set<string>();
  const out: BrandVaultRefineryJobSnapshot[] = [];
  for (const snapshot of snapshots) {
    if (seen.has(snapshot.job.id)) continue;
    seen.add(snapshot.job.id);
    out.push(snapshot);
  }
  return out;
}

function toScanSummary(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultBrandScanSummary {
  return {
    jobId: snapshot.job.id,
    brandId: snapshot.job.brandId ?? null,
    orgId: snapshot.job.orgId ?? null,
    userId: snapshot.job.userId,
    recordId: snapshot.recordId ?? null,
    status: snapshot.job.status,
    websiteUrl: snapshot.job.inputs.websiteUrl ?? null,
    companyName: snapshot.job.inputs.companyName ?? null,
    normalizedUrl: snapshot.normalizedUrl ?? null,
    candidateCount: snapshot.candidates.length,
    warningCount: snapshot.job.warnings.length,
    createdAt: snapshot.job.createdAt,
    updatedAt: snapshot.job.updatedAt,
  };
}

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(parsed, MAX_LIMIT));
}