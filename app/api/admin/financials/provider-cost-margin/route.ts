import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import {
  getProviderCostMarginReport,
  isProviderCostMarginGroupBy,
} from '@/lib/financials/provider-cost-margin-report';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const groupByParam = searchParams.get('groupBy');
    const limitParam = searchParams.get('limit');
    const report = await getProviderCostMarginReport({
      from: parseDateParam(searchParams.get('from')),
      to: parseDateParam(searchParams.get('to')),
      groupBy: isProviderCostMarginGroupBy(groupByParam) ? groupByParam : undefined,
      limit: limitParam ? Number(limitParam) : undefined,
    });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ProviderCostMarginReport] Error:', message);
    return NextResponse.json(
      { ok: false, message: 'Failed to load provider cost margin report' },
      { status: 500 },
    );
  }
}

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
