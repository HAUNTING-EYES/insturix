import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import * as db from '@/lib/thinkforge/services/db';
import { reviseDocumentViaFlatWriter } from '@/lib/thinkforge/services/flat-writer-edit';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ExactIdSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0 && value.trim() === value,
  { message: 'must be a non-empty trimmed string' },
);

const EditDocumentRequestSchema = z.object({
  instruction: z.string().trim().min(1),
  sessionId: ExactIdSchema,
  scriptId: ExactIdSchema,
});

function editErrorResponse(error: unknown): NextResponse | null {
  const message = error instanceof Error ? error.message : '';
  if (message === 'ThinkForge document not found'
    || message === 'ThinkForge session not found or not authorized') {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  if (message === 'Version conflict') {
    return NextResponse.json({ error: 'Document changed during edit; retry the request' }, { status: 409 });
  }
  if (message.startsWith('Stored ThinkForge document')) {
    return NextResponse.json({ error: message }, { status: 422 });
  }
  return null;
}

/**
 * Edit script with AI
 * POST /api/services/thinkforge/script/edit
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = EditDocumentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { instruction, sessionId, scriptId } = parsed.data;

  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let session: Awaited<ReturnType<typeof db.getSession>>;
  try {
    session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const storedDocument = await db.getScript(session._id, scriptId);
    if (!storedDocument) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[ThinkForge:script/edit] Document authorization failed:', error);
    return NextResponse.json({ error: 'Failed to authorize document' }, { status: 500 });
  }
  const canonicalSessionId = session._id;
  const canonicalOrgId = session.orgId ?? orgId ?? null;

  // P3.1: the active context at WORK-START decides who pays (stamped surfaces).
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
    const revised = await reviseDocumentViaFlatWriter({
      userId,
      orgId: canonicalOrgId,
      sessionId: canonicalSessionId,
      scriptId,
      instruction,
    });
    return NextResponse.json({
      scriptId: revised.scriptId ?? scriptId,
      title: revised.title,
      content: revised.content,
      blocks: revised.blocks ?? [],
      richText: revised.richText ?? null,
      metadata: revised.metadata ?? {},
      version: revised.version,
      documentType: revised.documentType,
      contentContract: revised.contentContract,
    });
  } catch (error: unknown) {
    console.error('Error editing script:', error);
    const message = error instanceof Error ? error.message : 'Script edit failed';
    await creditCheck.refund(message);
    const explicitResponse = editErrorResponse(error);
    if (explicitResponse) return explicitResponse;
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
