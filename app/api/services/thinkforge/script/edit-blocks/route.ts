import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
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

const EditBlocksRequestSchema = z.object({
  instruction: z.string().trim().min(1),
  sessionId: ExactIdSchema,
  scriptId: ExactIdSchema,
  selection: z.string().trim().min(1).optional(),
  indices: z.array(z.number().int().nonnegative()).optional(),
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
 * Revise a focused part of an existing ThinkForge document.
 * The browser supplies edit intent and scope only; persisted state remains authoritative.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = EditBlocksRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { instruction, sessionId, scriptId, selection, indices } = parsed.data;

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
    if (indices && indices.length > 0) {
      const blockCount = Array.isArray(storedDocument.blocks) ? storedDocument.blocks.length : 0;
      if (indices.some((index) => index >= blockCount)) {
        return NextResponse.json({ error: 'Block selection is stale' }, { status: 409 });
      }
    }
  } catch (error) {
    console.error('[ThinkForge:script/edit-blocks] Document authorization failed:', error);
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
    const scopedInstruction = indices && indices.length > 0
      ? `${instruction}\n\nEdit only canonical block indices: ${indices.join(', ')}.`
      : instruction;
    const revised = await reviseDocumentViaFlatWriter({
      userId,
      orgId: canonicalOrgId,
      sessionId: canonicalSessionId,
      scriptId,
      instruction: scopedInstruction,
      selection,
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
      replacements: [],
    });
  } catch (error: unknown) {
    console.error('[ThinkForge:script/edit-blocks] Edit failed:', error);
    const message = error instanceof Error ? error.message : 'Block edit failed';
    await creditCheck.refund(message);
    const explicitResponse = editErrorResponse(error);
    if (explicitResponse) return explicitResponse;
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
