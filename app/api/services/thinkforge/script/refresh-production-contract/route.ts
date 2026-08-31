import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { normalizeThinkForgeDocumentType } from '@/lib/thinkforge/schemas/document-contract';
import * as db from '@/lib/thinkforge/services/db';
import { reviseDocumentViaFlatWriter } from '@/lib/thinkforge/services/flat-writer-edit';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ExactIdSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0 && value.trim() === value,
  { message: 'must be a non-empty trimmed string' },
);

const RefreshProductionContractRequestSchema = z.object({
  sessionId: ExactIdSchema,
  scriptId: ExactIdSchema,
  baseVersion: z.number().int().nonnegative(),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RefreshProductionContractRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }

  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, scriptId, baseVersion } = parsed.data;
  let session: Awaited<ReturnType<typeof db.getSession>>;
  try {
    session = await db.getSession(sessionId, userId, orgId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const storedDocument = await db.getScript(session._id, scriptId);
    if (!storedDocument) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (normalizeThinkForgeDocumentType(storedDocument.documentType) !== 'video_script') {
      return NextResponse.json({ error: 'Production contract refresh is available only for video scripts' }, { status: 422 });
    }
    if ((storedDocument.version ?? 0) !== baseVersion) {
      return NextResponse.json({
        error: 'Document changed before production contract refresh',
        currentVersion: storedDocument.version ?? 0,
      }, { status: 409 });
    }
  } catch (error) {
    console.error('[ThinkForge:refresh-production-contract] Authorization failed:', error);
    return NextResponse.json({ error: 'Failed to authorize document' }, { status: 500 });
  }

  const canonicalSessionId = session._id;
  const canonicalOrgId = session.orgId ?? orgId ?? null;
  const billingWallet = resolveContextBillingOwner(userId, canonicalOrgId, isOrgWalletBillingEnabled());
  const creditCheck = await checkCredits(
    userId,
    'thinkforge',
    'document_creation',
    { taskId: canonicalSessionId },
    billingWallet,
  );
  if (!creditCheck.allowed) return creditCheck.errorResponse;
  await creditCheck.deduct();

  try {
    const refreshed = await reviseDocumentViaFlatWriter({
      mode: 'refresh-production-contract',
      userId,
      orgId: canonicalOrgId,
      sessionId: canonicalSessionId,
      scriptId,
      expectedVersion: baseVersion,
    });
    return NextResponse.json({
      scriptId: refreshed.scriptId ?? scriptId,
      title: refreshed.title,
      content: refreshed.content,
      blocks: refreshed.blocks ?? [],
      richText: refreshed.richText ?? null,
      metadata: refreshed.metadata ?? {},
      version: refreshed.version,
      documentType: refreshed.documentType,
      contentContract: refreshed.contentContract,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Production contract refresh failed';
    await creditCheck.refund(message);
    if (message === 'Version conflict') {
      return NextResponse.json({ error: 'Document changed during production contract refresh' }, { status: 409 });
    }
    if (message === 'Production contract refresh changed visible content') {
      return NextResponse.json({ error: 'Production metadata could not be refreshed without changing the script' }, { status: 422 });
    }
    console.error('[ThinkForge:refresh-production-contract] Refresh failed:', error);
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
