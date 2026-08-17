import { NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getThinkForgeOperationalDiagnostics } from '@/lib/thinkforge/operations/operational-diagnostics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readIdentifier(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export async function GET(request: Request): Promise<Response> {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response ?? NextResponse.json(
      { ok: false, error: 'Admin authorization failed closed.' },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const sessionId = readIdentifier(url.searchParams.get('sessionId'));
  const scriptId = readIdentifier(url.searchParams.get('scriptId'));
  if (Boolean(sessionId) !== Boolean(scriptId)) {
    return NextResponse.json(
      { ok: false, error: 'sessionId and scriptId must be provided together.' },
      { status: 400 },
    );
  }

  try {
    const diagnostics = await getThinkForgeOperationalDiagnostics({ sessionId, scriptId });
    return NextResponse.json({ ok: true, diagnostics });
  } catch (error) {
    console.error('[ThinkForge:Operations] Diagnostics failed:', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'ThinkForge operational diagnostics are unavailable.' },
      { status: 503 },
    );
  }
}
