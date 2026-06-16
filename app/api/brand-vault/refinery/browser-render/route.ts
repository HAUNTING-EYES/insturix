import { NextResponse } from 'next/server';
import { handleBrandVaultBrowserRenderRequest } from '@/lib/shared/brand-vault-browser-render-endpoint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const result = await handleBrandVaultBrowserRenderRequest(req);
  return NextResponse.json(result.body, { status: result.status });
}
