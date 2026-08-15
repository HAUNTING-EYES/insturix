import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { executeScriptOperation } from '@/lib/thinkforge/services/script-service';
import { ScriptOpSchema } from '@/lib/thinkforge/schemas/route-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified script endpoint
 * Handles get, save, and update operations
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ScriptOpSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { sessionId, scriptId, action, script, baseVersion } = parsed.data;

  try {
    const result = await executeScriptOperation({
      sessionId,
      scriptId,
      userId,
      action,
      script,
      orgId,
      baseVersion
    });

    return NextResponse.json({ script: result });
  } catch (error: any) {
    const status = error?.message === 'Session not found'
      ? 404
      : error?.message === 'Version conflict'
        ? 409
        : error?.message?.includes('Script data required')
          || error?.message === 'Document identity is required'
          || error?.message === 'Document identity is invalid'
          ? 400
          : 500;
    if (status >= 500) {
      console.error('Error in script endpoint:', error);
    }
    return NextResponse.json(
      { error: 'Script operation failed', details: error?.message },
      { status }
    );
  }
}

