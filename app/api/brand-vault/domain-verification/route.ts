import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createBrandVaultDomainVerificationInstruction,
  verifyBrandVaultDomainDnsRecord,
} from '@/lib/shared/brand-vault-domain-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const websiteUrl = isRecord(body) && typeof body.websiteUrl === 'string' ? body.websiteUrl : '';
  const action = isRecord(body) && body.action === 'verify' ? 'verify' : 'instructions';
  if (!websiteUrl.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: 'missing_website_url', message: 'websiteUrl is required.' } },
      { status: 400 },
    );
  }

  try {
    if (action === 'verify') {
      const result = await verifyBrandVaultDomainDnsRecord({ userId, websiteUrl });
      return NextResponse.json({ ok: true, verification: result }, { status: 200 });
    }
    const instruction = createBrandVaultDomainVerificationInstruction({ userId, websiteUrl });
    return NextResponse.json({ ok: true, verification: instruction }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'domain_verification_unavailable',
          message: error instanceof Error ? error.message : 'Domain verification is unavailable.',
        },
      },
      { status: 400 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}