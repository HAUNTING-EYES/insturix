import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { executeScriptOperation } from '@/lib/thinkforge/services/script-service';
import { z } from 'zod';

const ScriptOpSchema = z.object({
  sessionId: z.string().min(1),
  action: z.enum(['get', 'save', 'update']),
  script: z.any().optional(),
  baseVersion: z.number().optional(),
}).passthrough();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified script endpoint
 * Handles get, save, and update operations
 */
export async function POST(req: Request) {
  const { userId } = await auth();
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
  const { sessionId, action, script, baseVersion } = parsed.data;

  try {
    const result = await executeScriptOperation({
      sessionId,
      userId,
      action,
      script,
      baseVersion
    });

    return NextResponse.json({ script: result });
  } catch (error: any) {
    console.error('Error in script endpoint:', error);
    return NextResponse.json(
      { error: 'Script operation failed', details: error?.message },
      { status: 500 }
    );
  }
}


